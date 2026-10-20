import { buildBodyGeometry, DEFAULT_PARAMS } from '../../src/lib/body.ts'
const b = buildBodyGeometry(DEFAULT_PARAMS)
const p = b.positions
const idx = b.geometry.getIndex()!.array as ArrayLike<number>
let worst: Array<{d:number,a:number,b:number}> = []
for (let t=0;t<idx.length;t+=3){
  for (let k=0;k<3;k++){
    const a=idx[t+k], c=idx[t+((k+1)%3)]
    const d=Math.hypot(p[a*3]-p[c*3],p[a*3+1]-p[c*3+1],p[a*3+2]-p[c*3+2])
    worst.push({d,a,b:c})
  }
}
worst.sort((x,y)=>y.d-x.d)
for (let i=0;i<10;i++){
  const w=worst[i]
  console.log('edge',w.d.toFixed(3),'a',w.a,[p[w.a*3],p[w.a*3+1],p[w.a*3+2]].map(v=>v.toFixed(3)).join(','),'b',w.b,[p[w.b*3],p[w.b*3+1],p[w.b*3+2]].map(v=>v.toFixed(3)).join(','))
}
