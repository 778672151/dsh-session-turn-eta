# dsh-session-turn-eta

Live remaining-time prediction for the current DeepSeek Harness turn, shown as a
progress bar with a live percentage under the composer.

- **Running** — a bar whose width follows elapsed time over the predicted total,
  with a percentage and an estimated time left. The percentage ticks locally
  while the turn is open.
- **Completed** — 100%.
- **Failed or interrupted** — the bar turns red and reads "progress interrupted".

## Install

```sh
dsh plugin --profile web add github:OWNER/dsh-session-turn-eta
```

Restart `dsh web` if the profile asks for it, then send any message. The bar
appears under the input box while the turn runs.

## How it works

The host half registers a `turnEta` session projection: it folds the durable
`turn/start`, `step/start`, `step/end` and `turn/end` events into a prediction.
The per-step rate is a blend of the live turn's own observed rate and the
session's **median** historical step duration, so one very long step (an idle
gap) cannot distort it; the expected step count is the historical median, raised
to the steps already observed. The published total then never rises while the
turn is open, so the percentage cannot move backwards between events.
The client half reads that projection through the standard `useProjection` seat
and renders it on the `conversation.composer.dock` slot. The plugin never
mutates the session and registers no model-visible capability.

## Build

The published bundle is built by `tsdown` (no monorepo checkout required):

```sh
npm install
npm run build      # -> lib/index.js (host) + lib/client.js (client)
npm test           # loads both halves and checks the rendered states
```

`scripts/build.sh` is an optional development helper that links a local DSH
checkout and type-checks the host half with that checkout's `tsc`.

## License

MIT
