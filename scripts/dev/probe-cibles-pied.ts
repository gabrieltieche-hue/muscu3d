/**
 * Contrôle des cibles de pieds : mesurent-elles bien rétrécir le pied ?
 * (une cible appliquée du mauvais côté déforme le pied au lieu de le
 * rétrécir — c'est ce qui produisait les « pics » sur les orteils.)
 */
import { getBaseMesh } from '../../src/lib/base/mesh'
import { loadModel } from './load-model'
import { applyTarget } from '../../src/lib/base/morph'

await loadModel()
const base = getBaseMesh()

function extent(pos: Float32Array, side: number) {
  let maxX = -9
  let minX = 9
  let maxZ = -9
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1]
    if (y > 0.055) continue
    const x = pos[i * 3]
    if (side > 0 ? x >= 0 : x < 0) {
      maxX = Math.max(maxX, x)
      minX = Math.min(minX, x)
      maxZ = Math.max(maxZ, pos[i * 3 + 2])
    }
  }
  return { minX, maxX, maxZ, width: maxX - minX }
}

const baseL = extent(base.positions, 1)
const baseR = extent(base.positions, -1)
console.log(`base   : pied G x ${baseL.minX.toFixed(4)}..${baseL.maxX.toFixed(4)} (largeur ${baseL.width.toFixed(4)}, z max ${baseL.maxZ.toFixed(4)})`)
console.log(`         pied D x ${baseR.minX.toFixed(4)}..${baseR.maxX.toFixed(4)} (largeur ${baseR.width.toFixed(4)}, z max ${baseR.maxZ.toFixed(4)})`)

for (const layer of ['footScaleL', 'footScaleR', 'footHorizL', 'footHorizR']) {
  const p = new Float32Array(base.positions)
  applyTarget(p, layer, 1)
  const l = extent(p, 1)
  const r = extent(p, -1)
  console.log(
    `${layer.padEnd(11)} : G x ${l.minX.toFixed(4)}..${l.maxX.toFixed(4)} (Δlargeur ${(l.width - baseL.width >= 0 ? '+' : '') + (l.width - baseL.width).toFixed(4)}, z max ${l.maxZ.toFixed(4)}) | D x ${r.minX.toFixed(4)}..${r.maxX.toFixed(4)} (Δlargeur ${(r.width - baseR.width >= 0 ? '+' : '') + (r.width - baseR.width).toFixed(4)}, z max ${r.maxZ.toFixed(4)})`,
  )
}
