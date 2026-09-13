/**
 * Shared fold-history limits for the two turn-eta folds (the event-emitting model
 * and the `turnEta` projection), so the bounds live in exactly one place.
 * @module @deepseek-ai/dsh-session-turn-eta/samples
 */

/** Bounds that keep the persisted fold state from growing without limit. */
export const MAX_STEP_SAMPLES = 500
export const MAX_TURN_STEPS = 200

/** Append a sample to a bounded oldest-dropped history. */
export function bounded(history: readonly number[], value: number, limit: number): number[] {
  const next = [...history, value]
  return next.length > limit ? next.slice(next.length - limit) : next
}
