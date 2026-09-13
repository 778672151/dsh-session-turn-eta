# Add 778672151/dsh-session-turn-eta

Adds one plugin to the list.

- **Repo:** https://github.com/778672151/dsh-session-turn-eta
- **Category:** `ui`
- **Entry file:** `data/plugins/778672151__dsh-session-turn-eta.yml`

## What it does

The plugin predicts how much wall time the current turn still needs and renders
it as a progress bar with a live percentage and an estimated time left under the
composer. The estimate is re-anchored as the turn runs, so it stays meaningful
for long turns; a completed turn reads 100%, and a failed or interrupted one
turns the bar red.

## Installability

The repo declares a `dsh.bundle` manifest and ships `cordis.patch.yml` at its
root, so it installs with:

```sh
dsh plugin --profile web add github:778672151/dsh-session-turn-eta
```

It also ships a browser half (`dsh.client`, `platform: web`) that registers a
`conversation.composer.dock` entry. `lib/` is committed, so installing runs no
build step (the package intentionally has no `prepare` script).

## Checks run locally

- `dsh plugin --profile etatest add github:778672151/dsh-session-turn-eta` → exit 0,
  bundle composed into the profile, no build approval required
- `node test/smoke.mjs` → loads both halves and asserts the running / completed /
  failed / indeterminate states
- `node test/predict.mjs` → 7 host estimator invariants
- `node test/render-real.mjs` → real React 18 SSR render

The entry file is the only change in this PR.
