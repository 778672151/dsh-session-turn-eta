/**
 * The `turnEta` projection unit: a pure whole-log fold of turn and step
 * events into the live remaining-time prediction the Web client renders under
 * the composer. State is plain JSON so the persisted projection cache can seed
 * a fold; the wire view reuses one object per state so an unchanged fold
 * publishes nothing.
 * @module @deepseek-ai/dsh-session-turn-eta/projection
 */

import { z } from 'zod'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'
import { etaCore } from './predict.ts'
import type { TurnEtaProjection, TurnEtaState } from './types.ts'

const openTurnSchema = z.object({
  turn: z.number().int().nonnegative(),
  startTime: z.number().nonnegative(),
  asOf: z.number().nonnegative(),
  stepDurations: z.array(z.number().nonnegative()),
  openStepStart: z.number().nonnegative().optional(),
  lastStep: z.number().int().nonnegative(),
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

function computeView(state: TurnEtaState): TurnEtaProjection {
  const open = state.open
  if (open !== undefined) {
    const core = etaCore({
      startTime: open.startTime,
      stepDurations: open.stepDurations,
      completedTurnSteps: state.completedTurnSteps,
      stepSamples: state.stepSamples,
      asOf: open.asOf,
    })
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
  stateVersion: 1,
  stateSchema,
  init: () => EMPTY_STATE,
  apply: (state, event) => {
    switch (event.type) {
      case 'turn/start':
        return {
          ...state,
          open: {
            turn: event.data.turn,
            startTime: event.time,
            asOf: event.time,
            stepDurations: [],
            lastStep: 0,
          },
        }
      case 'step/start': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return state
        return {
          ...state,
          open: { ...open, asOf: event.time, openStepStart: event.time, lastStep: event.data.step },
        }
      }
      case 'step/end': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return state
        if (open.openStepStart === undefined) {
          return { ...state, open: { ...open, asOf: event.time, lastStep: event.data.step } }
        }
        const duration = Math.max(0, event.time - open.openStepStart)
        return {
          ...state,
          open: {
            turn: open.turn,
            startTime: open.startTime,
            asOf: event.time,
            stepDurations: [...open.stepDurations, duration],
            lastStep: event.data.step,
          },
          stepSamples: [...state.stepSamples, duration],
        }
      }
      case 'assistant/message':
      case 'tool/call':
      case 'tool/result': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return state
        return { ...state, open: { ...open, asOf: event.time, lastStep: event.data.step } }
      }
      case 'turn/end': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return state
        const completed = event.data.reason.kind === 'completed'
        return {
          completedTurnSteps: completed
            ? [...state.completedTurnSteps, open.stepDurations.length]
            : state.completedTurnSteps,
          stepSamples: state.stepSamples,
          last: {
            turn: open.turn,
            durationMs: Math.max(0, event.time - open.startTime),
            stepCount: open.stepDurations.length,
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
