/**
 * Output vocabulary of the `session-turn-eta` plugin: the in-turn
 * remaining-time prediction, the once-per-turn duration record, and the
 * `turnEta` session projection the Web client renders.
 * @module @deepseek-ai/dsh-session-turn-eta/types
 */

import type { SessionId, TurnEndReason } from '@deepseek-ai/dsh-session'

/** How one prediction was derived, or that the session lacks enough history. */
export type TurnEtaMethod = 'step-mean' | 'insufficient-data'

/** Remaining-time range implied by the spread of observed step durations. */
export interface TurnEtaInterval {
  readonly lowMs: number
  readonly highMs: number
}

/**
 * One in-turn remaining-time prediction, emitted on `turn-eta/update`.
 * Every numeric field except `elapsedMs` and `completedSteps` is absent under
 * `insufficient-data`.
 */
export interface TurnEtaPrediction {
  readonly sessionId: SessionId
  readonly turn: number
  readonly step: number
  readonly elapsedMs: number
  readonly completedSteps: number
  readonly expectedSteps?: number
  readonly meanStepMs?: number
  readonly predictedTotalMs?: number
  readonly remainingMs?: number
  readonly interval?: TurnEtaInterval
  readonly method: TurnEtaMethod
}

/** Short reason kind that closed a turn. */
export type TurnEtaEndKind = TurnEndReason['kind']

/**
 * The once-per-turn wall-time record emitted on `turn-eta/complete`.
 * `completed` is true only for a turn that ended with
 * `reason.kind === 'completed'`.
 */
export interface TurnEtaRecord {
  readonly sessionId: SessionId
  readonly turn: number
  readonly durationMs: number
  readonly stepCount: number
  readonly completed: boolean
  readonly reason: string
}

/** The open turn's fold facts; every field is plain JSON. */
export interface OpenTurnState {
  readonly turn: number
  /** Epoch ms of the turn's `turn/start` event (the timing anchor). */
  readonly startTime: number
  /** Epoch ms of the most recent tracked event in the open turn. */
  readonly asOf: number
  readonly stepDurations: readonly number[]
  /** Epoch ms of the open step's `step/start`; absent between steps. */
  readonly openStepStart?: number | undefined
  readonly lastStep: number
}

/** A finished turn's summary, retained for the client's terminal state. */
export interface TurnEtaLastTurn {
  readonly turn: number
  readonly durationMs: number
  readonly stepCount: number
  readonly completed: boolean
  readonly reason: string
}

/**
 * Whole-log fold state for the `turnEta` projection unit. Plain JSON so the
 * persisted projection cache can seed a fold.
 */
export interface TurnEtaState {
  readonly open?: OpenTurnState | undefined
  readonly completedTurnSteps: readonly number[]
  readonly stepSamples: readonly number[]
  readonly last?: TurnEtaLastTurn | undefined
}

/**
 * The `turnEta` wire payload the Web client renders: the open turn's timing
 * anchors plus a prediction core, or the last finished turn's terminal state.
 */
export interface TurnEtaProjection {
  readonly turn: number
  readonly step: number
  /** True while a turn is open; false once it ends or before the first turn. */
  readonly open: boolean
  /** Epoch ms of the open turn's `turn/start`; 0 when no turn is open. */
  readonly startTime: number
  readonly elapsedMs: number
  readonly completedSteps: number
  readonly expectedSteps?: number | undefined
  readonly meanStepMs?: number | undefined
  readonly predictedTotalMs?: number | undefined
  readonly remainingMs?: number | undefined
  readonly interval?: TurnEtaInterval | undefined
  readonly method: TurnEtaMethod
  /** Terminal outcome of the last finished turn; absent while a turn is open. */
  readonly completed?: boolean | undefined
  readonly reason?: string | undefined
  readonly durationMs?: number | undefined
}

declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    /** Whole-log turn timing and step-sample fold state. */
    turnEta: TurnEtaState
  }
  interface SessionProjectionMap {
    /** Live remaining-time prediction for the open turn, or the last turn's terminal state. */
    turnEta: TurnEtaProjection
  }
}
