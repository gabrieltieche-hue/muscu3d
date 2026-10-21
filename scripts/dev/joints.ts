import { getBaseMesh } from '../../src/lib/base/mesh.ts'

import { loadModel } from './load-model'
await loadModel()
const b = getBaseMesh()
console.log(Object.keys(b.joints).filter(k=>k.startsWith('l-')).sort().join('\n'))
