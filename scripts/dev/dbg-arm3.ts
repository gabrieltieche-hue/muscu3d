import { getBaseMesh } from '../../src/lib/base/mesh.ts'
import { posePositions } from '../../src/lib/base/pose.ts'
const b = getBaseMesh()
const p = posePositions(b.positions, b.joints, 1).positions
// vertices proches du coude gauche (0.188,0.700,0.008)
let n=0
for (let i=0;i<b.positions.length/3;i++){
  const x=b.positions[i*3], y=b.positions[i*3+1], z=b.positions[i*3+2]
  const d=Math.hypot(x-0.188,y-0.700,z-0.008)
  if(d<0.05 && n<8){
    n++
    const mv=Math.hypot(p[i*3]-x,p[i*3+1]-y,p[i*3+2]-z)
    console.log('coude v',i,'rest',[x,y,z].map(v=>v.toFixed(3)).join(','),'->',[p[i*3],p[i*3+1],p[i*3+2]].map(v=>v.toFixed(3)).join(','),'move',mv.toFixed(3))
  }
}
// sommet le plus déplacé
let mx=0,mi=-1
for (let i=0;i<p.length/3;i++){
  const d=Math.hypot(p[i*3]-b.positions[i*3],p[i*3+1]-b.positions[i*3+1],p[i*3+2]-b.positions[i*3+2])
  if(d>mx){mx=d;mi=i}
}
console.log('max move',mx.toFixed(3),'at',mi,'rest',[b.positions[mi*3],b.positions[mi*3+1],b.positions[mi*3+2]].map(v=>v.toFixed(3)).join(','),'->',[p[mi*3],p[mi*3+1],p[mi*3+2]].map(v=>v.toFixed(3)).join(','))
