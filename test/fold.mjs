// Standalone-fold test: the exported driver must behave exactly like the
// projection unit it wraps, and must be seedable from a captured state.
import assert from 'node:assert/strict'
import { createTurnEtaFold, emptyTurnEtaState, turnEtaProjectionDefinition } from '../lib/index.js'

let failures = 0
const check = (name, fn) => {
  try { fn(); console.log('PASS ' + name) }
  catch (e) { failures++; console.log('FAIL ' + name + ' :: ' + e.message) }
}

let seq = 0
const ev = (type, time, data) => ({ type, time, data, seq: seq++ })
const turn = (f, n, start, durations) => {
  f.apply(ev('turn/start', start, { turn: n }))
  let at = start
  for (const d of durations) {
    f.apply(ev('step/start', at, { turn: n, step: 1 }))
    at += d
    f.apply(ev('step/end', at, { turn: n, step: 1 }))
  }
  f.apply(ev('turn/end', at + 500, { turn: n, reason: { kind: 'completed' } }))
}

check('an empty fold publishes the zeroed, non-open view', () => {
  const view = createTurnEtaFold().view()
  assert.equal(view.open, false)
  assert.equal(view.turn, 0)
  assert.equal(view.method, 'insufficient-data')
})

check('the fold matches the projection unit event for event', () => {
  const fold = createTurnEtaFold()
  let state = turnEtaProjectionDefinition.init({}, 0)
  const events = [
    ev('turn/start', 1000, { turn: 1 }),
    ev('step/start', 1000, { turn: 1, step: 1 }),
    ev('step/end', 3000, { turn: 1, step: 1 }),
    ev('assistant/message', 3500, { turn: 1, step: 1 }),
    ev('step/start', 3500, { turn: 1, step: 2 }),
    ev('step/end', 5000, { turn: 1, step: 2 }),
    ev('turn/end', 5500, { turn: 1, reason: { kind: 'completed' } }),
  ]
  for (const event of events) {
    state = turnEtaProjectionDefinition.apply(state, event)
    assert.deepEqual(JSON.parse(JSON.stringify(fold.apply(event))), JSON.parse(JSON.stringify(turnEtaProjectionDefinition.wire.view(state))))
  }
  assert.equal(fold.view().durationMs, 4500)
  assert.equal(fold.view().completed, true)
})

check('a folded turn anchors the next one', () => {
  const fold = createTurnEtaFold()
  for (let n = 1; n <= 3; n++) turn(fold, n, n * 100000, [2000, 2000, 2000])
  fold.apply(ev('turn/start', 400000, { turn: 4 }))
  fold.apply(ev('step/start', 400000, { turn: 4, step: 1 }))
  fold.apply(ev('step/end', 402000, { turn: 4, step: 1 }))
  const view = fold.view()
  assert.equal(view.open, true)
  assert.equal(view.completedSteps, 1)
  assert.equal(view.method, 'step-mean')
  assert.ok(view.remainingMs > 0, 'a live turn must keep runway')
})

check('a captured state reseeds a fold without replaying the log', () => {
  const first = createTurnEtaFold()
  for (let n = 1; n <= 3; n++) turn(first, n, n * 100000, [2000, 2000, 2000])
  const captured = first.state()
  const resumed = createTurnEtaFold(JSON.parse(JSON.stringify(captured)))
  assert.deepEqual(JSON.parse(JSON.stringify(resumed.view())), JSON.parse(JSON.stringify(first.view())))
  resumed.apply(ev('turn/start', 400000, { turn: 4 }))
  resumed.apply(ev('step/start', 400000, { turn: 4, step: 1 }))
  resumed.apply(ev('step/end', 402000, { turn: 4, step: 1 }))
  assert.equal(resumed.view().open, true)
  assert.equal(resumed.view().completedSteps, 1)
})

check('empty states are not shared between folds', () => {
  const a = emptyTurnEtaState()
  const b = emptyTurnEtaState()
  assert.notEqual(a, b)
  assert.notEqual(a.stepSamples, b.stepSamples)
  assert.notEqual(a.completedTurnSteps, b.completedTurnSteps)
})

if (failures > 0) {
  console.log('\n' + failures + ' FAILED')
  process.exit(1)
}
console.log('ALL PASS')
