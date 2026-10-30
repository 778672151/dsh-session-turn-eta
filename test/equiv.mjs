// Equivalence fuzz: the optimised primitives must match the reference formulas
// bit for bit, and the sorted memo must stay ascending under random appends.
import assert from 'node:assert/strict'
import { ascending, expectedTotalSteps, insertSorted, median, quantile, robustQuantile, withSample } from '../lib/index.js'

const CAP = 8
const q = quantile
const referenceRobust = (sorted, fraction) => {
  if (sorted.length === 0) return 0
  const centre = median(sorted)
  if (!(centre > 0)) return q(sorted, fraction)
  const cap = centre * CAP
  return q(sorted.map((v) => Math.min(v, cap)), fraction)
}
const referenceExpected = (steps, completed) => {
  const base = median(ascending(steps)) ?? 10
  if (completed <= 0) return base
  const longer = steps.filter((c) => c >= completed)
  if (longer.length > 0) return Math.max(base, median(ascending(longer)))
  return Math.max(base, completed + Math.max(2, Math.ceil(completed * 0.25)))
}

let rng = 42
const rand = () => { rng = (rng * 1103515245 + 12345) % 2147483648; return rng / 2147483648 }
const pick = (n) => Math.floor(rand() * n)

let checks = 0
for (let round = 0; round < 300; round++) {
  const n = pick(40)
  const raw = Array.from({ length: n }, () => (rand() < 0.1 ? 3e6 : pick(9000)))
  const sorted = ascending(raw)
  for (const fraction of [0.25, 0.5, 0.75, 0.9]) {
    assert.ok(Math.abs(robustQuantile(sorted, fraction) - referenceRobust(sorted, fraction)) < 1e-9, 'robust quantile diverged')
    checks++
  }
  const steps = Array.from({ length: pick(30) }, () => pick(40))
  for (const completed of [0, 1, 2, 5, 12, 40, 90]) {
    assert.equal(expectedTotalSteps(steps, completed), referenceExpected(steps, completed), 'expected steps diverged')
    checks++
  }
  // incremental append keeps one ascending copy equal to a full sort
  let samples = []
  for (const value of raw) samples = withSample(samples, value)
  assert.deepEqual(ascending(samples), sorted, 'incremental sorted memo diverged')
  // insertSorted agrees with a full sort on every list
  for (let i = 0; i < 20; i++) {
    const list = ascending(Array.from({ length: pick(15) }, () => pick(100)))
    const value = pick(100)
    assert.deepEqual(insertSorted(list, value), ascending([...list, value]), 'insertSorted diverged')
    checks++
  }
}

console.log('ALL PASS (' + checks + ' equivalence checks)')
