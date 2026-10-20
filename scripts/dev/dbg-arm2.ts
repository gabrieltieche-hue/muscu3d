import { getBaseMesh } from '../../src/lib/base/mesh.ts'
import { posePositions } from '../../src/lib/base/pose.ts'
const b = getBaseMesh()
const p = posePositions(b.positions, b.joints, 1).positions
let mn=[9,9,9], mx=[-9,-9,-9], maxMove=0, mi=-1
for (let i=0;i<p.length/3;i++){
  for(let c=0;c<3;c++){ mn[c]=Math.min(mn[c],p[i*3+c]); mx[c]=Math.max(mx[c],p[i*3+c]) }
  const d=Math.hypot(p[i*3]-b.positions[i*3],p[i*3+1]-b.positions[i*3+1],p[i*3+2]-b.positions[i*3+2])
  if(d>maxMove){maxMove=d;mi=i}
}
console.log('bbox min',mn.map(v=>v.toFixed(3)),'max',mx.map(v=>v.toFixed(3)))
console.log('max move',maxMove.toFixed(3),'at',mi,[b.positions[mi*3],b.positions[mi*3+1],b.positions[mi*3+2]].map(v=>v.toFixed(3)).join(','),'->',[p[mi*3],p[mi*3+1],p[mi*3+2]].map(v=>v.toFixed(3)).join(','))
