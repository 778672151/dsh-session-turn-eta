// Real-React render check for the moved UI: loads the built client bundle and
// renders the registered component with the checkout's React + react-dom/server.
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const checkout = process.env.DSH_CHECKOUT || '/home/zuoye/开发/deepseek-harness'
const fromCheckout = createRequire(join(checkout, 'packages/client/ui-chat/package.json'))
const react = fromCheckout('react')
const server = fromCheckout('react-dom/server')

const code = readFileSync(join(root, 'lib/client.js'), 'utf8')
let captured
new Function('window', code)({ __ModuleLoader__: { load: (m) => { captured = m } } })
const req = (id) => {
  if (id === 'react') return react
  if (id === 'react/jsx-runtime') return fromCheckout('react/jsx-runtime')
  throw new Error('unexpected require: ' + id)
}
const mod = captured.factory(req)
const registered = []
mod.apply({
  effect: (fn) => fn(),
  locale: { register: () => ({}) },
  slots: { inject: (n, fn) => fn(), register: (o, c) => { registered.push({ o, c }); return () => {} } },
})
const Comp = registered[0].c
const t = (k, p) => k + (p ? JSON.stringify(p) : '')
const html = (eta) => server.renderToStaticMarkup(react.createElement(Comp, { useProjection: () => eta, t }))

let failures = 0
const check = (name, fn) => {
  try { fn(); console.log('PASS ' + name) }
  catch (e) { failures++; console.log('FAIL ' + name + ' :: ' + e.message) }
}

check('react 18 resolved', () => {
  assert.ok(String(react.version).startsWith('18'), 'unexpected react ' + react.version)
  console.log('     react ' + react.version + ' from ' + checkout)
})
check('running ~50% renders with scoped class', () => {
  const now = Date.now()
  const out = html({ open: true, startTime: now - 50000, completedSteps: 2, predictedTotalMs: 100000 })
  assert.match(out, /data-turn-progress/)
  assert.match(out, /data-status="running"/)
  assert.match(out, /role="progressbar"/)
  const m = out.match(/aria-valuenow="(\d+)"/)
  assert.ok(m && Number(m[1]) >= 49 && Number(m[1]) <= 51, 'expected ~50: ' + out)
  assert.match(out, /dsh-eta-root-/)
})
check('completed -> 100%', () => {
  const out = html({ open: false, startTime: 0, completedSteps: 3, completed: true })
  assert.match(out, /data-status="completed"/)
  assert.match(out, /aria-valuenow="100"/)
})
check('failed -> interrupted', () => {
  const out = html({ open: false, startTime: 0, completedSteps: 3, completed: false })
  assert.match(out, /data-status="failed"/)
})
check('no projection -> empty', () => { assert.equal(html(undefined), '') })

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED')
process.exit(failures === 0 ? 0 : 1)
