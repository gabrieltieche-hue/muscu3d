import { getBaseMesh } from '../../src/lib/base/mesh.ts'
const b = getBaseMesh()
const idx = b.indices
let mx = 0
for (let t = 0; t < idx.length; t += 3) {
  for (let k = 0; k < 3; k++) {
    const a = idx[t+k], c = idx[t+((k+1)%3)]
    const d = Math.hypot(b.positions[a*3]-b.positions[c*3], b.positions[a*3+1]-b.positions[c*3+1], b.positions[a*3+2]-b.positions[c*3+2])
    if (d > mx) mx = d
  }
}
console.log('base mesh : arête la plus longue', mx.toFixed(3), 'm')
