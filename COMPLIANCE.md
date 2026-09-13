# Marketplace compliance (awesome-dsh-plugin)

Source of truth: `awesome-dsh-plugin/awesome-dsh-plugin` → `contributing.md`
(fetched 2026-09-13 from `raw.githubusercontent.com/awesome-dsh-plugin/awesome-dsh-plugin/main/contributing.md`).
Catalog consumed by dsh-market via `https://awesome-dsh-plugin.com/plugins.json`.

| # | Requirement (contributing.md) | Where it is met | Evidence |
|---|---|---|---|
| R1 | PR adds one file `data/plugins/<owner>__<repo>.yml` | not yet (Phase 4, awaits repo + credentials) | — |
| R2 | YAML fields `url`/ `name`/ `category`/ `description.en` | draft entry prepared | see Phase 4 |
| R3 | `package.json` declares `dsh.bundle` + a `cordis.patch.yml` at the repo root | `package.json` `dsh.bundle.patch`; `cordis.patch.yml` | `node -e "console.log(require('./package.json').dsh)"` |
| R4 | Real, working code | host fold + client component; `npm test` | `node test/smoke.mjs` → ALL PASS |
| R5 | Repo at least 1 day old | not yet (new repo) | GitHub API `created_at` |
| R6 | Actively maintained | versioned source repo | — |
| R7 | `dsh-plugin` GitHub topic | not yet (set on repo creation) | repo topics API |
| R8 | Accurate description, no marketing; matching category | `package.json` description + entry `description.en` | description names only the visible behavior |
| R9 | Do not hand-edit generated READMEs | only the entry YAML is submitted | — |
| R10 | Monorepo subpackage naming | not applicable (standalone repo) | — |

## Build / load evidence

```
dev_build_plugin {dir: .../dsh-session-turn-eta}
→ OK: 构建打包完成；host 构建完成；client 构建完成（tsdown → lib/client.js）

node test/smoke.mjs
→ PASS host exports name/inject/apply
→ PASS client bundle registers under its id
→ PASS client exports apply/inject
→ PASS apply registers a conversation.composer.dock entry
→ PASS no projection -> renders nothing
→ PASS running -> bar ~50%
→ PASS completed -> 100%
→ PASS failed -> interrupted status
→ PASS running without a total -> indeterminate
→ ALL PASS
```

## Install evidence (throwaway DSH_HOME)

```
npm pack
→ dsh-external-dsh-session-turn-eta-0.1.0.tgz (8 files:
  LICENSE, README.md, cordis.patch.yml, lib/index.js, lib/index.js.map,
  lib/client.js, lib/client.js.map, package.json)

DSH_HOME=/tmp/dsh-eta-home dsh plugin --profile etatest add <tgz>
→ dsh: initialized profile etatest at /tmp/dsh-eta-home/profiles/etatest
→ + @dsh-external/dsh-session-turn-eta file:...tgz
→ Done in 1.2s using pnpm v11.7.0        (EXIT 0)

cat /tmp/dsh-eta-home/profiles/etatest/package.json
→ dependencies: { "@dsh-external/dsh-session-turn-eta": "file:...tgz" }
→ dsh.profile.bundles: ["@deepseek-ai/dsh-base", "@dsh-external/dsh-session-turn-eta"]

dsh plugin --profile etatest list
→ @dsh-external/dsh-session-turn-eta@0.1.0
```
