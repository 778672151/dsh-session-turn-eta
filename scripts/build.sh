#!/bin/bash
# Local build for @dsh-external/dsh-session-turn-eta.
#
# The plugin type-checks against the PUBLISHED DSH packages of the version line
# it supports (0.2.1-rc.x), not against a monorepo checkout: that keeps the
# contract it compiles against identical to the contract the desktop app
# actually loads. Point DSH_CONTRACT_DIR at a node_modules tree that contains
# @deepseek-ai/* 0.2.1-rc.x plus zod; when unset the script looks for one in the
# usual places and finally falls back to a checkout's workspace packages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# --- 1. resolve the contract tree -------------------------------------------
CONTRACT="${DSH_CONTRACT_DIR:-}"
if [ -z "$CONTRACT" ]; then
  for candidate in "$HOME/.dsh/contracts/0.2.1-rc.5" "/tmp/eta-types/node_modules"; do
    if [ -d "$candidate/@deepseek-ai/dsh-session-projection" ]; then CONTRACT="$candidate"; break; fi
  done
fi
if [ -z "$CONTRACT" ]; then
  echo "build: no contract tree found (set DSH_CONTRACT_DIR to a node_modules with @deepseek-ai/* 0.2.1-rc.x)" >&2
  exit 1
fi

# --- 2. link it in ----------------------------------------------------------
link() {
  local link_path="$ROOT/node_modules/$1"
  local target="$2"
  if [ ! -e "$target" ]; then
    echo "build: missing $target (needed by $1)" >&2
    exit 1
  fi
  node -e "
    const fs = require('fs');
    const path = require('path');
    const link = path.resolve(process.argv[1]);
    const target = path.resolve(process.argv[2]);
    fs.rmSync(link, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, 'dir');
  " "$link_path" "$target"
}

echo "=== Linking the 0.2.1 contract ($CONTRACT) ==="
for pkg in cordis cosmokit schemastery dsh-session dsh-session-projection \
           dsh-client-ui-slots dsh-client-locale dsh-client-ui-conversation \
           dsh-api-session-controller; do
  link "@deepseek-ai/$pkg" "$CONTRACT/@deepseek-ai/$pkg"
done
link zod "$CONTRACT/zod"
# dsh-client-runtime is optional for the plugin (it only type-checks the client
# half against ui-slots); link it when the contract tree carries it.
if [ -e "$CONTRACT/@deepseek-ai/dsh-client-runtime" ]; then
  link "@deepseek-ai/dsh-client-runtime" "$CONTRACT/@deepseek-ai/dsh-client-runtime"
fi
# The client half needs React ambient types; they ship with the contract tree
# when it came from a checkout, and are optional otherwise.
if [ -n "${DSH_REACT_TYPES:-}" ] && [ -d "$DSH_REACT_TYPES/react" ]; then
  mkdir -p "$ROOT/node_modules/@types"
  link "@types/react" "$DSH_REACT_TYPES/react"
fi

# --- 3. toolchain shims -----------------------------------------------------
BIN="$ROOT/node_modules/.bin"
mkdir -p "$BIN"
if [ -e "$CONTRACT/typescript" ]; then
  link typescript "$CONTRACT/typescript"
  ln -sf ../typescript/bin/tsc "$BIN/tsc"
fi
if [ -n "${DSH_CHECKOUT:-}" ] && [ -e "$DSH_CHECKOUT/node_modules/tsdown/dist/run.mjs" ]; then
  ln -sf "$DSH_CHECKOUT/node_modules/tsdown/dist/run.mjs" "$BIN/tsdown"
fi

# --- 4. type-check ----------------------------------------------------------
# Both halves are checked: the host half against the server-side contract, the
# client half against the browser slots/locale contract.
if [ -f "$BIN/tsc" ] || [ -x "$BIN/tsc" ]; then
  TSC_VERSION=$("$BIN/tsc" --version)
  echo "=== Type-checking host src ($TSC_VERSION) ==="
  "$BIN/tsc" -p tsconfig.json
  echo "=== Type-checking client src ==="
  "$BIN/tsc" -p tsconfig.client.json
  echo "=== Type-check complete ==="
else
  echo "build: tsc unavailable, skipping type-check" >&2
fi
