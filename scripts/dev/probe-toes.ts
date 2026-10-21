/**
 * Contrôle des sillons d'orteils : vérifie que les polylignes tombent bien
 * ENTRE les orteils du maillage construit (et non à l'intérieur).
 */
import * as THREE from 'three'
import { buildBodyGeometry, DEFAULT_PARAMS } from '../../src/lib/body'

import { loadModel } from './load-model'
await loadModel()

const b = buildBodyGeometry(DEFAULT_PARAMS)
const pos = b.positions
const H = DEFAULT_PARAMS.height / 100
const j = b.joints

const distToPoly = (px: number, py: number, pz: number, pts: THREE.Vector3[]) => {
  let best = Infinity
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k]
    const c = pts[k + 1]
    const abx = c.x - a.x
    const aby = c.y - a.y
    const abz = c.z - a.z
    const len2 = abx * abx + aby * aby + abz * abz
    const t = len2 > 1e-12 ? Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / len2)) : 0
    const dx = px - (a.x + abx * t)
    const dy = py - (a.y + aby * t)
    const dz = pz - (a.z + abz * t)
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d < best) best = d
  }
  return best
}

for (const side of ['l', 'r'] as const) {
  for (let f = 1; f < 5; f++) {
    const pts: THREE.Vector3[] = []
    for (const k of [1, 2, 3]) {
      const a = j[`${side}-toe-${f}-${k}`]
      const c = j[`${side}-toe-${f + 1}-${k}`]
      if (a && c) pts.push(a.clone().add(c).multiplyScalar(0.5))
    }
    if (pts.length < 2) continue
    // distance minimale du maillage à la polyligne
    let best = Infinity
    let bx = 0
    let by = 0
    let bz = 0
    for (let i = 0; i < pos.length / 3; i++) {
      const d = distToPoly(pos[i * 3] / H, pos[i * 3 + 1] / H, pos[i * 3 + 2] / H, pts)
      if (d < best) {
        best = d
        bx = pos[i * 3] / H
        by = pos[i * 3 + 1] / H
        bz = pos[i * 3 + 2] / H
      }
    }
    console.log(
      `${side} orteil ${f}/${f + 1} : dist min mesh = ${best.toFixed(5)}  (point ${bx.toFixed(4)}, ${by.toFixed(4)}, ${bz.toFixed(4)})`,
    )
  }
}
// où sont réellement les orteils du maillage ?
const toe = j['l-toe-1-3']
console.log('\nrepère l-toe-1-3 :', toe.x.toFixed(4), toe.y.toFixed(4), toe.z.toFixed(4))
let n = 0
for (let i = 0; i < pos.length / 3; i++) {
  const d = Math.hypot(pos[i * 3] / H - toe.x, pos[i * 3 + 1] / H - toe.y, pos[i * 3 + 2] / H - toe.z)
  if (d < 0.03) n++
}
console.log(`${n} sommets du maillage dans un rayon de 3 cm du repère l-toe-1-3`)
// y min du maillage (la plante)
let minY = 9
for (let i = 1; i < pos.length; i += 3) minY = Math.min(minY, pos[i])
console.log('y min (plante) =', minY.toFixed(4), 'm')
