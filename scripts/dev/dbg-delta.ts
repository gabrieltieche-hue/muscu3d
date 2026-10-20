import { getBaseMesh } from '../../src/lib/base/mesh.ts'
import { applyTarget } from '../../src/lib/base/morph.ts'
const b = getBaseMesh()
const m = new Float32Array(b.positions)
applyTarget(m, 'male', 1)
for (const i of [9881, 9917, 3213]) {
  console.log('v',i,'base',[b.positions[i*3],b.positions[i*3+1],b.positions[i*3+2]].map(v=>v.toFixed(3)).join(','),
    '-> male',[m[i*3],m[i*3+1],m[i*3+2]].map(v=>v.toFixed(3)).join(','),
    'delta',[m[i*3]-b.positions[i*3],m[i*3+1]-b.positions[i*3+1],m[i*3+2]-b.positions[i*3+2]].map(v=>v.toFixed(3)).join(','))
}
