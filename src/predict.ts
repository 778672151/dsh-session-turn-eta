/**
 * Shared pure prediction math for the turn-eta fold: one home for the median /
 * mean / extrapolation used by both the event-emitting model (`eta.ts`) and the
 * `turnEta` projection unit.
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

/** Median of a non-empty numeric list, or undefined for an empty list. */
function median(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] as number
  const lower = sorted[middle - 1] as number
  const upper = sorted[middle] as number
  return (lower + upper) / 2
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length
}

/**
 * Derive one remaining-time core from the open turn's facts.
 *
 * The estimate is the recent step mean times the median closed-step count of
 * previously completed turns in this session; `insufficient-data` omits every
 * numeric field rather than guessing.
 * @param input - open-turn anchors and observed step samples.
 * @returns the shared prediction core.
 */
export function etaCore(input: EtaPredictionInput): EtaCore {
  const completedSteps = input.stepDurations.length
  const elapsedMs = Math.max(0, input.asOf - input.startTime)
  const expectedSteps = median(input.completedTurnSteps)
  const samples = completedSteps >= 1 ? input.stepDurations : input.stepSamples
  const base: EtaCore = { elapsedMs, completedSteps, method: 'insufficient-data' }
  if (expectedSteps === undefined || expectedSteps < 1 || samples.length === 0) return base
  const meanStepMs = mean(samples)
  const predictedTotalMs = meanStepMs * expectedSteps
  const remainingMs = Math.max(0, predictedTotalMs - elapsedMs)
  const interval = samples.length >= 2
    ? {
        lowMs: Math.max(0, Math.min(...samples) * expectedSteps - elapsedMs),
        highMs: Math.max(0, Math.max(...samples) * expectedSteps - elapsedMs),
      }
    : undefined
  return {
    ...base,
    expectedSteps,
    meanStepMs,
    predictedTotalMs,
    remainingMs,
    ...(interval === undefined ? {} : { interval }),
    method: 'step-mean',
  }
}
