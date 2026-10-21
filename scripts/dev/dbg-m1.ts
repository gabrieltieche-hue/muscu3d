import { buildBodyGeometry, DEFAULT_PARAMS } from '../../src/lib/body'
console.log('build...')
const b = buildBodyGeometry(DEFAULT_PARAMS)
console.log('built', b.positions.length / 3, 'verts')
