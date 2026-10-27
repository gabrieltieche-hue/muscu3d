/**
 * Mesure le coût d'une mise à jour de la statue paramétrable (curseurs).
 * Charge le même GLB que la page, puis chronomètre `update()`.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseBodyModel } from '../../src/lib/base/model'
import { buildParametricStatue } from '../../src/lib/statue'
import { DEFAULT_PARAMS } from '../../src/lib/body'
import { FIXED_PARAMS } from '../../src/lib/referenceProfile'

const ROOT = join(import.meta.dirname, '..', '..')

async function main() {
  const file = process.argv[2] ?? 'public/modele.glb'
  const buf = readFileSync(join(ROOT, file))
  await parseBodyModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  console.log('modèle', file)

  const params = { ...DEFAULT_PARAMS, ...FIXED_PARAMS }
  let t = performance.now()
  const statue = buildParametricStatue(params)
  console.log('construction      ', (performance.now() - t).toFixed(1), 'ms')

  // 20 mises à jour : on simule un glissement de curseur
  const times: number[] = []
  for (let i = 0; i < 20; i++) {
    const p = { ...params, height: 170 + i * 0.5, fat: 8 + i * 0.4, arms: 70 + i }
    t = performance.now()
    statue.update(p)
    times.push(performance.now() - t)
  }
  times.sort((a, b) => a - b)
  const med = times[times.length >> 1]
  const mean = times.reduce((a, b) => a + b, 0) / times.length
  console.log(
    `update()          méd ${med.toFixed(1)} ms · moy ${mean.toFixed(1)} ms · max ${times[times.length - 1].toFixed(1)} ms`,
  )
}

main()
