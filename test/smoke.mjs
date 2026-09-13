// Smoke test for the built plugin: loads lib/index.js and lib/client.js and
// asserts registration + rendered progress states. No browser required.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0
const check = (name, fn) => {
  try { fn(); console.log('PASS ' + name) }
  catch (e) { failures++; console.log('FAIL ' + name + ' :: ' + e.message) }
}

const host = await import('file://' + join(root, 'lib/index.js'))
check('host exports name/inject/apply', () => {
  assert.equal(host.name, 'session-turn-eta')
  assert.deepEqual(host.inject, ['sessionProjections'])
  assert.equal(typeof host.apply, 'function')
  assert.equal(typeof host.TurnEtaModel, 'function')
})

const code = readFileSync(join(root, 'lib/client.js'), 'utf8')
let captured
new Function('window', code)({ __ModuleLoader__: { load: (m) => { captured = m } } })
check('client bundle registers under its id', () => {
  assert.ok(captured, 'window.__ModuleLoader__.load was not called')
  assert.equal(captured.id, '@dsh-external/dsh-session-turn-eta')
  assert.equal(typeof captured.factory, 'function')
})

const element = (type, props) => ({ type, props: props || {} })
const react = {
  memo: (f) => f,
  createElement: (type, props, ...children) => element(type, {
    ...(props || {}),
    children: children.length === 0 ? (props && props.children) : (children.length === 1 ? children[0] : children),
  }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  Fragment: Symbol('Fragment'),
}
const jsxRuntime = {
  jsx: (type, props) => element(type, props),
  jsxs: (type, props) => element(type, props),
  Fragment: react.Fragment,
}
const req = (id) => {
  if (id === 'react') return react
  if (id === 'react/jsx-runtime') return jsxRuntime
  throw new Error('unexpected require: ' + id)
}
const mod = captured.factory(req)
check('client exports apply/inject', () => {
  assert.equal(typeof mod.apply, 'function')
  assert.deepEqual(mod.inject, ['slots', 'locale'])
})

const registered = []
const localeCalls = []
const ctx = {
  effect: (fn, label) => { fn(); return label },
  locale: { register: (ns, d) => { localeCalls.push(ns); return d } },
  slots: { inject: (n, fn) => fn(), register: (o, c) => { registered.push({ o, c }); return () => {} } },
}
check('apply registers a conversation.composer.dock entry', () => {
  mod.apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].o.name, 'conversation.composer.dock')
  assert.equal(registered[0].o.id, 'dsh-session-turn-eta')
  assert.equal(registered[0].o.order, -1)
  assert.equal(registered[0].o.locale, 'dsh-session-turn-eta')
  assert.ok(localeCalls.includes('dsh-session-turn-eta'), 'locale namespace not registered')
})

const Comp = registered[0].c
const t = (k, p) => k + (p ? JSON.stringify(p) : '')
const render = (eta) => Comp({ useProjection: () => eta, t })
const find = (node, pred) => {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (pred(node)) return node
  const kids = node.props ? node.props.children : node.children
  const list = Array.isArray(kids) ? kids : (kids === undefined ? [] : [kids])
  for (const c of list) { const hit = find(c, pred); if (hit) return hit }
  return null
}
const bar = (node) => find(node, (n) => n.props && n.props.role === 'progressbar')

check('no projection -> renders nothing', () => { assert.equal(render(undefined), null) })
check('running -> bar ~50%', () => {
  const now = Date.now()
  const tree = render({ open: true, startTime: now - 50000, completedSteps: 2, predictedTotalMs: 100000 })
  assert.ok(tree && tree.props['data-turn-progress'], 'no progress root')
  assert.equal(tree.props['data-status'], 'running')
  const b = bar(tree)
  const v = Number(b.props['aria-valuenow'])
  assert.ok(v >= 49 && v <= 51, 'expected ~50, got ' + v)
  assert.ok(String(b.props['aria-valuetext']).includes('turnProgress.etaSeconds'), 'missing eta text')
})
check('completed -> 100%', () => {
  const tree = render({ open: false, startTime: 0, completedSteps: 3, completed: true })
  assert.equal(tree.props['data-status'], 'completed')
  assert.equal(bar(tree).props['aria-valuenow'], 100)
})
check('failed -> interrupted status', () => {
  const tree = render({ open: false, startTime: 0, completedSteps: 3, completed: false })
  assert.equal(tree.props['data-status'], 'failed')
  assert.equal(bar(tree).props['aria-valuenow'], 100)
})
check('running without a total -> indeterminate', () => {
  const tree = render({ open: true, startTime: Date.now(), completedSteps: 1 })
  assert.equal(tree.props['data-status'], 'running')
  assert.equal(bar(tree).props['aria-valuenow'], undefined)
})

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED')
process.exit(failures === 0 ? 0 : 1)
