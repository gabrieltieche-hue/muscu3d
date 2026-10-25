import * as THREE from 'three'
import { getLoadedBody } from './base/model'

/**
 * Affichage d'un modèle 3D externe « tel quel ».
 *
 * Le projet sait sculpter la base MakeHuman (`body.glb`), mais un fichier
 * téléchargé sur internet a une autre topologie : on ne peut pas lui
 * appliquer les cibles de morphing ni les repères anatomiques. Dans ce cas on
 * se contente de ce que l'utilisateur veut voir : **la statue**, avec un
 * matériau unique, centrée et posée sur le socle.
 *
 * Aucune géométrie n'est inventée ici : on charge la scène glTF, on remplace
 * les matériaux, on normalise l'échelle et on l'ancre au sol.
 */

/**
 * Matière « argile / plâtre de studio ».
 * Gris neutre, très mat, sans métal : c'est la matière des images de
 * référence (pas de couleur de peau, pas de brillance plastique).
 */
export const CLAY_MAT = new THREE.MeshStandardMaterial({
  color: 0x969696,
  roughness: 0.7,
  metalness: 0,
  envMapIntensity: 0.5,
})

const TARGET_HEIGHT = 1.75

/**
 * Prépare le modèle externe déjà chargé :
 *  - matériau argile unique sur tous les maillages ;
 *  - ombres activées ;
 *  - échelle normalisée (1,75 m), centrage horizontal, pieds à y = 0.
 *
 * Le groupe renvoyé est ajouté au pivot de la caméra par `Viewer.setBody`.
 * Le fichier n'est pas modifié : on ne touche qu'à la scène Three.js.
 */
export function buildStatue(): { group: THREE.Group } {
  const model = getLoadedBody()
  if (!model) throw new Error('modèle 3D non chargé')

  const root = model.scene
  const group = new THREE.Group()
  group.name = 'statue'
  group.add(root)

  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = CLAY_MAT
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals()
  })

  // 1. échelle : hauteur du modèle -> 1,75 m (taille humaine de référence)
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const scale = size.y > 1e-5 ? TARGET_HEIGHT / size.y : 1
  root.scale.multiplyScalar(scale)
  root.updateMatrixWorld(true)

  // 2. centrage : X/Z au centre du socle, pieds exactement à y = 0
  box.setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y
  root.updateMatrixWorld(true)

  return { group }
}
