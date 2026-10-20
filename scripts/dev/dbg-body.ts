import { buildBodyGeometry, DEFAULT_PARAMS } from '../../src/lib/body.ts'
const b = buildBodyGeometry(DEFAULT_PARAMS)
const p = b.positions
let mn=[9,9,9], mx=[-9,-9,-9], maxMove=0, mi=-1
for (let i=0;i<p.length/3;i++){
  for(let c=0;c<3;c++){ mn[c]=Math.min(mn[c],p[i*3+c]); mx[c]=Math.max(mx[c],p[i*3+c]) }
}
console.log('bbox min',mn.map(v=>v.toFixed(3)),'max',mx.map(v=>v.toFixed(3)))
const g = b.geometry.getAttribute('position').array as Float32Array
let gn=[9,9,9], gx=[-9,-9,-9]
for (let i=0;i<g.length/3;i++) for(let c=0;c<3;c++){ gn[c]=Math.min(gn[c],g[i*3+c]); gx[c]=Math.max(gx[c],g[i*3+c]) }
console.log('geom bbox min',gn.map(v=>v.toFixed(3)),'max',gx.map(v=>v.toFixed(3)))
console.log('garment', b.garment ? 'oui' : 'non')
