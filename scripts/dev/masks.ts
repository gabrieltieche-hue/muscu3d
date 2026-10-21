import { getMasks } from '../../src/lib/body.ts'
import { getBaseMesh } from '../../src/lib/base/mesh.ts'
import { posePositions } from '../../src/lib/base/pose.ts'

import { loadModel } from './load-model'
await loadModel()
const m = getMasks()
const b = getBaseMesh()
const p = posePositions(b.positions, b.joints, 1).positions
const n = p.length/3
const stat = (name: string, arr: Float32Array) => {
  let mx = 0, mi = -1
  for (let i=0;i<n;i++) if (arr[i]>mx) { mx = arr[i]; mi = i }
  console.log(name, 'max', mx.toFixed(3), 'at', mi, 'pos', [p[mi*3],p[mi*3+1],p[mi*3+2]].map(v=>v.toFixed(3)).join(' '))
}
stat('belly', m.belly); stat('fat', m.fat); stat('abs', m.abs); stat('pec', m.pec)
// quelques points du ventre (avant, y 0.55-0.62)
for (let i=0;i<n;i++){
  const x=p[i*3], y=p[i*3+1], z=p[i*3+2]
  if (Math.abs(y-0.60)<0.006 && Math.abs(x)<0.02 && z>0.05) {
    console.log('ventre y=.60 x=',x.toFixed(3),'z=',z.toFixed(3),'bellyMask=',m.belly[i].toFixed(3),'fatMask=',m.fat[i].toFixed(3))
    break
  }
}
