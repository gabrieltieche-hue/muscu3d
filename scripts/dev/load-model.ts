/**
 * Utilitaire pour les scripts Node : charge le modèle 3D (public/body.glb)
 * avec le même GLTFLoader que la page web.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseBodyModel } from '../../src/lib/base/model'

const here = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(here, '..', '..')
export const GLB = join(ROOT, 'public', 'body.glb')

/** Charge le modèle et attend qu'il soit prêt. */
export async function loadModel() {
  const buf = readFileSync(GLB)
  return parseBodyModel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}
