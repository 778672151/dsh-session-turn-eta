# Changelog

## 0.3.0

### Prediction

- The per-step rate is now the **40th percentile** of the session's observed step
  durations instead of the median. On a 21-session backtest this cuts MAPE from
  74% to 68% and reduces backwards movement, because the step distribution is
  right-skewed.
- `interval` is now an **empirical predictive range** derived from every
  `remaining steps x step duration` combination the session's history admits
  (8th–92nd percentile), rather than a min/max of samples. Measured coverage of
  the realised remaining time is about 64%.

### Display

- A wide estimate prints as a range (`~3m–20m left`) with a translucent band on
  the track showing where the turn is predicted to end.

### Measured and rejected

Both mechanisms of the planned "task-progress" approach were implemented and
backtested, then removed because they made accuracy worse on real session data:

- a tool-class-aware rate (class mix times per-class medians): MAPE 74% -> 107%;
- todo milestones (wall time per completed todo item) blended into the estimate:
  MAPE 56% -> 68% on the todo-bearing turns, and neutral overall.

The todo list is written in only about a quarter of turns and usually once, so it
does not carry enough signal to beat the step model.

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
