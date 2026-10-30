/**
 * Standalone driver for the `turnEta` fold: feed it the durable session events,
 * read the prediction. No Cordis context, no registry, no `Session` object — the
 * same fold the desktop app runs, usable from a script or from another agent's
 * runtime that only wants the numbers.
 *
 * ```ts
 * import { createTurnEtaFold } from '@dsh-external/dsh-session-turn-eta'
 * const fold = createTurnEtaFold()
 * for (const event of log) fold.apply(event)
 * fold.view().remainingMs
 * ```
 *
 * @module @deepseek-ai/dsh-session-turn-eta/fold
 */

import { emptyTurnEtaState, turnEtaProjectionDefinition } from './projection.ts'
import type { TurnEtaProjection, TurnEtaState } from './types.ts'

/** One durable session event, as the projection's fold consumes it. */
export type TurnEtaFoldEvent = Parameters<typeof turnEtaProjectionDefinition.apply>[1]

/** A fold instance: append events, read the current view or the raw state. */
export interface TurnEtaFold {
  /** Fold one event and return the view it produced. */
  apply(event: TurnEtaFoldEvent): TurnEtaProjection
  /** The current published view (cached per state, as on the wire). */
  view(): TurnEtaProjection
  /** The current fold state; plain JSON, so it can be checkpointed and reseeded. */
  state(): TurnEtaState
}

/**
 * Create an empty fold.
 * @param seed - a previously captured state (e.g. a projection checkpoint) to
 * continue from instead of replaying the whole log; its schema is not re-validated.
 * @returns a fold ready to consume events.
 */
export function createTurnEtaFold(seed?: TurnEtaState): TurnEtaFold {
  // No header is needed: the fold keeps nothing header-derived, so an empty
  // state is just the two empty sample lists.
  let state: TurnEtaState = seed ?? emptyTurnEtaState()
  return {
    apply(event) {
      state = turnEtaProjectionDefinition.apply(state, event)
      return turnEtaProjectionDefinition.wire.view(state)
    },
    view: () => turnEtaProjectionDefinition.wire.view(state),
    state: () => state,
  }
}
