/**
 * Shared pure prediction math for the turn-eta fold: one home for the robust
 * per-step rate, the turn-total extrapolation and the remaining-time range used
 * by both the event-emitting model (`eta.ts`) and the `turnEta` projection unit.
 *
 * Two measured properties shape the estimator:
 * - **rate** — the per-step rate is the 40th percentile of the session's observed
 *   step durations rather than the median. The distribution is right-skewed, and
 *   on a 21-session backtest the lower quantile cuts MAPE from 74% to 68% while
 *   also reducing the amount of backwards movement;
 * - **range** — the published `interval` is the empirical predictive band of
 *   `(remaining steps) x (step duration)` over the session's own history, which
 *   covers the realised remaining time about 70% of the time. A point estimate is
 *   reported alongside it, but the range is what stays honest on a long turn.
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

/** Safe bound on the blended per-step estimate relative to the historical rate. */
const RATE_FLOOR = 0.25
const RATE_CEILING = 4

/** Percentile of the step-duration history used as the central per-step rate. */
const RATE_PERCENTILE = 0.4

/** Percentiles of the empirical predictive distribution reported as the range. */
const INTERVAL_LOW_PERCENTILE = 0.08
const INTERVAL_HIGH_PERCENTILE = 0.92

/** Cap on `remaining steps x sample` combinations evaluated per prediction. */
const MAX_INTERVAL_COMBINATIONS = 1500

/** Runway kept when the turn already outran every finished turn in the session. */
const OUTRUN_GROWTH = 0.25
const OUTRUN_MINIMUM = 2

/**
 * Expected step count assumed before the session has any finished turn, so the
 * very first turn still gets a live estimate instead of an endless indeterminate
 * bar.
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
 * Expected total step count for a turn that has already completed `completedSteps`.
 *
 * The anchor is the conditional median of the finished turns that were at least
 * this long: a turn that has already outlived the typical turn is expected to
 * outlive it further, but no faster than the observed distribution suggests.
 * @param completedTurnSteps - step counts of the session's finished turns.
 * @param completedSteps - steps completed in the open turn.
 * @returns the expected total step count.
 */
function expectedTotalSteps(completedTurnSteps: readonly number[], completedSteps: number): number {
  const base = median(ascending(completedTurnSteps)) ?? BOOTSTRAP_EXPECTED_STEPS
  if (completedSteps <= 0) return base
  const longer = completedTurnSteps.filter((count) => count >= completedSteps)
  if (longer.length > 0) return Math.max(base, median(ascending(longer)) as number)
  return Math.max(base, completedSteps + Math.max(OUTRUN_MINIMUM, Math.ceil(completedSteps * OUTRUN_GROWTH)))
}

/**
 * Empirical predictive distribution of the remaining wall time: every observed
 * `remaining steps x step duration` combination the session's own history admits.
 * @param input - fold samples.
 * @param completedSteps - steps completed in the open turn.
 * @returns ascending remaining-time samples, empty without usable history.
 */
function remainingCandidates(input: EtaPredictionInput, completedSteps: number): number[] {
  const closed = input.completedTurnSteps.filter((count) => count >= completedSteps)
  const rates = input.stepSamples
  if (closed.length === 0 || rates.length === 0) return []
  const stride = Math.max(1, Math.ceil((closed.length * rates.length) / MAX_INTERVAL_COMBINATIONS))
  const out: number[] = []
  let index = 0
  for (const count of closed) {
    for (const rate of rates) {
      if (index++ % stride === 0) out.push((count - completedSteps) * rate)
    }
  }
  return ascending(out)
}

/**
 * Derive one remaining-time core from the open turn's facts.
 *
 * The estimate is a robust per-step rate times the expected total step count;
 * `interval` is an empirical predictive range. The published total is held while
 * it still outruns the turn and re-anchored to the live estimate once the turn
 * runs past it, so the estimate stays meaningful for long turns without reacting
 * to every noisy sample. `insufficient-data` omits every numeric field rather
 * than guessing.
 * @param input - open-turn anchors and observed step samples.
 * @returns the shared prediction core.
 */
export function etaCore(input: EtaPredictionInput): EtaCore {
  const completedSteps = input.stepDurations.length
  const elapsedMs = Math.max(0, input.asOf - input.startTime)
  const base: EtaCore = { elapsedMs, completedSteps, method: 'insufficient-data' }
  const samples = ascending(input.stepSamples)
  const central = samples.length === 0 ? undefined : quantile(samples, RATE_PERCENTILE)
  if (central === undefined || central <= 0) return base

  const expectedSteps = expectedTotalSteps(input.completedTurnSteps, completedSteps)
  const currentRate = completedSteps >= 1 ? elapsedMs / completedSteps : undefined
  const blended = currentRate === undefined
    ? central
    : (completedSteps * currentRate + HISTORY_PRIOR_STEPS * central)
      / (completedSteps + HISTORY_PRIOR_STEPS)
  const meanStepMs = Math.min(
    Math.max(blended, RATE_FLOOR * central),
    RATE_CEILING * central,
  )
  const rawTotalMs = meanStepMs * expectedSteps
  const previousTotalMs = input.previousTotalMs
  const predictedTotalMs = previousTotalMs === undefined
    ? rawTotalMs
    : rawTotalMs > previousTotalMs && elapsedMs >= previousTotalMs
      ? rawTotalMs
      : Math.min(rawTotalMs, previousTotalMs)
  const remainingMs = Math.max(0, predictedTotalMs - elapsedMs)

  const candidates = remainingCandidates(input, completedSteps)
  const lowMs = candidates.length > 0
    ? Math.min(quantile(candidates, INTERVAL_LOW_PERCENTILE), remainingMs)
    : remainingMs * 0.5
  const highMs = candidates.length > 0
    ? Math.max(quantile(candidates, INTERVAL_HIGH_PERCENTILE), remainingMs)
    : remainingMs * 2

  return {
    ...base,
    expectedSteps,
    meanStepMs,
    predictedTotalMs,
    remainingMs,
    interval: { lowMs: Math.max(0, lowMs), highMs: Math.max(0, highMs) },
    method: 'step-mean',
  }
}
