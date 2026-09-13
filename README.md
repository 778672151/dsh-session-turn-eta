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
gap) cannot distort it. The expected step count is the **conditional median** of
the completed turns that were at least as long as this one, so a growing turn
keeps a live estimate; the published total is held while it still outruns the
turn and re-anchored to the live estimate once the turn runs past it. An
estimate therefore never sits at 100% while the turn keeps working.
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
