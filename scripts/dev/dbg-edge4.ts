import { getBaseMesh } from '../../src/lib/base/mesh'
const base = getBaseMesh()
const quads = base.quads
const nF = quads.length / 4
// comptage par Map
const seen = new Map<string, number>()
for (let f = 0; f < nF; f++) {
  for (let k = 0; k < 4; k++) {
    const a = quads[f * 4 + k]
    const b = quads[f * 4 + ((k + 1) & 3)]
    const key = a < b ? `${a}_${b}` : `${b}_${a}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
}
console.log('edges distinctes (Map) :', seen.size)
const counts = new Map<number, number>()
for (const c of seen.values()) counts.set(c, (counts.get(c) ?? 0) + 1)
console.log('répartition par occurrences :', [...counts.entries()])
