# Changelog

## 0.3.0

A better-calibrated estimate, a real client-contract fix, and an opt-in skin
system. The bar can no longer read 100% while the turn is still running.

### Prediction

- **Per-step rate moved to the 90th percentile, read robustly
  (`RATE_PERCENTILE = 0.9` + winsorising at `8 x median`).** The duration
  distribution is strongly right-skewed; the central rate used to sit at the
  60th percentile, which under-predicted the turns that dominate wall time. The
  sample is clamped to `8 x median` before the quantile is read, so one 9-hour
  idle step cannot drag the high quantile up by itself.
- **Re-anchoring released at the halfway point (`REANCHOR_AT = 0.5`, from 0.6).**
  Measured on a rebuilt 131-session archive, split by session difficulty:

  | Half | median remaining bias | median APE | share overtaken |
  | --- | --- | --- | --- |
  | train (483 turns, 42,853 points) | -0.294 -> **+0.019** | 0.775 -> **0.768** | 0.596 -> **0.493** |
  | held-out (379 turns, 70,586 points) | -0.464 -> **-0.291** | 0.771 -> **0.753** | 0.667 -> **0.605** |

  Every prediction on both halves kept `remainingMs > 0`; none ever reported an
  elapsed time at or past its published total.

### Client contract

- **`dsh.client.inject` no longer names a package that does not exist.** It
  declared `@deepseek-ai/dsh-client-runtime`, which is absent from both the
  `0.1.6-alpha.1` and `0.1.7-alpha.2` install trees and from the checkout; boot
  rows now name the real `@deepseek-ai/dsh-client-ui-slots`,
  `@deepseek-ai/dsh-client-ui-conversation` and `@deepseek-ai/dsh-client-locale`.
- Verified the `conversation.composer.dock` slot, the `ProjectionDefinition`
  shape and the `locale.register(ns, dicts)` reach on both desktop versions;
  the plugin renders unchanged apart from the fix above.

### Skins

- Five CSS-variable-driven presets (`auto`, `bilibili`, `mint`, `sunset`,
  `ocean`), selectable per render (`skin` prop) or document-wide
  (`data-turn-eta-skin` on `<body>`/`<html>`).
- Bilibili-style touches: gradient fill, a slow shimmer, a leading dot at the
  tip of the filled track, and a one-shot burst when the turn really finishes.
- All motion is disabled under `prefers-reduced-motion: reduce`; unknown skin
  names fall back to `auto`.

### Verified

- `test/predict.mjs` — 9 host estimator invariants (unchanged set, still green).
- `test/smoke.mjs` — 10 client render states.
- `test/render-real.mjs` — real React 18 SSR.
- `test/skin.mjs` — every preset renders, prop/attribute selection, decoration
  presence, reduced-motion CSS shipped.

- **The estimate always keeps one step of runway.** When the published total
  would fall at or behind the elapsed time of an open turn, it is lifted to
  `max(raw estimate, elapsed + one step)`. A prediction made while the turn is
  open therefore always has a positive remaining time.

### Display

- **A running turn renders at most 99%** (`MAX_OPEN_PERCENT = 99`). Only a turn
  that actually ended shows 100%; a turn that outran its own estimate fills and
  pulses under a "finishing" label instead.

### Verified

- `test/predict.mjs` — 10 host estimator invariants, including `remaining must
  stay positive at step N`, an early re-anchor, the right-skew tracking of the
  high quantile, and the elapsed-time runway across a long mid-turn gap.
- `test/smoke.mjs` — 10 client render states, including `running past its total
  never reports 100`.
- `test/render-real.mjs` — real React 18 SSR.
- `test/skin.mjs` — every preset renders, prop/attribute selection, decoration
  presence, reduced-motion CSS shipped.
- Replayed over a rebuilt 131-session archive, split by session difficulty:
  every prediction on both halves kept `remainingMs > 0` and none ever reported
  an elapsed time at or past its published total.

## 0.2.0

First public release.

### Prediction

- Robust per-step rate: the live turn's observed rate blended with the session's
  **median** historical step duration, so a single very long step (an idle gap)
  cannot distort the estimate.
- Data-driven anchor: the expected step count is the **conditional median** of
  the finished turns that were at least as long as the current one.
- Real-time re-anchoring: the published total is held while it still outruns the
  turn and re-anchored to the live estimate once the turn runs past it, so the
  estimate never sits at 100% while the turn keeps working.
- Every finished turn anchors the next one, whatever closed it; the first turn
  bootstraps from a prior expected step count until the session has history.

### Display

- Humanised remaining time (seconds, minutes + seconds, hours + minutes).
- Animated indeterminate bar while no total is known yet.
- Pulsing full bar with a "finishing" label once the estimate is exhausted.
- Stable label width and a hover title with the details.

### Verified

- `test/predict.mjs` — 7 host estimator invariants.
- `test/smoke.mjs` — client render states.
- `test/render-real.mjs` — real React 18 SSR.
- Backtest over 21 real sessions / 70 active turns: MAPE 206% -> 86.6%,
  exhausted estimates 90 -> 60.
