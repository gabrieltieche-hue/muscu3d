import { getBaseMesh } from '/root/muscu3d/src/lib/base/mesh'
import { posePositions } from '/root/muscu3d/src/lib/base/pose'

const base = getBaseMesh()
console.log('joints', Object.keys(base.joints).length)
for (const k of ['l-shoulder','l-elbow','l-hand','r-shoulder','r-elbow','r-hand','l-upper-leg','l-knee','l-ankle','l-foot-1','r-upper-leg','r-knee','r-ankle']) {
  const j = base.joints[k]
  console.log(k.padEnd(14), j ? [j.x.toFixed(3), j.y.toFixed(3), j.z.toFixed(3)].join(' ') : 'ABSENT')
}
const pose = posePositions(base.positions, base.joints, 1)
console.log('bbox raw', bbox(base.positions))
console.log('bbox pose', bbox(pose.positions))
console.log('posed joints', Object.fromEntries(['l-shoulder','l-elbow','l-hand','l-knee','l-ankle'].map(k=>[k,[pose.joints[k].x.toFixed(3),pose.joints[k].y.toFixed(3),pose.joints[k].z.toFixed(3)].join(' ')])))
function bbox(p: Float32Array) {
  let mn=[9,9,9], mx=[-9,-9,-9]
  for (let i=0;i<p.length;i+=3) for (let c=0;c<3;c++){ mn[c]=Math.min(mn[c],p[i+c]); mx[c]=Math.max(mx[c],p[i+c]) }
  return { min: mn.map(v=>v.toFixed(3)), max: mx.map(v=>v.toFixed(3)) }
}
