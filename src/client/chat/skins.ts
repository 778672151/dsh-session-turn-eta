/**
 * Skin presets for the composer-dock turn progress bar.
 *
 * A skin is a named set of CSS custom properties (fill gradient, leading-dot
 * glow, track tint, celebration colour) applied through the root's `data-skin`
 * attribute; the component itself never hard-codes a colour. `auto` follows the
 * harness theme tokens, so it is correct in both light and dark mode.
 * @module @deepseek-ai/dsh-session-turn-eta/client/skins
 */

/** Every selectable skin, in documentation order. */
export const TURN_ETA_SKINS = ['auto', 'bilibili', 'mint', 'sunset', 'ocean'] as const

/** One selectable skin name. */
export type TurnEtaSkin = (typeof TURN_ETA_SKINS)[number]

/** Skin used when no explicit or document-level choice is valid. */
export const TURN_ETA_DEFAULT_SKIN: TurnEtaSkin = 'auto'

/** Attribute read off `<body>`/`<html>` to pick a skin without a prop. */
export const TURN_ETA_SKIN_ATTRIBUTE = 'data-turn-eta-skin'

/** Whether a value names a known skin. */
export function isTurnEtaSkin(value: unknown): value is TurnEtaSkin {
  return typeof value === 'string' && (TURN_ETA_SKINS as readonly string[]).includes(value)
}

/** Read the document-level skin choice, if any (SSR-safe). */
function documentSkin(): TurnEtaSkin | undefined {
  if (typeof document === 'undefined') return undefined
  const body = document.body?.getAttribute(TURN_ETA_SKIN_ATTRIBUTE)
  if (isTurnEtaSkin(body)) return body
  const root = document.documentElement?.getAttribute(TURN_ETA_SKIN_ATTRIBUTE)
  return isTurnEtaSkin(root) ? root : undefined
}

/**
 * Resolve the skin the bar should render with: an explicit prop wins, then the
 * document attribute, then `auto`. Unknown values fall back to `auto` rather
 * than breaking the bar.
 * @param explicit - the (optional) per-render skin choice.
 * @returns a valid skin name.
 */
export function resolveTurnEtaSkin(explicit?: TurnEtaSkin | string | null): TurnEtaSkin {
  if (isTurnEtaSkin(explicit)) return explicit
  return documentSkin() ?? TURN_ETA_DEFAULT_SKIN
}
