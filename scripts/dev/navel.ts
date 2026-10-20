import { getBaseMesh } from '../../src/lib/base/mesh.ts'
import { posePositions } from '../../src/lib/base/pose.ts'
const b = getBaseMesh()
const p = posePositions(b.positions, b.joints, 1).positions
// profil z le long de la ligne médiane (x proche de 0), face avant
for (let y = 0.55; y <= 0.74; y += 0.005) {
  let best = -9, bx = 0
  for (let i = 0; i < p.length/3; i++) {
    const yy = p[i*3+1], xx = p[i*3]
    if (Math.abs(yy - y) > 0.0025) continue
    if (Math.abs(xx) > 0.012) continue
    if (p[i*3+2] > best) { best = p[i*3+2]; bx = xx }
  }
  if (best > -9) console.log(y.toFixed(3), best.toFixed(4), 'x=', bx.toFixed(4))
}
