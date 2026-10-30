# Changelog

## 0.4.1

Same numbers, ~25x cheaper per event. The projection runs on every committed
session event and is now folded in amortised O(1) instead of O(history).

### Hot path

- **Incremental ascending history.** A finished step used to append to
  `stepSamples` and every later prediction re-sorted the whole list, making a
  session cost quadratic in its step count. `withSample(samples, value)` grows
  the ascending copy by insertion and memoises it under the new list reference,
  so the sort is paid once per step, at O(n) copy instead of O(n log n) sort.
- **Rate profile cached per history.** `robustQuantile` winsorised the whole
  sample list on every event (messages and tool calls included, which change no
  sample). The 0.9 / 0.25 / 0.75 quantiles are now read once per sample list and
  memoised: one clamp-scan per finished step instead of one per event.
- **Winsorised quantile without the copy.** The clamped list is still ascending,
  so its quantile is an index read with `min(value, cap)` applied at the two
  interpolation endpoints — no per-call array allocation.
- **Anchors by binary search.** `expectedTotalSteps` filtered and re-sorted the
  completed-turn step counts on every event; the ascending copy is memoised and
  the `>= completedSteps` median is now `lowerBound` plus an index read.
- **The view reuses the anchor's core.** Advancing the open turn already ran
  `etaCore` to refresh the monotonic total; the view of the same event reused
  its result instead of running the estimator a second time with that total fed
  back (which is idempotent by construction).

Measured (`npm run bench`, fold only, no registry or UI, warmup run first):
12,864 events over 8 turns of 50 steps went from ~9.5k to ~245k events/s, and
the cost is now flat in the history size (80 turns / 32,160 events: ~150k
events/s; before the change the same shape degraded to ~11k events/s at 3,000
samples).

### Exports and tests

- `lib/index.js` now also exports `median`, `quantile`, `robustQuantile`,
  `ascending`, `expectedTotalSteps`, `insertSorted` and `withSample`, so an
  embedding host can reuse the exact primitives (and their memos) the
  projection uses.
- New `test/equiv.mjs` fuzzes every optimised primitive against the reference
  formula it replaced (9,300 comparisons over randomised skewed samples), so a
  future speed-up cannot silently drift from the maths. It runs as part of
  `npm test`.
- New `bench/bench.mjs` (throughput) and `bench/scale.mjs` (cost vs history
  size), wired to `npm run bench`.

## 0.4.0

Retargeted at the **0.2.1-rc.5** desktop build and rebuilt around a single fold.
Same bar, same estimator numbers — less duplicated work, and the plugin now
compiles against the contract the app actually loads.

### One fold, not two

- **Removed `TurnEtaModel` (`src/eta.ts`).** The host half used to register the
  `turnEta` projection *and* replay every `session/event` through its own model,
  folding the same events twice: the registry already drives each registered
  unit once per committed event. The plugin now mirrors the registry's change
  feed instead — `turn-eta/update` is emitted from `onChanged`, which only fires
  when the published view changed by `Object.is`, so one emission per event that
  actually moved the bar and one `turn-eta/complete` per closed turn.
- The estimator itself is now public surface rather than model internals:
  `etaCore`, `ETA_TUNING`, `median`, `quantile`, `robustQuantile`,
  `expectedTotalSteps` and `turnEtaProjectionDefinition` are exported from
  `lib/index.js`, so the same function the UI is driven by can be reused
  directly (no plugin instance, no session) when embedding the estimator.
- `ProjectionDefinition.init(header, inheritedEventCount)` now takes the two
  arguments the 0.2.1 contract declares.
- The empty fold state is minted per `init()` (`emptyState()`) instead of a
  module-level `EMPTY_STATE` singleton, so two folds can never share one
  `stepSamples` array by accident.

### The estimator is now embeddable

- **`createTurnEtaFold()`** (`src/fold.ts`) drives the very same fold without a
  Cordis context, a registry, or a `Session`: `apply(event)` / `view()` /
  `state()`. A captured `state()` can reseed a new fold, so a consumer that
  already holds a projection checkpoint never replays the log.
- `emptyTurnEtaState()` is the single definition of the empty fold state, used by
  both `init()` and the standalone driver, so "empty" cannot drift between them.
- `test/fold.mjs` pins the driver to the projection unit it wraps: identical views
  event for event, the next turn anchors off a folded turn, a JSON-round-tripped
  state resumes mid-session, and two folds never share a sample array.

### Compatibility

- `dsh.manifestVersion: 1`, `engines.node >= 22`, and peer ranges moved onto the
  0.2.1 line: `@deepseek-ai/cordis >=4.0.5 <5`, `dsh-session ^0.2.1-rc.1`,
  `dsh-session-projection ^0.2.1-rc.1`. The client half declares
  `dsh-client-ui-conversation` / `dsh-client-locale` as **optional** peers.
- Both halves are type-checked against the *published* `0.2.1-rc.x` packages, not
  against a monorepo checkout: `tsconfig.json` covers the host half,
  `tsconfig.client.json` covers the client half (`jsx: react-jsx`, DOM libs,
  `src/client/css.d.ts` for the CSS-Modules shape). `scripts/build.sh` links a
  contract tree (`DSH_CONTRACT_DIR`) and runs both checks, so a checkout that
  drifted cannot silently redefine the contract.
- The client half no longer imports its own package subpath
  (`@deepseek-ai/dsh-session-turn-eta/client`) for the projection type; it reads
  `src/types.ts` directly, and imports `@deepseek-ai/dsh-client-ui-slots`
  type-only so the `LocaleNamespaceMap` augmentation is a legal module
  augmentation instead of an unresolved module name.

### Tests

- `test/predict.mjs` now drives the **real fold**
  (`turnEtaProjectionDefinition.apply` + `wire.view`) instead of a parallel
  model, so the invariants cover the code path the desktop runs. The ten
  original assertions are unchanged; three were added: an uninterested event
  must return the **same state reference** (that identity is what lets the
  registry skip the view and the change feed), the closed-turn view reports the
  recorded duration and reason once, and an empty fold publishes a zeroed,
  non-open view.
- `test/smoke.mjs` asserts what the host half now exposes and, with a stub
  registry, that `apply` registers one unit, subscribes once, ignores changes
  for other keys, and emits `turn-eta/update` / `turn-eta/complete` with the
  expected payloads (and nothing for the pre-first-turn empty view).

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
