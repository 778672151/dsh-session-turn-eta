#!/bin/bash
# Local/injector build for @dsh-external/dsh-session-turn-eta.
# Links the host packages this plugin type-checks against, then type-checks with
# the checkout tsc. Emission is done by tsdown (npm run build / prepare), which
# is self-contained and needs no monorepo checkout.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CHECKOUT="${DSH_CHECKOUT:-}"
if [ -z "$CHECKOUT" ]; then
  for candidate in "/home/zuoye/开发/deepseek-harness" "$HOME/dsh-harness" "$HOME/dsh" "$HOME/.dsh/dsh-harness"; do
    if [ -d "$candidate/packages" ]; then CHECKOUT="$candidate"; break; fi
  done
fi
if [ -z "$CHECKOUT" ] || [ ! -d "$CHECKOUT/packages" ]; then
  echo "build: cannot locate the dsh checkout (set DSH_CHECKOUT)" >&2
  exit 1
fi

TSC="$CHECKOUT/node_modules/.bin/tsc"
if [ ! -x "$TSC" ] && [ ! -f "$TSC.cmd" ]; then
  echo "build: tsc not found at $TSC" >&2
  exit 1
fi

link_pkg() {
  local target="$CHECKOUT/$2"
  if [ ! -e "$target" ]; then
    echo "build: dependency target missing: $target" >&2
    exit 1
  fi
  node -e "
    const fs = require('fs');
    const path = require('path');
    const link = path.resolve(process.argv[1]);
    const target = path.resolve(process.argv[2]);
    fs.rmSync(link, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  " "node_modules/$1" "$target"
}

echo "=== Linking build dependencies (checkout: $CHECKOUT) ==="
mkdir -p node_modules/@deepseek-ai
node -e "const fs=require('fs');fs.rmSync('node_modules/@standard-schema',{recursive:true,force:true})"
link_pkg @deepseek-ai/cordis vendor/cordis
link_pkg @deepseek-ai/cosmokit vendor/cosmokit
link_pkg @deepseek-ai/schemastery vendor/schemastery
link_pkg @deepseek-ai/dsh-session packages/core/session
link_pkg @deepseek-ai/dsh-session-projection packages/session/session-projection
link_pkg @types/node node_modules/@types/node

ZOD_REL=$(cd "$CHECKOUT" && ls -d node_modules/.pnpm/zod@*/node_modules/zod 2>/dev/null | head -1)
if [ -n "$ZOD_REL" ]; then
  link_pkg zod "$ZOD_REL"
else
  echo "build: zod not found under the checkout .pnpm store" >&2
  exit 1
fi

STD_SCHEMA=$(find "$CHECKOUT/node_modules/.pnpm" -maxdepth 1 -type d -iname "@standard-schema+spec@*" 2>/dev/null | head -1)
if [ -n "$STD_SCHEMA" ]; then
  node -e "
    const fs = require('fs');
    const path = require('path');
    fs.rmSync('node_modules/@standard-schema', { recursive: true, force: true });
    fs.mkdirSync('node_modules/@standard-schema', { recursive: true });
    fs.symlinkSync(path.resolve(process.argv[1]), path.resolve('node_modules/@standard-schema/spec'), process.platform === 'win32' ? 'junction' : 'dir');
  " "$STD_SCHEMA/node_modules/@standard-schema/spec"
fi

echo "=== Type-checking src (tsc $("$TSC" --version)) ==="
"$TSC" -p tsconfig.json
echo "=== Type-check complete ==="
