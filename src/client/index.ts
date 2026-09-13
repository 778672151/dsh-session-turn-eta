/**
 * @dsh-external/dsh-session-turn-eta — client half.
 *
 * Registers the composer-dock progress bar that renders the host `turnEta`
 * session projection. Bundled by tsdown into lib/client.js in the DSH client
 * bundle format (window.__ModuleLoader__.load).
 */

import * as react from 'react'

/** Locale namespace for this plugin's composer-dock copy. */
export const NS = 'dsh-session-turn-eta'

/** Local tick while a turn is open; the wire only advances on session events. */
const TICK_MS = 250

/** Simplified Chinese dictionary. */
export const zh = {
  'turnProgress.running': '进度 {percent}%',
  'turnProgress.indeterminate': '进行中…',
  'turnProgress.completed': '进度 100%',
  'turnProgress.failed': '进度已中断',
  'turnProgress.eta': '约剩 {seconds} 秒',
}

/** English dictionary. */
export const en = {
  'turnProgress.running': 'Progress {percent}%',
  'turnProgress.indeterminate': 'In progress…',
  'turnProgress.completed': 'Progress 100%',
  'turnProgress.failed': 'Progress interrupted',
  'turnProgress.eta': '~{seconds}s left',
}

/** The projected turn shape this component reads (the host's turnEta view). */
interface TurnEta {
  open: boolean
  startTime: number
  completedSteps: number
  predictedTotalMs?: number
  expectedSteps?: number
  completed?: boolean
}

type Status = 'running' | 'completed' | 'failed'

/** Clamp a computed percentage into [0, 100] with integer rounding. */
function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 0
  return Math.max(0, Math.min(100, Math.round(percent)))
}

/** Live/terminal status of the projected turn. */
function statusOf(eta: TurnEta): Status | undefined {
  if (eta.open) return 'running'
  if (eta.completed === true) return 'completed'
  if (eta.completed === false) return 'failed'
  return undefined
}

/** Percentage: elapsed over predicted total while open, step fraction as fallback, 100 when terminal. */
function percentOf(eta: TurnEta, now: number): number | undefined {
  if (!eta.open) return eta.completed === undefined ? undefined : 100
  if (eta.predictedTotalMs !== undefined && eta.predictedTotalMs > 0) {
    return clampPercent((now - eta.startTime) / eta.predictedTotalMs * 100)
  }
  if (eta.expectedSteps !== undefined && eta.expectedSteps > 0) {
    return clampPercent(eta.completedSteps / eta.expectedSteps * 100)
  }
  return undefined
}

const ROOT: Record<string, string | number> = {
  display: 'flex', alignItems: 'center', gap: '8px', boxSizing: 'border-box',
  padding: '4px 0 0', fontSize: '12px', lineHeight: '16px',
  color: 'var(--dsw-alias-label-tertiary, #8a8f98)', fontVariantNumeric: 'tabular-nums',
}
const TRACK: Record<string, string | number> = {
  position: 'relative', flex: '0 0 160px', height: '6px', borderRadius: '3px',
  overflow: 'hidden', background: 'var(--dsw-alias-fill-secondary, rgba(127,127,127,0.25))',
}
const LABEL: Record<string, string | number> = { whiteSpace: 'nowrap' }
const REMAIN: Record<string, string | number> = { whiteSpace: 'nowrap', opacity: 0.8 }

const Fill = react.memo(function Fill(props: { width: number; failed: boolean }) {
  return react.createElement('div', {
    style: {
      height: '100%', width: String(props.width) + '%',
      transition: 'width 200ms linear',
      background: props.failed
        ? 'var(--dsw-alias-fill-error, #e5484d)'
        : 'var(--dsw-alias-fill-primary, #4b7bec)',
    },
  })
})

const Progress = react.memo(function Progress(props: {
  useProjection: (key: 'turnEta') => TurnEta | undefined
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const { useProjection, t } = props
  const eta = useProjection('turnEta')
  const [now, setNow] = react.useState(() => Date.now())
  const status = eta === undefined ? undefined : statusOf(eta)

  react.useEffect(() => {
    if (status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), TICK_MS)
    return () => clearInterval(id)
  }, [status])

  if (eta === undefined || status === undefined) return null
  const percent = status === 'running' ? percentOf(eta, now) : 100
  const remainingMs = status === 'running' && eta.predictedTotalMs !== undefined
    ? Math.max(0, eta.predictedTotalMs - Math.max(0, now - eta.startTime))
    : undefined
  const label = status === 'completed'
    ? t('turnProgress.completed')
    : status === 'failed'
      ? t('turnProgress.failed')
      : percent === undefined
        ? t('turnProgress.indeterminate')
        : t('turnProgress.running', { percent })
  const remaining = remainingMs === undefined
    ? undefined
    : t('turnProgress.eta', { seconds: Math.ceil(remainingMs / 1000) })

  return react.createElement('div', { 'data-turn-progress': true, 'data-status': status, style: ROOT },
    react.createElement('div', {
      role: 'progressbar',
      'aria-label': label,
      'aria-valuemin': 0,
      'aria-valuemax': 100,
      'aria-valuenow': percent,
      'aria-valuetext': remaining === undefined ? label : label + ' · ' + remaining,
      style: TRACK,
    }, react.createElement(Fill, { width: percent === undefined ? 0 : percent, failed: status === 'failed' })),
    react.createElement('span', { style: LABEL }, label),
    remaining === undefined ? null : react.createElement('span', { style: REMAIN }, remaining),
  )
})

/** Client services required by this plugin. */
export const inject = ['slots', 'locale']

/**
 * Register this plugin's composer-dock progress bar.
 * @param ctx - client context carrying the slots and locale services.
 */
export function apply(ctx: {
  effect: (fn: () => unknown, label: string) => void
  locale: { register: (ns: string, dictionaries: { zh: object; en: object }) => unknown }
  slots: { inject: (name: string, register: () => unknown) => void; register: (options: object, component: unknown) => unknown }
}): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-turn-eta: dictionaries')
  ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
    name: 'conversation.composer.dock',
    id: 'dsh-session-turn-eta',
    order: -1,
    locale: NS,
  }, Progress))
}
