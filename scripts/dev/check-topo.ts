/**
 * Qualité de la topologie de base : faces dégénérées, orientation
 * incohérente, arêtes non-manifoldes. Catmull-Clark amplifie les défauts
 * en pointes, il faut donc les connaître.
 */
import { getBaseMesh } from '../../src/lib/base/mesh'

import { loadModel } from './load-model'
await loadModel()

const base = getBaseMesh()
const P = base.positions
const quads = base.faces
const nF = quads.length / 4

// 1) faces de surface nulle ou quasi nulle
let degenerate = 0
let tiny: Array<{ f: number; a: number }> = []
for (let f = 0; f < nF; f++) {
  const o = f * 4
  const p = [0, 1, 2, 3].map((k) => {
    const i = quads[o + k] * 3
    return [P[i], P[i + 1], P[i + 2]] as [number, number, number]
  })
  // aire par triangulation
  const area = (a: number[], b: number[], c: number[]) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0],
    ]
    return Math.hypot(n[0], n[1], n[2]) * 0.5
  }
  const ar = area(p[0], p[1], p[2]) + area(p[0], p[2], p[3])
  if (ar < 1e-9) degenerate++
  if (ar < 2e-7) tiny.push({ f, a: ar })
}
console.log(`faces quads : ${nF}`)
console.log(` faces dégénérées (aire nulle) : ${degenerate}`)
console.log(` faces minuscules (aire < 2e-7) : ${tiny.length}`)
for (const t of tiny.slice(0, 20)) {
  const o = t.f * 4
  const cx = (P[quads[o] * 3] + P[quads[o + 1] * 3] + P[quads[o + 2] * 3] + P[quads[o + 3] * 3]) / 4
  const cy =
    (P[quads[o] * 3 + 1] + P[quads[o + 1] * 3 + 1] + P[quads[o + 2] * 3 + 1] + P[quads[o + 3] * 3 + 1]) / 4
  const cz =
    (P[quads[o] * 3 + 2] + P[quads[o + 1] * 3 + 2] + P[quads[o + 2] * 3 + 2] + P[quads[o + 3] * 3 + 2]) / 4
  console.log(`   face ${t.f} aire=${t.a.toExponential(2)} centre (${cx.toFixed(4)}, ${cy.toFixed(4)}, ${cz.toFixed(4)})`)
}

// 2) orientation : le centre de la face doit être à l'extérieur du corps.
//    On compare la normale de la face avec la direction centre-corps.
let flipped = 0
let flippedList: Array<{ f: number; y: number; z: number; x: number }> = []
for (let f = 0; f < nF; f++) {
  const o = f * 4
  const idx = [0, 1, 2].map((k) => quads[o + k] * 3)
  const e1 = [P[idx[1]] - P[idx[0]], P[idx[1] + 1] - P[idx[0] + 1], P[idx[1] + 2] - P[idx[0] + 2]]
  const e2 = [P[idx[2]] - P[idx[0]], P[idx[2] + 1] - P[idx[0] + 1], P[idx[2] + 2] - P[idx[0] + 2]]
  const n = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ]
  const len = Math.hypot(n[0], n[1], n[2])
  if (len < 1e-12) continue
  const cx = (P[idx[0]] + P[idx[1]] + P[idx[2]]) / 3
  const cy = (P[idx[1] + 1] + P[idx[1] + 1] + P[idx[2] + 1]) / 3
  const cz = (P[idx[2] + 2] + P[idx[2] + 2] + P[idx[2] + 2]) / 3
  // centre du corps approché
  const bodyC = [0, 0.5, 0.01]
  const d = [cx - bodyC[0], cy - bodyC[1], cz - bodyC[2]]
  const dl = Math.hypot(d[0], d[1], d[2]) || 1
  const dot = (n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / (len * dl)
  if (dot < 0) {
    flipped++
    flippedList.push({ f, x: cx, y: cy, z: cz })
  }
}
console.log(` faces à normale entrante : ${flipped}`)
const byRegion = new Map<string, number>()
for (const v of flippedList) {
  const key = v.y < 0.05 ? 'pieds' : v.y > 0.85 ? 'tete' : 'corps'
  byRegion.set(key, (byRegion.get(key) ?? 0) + 1)
}
console.log(' répartition :', [...byRegion.entries()])
for (const v of flippedList.slice(0, 12)) {
  console.log(`  face ${v.f}  centre (${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`)
}
