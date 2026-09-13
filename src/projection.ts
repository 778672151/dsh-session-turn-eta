/**
 * The `turnEta` projection unit: a pure whole-log fold of turn and step events
 * into the live remaining-time prediction the Web client renders under the
 * composer. State is plain JSON so the persisted projection cache can seed a
 * fold; the wire view reuses one object per state so an unchanged fold publishes
 * nothing.
 * @module @deepseek-ai/dsh-session-turn-eta/projection
 */

import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { etaCore } from './predict.ts'
import type { EtaPredictionInput } from './predict.ts'
import { MAX_STEP_SAMPLES, MAX_TURN_STEPS, bounded } from './samples.ts'
import type { OpenTurnState, TurnEtaProjection, TurnEtaState } from './types.ts'

const openTurnSchema = z.object({
  turn: z.number().int().nonnegative(),
  startTime: z.number().nonnegative(),
  asOf: z.number().nonnegative(),
  stepDurations: z.array(z.number().nonnegative()),
  openStepStart: z.number().nonnegative().optional(),
  lastStep: z.number().int().nonnegative(),
  lastTotalMs: z.number().nonnegative().optional(),
}).strict()

const stateSchema: z.ZodType<TurnEtaState> = z.object({
  open: openTurnSchema.optional(),
  completedTurnSteps: z.array(z.number().int().nonnegative()),
  stepSamples: z.array(z.number().nonnegative()),
  last: z.object({
    turn: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    stepCount: z.number().int().nonnegative(),
    completed: z.boolean(),
    reason: z.string(),
  }).strict().optional(),
}).strict()

const viewSchema: z.ZodType<TurnEtaProjection> = z.object({
  turn: z.number().int().nonnegative(),
  step: z.number().int().nonnegative(),
  open: z.boolean(),
  startTime: z.number().nonnegative(),
  elapsedMs: z.number().nonnegative(),
  completedSteps: z.number().int().nonnegative(),
  expectedSteps: z.number().nonnegative().optional(),
  meanStepMs: z.number().nonnegative().optional(),
  predictedTotalMs: z.number().nonnegative().optional(),
  remainingMs: z.number().nonnegative().optional(),
  interval: z.object({ lowMs: z.number().nonnegative(), highMs: z.number().nonnegative() }).strict().optional(),
  method: z.enum(['step-mean', 'insufficient-data']),
  completed: z.boolean().optional(),
  reason: z.string().optional(),
  durationMs: z.number().nonnegative().optional(),
}).strict()

const EMPTY_STATE: TurnEtaState = { completedTurnSteps: [], stepSamples: [] }

/** The wire view for one fold state; cached per state reference. */
const views = new WeakMap<TurnEtaState, TurnEtaProjection>()

/** The estimator inputs implied by a fold state and one open turn. */
function inputsFor(state: TurnEtaState, open: OpenTurnState, asOf: number): EtaPredictionInput {
  return {
    startTime: open.startTime,
    stepDurations: open.stepDurations,
    completedTurnSteps: state.completedTurnSteps,
    stepSamples: state.stepSamples,
    asOf,
  }
}

/**
 * Advance the open turn to `asOf` with a patch, refreshing the published total
 * so the next view reads the same total the estimator just published.
 */
function advanceOpen(
  state: TurnEtaState,
  open: OpenTurnState,
  asOf: number,
  patch: Partial<OpenTurnState>,
): OpenTurnState {
  const next: OpenTurnState = { ...open, ...patch, asOf }
  const core = etaCore({ ...inputsFor(state, next, asOf), previousTotalMs: next.lastTotalMs })
  if (core.predictedTotalMs === undefined) return next
  return { ...next, lastTotalMs: core.predictedTotalMs }
}

function computeView(state: TurnEtaState): TurnEtaProjection {
  const open = state.open
  if (open !== undefined) {
    const core = etaCore({ ...inputsFor(state, open, open.asOf), previousTotalMs: open.lastTotalMs })
    return { turn: open.turn, step: open.lastStep, open: true, startTime: open.startTime, ...core }
  }
  const last = state.last
  if (last !== undefined) {
    return {
      turn: last.turn,
      step: 0,
      open: false,
      startTime: 0,
      elapsedMs: 0,
      completedSteps: last.stepCount,
      method: 'insufficient-data',
      completed: last.completed,
      reason: last.reason,
      durationMs: last.durationMs,
    }
  }
  return {
    turn: 0,
    step: 0,
    open: false,
    startTime: 0,
    elapsedMs: 0,
    completedSteps: 0,
    method: 'insufficient-data',
  }
}

/** The `turnEta` unit registered on `ctx.sessionProjections` (exported for the unit spec). */
export const turnEtaProjectionDefinition = {
  key: 'turnEta',
  stateVersion: 2,
  stateSchema,
  init: () => EMPTY_STATE,
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start':
        return {
          ...state,
          open: advanceOpen(state, {
            turn: event.data.turn,
            startTime: event.time,
            asOf: event.time,
            stepDurations: [],
            lastStep: 0,
          }, event.time, {}),
        }
      case 'step/start': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return state
        return { ...state, open: advanceOpen(state, open, event.time, { openStepStart: event.time, lastStep: event.data.step }) }
      }
      case 'step/end': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return state
        if (open.openStepStart === undefined) return state
        const duration = Math.max(0, event.time - open.openStepStart)
        const nextState: TurnEtaState = {
          ...state,
          stepSamples: bounded(state.stepSamples, duration, MAX_STEP_SAMPLES),
        }
        return {
          ...nextState,
          open: advanceOpen(nextState, open, event.time, {
            stepDurations: bounded(open.stepDurations, duration, MAX_TURN_STEPS),
            openStepStart: undefined,
            lastStep: event.data.step,
          }),
        }
      }
      case 'assistant/message':
      case 'tool/call':
      case 'tool/result': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return state
        return { ...state, open: advanceOpen(state, open, event.time, { lastStep: event.data.step }) }
      }
      case 'turn/end': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return state
        const completed = event.data.reason.kind === 'completed'
        const stepCount = open.stepDurations.length
        return {
          ...state,
          // Anchor on how long turns run, whatever closed them.
          completedTurnSteps: stepCount >= 1
            ? bounded(state.completedTurnSteps, stepCount, MAX_TURN_STEPS)
            : state.completedTurnSteps,
          last: {
            turn: open.turn,
            durationMs: Math.max(0, event.time - open.startTime),
            stepCount,
            completed,
            reason: event.data.reason.kind,
          },
        }
      }
      default:
        return state
    }
  },
  wire: {
    viewSchema,
    view: (state) => {
      const cached = views.get(state)
      if (cached !== undefined) return cached
      const computed = computeView(state)
      views.set(state, computed)
      return computed
    },
  },
} satisfies ProjectionDefinition<'turnEta', TurnEtaState>
