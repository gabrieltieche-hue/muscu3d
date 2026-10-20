import { getBaseMesh } from '../../src/lib/base/mesh.ts'
import { posePositions } from '../../src/lib/base/pose'
const base = getBaseMesh()
const pose = posePositions(base.positions, base.joints, 1)
const idx: number[] = []
for (let i=0;i<base.positions.length/3;i++) if (base.positions[i*3] > 0.27) idx.push(i)
console.log('raw verts x>0.27:', idx.length)
for (const i of idx.slice(0,6)) {
  const r=[base.positions[i*3],base.positions[i*3+1],base.positions[i*3+2]].map(v=>v.toFixed(3))
  const p=[pose.positions[i*3],pose.positions[i*3+1],pose.positions[i*3+2]].map(v=>v.toFixed(3))
  console.log(i, 'raw', r.join(' '), '-> pose', p.join(' '), 'moved', Math.hypot(pose.positions[i*3]-base.positions[i*3],pose.positions[i*3+1]-base.positions[i*3+1],pose.positions[i*3+2]-base.positions[i*3+2]).toFixed(3))
}
