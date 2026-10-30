// Host-side invariants for the turn-eta estimator, driven through the REAL
// `turnEta` projection fold (the same code path the desktop app runs) rather
// than a parallel model: every assertion below folds session events with
// `turnEtaProjectionDefinition.apply` and reads the published wire view.
import assert from 'node:assert/strict'
import { turnEtaProjectionDefinition, ETA_TUNING } from '../lib/index.js'

let failures = 0
const check = (name, fn) => {
  try { fn(); console.log('PASS ' + name) }
  catch (e) { failures++; console.log('FAIL ' + name + ' :: ' + e.message) }
}

/** A fold under test: the unit's own state plus the wire view of it. */
const fold = () => {
  let state = turnEtaProjectionDefinition.init({}, 0)
  const apply = (event) => {
    state = turnEtaProjectionDefinition.apply(state, event)
    return turnEtaProjectionDefinition.wire.view(state)
  }
  return { apply, view: () => turnEtaProjectionDefinition.wire.view(state) }
}

let seq = 0
const ev = (type, time, data) => ({ type, time, data, seq: seq++ })

function completedTurn(f, turn, start, durations, reason = 'completed') {
  let t = start
  f.apply(ev('turn/start', t, { turn }))
  for (let i = 0; i < durations.length; i++) {
    f.apply(ev('step/start', t, { turn, step: i + 1 }))
    t += durations[i]
    f.apply(ev('step/end', t, { turn, step: i + 1 }))
  }
  f.apply(ev('turn/end', t, { turn, reason: { kind: reason } }))
  return t
}

check('insufficient data before any rate sample exists', () => {
  const f = fold()
  const r = f.apply(ev('turn/start', 0, { turn: 1 }))
  assert.equal(r.method, 'insufficient-data')
  assert.equal(r.predictedTotalMs, undefined)
})

check('the first turn gets a bootstrap estimate once it has a step', () => {
  const f = fold()
  f.apply(ev('turn/start', 0, { turn: 1 }))
  f.apply(ev('step/start', 0, { turn: 1, step: 1 }))
  const r = f.apply(ev('step/end', 5000, { turn: 1, step: 1 }))
  assert.equal(r.method, 'step-mean')
  assert.ok(r.predictedTotalMs > 0, 'expected a bootstrap total, got ' + r.predictedTotalMs)
  assert.ok(r.expectedSteps >= ETA_TUNING.BOOTSTRAP_EXPECTED_STEPS,
    'expected the bootstrap step count, got ' + r.expectedSteps)
})

check('a non-completed turn still anchors the next turn', () => {
  const f = fold()
  const start2 = completedTurn(f, 1, 0, [1000, 1000, 1000], 'aborted')
  const r = f.apply(ev('turn/start', start2, { turn: 2 }))
  assert.equal(r.method, 'step-mean')
  assert.equal(r.expectedSteps, 3)
})

check('predicts a total from history once a turn completed', () => {
  const f = fold()
  const end = completedTurn(f, 1, 0, [1000, 1000, 1000, 1000, 1000])
  const r = f.apply(ev('turn/start', end, { turn: 2 }))
  assert.equal(r.method, 'step-mean')
  assert.equal(r.expectedSteps, 5)
  assert.ok(r.predictedTotalMs >= 4000 && r.predictedTotalMs <= 6000,
    'total ~5000, got ' + r.predictedTotalMs)
})

check('a 9-hour outlier step does not blow up the estimate', () => {
  const f = fold()
  let t = completedTurn(f, 1, 0, [1000, 1000, 1000, 1000, 1000])
  t = completedTurn(f, 2, t, [32_000_000])
  const r = f.apply(ev('turn/start', t, { turn: 3 }))
  assert.ok(r.predictedTotalMs < 100_000, 'expected a robust total, got ' + r.predictedTotalMs)
})

check('re-anchors instead of saturating on a long turn', () => {
  const f = fold()
  const start2 = completedTurn(f, 1, 0, [2000, 2000, 2000])
  let t = start2
  f.apply(ev('turn/start', t, { turn: 2 }))
  let prevTotal
  let reAnchors = 0
  let lastRemaining = 0
  for (let i = 0; i < 15; i++) {
    f.apply(ev('step/start', t, { turn: 2, step: i + 1 }))
    t += 1000
    const p = f.apply(ev('step/end', t, { turn: 2, step: i + 1 }))
    if (prevTotal !== undefined && p.predictedTotalMs > prevTotal) reAnchors++
    prevTotal = p.predictedTotalMs
    lastRemaining = p.remainingMs
    // The bar must never be able to show completion while the turn is open.
    assert.ok(p.remainingMs > 0, 'remaining must stay positive at step ' + (i + 1) + ', got ' + p.remainingMs)
    assert.ok(p.predictedTotalMs > t - start2, 'the total must cover the elapsed time at step ' + (i + 1))
  }
  assert.ok(reAnchors > 0, 'expected at least one re-anchor on a turn past history')
  assert.ok(lastRemaining > 0, 'the estimate should stay live, got remaining ' + lastRemaining)
})

