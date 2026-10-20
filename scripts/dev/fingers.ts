import { getBaseMesh } from '../../src/lib/base/mesh.ts'
const b = getBaseMesh()
for (let f=1; f<=5; f++) {
  const p = [1,2,3,4].map(n => b.joints[`l-finger-${f}-${n}`]).filter(Boolean)
  console.log('finger', f, p.map(v=>`(${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)})`).join(' '))
}
console.log('hand', b.joints['l-hand'].toArray().map(v=>v.toFixed(3)))
console.log('hand-2', b.joints['l-hand-2'].toArray().map(v=>v.toFixed(3)))
console.log('hand-3', b.joints['l-hand-3'].toArray().map(v=>v.toFixed(3)))
