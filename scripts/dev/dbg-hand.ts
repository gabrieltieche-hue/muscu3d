import { getBaseMesh } from '../../src/lib/base/mesh.ts'
import { posePositions } from '../../src/lib/base/pose.ts'
const b = getBaseMesh()
const p = posePositions(b.positions, b.joints, 1).positions
let n=0
for (let i=0;i<b.positions.length/3;i++){
  const x=b.positions[i*3], y=b.positions[i*3+1], z=b.positions[i*3+2]
  if (x>0.22 && x<0.30 && y>0.58 && y<0.64 && z>0.08 && n<10){
    n++
    console.log('main v',i,'rest',[x,y,z].map(v=>v.toFixed(3)).join(','),'->',[p[i*3],p[i*3+1],p[i*3+2]].map(v=>v.toFixed(3)).join(','),'mv',Math.hypot(p[i*3]-x,p[i*3+1]-y,p[i*3+2]-z).toFixed(3))
  }
}
