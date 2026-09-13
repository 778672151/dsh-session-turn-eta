/**
 * Live turn progress under the composer: a bar plus percentage fed by the
 * `turnEta` session projection. The host projects only on session events, so
 * the component adds a local tick while a turn is open and recomputes the
 * percentage from the projected total; a terminal turn renders its outcome.
 */

import { useEffect, useState } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: merges the `turnEta` projection key into SessionProjectionMap.
import type { TurnEtaProjection } from '@deepseek-ai/dsh-session-turn-eta/client'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import css from './TurnProgress.module.css'

/** Local tick while a turn is open; the wire only advances on session events. */
const TICK_MS = 250

/** Live, succeeded, or failed status of the projected turn. */
export type TurnProgressStatus = 'running' | 'completed' | 'failed'

export interface TurnProgressProps {
  useProjection: UseProjection
  /** The owning dock's locale seat. */
  t: ChatViewSlotProps['t']
}

/**
 * Clamp a computed percentage into [0, 100] with integer rounding.
 * @param percent - raw percentage; non-finite values read as 0.
 * @returns the clamped integer percentage.
 */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.max(0, Math.min(100, Math.round(percent)))
}

/**
 * Terminal or live status of the projected turn.
 * @param eta - the current `turnEta` value.
 * @returns undefined before the session's first turn.
 */
export function turnProgressStatus(eta: TurnEtaProjection): TurnProgressStatus | undefined {
  if (eta.open) return 'running'
  if (eta.completed === true) return 'completed'
  if (eta.completed === false) return 'failed'
  return undefined
}

/**
 * Percentage for the projected turn: elapsed over the predicted total while
 * open, the observed step fraction when no total is available, and 100 once
 * the turn reaches a terminal state.
 * @param eta - the current `turnEta` value.
 * @param now - the locally observed epoch ms used for the live tick.
 * @returns the percentage, or undefined when the projection carries no total.
 */
export function turnProgressPercent(eta: TurnEtaProjection, now: number): number | undefined {
  if (!eta.open) return eta.completed === undefined ? undefined : 100
  if (eta.predictedTotalMs !== undefined && eta.predictedTotalMs > 0) {
    return clampPercent((now - eta.startTime) / eta.predictedTotalMs * 100)
  }
  if (eta.expectedSteps !== undefined && eta.expectedSteps > 0) {
    return clampPercent(eta.completedSteps / eta.expectedSteps * 100)
  }
  return undefined
}

/**
 * Human-readable remaining time: seconds under a minute, minutes and seconds
 * under an hour, then hours and minutes, so long estimates stay readable.
 * @param t - the dock locale seat.
 * @param remainingMs - remaining milliseconds.
 * @returns the localized remaining-time label.
 */
function remainingLabel(t: ChatViewSlotProps['t'], remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.round(remainingMs / 1_000))
  if (totalSeconds < 60) return t('turnProgress.etaSeconds', { seconds: totalSeconds })
  const totalMinutes = Math.floor(totalSeconds / 60)
  if (totalMinutes < 60) {
    return t('turnProgress.etaMinutes', { minutes: totalMinutes, seconds: totalSeconds % 60 })
  }
  return t('turnProgress.etaHours', { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 })
}

/**
 * The composer-dock progress bar. Renders nothing before a session's first turn.
 * @param props - the projection read seat and the dock locale seat.
 * @returns the bar, percentage label, and live remaining estimate.
 */
export function TurnProgress({ useProjection, t }: TurnProgressProps) {
  const eta = useProjection('turnEta')
  const status = eta === undefined ? undefined : turnProgressStatus(eta)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [status])

  if (eta === undefined || status === undefined) return null
  const percent = status === 'running' ? turnProgressPercent(eta, now) : 100
  const remainingMs = status === 'running' && eta.predictedTotalMs !== undefined
    ? Math.max(0, eta.predictedTotalMs - Math.max(0, now - eta.startTime))
    : undefined
  // The published total never rises, so a turn that outlives its estimate keeps
  // a zero remainder. Report that as "finishing" rather than a misleading "0s left".
  const exhausted = status === 'running' && remainingMs === 0
  const label = status === 'completed'
    ? t('turnProgress.completed')
    : status === 'failed'
      ? t('turnProgress.failed')
      : exhausted
        ? t('turnProgress.finishing')
        : percent === undefined
          ? t('turnProgress.indeterminate')
          : t('turnProgress.running', { percent })
  const remaining = remainingMs === undefined || exhausted ? undefined : remainingLabel(t, remainingMs)
  const details = remaining === undefined ? label : `${label} · ${remaining}`

  return (
    <div
      className={css.root}
      data-turn-progress
      data-status={status}
      data-indeterminate={percent === undefined ? 'true' : undefined}
      data-exhausted={exhausted ? 'true' : undefined}
      title={details}
    >
      <div
        className={css.track}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={details}
      >
        <div className={css.fill} style={percent === undefined ? undefined : { width: `${percent}%` }} />
      </div>
      <span className={css.label}>{label}</span>
      {remaining !== undefined && <span className={css.remaining}>{remaining}</span>}
    </div>
  )
}
