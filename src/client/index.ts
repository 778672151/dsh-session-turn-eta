/**
 * @dsh-external/dsh-session-turn-eta — client entry and dock wiring only.
 * The UI itself lives verbatim in ./chat/TurnProgress.tsx + .module.css.
 */
import { TurnProgress } from './chat/TurnProgress.tsx'

/** Locale namespace for this plugin's composer-dock copy. */
export const NS = 'dsh-session-turn-eta'

/** Simplified Chinese dictionary. */
export const zh = {
  'turnProgress.running': '进度 {percent}%',
  'turnProgress.indeterminate': '进行中…',
  'turnProgress.completed': '进度 100%',
  'turnProgress.finishing': '即将完成…',
  'turnProgress.failed': '进度已中断',
  'turnProgress.etaSeconds': '约剩 {seconds} 秒',
  'turnProgress.etaMinutes': '约剩 {minutes} 分 {seconds} 秒',
  'turnProgress.etaHours': '约剩 {hours} 时 {minutes} 分',
}

/** English dictionary. */
export const en = {
  'turnProgress.running': 'Progress {percent}%',
  'turnProgress.indeterminate': 'In progress…',
  'turnProgress.completed': 'Progress 100%',
  'turnProgress.finishing': 'Finishing…',
  'turnProgress.failed': 'Progress interrupted',
  'turnProgress.etaSeconds': '~{seconds}s left',
  'turnProgress.etaMinutes': '~{minutes}m {seconds}s left',
  'turnProgress.etaHours': '~{hours}h {minutes}m left',
}

/** Client services required by this plugin. */
export const inject = ['slots', 'locale']

/**
 * Register the composer-dock progress bar.
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
  }, TurnProgress))
}
