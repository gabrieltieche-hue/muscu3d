import * as THREE from 'three'
import { getBaseMesh } from '../../src/lib/base/mesh.ts'
const base = getBaseMesh()
const j = base.joints
const i = 8567
const p = new THREE.Vector3(base.positions[i*3], base.positions[i*3+1], base.positions[i*3+2])
const shoulder = j['l-shoulder'], elbow = j['l-elbow'], hand = j['l-hand']
const armRest = elbow.clone().sub(shoulder).normalize()
const foreRest = hand.clone().sub(elbow).normalize()
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v))
const ss=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)}
function lw(pv:THREE.Vector3, axis:THREE.Vector3, inner:number, outer:number, lo:number, hi:number){
  const d=pv.clone().sub(p); const along=d.dot(axis); const perp=d.clone().sub(axis.clone().multiplyScalar(along)).length()
  return {along, perp, w: ss(lo,hi,along)*(1-ss(inner,outer,perp))}
}
const A=lw(p, armRest, 0.055,0.095,-0.02,0.075)
const B=lw(p.clone().sub(elbow).add(elbow), foreRest, 0.045,0.08,-0.02,0.05)
console.log('p',p.toArray().map(v=>v.toFixed(3)))
console.log('armRest',armRest.toArray().map(v=>v.toFixed(3)),'along/perp/w',A)
console.log('foreRest',foreRest.toArray().map(v=>v.toFixed(3)),'along/perp/w',B)
// q1/q2
const ARM_DIR=new THREE.Vector3(0.2,-0.975,0.06).normalize()
const FORE_DIR=new THREE.Vector3(0.12,-0.975,0.19).normalize()
const q1=new THREE.Quaternion().setFromUnitVectors(armRest,ARM_DIR)
const q2=new THREE.Quaternion().setFromUnitVectors(foreRest,FORE_DIR)
const p1=p.clone().sub(shoulder).applyQuaternion(q1).add(shoulder)
console.log('after q1',p1.toArray().map(v=>v.toFixed(3)))
const e1=elbow.clone().sub(shoulder).applyQuaternion(q1).add(shoulder)
const p2=p1.clone().sub(e1).applyQuaternion(q2).add(e1)
console.log('elbow1',e1.toArray().map(v=>v.toFixed(3)),'after q2',p2.toArray().map(v=>v.toFixed(3)))
console.log('angle q2 deg', THREE.MathUtils.radToDeg(q2.angleTo(new THREE.Quaternion())).toFixed(1))
