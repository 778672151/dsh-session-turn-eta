import { createTurnEtaFold } from '../lib/index.js'

const build = (turns, stepsPerTurn) => {
  const events = []
  let seq = 0
  let time = 0
  const push = (type, data) => { events.push({ type, data, time, seq: seq++ }) }
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

const time = (events) => {
  const fold = createTurnEtaFold()
  for (const e of events.slice(0, events.length / 2)) fold.apply(e)
  const start = process.hrtime.bigint()
  for (const e of events) fold.apply(e)
  const ms = Number(process.hrtime.bigint() - start) / 1e6
  return { ms, rate: events.length / ms * 1000, samples: fold.state().stepSamples.length, turns: fold.state().completedTurnSteps.length }
}

for (const turns of [10, 20, 40, 80]) {
  const events = build(turns, 50)
  const r = time(events)
  console.log('turns=' + turns + ' events=' + events.length + ' samples=' + r.samples + ' -> ' + r.ms.toFixed(0) + 'ms, ' + r.rate.toFixed(0) + ' ev/s')
}
