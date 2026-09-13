# Changelog

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
