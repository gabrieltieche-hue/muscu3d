import { buildBodyGeometry, DEFAULT_PARAMS } from '../../src/lib/body.ts'
const b = buildBodyGeometry(DEFAULT_PARAMS)
const p = b.positions
let n=0
for (let i=0;i<p.length/3;i++){
  const x=p[i*3], y=p[i*3+1], z=p[i*3+2]
  if (x>0.10 && x<0.20 && y>0.42 && y<0.56 && z>0.02 && n<8){
    n++
    console.log('main',i,[x,y,z].map(v=>v.toFixed(3)).join(','))
  }
}
