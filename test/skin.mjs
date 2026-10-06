// Skin-system checks for the built client bundle: every preset renders, the
// skin can be chosen by prop or document attribute, the leading-dot / shimmer /
// celebration decorations are present, and reduced-motion CSS is shipped.
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

const code = readFileSync(join(root, 'lib/client.js'), 'utf8')
let captured
new Function('window', code)({ __ModuleLoader__: { load: (m) => { captured = m } } })

const element = (type, props) => ({ type, props: props || {} })
const react = {
  memo: (f) => f,
  createElement: (type, props, ...children) => element(type, { ...(props || {}), children: children.length <= 1 ? children[0] : children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useEffect: () => {},
  Fragment: Symbol('Fragment'),
}
const jsxRuntime = { jsx: (t, p) => element(t, p), jsxs: (t, p) => element(t, p), Fragment: react.Fragment }
const mod = captured.factory((id) => {
  if (id === 'react') return react
  if (id === 'react/jsx-runtime') return jsxRuntime
  throw new Error('unexpected require: ' + id)
})
const registered = []
mod.apply({
  effect: (fn) => fn(),
  locale: { register: () => ({}) },
  slots: { inject: (n, fn) => fn(), register: (o, c) => { registered.push({ o, c }); return () => {} } },
})
const Comp = registered[0].c
const t = (k) => k
const render = (eta, skin) => Comp({ useProjection: () => eta, t, skin })
const find = (node, pred) => {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (pred(node)) return node
  const kids = node.props ? node.props.children : undefined
  for (const c of (Array.isArray(kids) ? kids : kids === undefined ? [] : [kids])) { const hit = find(c, pred); if (hit) return hit }
  return null
}
const running = () => ({ open: true, startTime: Date.now() - 50000, completedSteps: 2, predictedTotalMs: 100000 })

check('module exposes the skin presets', () => {
  assert.ok(Array.isArray(mod.TURN_ETA_SKINS), 'TURN_ETA_SKINS missing')
  assert.ok(mod.TURN_ETA_SKINS.includes('auto'))
  assert.ok(mod.TURN_ETA_SKINS.includes('bilibili'))
  assert.ok(mod.TURN_ETA_SKINS.length >= 3, 'expected >= 3 presets, got ' + mod.TURN_ETA_SKINS.length)
  assert.equal(mod.TURN_ETA_DEFAULT_SKIN, 'auto')
})

check('default skin is auto (harness theme tokens)', () => {
  const tree = render(running())
  assert.equal(tree.props['data-skin'], 'auto')
})

check('an explicit preset wins', () => {
  const tree = render(running(), 'bilibili')
  assert.equal(tree.props['data-skin'], 'bilibili')
})

check('every preset renders a progressbar', () => {
  for (const skin of mod.TURN_ETA_SKINS) {
    const tree = render(running(), skin)
    const bar = find(tree, (n) => n.props && n.props.role === 'progressbar')
    assert.ok(bar, 'no progressbar for skin ' + skin)
    const v = Number(bar.props['aria-valuenow'])
    assert.ok(v >= 49 && v <= 51, 'skin ' + skin + ' percent ' + v)
  }
})

check('an unknown skin falls back to auto', () => {
  const tree = render(running(), 'not-a-skin')
  assert.equal(tree.props['data-skin'], 'auto')
})

check('the leading dot renders while running, celebration only when completed', () => {
  const run = render(running(), 'bilibili')
  assert.ok(find(run, (n) => n.props && n.props.className === 'dsh-eta-tip-' + classNameKey(run)), 'tip missing while running')
  const done = render({ open: false, startTime: 0, completedSteps: 3, completed: true }, 'bilibili')
  assert.ok(find(done, (n) => n.props && n.props.className === 'dsh-eta-celebration-' + classNameKey(done)), 'celebration missing when completed')
  assert.equal(find(done, (n) => n.props && String(n.props.className).startsWith('dsh-eta-tip-')), null, 'tip must not render when completed')
})

function classNameKey(tree) {
  return String(find(tree, (n) => n.props && n.props.className).props.className).split('-').pop()
}

check('shipped CSS carries gradient, glow, celebration and reduced-motion rules', () => {
  assert.match(code, /linear-gradient\(/, 'no gradient fill')
  assert.match(code, /dsh-eta-tip-/, 'no leading-dot class')
  assert.match(code, /dsh-eta-celebration-/, 'no celebration class')
  assert.match(code, /prefers-reduced-motion/, 'no reduced-motion guard')
  assert.match(code, /data-skin/, 'no skin selectors')
})

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED')
process.exit(failures === 0 ? 0 : 1)
