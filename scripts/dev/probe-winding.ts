import { getBaseMesh } from '../../src/lib/base/mesh'

import { loadModel } from './load-model'
await loadModel()

const base = getBaseMesh()
const P = base.positions
const idx = base.indices

for (const s of ['l', 'r'] as const) {
  const ankle = base.joints[s + '-ankle']
  const sel: number[] = []
  for (let i = 0; i < P.length / 3; i++) {
    const dy = P[i * 3 + 1] - ankle.y
    const horiz = Math.hypot(P[i * 3] - ankle.x, P[i * 3 + 2] - ankle.z)
    if (dy > 0.08 || dy < -0.05) continue
    if (horiz > 0.12) continue
    sel.push(i)
  }
  let down = 0, up = 0, lat = 0, sumY = 0, cnt = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2]
    if (!sel.includes(a) || !sel.includes(b) || !sel.includes(c)) continue
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]]
    const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]]
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ]
    const l = Math.hypot(n[0], n[1], n[2]) || 1
    const ny = n[1] / l
    sumY += ny; cnt++
    if (ny < -0.2) down++
    else if (ny > 0.2) up++
    else lat++
  }
  console.log(`${s} : ${sel.length} sommets | faces bas ${down}, haut ${up}, laterales ${lat} | ny moyen ${(sumY / Math.max(cnt,1)).toFixed(3)}`)
  let minY = 9, maxY = -9
  for (const i of sel) { minY = Math.min(minY, P[i*3+1]); maxY = Math.max(maxY, P[i*3+1]) }
  console.log(`   y ${minY.toFixed(4)} .. ${maxY.toFixed(4)}`)
}
