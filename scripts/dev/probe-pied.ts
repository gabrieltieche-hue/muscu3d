/**
 * Diagnostic de la correction du pied : normale de la plante, angle de
 * correction, et amplitude du déplacement des orteils.
 */
import * as THREE from 'three'
import { getBaseMesh } from '../../src/lib/base/mesh'
import { posePositions } from '../../src/lib/base/pose'
import { applyTarget } from '../../src/lib/base/morph'
import { getLayerWeights, DEFAULT_PARAMS } from '../../src/lib/body'

import { loadModel } from './load-model'
await loadModel()

const base = getBaseMesh()
const morphed = new Float32Array(base.positions)
const w = getLayerWeights(DEFAULT_PARAMS)
for (const [name, v] of Object.entries(w)) applyTarget(morphed, name, v)
const { positions, joints } = posePositions(morphed, base.joints)

const idx = base.indices
const n = positions.length / 3

// normale moyenne de la plante (faces tournées vers le bas) dans la zone du pied
for (const side of ['l', 'r'] as const) {
  const ankle = joints[`${side}-ankle`]
  const toe = joints[`${side}-foot-1`]
  console.log(
    `\n${side} : cheville (${ankle.x.toFixed(4)}, ${ankle.y.toFixed(4)}, ${ankle.z.toFixed(4)})  orteil (${toe.x.toFixed(4)}, ${toe.y.toFixed(4)}, ${toe.z.toFixed(4)})`,
  )
  // vertices du pied : sous la cheville, dans un rayon
  const foot: number[] = []
  for (let i = 0; i < n; i++) {
    const dx = positions[i * 3] - ankle.x
    const dy = positions[i * 3 + 1] - ankle.y
    const dz = positions[i * 3 + 2] - ankle.z
    if (dy > 0.075 || dy < -0.012) continue
    if (Math.hypot(dx, dz) > 0.1) continue
    foot.push(i)
  }
  console.log(`  ${foot.length} sommets de pied`)
  // normales de faces vers le bas
  const acc = new THREE.Vector3()
  let cnt = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]
    const b = idx[t + 1]
    const c = idx[t + 2]
    if (!foot.includes(a) || !foot.includes(b) || !foot.includes(c)) continue
    const e1 = new THREE.Vector3(
      positions[b * 3] - positions[a * 3],
      positions[b * 3 + 1] - positions[a * 3 + 1],
      positions[b * 3 + 2] - positions[a * 3 + 2],
    )
    const e2 = new THREE.Vector3(
      positions[c * 3] - positions[a * 3],
      positions[c * 3 + 1] - positions[a * 3 + 1],
      positions[c * 3 + 2] - positions[a * 3 + 2],
    )
    const nn = new THREE.Vector3().crossVectors(e1, e2)
    const l = nn.length()
    if (l < 1e-12) continue
    if (nn.y > -0.2 * l) continue
    acc.add(nn)
    cnt++
  }
  console.log(`  ${cnt} faces vers le bas, normale moyenne = (${acc.x.toFixed(4)}, ${acc.y.toFixed(4)}, ${acc.z.toFixed(4)})`)
  if (acc.lengthSq() > 1e-12) {
    acc.normalize()
    const down = new THREE.Vector3(0, -1, 0)
    const ang = (Math.acos(Math.max(-1, Math.min(1, acc.dot(down)))) * 180) / Math.PI
    console.log(`  angle avec (0,-1,0) = ${ang.toFixed(2)}°`)
  }
  // étendue du pied en x/z
  let minX = 9
  let maxX = -9
  let minZ = 9
  let maxZ = -9
  for (const i of foot) {
    minX = Math.min(minX, positions[i * 3])
    maxX = Math.max(maxX, positions[i * 3])
    minZ = Math.min(minZ, positions[i * 3 + 2])
    maxZ = Math.max(maxZ, positions[i * 3 + 2])
  }
  console.log(`  étendue x ${minX.toFixed(4)}..${maxX.toFixed(4)}  z ${minZ.toFixed(4)}..${maxZ.toFixed(4)}`)
}
