# dsh-session-turn-eta

Live remaining-time prediction for the current DeepSeek Harness turn, shown as a
progress bar with a live percentage under the composer.

- **Running** — a bar whose width follows elapsed time over the predicted total,
  with a percentage and a humanised time left (`~12m 34s left` / `约剩 12 分 34 秒`).
  The percentage ticks locally while the turn is open.
- **Finishing** — once a turn outruns its own estimate the bar fills and pulses
  with a "finishing" label, instead of a misleading "0s left".
- **Completed** — 100%.
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
| DeepSeek Harness | tested against `@deepseek-ai/dsh-*` `0.1.5-rc.1` (checkout `aa8262ec09`) |
| `@deepseek-ai/cordis` | `>=4.0.0-rc <5` |
| `@deepseek-ai/dsh-session` | `>=0.0.1-rc <2` |
| `@deepseek-ai/dsh-session-projection` | `>=0.0.1-rc <2` |
| Node | 24.x for building; the shipped bundle runs on the DSH host |

## How it works

The host half registers a `turnEta` session projection: it folds the durable
`turn/start`, `step/start`, `step/end` and `turn/end` events into a prediction.

- The per-step rate blends the live turn's own observed rate with the session's
  **median** historical step duration, so one very long step (an idle gap) cannot
  distort it.
- The expected step count is the **conditional median** of the finished turns
  that were at least as long as this one, so a growing turn keeps a live estimate.
- The published total is held while it still outruns the turn and **re-anchored**
  to the live estimate as soon as the turn runs past it, so the estimate never
  sits at 100% while the turn keeps working.
- Every finished turn anchors the next one, whatever closed it (a turn that
  errored or was aborted is still evidence of how long turns run); the first turn
  bootstraps from a prior until the session has real history.

The client half reads that projection through the standard `useProjection` seat
and renders it on the `conversation.composer.dock` slot. The plugin never
mutates the session and registers no model-visible capability.

## Build

The published bundle is built by `tsdown` (no monorepo checkout required):

```sh
npm install
npm run build      # -> lib/index.js (host) + lib/client.js (client)
npm test           # host estimator invariants + client render states
```

`scripts/build.sh` is an optional development helper that links a local DSH
checkout and type-checks the host half with that checkout's `tsc`.

## License

MIT
