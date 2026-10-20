import * as THREE from 'three'
import {
  BASE_INDEX,
  BASE_INDEX_COUNT,
  BASE_POS_Q,
  BASE_SCALE,
  BASE_VERTEX_COUNT,
  JOINTS,
} from './data'

/**
 * Mesh de base embarqué (MakeHuman base.obj, CC0).
 * Coordonnées normalisées : pieds à y = 0, sommet du crâne à y = 1,
 * visage vers +z. L'échelle réelle est appliquée au moment du morphing.
 */

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function int16(b64: string): Int16Array {
  const bytes = decodeBase64(b64)
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return new Int16Array(buf)
}

function uint16(b64: string): Uint16Array {
  const bytes = decodeBase64(b64)
  const buf = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buf).set(bytes)
  return new Uint16Array(buf)
}

export interface BaseMesh {
  /** positions normalisées (hauteur du corps = 1) */
  positions: Float32Array
  indices: Uint16Array
  joints: Record<string, THREE.Vector3>
}

let cache: BaseMesh | null = null

export function getBaseMesh(): BaseMesh {
  if (cache) return cache
  const q = int16(BASE_POS_Q)
  const positions = new Float32Array(BASE_VERTEX_COUNT * 3)
  for (let i = 0; i < positions.length; i++) positions[i] = q[i] / BASE_SCALE
  const indices = uint16(BASE_INDEX)
  if (indices.length !== BASE_INDEX_COUNT) {
    throw new Error('base mesh: index count mismatch')
  }
  const joints: Record<string, THREE.Vector3> = {}
  for (const [name, v] of Object.entries(JOINTS)) {
    joints[name] = new THREE.Vector3(v[0], v[1], v[2])
  }
  cache = { positions, indices, joints }
  return cache
}

/** Géométrie neuve (indépendante) à partir des positions morphées. */
export function geometryFromPositions(positions: Float32Array): THREE.BufferGeometry {
  const { indices } = getBaseMesh()
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(new THREE.BufferAttribute(indices.slice(), 1))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}
