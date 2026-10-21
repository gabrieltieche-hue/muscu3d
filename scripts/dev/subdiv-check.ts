/**
 * Contrôle de la subdivision Catmull-Clark : volume, boîte d'englobante,
 * intégrité de la topologie (chaque arête doit être partagée par 2 faces)
 * et temps de calcul par image.
 */
import { getBaseMesh } from '../../src/lib/base/mesh'
import { getSubdivider } from '../../src/lib/base/subdiv'

const base = getBaseMesh()

function stats(pos: Float32Array, idx: Uint16Array | Uint32Array) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i]
    if (pos[i] > maxX) maxX = pos[i]
    if (pos[i + 1] < minY) minY = pos[i + 1]
    if (pos[i + 1] > maxY) maxY = pos[i + 1]
    if (pos[i + 2] < minZ) minZ = pos[i + 2]
    if (pos[i + 2] > maxZ) maxZ = pos[i + 2]
  }
  let vol = 0
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]
    vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return { minX, maxX, minY, maxY, minZ, maxZ, vol: Math.abs(vol) }
}

/** arêtes non-manifoldes (devraient être 0 sur un maillage fermé) */
function boundaryEdges(quads: Uint32Array): number {
  const seen = new Map<number, number>()
  for (let f = 0; f < quads.length; f += 4) {
    for (let k = 0; k < 4; k++) {
      const a = quads[f + k]
      const b = quads[f + ((k + 1) & 3)]
      const key = a < b ? a * 1e7 + b : b * 1e7 + a
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
  }
  let n = 0
  for (const c of seen.values()) if (c !== 2) n++
  return n
}

const s0 = stats(base.positions, base.indices)
console.log('base   :', base.positions.length / 3, 'sommets,', base.quads.length / 4, 'quads')
console.log('  bbox x', s0.minX.toFixed(4), s0.maxX.toFixed(4), ' y', s0.minY.toFixed(4), s0.maxY.toFixed(4), ' z', s0.minZ.toFixed(4), s0.maxZ.toFixed(4))
console.log('  volume', s0.vol.toFixed(6), ' arêtes non-manifoldes :', boundaryEdges(base.quads))

for (const level of [1, 2]) {
  const sub = getSubdivider(base.quads, level)
  const tPlan = Date.now()
  void getSubdivider(base.quads, level)
  void tPlan
  // première passe (plan + calcul)
  const t0 = Date.now()
  const r = sub.apply(base.positions)
  const dtFirst = Date.now() - t0
  // passes suivantes (plan déjà prêt) : c'est le cas réel à chaque image
  const t1 = Date.now()
  const REP = 5
  for (let k = 0; k < REP; k++) sub.apply(base.positions)
  const dt = (Date.now() - t1) / REP
  const s = stats(r.positions, r.indices)
  console.log(`niv ${level} :`, r.vertexCount, 'sommets,', r.triangleCount, 'triangles —', dtFirst, 'ms (1re) /', dt.toFixed(1), 'ms (plan prêt)')
  console.log('  bbox x', s.minX.toFixed(4), s.maxX.toFixed(4), ' y', s.minY.toFixed(4), s.maxY.toFixed(4), ' z', s.minZ.toFixed(4), s.maxZ.toFixed(4))
  console.log('  volume', s.vol.toFixed(6), ' (écart', ((s.vol / s0.vol - 1) * 100).toFixed(2), '%)')
}
