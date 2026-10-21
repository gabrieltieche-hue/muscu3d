/**
 * Symétrie du mesh : compare la base MakeHuman et le mesh après
 * application des cibles (la cible « caucasian-male-young » est-elle
 * symétrique ?).
 */
import * as THREE from 'three'
import { getBaseMesh } from '../../src/lib/base/mesh'
import { loadModel } from './load-model'
import { applyTarget } from '../../src/lib/base/morph'
import { getLayerWeights, DEFAULT_PARAMS } from '../../src/lib/body'

await loadModel()
const base = getBaseMesh()

/** profil de largeur du corps par bande de hauteur, par côté */
function profile(pos: Float32Array, label: string) {
  const n = pos.length / 3
  const rows: string[] = []
  for (const [name, y0, y1] of [
    ['pied', 0.0, 0.05],
    ['mollet', 0.1, 0.2],
    ['cuisse', 0.3, 0.45],
    ['bassin', 0.47, 0.55],
    ['ventre', 0.56, 0.64],
    ['poitrine', 0.7, 0.8],
    ['epaule', 0.78, 0.84],
  ] as Array<[string, number, number]>) {
    let lx = 9
    let rx = -9
    let lz = 9
    let rz = -9
    for (let i = 0; i < n; i++) {
      const y = pos[i * 3 + 1]
      if (y < y0 || y > y1) continue
      if (pos[i * 3] >= 0) {
        lx = Math.max(lx, pos[i * 3])
        lz = Math.max(lz, pos[i * 3 + 2])
      } else {
        rx = Math.min(rx, pos[i * 3])
        rz = Math.min(rz, pos[i * 3 + 2])
      }
    }
    rows.push(`${name}: L ${lx.toFixed(4)}/${lz.toFixed(4)} R ${rx.toFixed(4)}/${rz.toFixed(4)} Δx ${(lx + rx).toFixed(4)}`)
  }
  console.log(`\n--- ${label} ---`)
  for (const r of rows) console.log('  ' + r)
}

console.log('positions:', base.positions.length, 'premiers:', Array.from(base.positions.slice(0,6)).map(v=>v.toFixed(3)).join(','))
profile(base.positions, 'mesh de base')

const morphed = new Float32Array(base.positions)
const w = getLayerWeights(DEFAULT_PARAMS)
for (const [name, v] of Object.entries(w)) applyTarget(morphed, name, v)
profile(morphed, 'après morphing (cibles MakeHuman)')

// la cible "male" seule
const onlyMale = new Float32Array(base.positions)
applyTarget(onlyMale, 'male', 1)
profile(onlyMale, 'cible male seule')
