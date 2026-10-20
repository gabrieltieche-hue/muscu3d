import { getBaseMesh } from '../../src/lib/base/mesh.ts'
const b = getBaseMesh()
const n = b.positions.length/3
// histographie fine des y pour repérer les anneaux horizontaux
const bins = new Map<number, number>()
for (let i=0;i<n;i++){ const y = Math.round(b.positions[i*3+1]*2000)/2000; bins.set(y,(bins.get(y)??0)+1) }
const arr=[...bins.entries()].sort((a,c)=>c[1]-a[1]).slice(0,14)
console.log('anneaux les plus denses (y, nb sommets):')
for (const [y,c] of arr) console.log('  ', y.toFixed(3), c)
