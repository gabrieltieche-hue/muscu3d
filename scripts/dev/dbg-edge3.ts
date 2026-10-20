import { buildBodyGeometry, DEFAULT_PARAMS } from '../../src/lib/body.ts'
const b = buildBodyGeometry(DEFAULT_PARAMS)
for (const i of [4779, 4761, 4758]) {
  console.log('v', i, 'final', [b.positions[i*3],b.positions[i*3+1],b.positions[i*3+2]].map(v=>v.toFixed(3)).join(','))
}
