import { createTurnEtaFold } from '../lib/index.js'

const build = (turns, stepsPerTurn) => {
  const events = []
  let seq = 0
  let time = 0
  const push = (type, data) => { events.push({ type, time, data, seq: seq++ }) }
  for (let turn = 1; turn <= turns; turn++) {
    push('turn/start', { turn })
    for (let step = 1; step <= stepsPerTurn; step++) {
      time += 200
      push('step/start', { turn, step })
      for (let k = 0; k < 3; k++) {
        time += 300
        push(k === 1 ? 'tool/call' : 'assistant/message', { turn, step, callId: 'c' + step, name: 'x', arguments: {} })
        time += 200
        push(k === 1 ? 'tool/result' : 'assistant/message', { turn, step, callId: 'c' + step, message: {} })
      }
      time += 400
      push('step/end', { turn, step })
    }
    push('turn/end', { turn, reason: { kind: 'completed' } })
  }
  return events
}

const run = (label, events, repeats) => {
  const fold = createTurnEtaFold()
  for (const e of events.slice(0, events.length / 2)) fold.apply(e)
  const start = process.hrtime.bigint()
  for (let r = 0; r < repeats; r++) for (const e of events) fold.apply(e)
  const ms = Number(process.hrtime.bigint() - start) / 1e6
  const total = events.length * repeats
  console.log(label + ': ' + total + ' events in ' + ms.toFixed(0) + 'ms -> ' + (total / ms * 1000).toFixed(0) + ' events/s')
}

run('short history (4 turns x 10 steps)', build(4, 10), 40)
run('long history (8 turns x 50 steps)', build(8, 50), 4)
