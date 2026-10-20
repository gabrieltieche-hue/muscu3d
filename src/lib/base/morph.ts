import { TARGETS, TARGET_SCALE, type TargetLayer } from './targets'

/**
 * Couches de morphing MakeHuman (CC0).
 *
 * Chaque couche est un delta creux appliqué aux positions de base :
 *   positions[i] += delta[i] / TARGET_SCALE * poids
 * avec des deltas exprimés en fraction de hauteur (1 = hauteur du corps).
 *
 * Ce sont les cibles officielles du mesh `base.obj` : elles donnent les
 * proportions masculines, la masse musculaire et les reliefs anatomiques
 * que les masques procéduraux ne peuvent pas produire seuls.
 */

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function toUint16(b64: string): Uint16Array {
  const bytes = decodeBase64(b64)
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return new Uint16Array(buf)
}

function toInt16(b64: string): Int16Array {
  const bytes = decodeBase64(b64)
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return new Int16Array(buf)
}

interface DecodedLayer {
  index: Uint16Array
  delta: Int16Array
}

const cache = new Map<string, DecodedLayer>()

function getLayer(name: string): DecodedLayer | null {
  const hit = cache.get(name)
  if (hit) return hit
  const src: TargetLayer | undefined = TARGETS[name]
  if (!src) return null
  const decoded = { index: toUint16(src.index), delta: toInt16(src.delta) }
  cache.set(name, decoded)
  return decoded
}

/** Applique une couche en place. `weight` peut être négatif (soustraction). */
export function applyTarget(positions: Float32Array, name: string, weight: number) {
  if (!weight) return
  const layer = getLayer(name)
  if (!layer) return
  const { index, delta } = layer
  const k = weight / TARGET_SCALE
  for (let n = 0; n < index.length; n++) {
    const v = index[n] * 3
    positions[v] += delta[n * 3] * k
    positions[v + 1] += delta[n * 3 + 1] * k
    positions[v + 2] += delta[n * 3 + 2] * k
  }
}

/** Somme des poids appliqués, pour le debug et les garde-fous. */
export function layerTotal(weights: Record<string, number>): number {
  let n = 0
  for (const w of Object.values(weights)) n += Math.abs(w)
  return n
}
