/**
 * Function plugin that predicts the remaining wall time of the live turn and
 * records each turn's total duration exactly once.
 *
 * The plugin owns **one** fold: the `turnEta` session projection (the Web
 * client's data source for the composer progress bar). It does not replay
 * `session/event` a second time — the projection registry already drives every
 * registered unit — so this module only mirrors the registry's change feed onto
 * two typed Cordis events: `turn-eta/update` while a turn is open, and
 * `turn-eta/complete` once per turn. It registers no model-visible capability
 * and never mutates the session.
 *
 * @module @deepseek-ai/dsh-session-turn-eta
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session } from '@deepseek-ai/dsh-session'
import { turnEtaProjectionDefinition } from './projection.ts'
import type { TurnEtaPrediction, TurnEtaProjection, TurnEtaRecord } from './types.ts'
import type {} from '@deepseek-ai/dsh-session-projection'

export type * from './types.ts'
export { emptyTurnEtaState, turnEtaProjectionDefinition } from './projection.ts'
export { createTurnEtaFold } from './fold.ts'
export type { TurnEtaFold, TurnEtaFoldEvent } from './fold.ts'
export { ETA_TUNING, etaCore } from './predict.ts'
export type { EtaCore, EtaPredictionInput } from './predict.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One live remaining-time prediction, emitted whenever the `turnEta` view
     * actually changed while a turn is open.
     * @param prediction - the current turn's prediction.
     * @dshScopeScan unsupported
     * @mode emit
     */
    'turn-eta/update'(prediction: TurnEtaPrediction): void
    /**
     * The recorded total duration of one finished turn, emitted exactly once
     * per turn.
     * @param record - the finished turn's wall time and outcome.
     * @dshScopeScan unsupported
     * @mode emit
     */
    'turn-eta/complete'(record: TurnEtaRecord): void
  }
}

/** Cordis plugin name. */
export const name = 'session-turn-eta'

/** The projection registry is the client-facing half; without it the fiber stays pending. */
export const inject = ['sessionProjections']

/**
 * Mint the `turn-eta/update` payload from one published projection view: the
 * view carries every predicted field, only the session id lives elsewhere.
 * @param session - session the view belongs to.
 * @param view - the open turn's published projection view.
 * @returns the event payload.
 */
function toPrediction(session: Session, view: TurnEtaProjection): TurnEtaPrediction {
  return {
    sessionId: session.id,
    turn: view.turn,
    step: view.step,
    elapsedMs: view.elapsedMs,
    completedSteps: view.completedSteps,
    expectedSteps: view.expectedSteps,
    meanStepMs: view.meanStepMs,
    predictedTotalMs: view.predictedTotalMs,
    remainingMs: view.remainingMs,
    interval: view.interval,
    method: view.method,
  }
}

/**
 * Mint the `turn-eta/complete` payload for a closed-turn view. Returns
 * undefined for the pre-first-turn empty view, so nothing is emitted before a
 * turn has ever finished.
 * @param session - session the view belongs to.
 * @param view - the published projection view.
 * @returns the event payload, or undefined when no turn has finished.
 */
function toRecord(session: Session, view: TurnEtaProjection): TurnEtaRecord | undefined {
  if (view.open || view.turn <= 0 || view.durationMs === undefined) return undefined
  return {
    sessionId: session.id,
    turn: view.turn,
    durationMs: view.durationMs,
    stepCount: view.completedSteps,
    completed: view.completed === true,
    reason: view.reason ?? 'unknown',
  }
}

/**
 * Register the `turnEta` projection and bridge its change feed to the plugin's
 * typed events. The registry notifies only when the published view changed by
 * `Object.is`, which is exactly the emission granularity the two events want:
 * one `turn-eta/update` per event that actually moved the bar, and one
 * `turn-eta/complete` when the open turn closes.
 * @param ctx - context whose projection registry receives the unit.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(turnEtaProjectionDefinition)
  ctx.sessionProjections.onChanged((session, key, value) => {
    if (key !== 'turnEta') return
    const view = value as TurnEtaProjection
    if (view.open) {
      const prediction = toPrediction(session, view)
      ctx.logger.debug(
        `turn-eta: session "${String(session.id)}" turn ${prediction.turn} `
        + `${prediction.method} remaining=${String(prediction.remainingMs)}ms`,
      )
      ctx.emit('turn-eta/update', prediction)
      return
    }
    const record = toRecord(session, view)
    if (record === undefined) return
    ctx.logger.info(
      `turn-eta: session "${String(session.id)}" turn ${record.turn} `
      + `duration=${record.durationMs}ms steps=${record.stepCount} `
      + `reason=${record.reason} completed=${String(record.completed)}`,
    )
    ctx.emit('turn-eta/complete', record)
  })
}
