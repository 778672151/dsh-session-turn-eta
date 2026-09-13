/**
 * Shared pure prediction math for the turn-eta fold: one home for the robust
 * per-step rate estimate and the monotonic turn-total extrapolation used by both
 * the event-emitting model (\`eta.ts\`) and the \`turnEta\` projection unit.
 *
 * Two properties matter for the rendered bar:
 * - **robustness** — a single very long step (an idle gap) must not blow up the
 *   estimate, so the historical rate is a median and the live rate is blended
 *   with it rather than replacing it;
 * - **stability** — the turn total never rises while the turn is open, so the
 *   percentage cannot move backwards between events.
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
   * The total already published for this open turn, if any. The estimator never
   * raises it, so the percentage cannot move backwards mid-turn.
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

/** Prior weight, in steps, of the historical median against the live turn's own rate. */
const HISTORY_PRIOR_STEPS = 1

/** Safe bound on the blended per-step estimate relative to the historical median. */
const RATE_FLOOR = 0.25
const RATE_CEILING = 4

/** Median of a non-empty numeric list, or undefined for an empty list. */
function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  const index = Math.floor(values.length / 2)
  return values[index] as number
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
 * Derive one remaining-time core from the open turn's facts.
 *
 * The estimate is a robust per-step rate times an expected step count. The rate
 * blends the live turn's own observed rate (elapsed over completed steps, so it
 * includes per-turn overhead) with the historical median step duration; the step
 * count is the historical median, raised to the steps already observed. The total
 * is then clamped to the previously published total so it never rises mid-turn.
 * \`insufficient-data\` omits every numeric field rather than guessing.
 * @param input - open-turn anchors and observed step samples.
 * @returns the shared prediction core.
 */
export function etaCore(input: EtaPredictionInput): EtaCore {
  const completedSteps = input.stepDurations.length
  const elapsedMs = Math.max(0, input.asOf - input.startTime)
  const expectedTurnSteps = median(ascending(input.completedTurnSteps))
  const samples = ascending(input.stepSamples)
  const historyRate = samples.length === 0 ? undefined : quantile(samples, 0.5)
  const base: EtaCore = { elapsedMs, completedSteps, method: 'insufficient-data' }
  if (expectedTurnSteps === undefined || expectedTurnSteps < 1) return base
  if (historyRate === undefined || historyRate <= 0) return base

  const currentRate = completedSteps >= 1 ? elapsedMs / completedSteps : undefined
  const blended = currentRate === undefined
    ? historyRate
    : (completedSteps * currentRate + HISTORY_PRIOR_STEPS * historyRate)
      / (completedSteps + HISTORY_PRIOR_STEPS)
  const meanStepMs = Math.min(
    Math.max(blended, RATE_FLOOR * historyRate),
    RATE_CEILING * historyRate,
  )
  const expectedSteps = Math.max(expectedTurnSteps, completedSteps)
  const rawTotalMs = meanStepMs * expectedSteps
  const predictedTotalMs = input.previousTotalMs === undefined
    ? rawTotalMs
    : Math.min(rawTotalMs, input.previousTotalMs)
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
