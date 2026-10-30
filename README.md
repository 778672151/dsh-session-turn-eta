# dsh-session-turn-eta

Live remaining-time prediction for the current DeepSeek Harness turn, shown as a
progress bar with a live percentage under the composer.

- **Running** — a bar whose width follows elapsed time over the predicted total,
  with a percentage and a humanised time left (`~12m 34s left` / `约剩 12 分 34 秒`).
  The percentage ticks locally while the turn is open. The filled track ends in
  a leading dot and carries a slow shimmer.
- **Finishing** — once a turn outruns its own estimate the bar fills and pulses
  with a "finishing" label, instead of a misleading "0s left".
- **Completed** — 100%, with a short one-shot burst at the tip.
- **Failed or interrupted** — the bar turns red and reads "progress interrupted".

## Install

```sh
dsh plugin --profile web add github:778672151/dsh-session-turn-eta
```

The repository ships a prebuilt `lib/`, so installing does not run a build step.
Restart `dsh web` if the profile asks for it, then send any message: the bar
appears under the input box while the turn runs.

## Compatibility

| | |
|---|---|
| DeepSeek-Harness desktop | `0.2.1-rc.5` (type-checked against its published packages) |
| `@deepseek-ai/cordis` | `>=4.0.5 <5` |
| `@deepseek-ai/dsh-session` | `^0.2.1-rc.1` |
| `@deepseek-ai/dsh-session-projection` | `^0.2.1-rc.1` |
| `@deepseek-ai/dsh-client-ui-conversation` / `dsh-client-locale` | `^0.2.1-rc.1` (client half, optional peers) |
| Node | `>=22` for building; the shipped bundle runs on the DSH host |

## How it works

The host half registers **one** `turnEta` session projection and nothing else:
it folds the durable `turn/start`, `step/start`, `step/end` and `turn/end`
events into a prediction. The projection registry already drives every
registered unit once per committed event, so the plugin does not replay
`session/event` a second time; it only mirrors the registry's change feed
(`onChanged`, which fires when the published view changed by `Object.is`) onto
two typed Cordis events: `turn-eta/update` while a turn is open and
`turn-eta/complete` once per turn.

- The per-step rate blends the live turn's own observed rate with the session's
  **90th-percentile** historical step duration (read after winsorising the sample
  at `8 x median`), so the rate tracks the steps that dominate a turn while a
  single 9-hour idle gap still cannot drag it up.
- The expected step count is the **conditional median** of the finished turns
  that were at least as long as this one, so a growing turn keeps a live estimate.
- The published total is held against early noise and **re-anchored** upward once
  the turn has passed **50%** of it, so a turn that keeps working stops being
  pinned to its first guess and the estimate never sits at 100% while it runs.
- The total always keeps **at least one step of runway** while the turn is open,
  so a prediction can never report completion before the turn actually ends.
- A running turn renders at most **99%**; only a turn that really ended shows
  100%. A turn that outran its estimate fills and pulses under a "finishing"
  label instead.
- Every finished turn anchors the next one, whatever closed it (a turn that
  errored or was aborted is still evidence of how long turns run); the first turn
  bootstraps from a prior until the session has real history.

The client half reads that projection through the standard `useProjection` seat
and renders it on the `conversation.composer.dock` slot. The plugin never
mutates the session and registers no model-visible capability.

## Skins

The bar ships five skins: `auto` (harness theme tokens, the default and the only
one that follows light/dark automatically), `bilibili`, `mint`, `sunset`, and
`ocean`. A skin only owns the fill gradient, the leading-dot glow, the track
tint, and the celebration colour; layout and accessibility never change.

Pick one either per render or document-wide:

```tsx
// per render (the dock entry accepts an optional `skin` prop)
<TurnProgress skin="bilibili" ... />
```

```html
<!-- document-wide, e.g. in the host page or a user script -->
<body data-turn-eta-skin="ocean">
```

The client entry exports `TURN_ETA_SKINS`, `TURN_ETA_DEFAULT_SKIN`,
`TURN_ETA_SKIN_ATTRIBUTE`, `isTurnEtaSkin()` and `resolveTurnEtaSkin()`. Unknown
values fall back to `auto`. All motion (shimmer, pulse, celebration) is disabled
under `prefers-reduced-motion: reduce`.

## Embedding the estimator

The fold is plain data in, plain data out: the same code the bar renders from can
be driven without Cordis, a session, or the plugin instance.

```ts
import { createTurnEtaFold, etaCore, ETA_TUNING } from '@dsh-external/dsh-session-turn-eta'

// full fold: the projection the client renders
const fold = createTurnEtaFold()
for (const event of durableLog) fold.apply(event)
const { remainingMs, predictedTotalMs, method } = fold.view()

// or just the math, from whatever facts you already have
const core = etaCore({ startTime, stepDurations, completedTurnSteps, stepSamples, asOf })
```

`createTurnEtaFold(seed)` accepts a captured `state()` so a fold can continue
from a projection checkpoint instead of replaying the whole log. `ETA_TUNING`
exposes every constant (`RATE_PERCENTILE`, `REANCHOR_AT`, `OUTLIER_CAP`, …) so a
consumer can read the calibration instead of copying numbers.

## Build

The published bundle is built by `tsdown` (no monorepo checkout required):

```sh
npm install
npm run build      # -> lib/index.js (host) + lib/client.js (client)
npm test           # host estimator invariants + client render states
```

`npm run typecheck` checks both halves against the *published* `0.2.1-rc.x`
contract: the host half (`tsconfig.json`) against `dsh-session` /
`dsh-session-projection`, and the client half (`tsconfig.client.json`) against
`dsh-client-ui-slots` / `dsh-api-session-controller` / `@types/react`.

`scripts/build.sh` is an optional development helper that links a contract tree
(`DSH_CONTRACT_DIR`, defaulting to a local copy of the published packages) and
type-checks both halves, so the build and the desktop app agree on the same
contract instead of on whatever a monorepo checkout happens to contain.

## License

MIT
