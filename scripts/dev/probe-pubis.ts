import { loadModel } from './load-model'
await loadModel()
import { buildBodyGeometry, DEFAULT_PARAMS } from '../../src/lib/body'
import { findPubis } from '../../src/lib/base/genitals'

const b = buildBodyGeometry(DEFAULT_PARAMS)
const H = DEFAULT_PARAMS.height / 100
const pubis = findPubis(b.positions, H)
console.log('pubis (normalisé) :', pubis.y.toFixed(4), pubis.z.toFixed(4), '-> en m :', (pubis.y * H).toFixed(3), (pubis.z * H).toFixed(3))
const g = b.genitals!
const p = g.getAttribute('position').array as Float32Array
let minY = 9, maxY = -9, minZ = 9, maxZ = -9, maxX = -9, minX = 9
for (let i = 0; i < p.length; i += 3) {
  minY = Math.min(minY, p[i+1]); maxY = Math.max(maxY, p[i+1])
  minZ = Math.min(minZ, p[i+2]); maxZ = Math.max(maxZ, p[i+2])
  maxX = Math.max(maxX, p[i]); minX = Math.min(minX, p[i])
}
console.log('génitaux (m) : y', minY.toFixed(3), maxY.toFixed(3), ' z', minZ.toFixed(3), maxZ.toFixed(3), ' x', minX.toFixed(3), maxX.toFixed(3))
// surface du corps au pubis
let best = -9, by = 0
for (let i = 0; i < b.positions.length; i += 3) {
  const x = b.positions[i] / H, y = b.positions[i+1] / H, z = b.positions[i+2] / H
  if (Math.abs(x) > 0.035) continue
  if (y < 0.465 || y > 0.535) continue
  if (z > best) { best = z; by = y }
}
console.log('surface pubienne : z', best.toFixed(4), 'y', by.toFixed(4))
