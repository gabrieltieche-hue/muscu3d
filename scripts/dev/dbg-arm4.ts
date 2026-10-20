import { getBaseMesh } from '../../src/lib/base/mesh.ts'
import { posePositions } from '../../src/lib/base/pose.ts'
const b = getBaseMesh()
posePositions(b.positions, b.joints, 1)
