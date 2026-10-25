import * as THREE from 'three'
import { getLoadedBody } from './model'

/**
 * Mesh de base du corps.
 *
 * Il n'est plus embarqué dans le JS : c'est un **fichier modèle glTF**
 * (`public/body.glb`, MakeHuman CC0) chargé par `GLTFLoader`.
 * Voir src/lib/base/model.ts.
 *
 * Convention : pieds à y = 0, sommet du crâne à y = 1, visage vers +z.
 * L'échelle réelle est appliquée au moment du morphing.
 */

export interface BaseMesh {
  /** positions normalisées (hauteur du corps = 1) */
  positions: Float32Array
  indices: Uint32Array
  /** faces d'origine (polygones) et leur taille : source de la subdivision */
  faces: Uint32Array
  faceSizes: Uint8Array
  joints: Record<string, THREE.Vector3>
}

let cache: BaseMesh | null = null

export function getBaseMesh(): BaseMesh {
  if (cache) return cache
  const m = getLoadedBody()
  if (!m) {
    throw new Error(
      "modèle 3D non chargé : appeler loadBodyModel() (voir src/lib/base/model.ts) avant de construire le corps",
    )
  }
  cache = {
    positions: m.positions,
    indices: m.indices,
    faces: m.faces,
    faceSizes: m.faceSizes,
    joints: m.joints,
  }
  return cache
}

/** Géométrie neuve (indépendante) à partir des positions morphées. */
export function geometryFromPositions(
  positions: Float32Array,
  indices?: Uint16Array | Uint32Array,
  normals?: Float32Array,
): THREE.BufferGeometry {
  const idx = indices ?? getBaseMesh().indices
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setIndex(new THREE.BufferAttribute(idx.slice() as Uint16Array | Uint32Array, 1))
  if (normals) geo.setAttribute('normal', new THREE.BufferAttribute(normals.slice(), 3))
  else geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}
