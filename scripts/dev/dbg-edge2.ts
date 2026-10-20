import { getBaseMesh } from '../../src/lib/base/mesh.ts'
import { posePositions } from '../../src/lib/base/pose.ts'
import { getMasks } from '../../src/lib/body.ts'
const b = getBaseMesh()
const p = posePositions(b.positions, b.joints, 1).positions
for (const i of [4779, 4761, 4758]) {
  console.log('v', i, 'base', [b.positions[i*3],b.positions[i*3+1],b.positions[i*3+2]].map(v=>v.toFixed(3)).join(','), '->', [p[i*3],p[i*3+1],p[i*3+2]].map(v=>v.toFixed(3)).join(','))
}
