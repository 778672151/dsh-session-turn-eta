/**
 * Function plugin that predicts the remaining wall time of the live turn and
 * records each turn's total duration exactly once.
 *
 * It registers the `turnEta` session projection (the Web client's data source
 * for the composer progress bar) and publishes two typed Cordis events:
 * `turn-eta/update` per tracked event while a turn is open, and
 * `turn-eta/complete` once per turn. It registers no model-visible capability
 * and never mutates the session.
 *
 * @module @deepseek-ai/dsh-session-turn-eta
 */

import type { Context } from '@deepseek-ai/cordis'
import { TurnEtaModel } from './eta.ts'
import { turnEtaProjectionDefinition } from './projection.ts'
import type { TurnEtaPrediction, TurnEtaRecord } from './types.ts'
import type {} from '@deepseek-ai/dsh-session-projection'

export type * from './types.ts'
export { TurnEtaModel } from './eta.ts'
export type { TurnEtaEmission } from './eta.ts'

declare module '@deepseek-ai/cordis' {
  interface Events {
    /**
     * One live remaining-time prediction, emitted as the open turn progresses.
     * @param prediction - the current turn's prediction.
     * @dshScopeScan unsupported
     * @mode emit
     */
    'turn-eta/update'(prediction: TurnEtaPrediction): void
    /**
     * The recorded total duration of one finished turn, emitted exactly once.
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
 * Register the `turnEta` projection and fold every durable session event into
 * turn ETA predictions and duration records.
 * @param ctx - context whose session event feed is observed and registry receives the unit.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(turnEtaProjectionDefinition)
  const model = new TurnEtaModel()
  ctx.on('session/event', (session, event) => {
    const emission = model.observe(session, event)
    if (emission.prediction !== undefined) {
      ctx.logger.debug(
        `turn-eta: session "${String(session.id)}" turn ${emission.prediction.turn} `
        + `${emission.prediction.method} remaining=${String(emission.prediction.remainingMs)}ms`,
      )
      ctx.emit('turn-eta/update', emission.prediction)
    }
    if (emission.record !== undefined) {
      ctx.logger.info(
        `turn-eta: session "${String(session.id)}" turn ${emission.record.turn} `
        + `duration=${emission.record.durationMs}ms steps=${emission.record.stepCount} `
        + `reason=${emission.record.reason} completed=${String(emission.record.completed)}`,
      )
      ctx.emit('turn-eta/complete', emission.record)
    }
  })
}
