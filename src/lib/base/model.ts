import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Chargement du modèle 3D du corps.
 *
 * Le corps n'est plus « sculpté » par le code : c'est un **vrai fichier
 * modèle** (glTF binaire `.glb`), chargé avec le chargeur standard de
 * Three.js (`GLTFLoader`), comme n'importe quel modèle 3D.
 *
 * Le fichier contient :
 *   - le maillage `body` (13 380 sommets, 13 378 quads) ;
 *   - un nœud par repère anatomique (`l-shoulder`, `l-knee`…) : c'est le
 *     squelette logiciel que le morphing et la pose utilisent.
 *
 * Origine : MakeHuman base mesh (CC0 1.0) — voir scripts/assets/README.md.
 * Conversion : scripts/prep-glb.py.
 */

export interface LoadedBody {
  /** positions normalisées (hauteur du corps = 1) */
  positions: Float32Array
  /** indices triangulés */
  indices: Uint16Array
  /** faces d'origine (polygones) : quads pour MakeHuman, triangles sinon */
  faces: Uint32Array
  /** nombre de sommets par face */
  faceSizes: Uint8Array
  /** repères anatomiques (normalisés) */
  joints: Record<string, THREE.Vector3>
  /** vrai si le mesh est la base MakeHuman (donc compatible cibles CC0) */
  makehuman: boolean
}

let loaded: LoadedBody | null = null
let pending: Promise<LoadedBody> | null = null

/** Décode une chaîne base64 en tableau d'octets. */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function extract(gltf: { scene: THREE.Group; userData: Record<string, unknown> }): LoadedBody {
  let mesh: THREE.Mesh | null = null
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
  })
  if (!mesh) throw new Error('body.glb : aucun maillage trouvé')
  const geo = (mesh as THREE.Mesh).geometry
  const posAttr = geo.getAttribute('position')
  const positions = new Float32Array(posAttr.array as ArrayLike<number>)
  const idxAttr = geo.getIndex()
  if (!idxAttr) throw new Error('body.glb : maillage non indexé')
  const indices = new Uint16Array(idxAttr.array as ArrayLike<number>)

  // faces d'origine : les quads si l'extension est présente (MakeHuman),
  // sinon les triangles du maillage.
  const qb64 = gltf.userData.quads as string | undefined
  let faces: Uint32Array
  let faceSizes: Uint8Array
  if (qb64) {
    const qbytes = b64ToBytes(qb64)
    // les quads sont stockés en Uint16 (indices du mesh de base) puis élargis
    const q16 = new Uint16Array(qbytes.buffer, qbytes.byteOffset, qbytes.byteLength / 2)
    faces = new Uint32Array(q16)
    faceSizes = new Uint8Array(faces.length / 4).fill(4)
  } else {
    faces = new Uint32Array(indices)
    faceSizes = new Uint8Array(indices.length / 3).fill(3)
  }

  // repères anatomiques : les nœuds de la scène
  const joints: Record<string, THREE.Vector3> = {}
  gltf.scene.traverse((o) => {
    if (o.name && o.userData && (o as THREE.Object3D).position) {
      const p = (o as THREE.Object3D).position
      joints[o.name] = new THREE.Vector3(p.x, p.y, p.z)
    }
  })

  return { positions, indices, faces, faceSizes, joints, makehuman: gltf.userData.targets === true }
}

/**
 * Charge le modèle depuis une URL. Renvoie la même instance si le modèle
 * est déjà chargé (le morphing et la pose l'utilisent de façon synchrone).
 */
export function loadBodyModel(url = 'body.glb'): Promise<LoadedBody> {
  if (loaded) return Promise.resolve(loaded)
  if (pending) return pending
  pending = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`body.glb : HTTP ${r.status}`)
      return r.arrayBuffer()
    })
    .then((buf) => parseBodyModel(buf))
  return pending
}

/** Analyse un buffer glTF binaire (utilisé aussi par les scripts Node). */
export function parseBodyModel(buffer: ArrayBuffer): Promise<LoadedBody> {
  return new Promise<LoadedBody>((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.parse(
      buffer,
      '',
      (gltf) => {
        try {
          const model = extract(gltf)
          loaded = model
          resolve(model)
        } catch (e) {
          reject(e)
        }
      },
      (err) => reject(err),
    )
  })
}

/** Modèle déjà chargé (null avant le chargement). */
export function getLoadedBody(): LoadedBody | null {
  return loaded
}
