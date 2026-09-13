/**
 * Replay-faithful fold from durable `session/event` records to turn
 * remaining-time predictions and once-per-turn duration records.
 * @module @deepseek-ai/dsh-session-turn-eta/eta
 */

import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { etaCore } from './predict.ts'
import type { TurnEtaPrediction, TurnEtaRecord } from './types.ts'

/** Emissions caused by applying one durable event. */
export interface TurnEtaEmission {
  readonly prediction?: TurnEtaPrediction
  readonly record?: TurnEtaRecord
}

interface OpenTurn {
  readonly turn: number
  readonly startTime: number
  readonly stepDurations: number[]
  openStepStart: number | undefined
  lastStep: number
}

interface SessionState {
  seeded: boolean
  open: OpenTurn | undefined
  completedTurnSteps: number[]
  stepSamples: number[]
}

/**
 * Per-session fold over durable turn and step events. One instance serves any
 * number of sessions; state is keyed weakly by `Session`. Every applied event
 * reduces to a prediction, a terminal record, both, or nothing.
 */
export class TurnEtaModel {
  private readonly states = new WeakMap<Session, SessionState>()

  private state(session: Session): SessionState {
    const existing = this.states.get(session)
    if (existing !== undefined) return existing
    const created: SessionState = {
      seeded: false,
      open: undefined,
      completedTurnSteps: [],
      stepSamples: [],
    }
    this.states.set(session, created)
    return created
  }

  /**
   * Apply one live event, seeding the session from its own durable log once so a
   * resumed session can predict from turns recorded before this model existed.
   * Seeding applies prior events for their state only; their predictions and
   * records are not re-emitted.
   * @param session - session that owns the event.
   * @param event - the appended event.
   * @returns the prediction and/or record this event produced.
   */
  observe(session: Session, event: SessionEvent): TurnEtaEmission {
    const state = this.state(session)
    if (!state.seeded) {
      state.seeded = true
      for (const prior of session.snapshotEvents()) {
        if (prior.seq >= event.seq) break
        this.apply(session, prior)
      }
    }
    return this.apply(session, event)
  }

  /**
   * Apply one durable event without seeding. Public so tests can drive exact
   * timestamps; production callers go through {@link observe}.
   * @param session - session that owns the event.
   * @param event - the appended event.
   * @returns the prediction and/or record this event produced.
   */
  apply(session: Session, event: SessionEvent): TurnEtaEmission {
    const state = this.state(session)
    switch (event.type) {
      case 'turn/start': {
        const open: OpenTurn = {
          turn: event.data.turn,
          startTime: event.time,
          stepDurations: [],
          openStepStart: undefined,
          lastStep: 0,
        }
        state.open = open
        return { prediction: this.predict(session, open, event.time) }
      }
      case 'step/start': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return {}
        open.openStepStart = event.time
        open.lastStep = event.data.step
        return { prediction: this.predict(session, open, event.time) }
      }
      case 'step/end': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return {}
        if (open.openStepStart !== undefined) {
          const duration = Math.max(0, event.time - open.openStepStart)
          open.stepDurations.push(duration)
          state.stepSamples.push(duration)
        }
        open.openStepStart = undefined
        open.lastStep = event.data.step
        return { prediction: this.predict(session, open, event.time) }
      }
      case 'assistant/message':
      case 'tool/call':
      case 'tool/result': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return {}
        return { prediction: this.predict(session, open, event.time) }
      }
      case 'turn/end': {
        const open = state.open
        if (open === undefined || open.turn !== event.data.turn) return {}
        state.open = undefined
        const record: TurnEtaRecord = {
          sessionId: session.id,
          turn: open.turn,
          durationMs: Math.max(0, event.time - open.startTime),
          stepCount: open.stepDurations.length,
          completed: event.data.reason.kind === 'completed',
          reason: event.data.reason.kind,
        }
        if (record.completed) state.completedTurnSteps.push(record.stepCount)
        return { record }
      }
      default:
        return {}
    }
  }

  private predict(session: Session, open: OpenTurn, asOf: number): TurnEtaPrediction {
    const state = this.state(session)
    return {
      sessionId: session.id,
      turn: open.turn,
      step: open.lastStep,
      ...etaCore({
        startTime: open.startTime,
        stepDurations: open.stepDurations,
        completedTurnSteps: state.completedTurnSteps,
        stepSamples: state.stepSamples,
        asOf,
      }),
    }
  }
}