check('the expected step count grows once the turn outlives history', () => {
  const f = fold()
  const start2 = completedTurn(f, 1, 0, [1000, 1000, 1000])
  let t = start2
  f.apply(ev('turn/start', t, { turn: 2 }))
  let atSix = 0
  for (let i = 0; i < 6; i++) {
    f.apply(ev('step/start', t, { turn: 2, step: i + 1 }))
    t += 1000
    const p = f.apply(ev('step/end', t, { turn: 2, step: i + 1 }))
    if (i === 5) atSix = p.expectedSteps
  }
  assert.ok(atSix > 3, 'expected the anchor to grow past history, got ' + atSix)
})

check('re-anchors upward before the turn fully outruns the estimate', () => {
  // A turn whose real total is far past the first anchor must stop being pinned
  // to that anchor. Holding until elapsed >= total (the old rule) froze the bar
  // at the early estimate and left the remaining time wrong for the whole turn.
  const f = fold()
  let t = 0
  for (let turn = 1; turn <= 5; turn++) t = completedTurn(f, turn, t, [1000, 1000])
  f.apply(ev('turn/start', t, { turn: 6 }))
  const start = t
  let firstTotal
  let total
  for (let i = 0; i < 40; i++) {
    f.apply(ev('step/start', t, { turn: 6, step: i + 1 }))
    t += 3000
    total = f.apply(ev('step/end', t, { turn: 6, step: i + 1 })).predictedTotalMs
    if (firstTotal === undefined) firstTotal = total
    assert.ok(total >= firstTotal, 'the published total must never shrink')
  }
  const elapsed = t - start
  assert.ok(total > firstTotal * 3, 'expected growth past the first anchor: ' + firstTotal + ' -> ' + total)
  assert.ok(elapsed > firstTotal * 0.6, 'test premise: the turn should have passed the re-anchor point')
})

check('a right-skewed history is tracked by the robust high quantile', () => {
  // Sorted samples [1000,1000,1000,5000]: a 60th-percentile rate would read
  // 1000, while the 90th-percentile rate (after winsorising) reads ~3800, so the
  // estimate has to sit well above the flat-rate one instead of ignoring the
  // step that actually dominates this session.
  const f = fold()
  const end = completedTurn(f, 1, 0, [1000, 1000, 1000, 5000])
  const r = f.apply(ev('turn/start', end, { turn: 2 }))
  assert.equal(r.method, 'step-mean')
  assert.equal(r.expectedSteps, 4)
  assert.ok(r.predictedTotalMs > 8000, 'expected a high-quantile total, got ' + r.predictedTotalMs)
})

check('the total always stays ahead of the elapsed time, even across a long gap', () => {
  // The guarantee that keeps the bar off 100% is *runway*, not monotonicity: the
  // published total may fall back (the live estimate can drop), but it must never
  // sit at or behind the elapsed time of an open turn.
  const f = fold()
  const start2 = completedTurn(f, 1, 0, [2000, 2000, 2000])
  let t = start2
  f.apply(ev('turn/start', t, { turn: 2 }))
  for (let i = 0; i < 12; i++) {
    f.apply(ev('step/start', t, { turn: 2, step: i + 1 }))
    t += i === 6 ? 90000 : 1000  // one long tool call mid-turn
    const p = f.apply(ev('step/end', t, { turn: 2, step: i + 1 }))
    assert.ok(p.predictedTotalMs > t - start2,
      'total must cover elapsed at step ' + (i + 1) + ': ' + p.predictedTotalMs + ' vs ' + (t - start2))
    assert.ok(p.remainingMs > 0, 'remaining must stay positive at step ' + (i + 1))
  }
})

check('an unchanged event returns the same state reference (zero downstream work)', () => {
  // The fold contract: a unit uninterested in an event MUST return the same
  // state reference, because an unchanged reference is what tells the registry
  // to skip the view computation and the change feed entirely.
  let state = turnEtaProjectionDefinition.init({}, 0)
  const unchanged = turnEtaProjectionDefinition.apply(state, ev('session/title', 1, { title: 'x' }))
  assert.equal(unchanged, state)
  state = turnEtaProjectionDefinition.apply(state, ev('turn/start', 10, { turn: 1 }))
  const otherTurn = turnEtaProjectionDefinition.apply(state, ev('step/end', 20, { turn: 99, step: 1 }))
  assert.equal(otherTurn, state, 'an event for another turn must not touch the open turn')
})

check('the closed-turn view reports the recorded duration exactly once', () => {
  const f = fold()
  const end = completedTurn(f, 1, 0, [1000, 1000], 'aborted')
  const view = f.view()
  assert.equal(view.open, false)
  assert.equal(view.turn, 1)
  assert.equal(view.completed, false)
  assert.equal(view.reason, 'aborted')
  assert.equal(view.durationMs, end)
  assert.equal(view.completedSteps, 2)
})

check('an empty fold publishes a zeroed, non-open view', () => {
  const view = fold().view()
  assert.equal(view.turn, 0)
  assert.equal(view.open, false)
  assert.equal(view.completedSteps, 0)
  assert.equal(view.method, 'insufficient-data')
})

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED')
process.exit(failures === 0 ? 0 : 1)
