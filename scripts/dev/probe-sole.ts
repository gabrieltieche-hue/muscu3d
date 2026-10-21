/**
 * Reproduit EXACTEMENT la mesure de la plante faite par la pose
 * (src/lib/base/pose.ts) sur le mesh morphé, avant la pose, et compare
 * les deux pieds.
 */
import * as THREE from 'three'
import { getBaseMesh } from '../../src/lib/base/mesh'
import { loadModel } from './load-model'
import { applyTarget } from '../../src/lib/base/morph'
import { getLayerWeights, DEFAULT_PARAMS } from '../../src/lib/body'

console.log('debut')
await loadModel()
console.log('modele charge')
const base = getBaseMesh()
const morphed = new Float32Array(base.positions)
const w = getLayerWeights(DEFAULT_PARAMS)
for (const [name, v] of Object.entries(w)) applyTarget(morphed, name, v)

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

for (const side of ['l', 'r'] as const) {
  const ankle = base.joints[`${side}-ankle`]
  const footWeight = (i: number) => {
    const px = morphed[i * 3]
    const py = morphed[i * 3 + 1]
    const pz = morphed[i * 3 + 2]
    const horiz = Math.hypot(px - ankle.x, pz - ankle.z)
    const below = smoothstep(ankle.y + 0.075, ankle.y - 0.012, py)
    const near = 1 - smoothstep(0.1, 0.16, horiz)
    return below * near
  }
  let n = 0
  let maxw = 0
  for (let i = 0; i < morphed.length / 3; i++) {
    const fw = footWeight(i)
    if (fw > maxw) maxw = fw
    if (fw > 0.98) n++
  }
  // faces vers le bas
  const acc = new THREE.Vector3()
  let cnt = 0
  const idx = base.indices
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]
    const b = idx[t + 1]
    const c = idx[t + 2]
    if (footWeight(a) < 0.98 || footWeight(b) < 0.98 || footWeight(c) < 0.98) continue
    const e1 = new THREE.Vector3(
      morphed[b * 3] - morphed[a * 3],
      morphed[b * 3 + 1] - morphed[a * 3 + 1],
      morphed[b * 3 + 2] - morphed[a * 3 + 2],
    )
    const e2 = new THREE.Vector3(
      morphed[c * 3] - morphed[a * 3],
      morphed[c * 3 + 1] - morphed[a * 3 + 1],
      morphed[c * 3 + 2] - morphed[a * 3 + 2],
    )
    const nn = new THREE.Vector3().crossVectors(e1, e2)
    const l = nn.length()
    if (l < 1e-12) continue
    if (nn.y > -0.2 * l) continue
    acc.add(nn)
    cnt++
  }
  const norm = acc.lengthSq() > 1e-12 ? acc.clone().normalize() : new THREE.Vector3(0, -1, 0)
  const down = new THREE.Vector3(0, -1, 0)
  const ang = (Math.acos(Math.max(-1, Math.min(1, norm.dot(down)))) * 180) / Math.PI
  console.log(
    `${side} : cheville (${ankle.x.toFixed(4)}, ${ankle.y.toFixed(4)}, ${ankle.z.toFixed(4)}) | ${n} sommets de pied (max w ${maxw.toFixed(3)}) | ${cnt} faces vers le bas | normale (${norm.x.toFixed(3)}, ${norm.y.toFixed(3)}, ${norm.z.toFixed(3)}) | ${ang.toFixed(1)}° de (0,-1,0)`,
  )
}
