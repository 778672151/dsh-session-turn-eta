/**
 * Shared pure prediction math for the turn-eta fold: one home for the robust
 * per-step rate estimate and the turn-total extrapolation used by both the
 * event-emitting model (\`eta.ts\`) and the \`turnEta\` projection unit.
 *
 * Two properties matter for the rendered bar:
 * - **robustness** — a single very long step (an idle gap) must not blow up the
 *   estimate, so the historical rate is a median and the live rate is blended
 *   with it rather than replacing it;
 * - **real-time anchoring** — the expected step count is the conditional median
 *   of previously completed turns *at least as long as this one*, so a growing
 *   turn keeps a live estimate instead of saturating; the total only re-anchors
 *   upward once the turn has actually outrun it, which keeps the percentage from
 *   drifting backwards on mere noise.
 * @module @deepseek-ai/dsh-session-turn-eta/predict
 */

import type { TurnEtaInterval, TurnEtaMethod } from './types.ts'

/** Inputs the prediction math reads from either fold. */
export interface EtaPredictionInput {
  readonly startTime: number
  readonly stepDurations: readonly number[]
  readonly completedTurnSteps: readonly number[]
  readonly stepSamples: readonly number[]
  readonly asOf: number
  /**
   * The total already published for this open turn, if any. It is held while it
   * still outruns the turn, and re-anchored to the live estimate once the turn
   * has run past it.
   */
  readonly previousTotalMs?: number | undefined
}

/** The prediction fields shared by the event payload and the projection wire view. */
export interface EtaCore {
  readonly elapsedMs: number
  readonly completedSteps: number
  readonly expectedSteps?: number
  readonly meanStepMs?: number
  readonly predictedTotalMs?: number
  readonly remainingMs?: number
  readonly interval?: TurnEtaInterval
  readonly method: TurnEtaMethod
}

/** Prior weight, in steps, of the historical rate against the live turn's own rate. */
const HISTORY_PRIOR_STEPS = 1

/**
 * Percentile of the step-duration history used as the central per-step rate.
 * The distribution is right-skewed, so a lower quantile minimises relative error
 * and resists one very long step.
 */
const RATE_PERCENTILE = 0.4

/** Safe bound on the blended per-step estimate relative to the historical median. */
const RATE_FLOOR = 0.25
const RATE_CEILING = 4

/** Runway kept when the turn already outran every finished turn in the session. */
const OUTRUN_GROWTH = 0.25
const OUTRUN_MINIMUM = 2

/**
 * Expected step count assumed before the session has any finished turn, so the
 * very first turn still gets a live estimate instead of an endless indeterminate
 * bar. Every later turn replaces it with the session's own median.
 */
const BOOTSTRAP_EXPECTED_STEPS = 10

/** Median of a non-empty ascending numeric list, or undefined for an empty list. */
function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  return values[Math.floor(values.length / 2)] as number
}

/** Linear-interpolated quantile of an already ascending list. */
function quantile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0] as number
  const position = fraction * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower] as number
  const weight = position - lower
  return (sorted[lower] as number) * (1 - weight) + (sorted[upper] as number) * weight
}

/** Ascending copy of a numeric list. */
function ascending(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right)
}

/**
 * Expected total step count for a turn that has already completed \`completedSteps\`.
 *
 * The anchor is the median of the completed turns that were at least this long:
 * a turn that has already outlived the typical turn is expected to outlive it
 * further, but no faster than the observed distribution suggests. When no
 * completed turn was this long, grow the observed count by a fixed runway.
 * @param completedTurnSteps - step counts of this session's completed turns.
 * @param completedSteps - steps completed in the open turn.
 * @returns the expected total step count, or undefined without history.
 */
function expectedTotalSteps(
  completedTurnSteps: readonly number[],
  completedSteps: number,
): number | undefined {
  const base = median(ascending(completedTurnSteps)) ?? BOOTSTRAP_EXPECTED_STEPS
  if (completedSteps <= 0) return base
  const longer = completedTurnSteps.filter((count) => count >= completedSteps)
  if (longer.length > 0) return Math.max(base, median(ascending(longer)) as number)
  return Math.max(base, completedSteps + Math.max(OUTRUN_MINIMUM, Math.ceil(completedSteps * OUTRUN_GROWTH)))
}

/**
 * Derive one remaining-time core from the open turn's facts.
 *
 * The estimate is a robust per-step rate times the anchored expected step count.
 * The rate blends the live turn's own observed rate (elapsed over completed
 * steps, so it includes per-turn overhead) with the historical median step
 * duration. The published total is held while it still outruns the turn and
 * re-anchored to the live estimate once the turn runs past it, so the estimate
 * stays meaningful for arbitrarily long turns without reacting to every noisy
 * sample. \`insufficient-data\` omits every numeric field rather than guessing.
 * @param input - open-turn anchors and observed step samples.
 * @returns the shared prediction core.
 */
export function etaCore(input: EtaPredictionInput): EtaCore {
  const completedSteps = input.stepDurations.length
  const elapsedMs = Math.max(0, input.asOf - input.startTime)
  const samples = ascending(input.stepSamples)
  const historyRate = samples.length === 0 ? undefined : quantile(samples, RATE_PERCENTILE)
  const base: EtaCore = { elapsedMs, completedSteps, method: 'insufficient-data' }
  if (historyRate === undefined || historyRate <= 0) return base
  const expectedSteps = expectedTotalSteps(input.completedTurnSteps, completedSteps)
  if (expectedSteps === undefined || expectedSteps < 1) return base

  const currentRate = completedSteps >= 1 ? elapsedMs / completedSteps : undefined
  const blended = currentRate === undefined
    ? historyRate
    : (completedSteps * currentRate + HISTORY_PRIOR_STEPS * historyRate)
      / (completedSteps + HISTORY_PRIOR_STEPS)
  const meanStepMs = Math.min(
    Math.max(blended, RATE_FLOOR * historyRate),
    RATE_CEILING * historyRate,
  )
  const rawTotalMs = meanStepMs * expectedSteps
  const previousTotalMs = input.previousTotalMs
  let predictedTotalMs = previousTotalMs === undefined
    ? rawTotalMs
    : rawTotalMs > previousTotalMs && elapsedMs >= previousTotalMs
      ? rawTotalMs
      : Math.min(rawTotalMs, previousTotalMs)
  // Keep at least one step of runway while the turn is open, so the estimate
  // cannot report completion before the turn actually ends.
  if (predictedTotalMs <= elapsedMs) {
    predictedTotalMs = Math.max(rawTotalMs, elapsedMs + Math.max(meanStepMs, 1))
  }
  const remainingMs = Math.max(0, predictedTotalMs - elapsedMs)
  const lowRate = quantile(samples, 0.25)
  const highRate = quantile(samples, 0.75)
  const interval: TurnEtaInterval = {
    lowMs: Math.max(0, Math.min(lowRate * expectedSteps, predictedTotalMs) - elapsedMs),
    highMs: Math.max(0, highRate * expectedSteps - elapsedMs),
  }
  return {
    ...base,
    expectedSteps,
    meanStepMs,
    predictedTotalMs,
    remainingMs,
    interval,
    method: 'step-mean',
  }
}
