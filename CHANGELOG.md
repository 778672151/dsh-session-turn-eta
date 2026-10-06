# Changelog

## 0.3.0

The bar can no longer read 100% while the turn is still running, and the
estimate no longer stays pinned to the first guess of the turn.

### Prediction

- **The estimate always keeps one step of runway.** When the published total
  would fall at or behind the elapsed time of an open turn, it is lifted to
  `max(raw estimate, elapsed + one step)`. A prediction made while the turn is
  open therefore always has a positive remaining time.
- **Re-anchoring starts earlier (`REANCHOR_AT = 0.6`).** The old rule held the
  published total until the turn had *fully* outrun it (`elapsed >= total`).
  On a turn that kept working, the real total was several times that first
  anchor, so the bar undershot and the remaining time stayed wrong for the whole
  turn. The estimate may now be re-anchored upward once the turn has passed 60%
  of the published total, which still ignores early noise.
- **Per-step rate raised from the 40th to the 60th percentile**
  (`RATE_PERCENTILE = 0.6`). The duration distribution is right-skewed; with
  the earlier re-anchor the 60th percentile tracked the archive better than 0.4.

### Display

- **A running turn renders at most 99%** (`MAX_OPEN_PERCENT = 99`). Only a turn
  that actually ended shows 100%; a turn that outran its own estimate fills and
  pulses under a "finishing" label instead.

### Verified

- `test/predict.mjs` — 9 host estimator invariants, including `remaining must
  stay positive at step N`, an early re-anchor, and the elapsed-time runway
  across a long mid-turn gap.
- `test/smoke.mjs` — client render states, including `running past its total
  never reports 100`.
- `test/render-real.mjs` — real React 18 SSR.
- Replayed over 702 archived sessions (54,488 predictions on turns that ended):
  every single prediction kept `remainingMs > 0` (minimum 0.3 ms), so no open
  turn could be scored as finished.
- On the same replay, mean absolute percentage error against the real turn
  duration fell from 48.4% to 46.1%, the estimate's negative bias from -42.7% to
  -33.3%, and the share of turns whose estimate was overtaken from 70.1% to
  57.5%. The improvement was confirmed on a held-out split of the archive
  (harder half: 53.8% -> 53.3% MAPE, 63.1% -> 50.9% overtaken).

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
