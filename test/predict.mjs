// Host-side invariants for the turn-eta estimator, driven through the built
// event-emitting model (which shares etaCore with the projection fold).
import assert from 'node:assert/strict'
import { TurnEtaModel } from '../lib/index.js'

let failures = 0
const check = (name, fn) => {
  try { fn(); console.log('PASS ' + name) }
  catch (e) { failures++; console.log('FAIL ' + name + ' :: ' + e.message) }
}

const session = () => ({ id: 's', snapshotEvents: () => [] })
let seq = 0
const ev = (type, time, data) => ({ type, time, data, seq: seq++ })

function completedTurn(model, sess, turn, start, durations) {
  let t = start
  model.apply(sess, ev('turn/start', t, { turn }))
  for (let i = 0; i < durations.length; i++) {
    model.apply(sess, ev('step/start', t, { turn, step: i + 1 }))
    t += durations[i]
    model.apply(sess, ev('step/end', t, { turn, step: i + 1 }))
  }
  model.apply(sess, ev('turn/end', t, { turn, reason: { kind: 'completed' } }))
  return t
}

check('insufficient data before any completed turn', () => {
  const m = new TurnEtaModel(); const s = session()
  const r = m.apply(s, ev('turn/start', 0, { turn: 1 }))
  assert.equal(r.prediction.method, 'insufficient-data')
  assert.equal(r.prediction.predictedTotalMs, undefined)
})

check('predicts a total from history once a turn completed', () => {
  const m = new TurnEtaModel(); const s = session()
  const end = completedTurn(m, s, 1, 0, [1000, 1000, 1000, 1000, 1000])
  const r = m.apply(s, ev('turn/start', end, { turn: 2 }))
  assert.equal(r.prediction.method, 'step-mean')
  assert.equal(r.prediction.expectedSteps, 5)
  assert.ok(r.prediction.predictedTotalMs >= 4000 && r.prediction.predictedTotalMs <= 6000, 'total ~5000, got ' + r.prediction.predictedTotalMs)
})

check('a 9-hour outlier step does not blow up the estimate', () => {
  const m = new TurnEtaModel(); const s = session()
  let t = completedTurn(m, s, 1, 0, [1000, 1000, 1000, 1000, 1000])
  t = completedTurn(m, s, 2, t, [32_000_000])
  const r = m.apply(s, ev('turn/start', t, { turn: 3 }))
  assert.ok(r.prediction.predictedTotalMs < 100_000, 'expected a robust total, got ' + r.prediction.predictedTotalMs)
})

check('the open-turn total and remaining never increase', () => {
  const m = new TurnEtaModel(); const s = session()
  const end = completedTurn(m, s, 1, 0, [2000, 2000, 2000])
  let t = end
  m.apply(s, ev('turn/start', t, { turn: 2 }))
  let prevRemaining = Infinity; let prevTotal = Infinity
  const durations = [1000, 50000, 1000, 1000]
  for (let i = 0; i < durations.length; i++) {
    m.apply(s, ev('step/start', t, { turn: 2, step: i + 1 }))
    t += durations[i]
    const r = m.apply(s, ev('step/end', t, { turn: 2, step: i + 1 }))
    const p = r.prediction
    assert.ok(p.predictedTotalMs <= prevTotal, 'total increased: ' + prevTotal + ' -> ' + p.predictedTotalMs)
    assert.ok(p.remainingMs <= prevRemaining, 'remaining increased: ' + prevRemaining + ' -> ' + p.remainingMs)
    prevTotal = p.predictedTotalMs; prevRemaining = p.remainingMs
  }
})

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILED')
process.exit(failures === 0 ? 0 : 1)
