/**
 * Sonde la surface du visage autour de l'œil : sert à caler le globe
 * oculaire, l'arcade et les paupières.
 */
import { getBaseMesh } from '../../src/lib/base/mesh'

import { loadModel } from './load-model'
await loadModel()

const base = getBaseMesh()
const P = base.positions
const J = base.joints

const eye = J['l-eye']
const up = J['l-upperlid']
const low = J['l-lowerlid']
console.log('l-eye       ', [eye.x, eye.y, eye.z].map((v) => v.toFixed(4)).join(' '))
console.log('l-upperlid  ', [up.x, up.y, up.z].map((v) => v.toFixed(4)).join(' '))
console.log('l-lowerlid  ', [low.x, low.y, low.z].map((v) => v.toFixed(4)).join(' '))

// sommets proches de l'œil
const list: Array<{ i: number; d: number; p: number[] }> = []
for (let i = 0; i < P.length / 3; i++) {
  const dx = P[i * 3] - eye.x
  const dy = P[i * 3 + 1] - eye.y
  const dz = P[i * 3 + 2] - eye.z
  const d = Math.hypot(dx, dy, dz)
  if (d < 0.045) list.push({ i, d, p: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]] })
}
list.sort((a, b) => a.d - b.d)
console.log(`\n${list.length} sommets dans un rayon de 4,5 cm autour de l'œil :`)
for (const v of list.slice(0, 26)) {
  console.log(
    `  d=${v.d.toFixed(4)}  x=${v.p[0].toFixed(4)} y=${v.p[1].toFixed(4)} z=${v.p[2].toFixed(4)}  (z-eye=${(v.p[2] - eye.z).toFixed(4)})`,
  )
}
// rayon de la surface la plus proche (profondeur du globe)
const zmax = list.reduce((m, v) => Math.max(m, v.p[2]), -9)
console.log('\nz max de la surface autour de l\'œil :', zmax.toFixed(4), ' (z du repère', eye.z.toFixed(4), ')')
// rayon estimé du globe : distance du centre à la surface
console.log('distance centre -> point le plus avancé :', Math.hypot(...(list[0] ? [list[0].p[0] - eye.x, list[0].p[1] - eye.y, list[0].p[2] - eye.z] : [0, 0, 0])).toFixed(4))

// points de la surface pour situer l'arcade et le sourcil
const brow: Array<{ p: number[]; d: number }> = []
for (let i = 0; i < P.length / 3; i++) {
  const dx = P[i * 3] - eye.x
  const dy = P[i * 3 + 1] - eye.y
  const dz = P[i * 3 + 2] - eye.z
  if (Math.abs(dx) < 0.03 && dy > 0.006 && dy < 0.03 && dz > 0.005) {
    brow.push({ p: [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], d: Math.hypot(dx, dy, dz) })
  }
}
console.log(`\n${brow.length} sommets au-dessus de l'œil (arcade / sourcil)`)
for (const v of brow.slice(0, 12)) {
  console.log(`  x=${v.p[0].toFixed(4)} y=${v.p[1].toFixed(4)} z=${v.p[2].toFixed(4)}`)
}
