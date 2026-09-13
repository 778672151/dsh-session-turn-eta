# Add 778672151/dsh-session-turn-eta

Adds one plugin to the list.

- **Repo:** https://github.com/778672151/dsh-session-turn-eta
- **Category:** `ui`
- **Entry file:** `data/plugins/778672151__dsh-session-turn-eta.yml`

## What it does

The plugin predicts how much wall time the current turn still needs, from the
mean duration of the turn's completed steps, and renders it as a progress bar
with a live percentage and an estimated time left under the composer. A
completed turn reads 100%; a failed or interrupted one turns the bar red.

## Installability

The repo declares a `dsh.bundle` manifest and ships `cordis.patch.yml` at its
root, so it installs with:

```sh
dsh plugin --profile web add github:778672151/dsh-session-turn-eta
```

It also ships a browser half (`dsh.client`, `platform: web`) that registers a
`conversation.composer.dock` entry.

## Checks run locally

- `npm pack` → tarball contains `lib/index.js`, `lib/client.js`, `cordis.patch.yml`, `LICENSE`, `README.md`
- `dsh plugin --profile etatest add <tgz>` → exit 0, bundle composed into the profile
- `node test/smoke.mjs` → loads both halves and asserts the running / completed / failed / indeterminate states (9/9 pass)

The entry file is the only change in this PR.
