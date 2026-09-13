import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { UserConfig } from 'tsdown'

const PLUGIN_ID = '@dsh-external/dsh-session-turn-eta'

/** Host half: transpile src/ with peer deps left external (no monorepo checkout). */
const hostConfig: UserConfig = {
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: ['zod', /^@deepseek-ai\//],
  },
  outputOptions: {
    entryFileNames: 'index.js',
  },
}

const CLIENT_EXTERNALS = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-runtime/client',
]

// Build-time CSS Modules, dependency-free: rewrite a .module.css import to a
// virtual JS module (id without a .css suffix, so tsdown's css-guard never sees
// it) that injects the same CSS text with class names scoped and exports the
// class map. The UI's .tsx and .module.css stay byte-identical.
const cssFiles = new Map<string, string>()

const cssModulesPlugin = {
  name: 'dsh-session-turn-eta:css-modules',
  resolveId(source: string, importer?: string) {
    if (!source.endsWith('.module.css') || importer === undefined) return null
    const absolute = resolve(dirname(importer), source)
    const id = '\0dsh-css:' + createHash('sha1').update(absolute).digest('hex')
    cssFiles.set(id, absolute)
    return id
  },
  load(id: string) {
    const absolute = cssFiles.get(id)
    if (absolute === undefined) return null
    const raw = readFileSync(absolute, 'utf8')
    const key = createHash('sha1').update(raw).digest('hex').slice(0, 6)
    const names: Record<string, string> = {}
    const css = raw.replace(/\.([A-Za-z_-][\w-]*)/g, (_match: string, name: string) => {
      if (names[name] === undefined) names[name] = 'dsh-eta-' + name + '-' + key
      return '.' + names[name]
    })
    const code = 'const css = ' + JSON.stringify(css) + ';\n'
      + 'if (typeof document !== "undefined" && document.querySelector("style[data-dsh-session-turn-eta]") === null) {\n'
      + '  const style = document.createElement("style");\n'
      + '  style.setAttribute("data-dsh-session-turn-eta", "");\n'
      + '  style.textContent = css;\n'
      + '  document.head.appendChild(style);\n'
      + '}\n'
      + 'export default ' + JSON.stringify(names) + ';\n'
    return { code, moduleType: 'js' as const }
  },
}

/** Client half: one browser bundle registered through window.__ModuleLoader__.load. */
const clientConfig: UserConfig = {
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  plugins: [cssModulesPlugin],
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (id: string) => !CLIENT_EXTERNALS.includes(id),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: ' + JSON.stringify(PLUGIN_ID) + ', factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
    codeSplitting: false,
  },
}

export default [hostConfig, clientConfig] as UserConfig[]
