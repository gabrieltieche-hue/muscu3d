import { getBaseMesh } from '../../src/lib/base/mesh'
import { loadModel } from './load-model'
await loadModel()
const b = getBaseMesh()
let mn = 9
let mx = -9
let c = 0
for (let i = 1; i < b.positions.length; i += 3) {
  mn = Math.min(mn, b.positions[i])
  mx = Math.max(mx, b.positions[i])
  if (b.positions[i] < 0.05) c++
}
console.log('y min', mn.toFixed(4), 'max', mx.toFixed(4), 'nb y<0.05 :', c)
