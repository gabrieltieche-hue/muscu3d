/**
 * Localise les plis francs du maillage : on cherche les arêtes dont les
 * normales de faces adjacentes forment un angle important. Les positions
 * sont imprimées en coordonnées normalisées (hauteur = 1).
 */
import * as THREE from 'three'
import { buildBodyGeometry, DEFAULT_PARAMS } from '../../src/lib/body'

import { loadModel } from './load-model'
await loadModel()

const b = buildBodyGeometry(DEFAULT_PARAMS)
const pos = b.positions
const idx = b.geometry.getIndex()!.array as Uint32Array

const n = pos.length / 3
// normales de faces
const fn = new Float32Array((idx.length / 3) * 3)
for (let t = 0; t < idx.length; t += 3) {
  const a = idx[t] * 3
  const bb = idx[t + 1] * 3
  const c = idx[t + 2] * 3
  const e1x = pos[bb] - pos[a]
  const e1y = pos[bb + 1] - pos[a + 1]
  const e1z = pos[bb + 2] - pos[a + 2]
  const e2x = pos[c] - pos[a]
  const e2y = pos[c + 1] - pos[a + 1]
  const e2z = pos[c + 2] - pos[a + 2]
  const nx = e1y * e2z - e1z * e2y
  const ny = e1z * e2x - e1x * e2z
  const nz = e1x * e2y - e1y * e2x
  const l = Math.hypot(nx, ny, nz) || 1
  fn[t] = nx / l
  fn[t + 1] = ny / l
  fn[t + 2] = nz / l
}

// pour chaque arête : max angle entre les faces adjacentes
const edge = new Map<number, number[]>()
for (let t = 0; t < idx.length; t += 3) {
  const v = [idx[t], idx[t + 1], idx[t + 2]]
  for (let k = 0; k < 3; k++) {
    const a = v[k]
    const c = v[(k + 1) % 3]
    const key = a < c ? a * 1000000 + c : c * 1000000 + a
    const arr = edge.get(key)
    if (arr) arr.push(t)
    else edge.set(key, [t])
  }
}
let worst: Array<{ ang: number; x: number; y: number; z: number }> = []
for (const [key, faces] of edge) {
  if (faces.length !== 2) continue
  const t0 = faces[0]
  const t1 = faces[1]
  const d = fn[t0] * fn[t1] + fn[t0 + 1] * fn[t1 + 1] + fn[t0 + 2] * fn[t1 + 2]
  const ang = Math.acos(Math.max(-1, Math.min(1, d)))
  const a = idx[t0] * 3
  worst.push({ ang, x: pos[a] / 1.75, y: pos[a + 1] / 1.75, z: pos[a + 2] / 1.75 })
}
worst.sort((p, q) => q.ang - p.ang)
console.log('angles les plus francs (degrés) :')
for (let i = 0; i < Math.min(25, worst.length); i++) {
  const w = worst[i]
  console.log(
    `  ${((w.ang * 180) / Math.PI).toFixed(1).padStart(6)}°  x=${w.x.toFixed(3)} y=${w.y.toFixed(3)} z=${w.z.toFixed(3)}`,
  )
}
// histogramme : distribution des angles
let over60 = 0
let over40 = 0
for (const w of worst) {
  const d = (w.ang * 180) / Math.PI
  if (d > 60) over60++
  if (d > 40) over40++
}
console.log(`arêtes : ${worst.length}, >40° : ${over40}, >60° : ${over60}`)
// zone de la cuisse (y 0.25..0.55)
const thigh = worst.filter((w) => w.y > 0.25 && w.y < 0.55 && Math.abs(w.x) < 0.14)
thigh.sort((p, q) => q.ang - p.ang)
console.log(`cuisses : ${thigh.length} arêtes, dont >50° : ${thigh.filter((w) => (w.ang * 180) / Math.PI > 50).length}`)
for (let i = 0; i < Math.min(10, thigh.length); i++) {
  const w = thigh[i]
  console.log(
    `  ${((w.ang * 180) / Math.PI).toFixed(1).padStart(6)}°  x=${w.x.toFixed(3)} y=${w.y.toFixed(3)} z=${w.z.toFixed(3)}`,
  )
}
void THREE
void n
