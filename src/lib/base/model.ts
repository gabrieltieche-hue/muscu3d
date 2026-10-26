import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Chargement du modèle 3D du corps.
 *
 * Le corps n'est plus « sculpté » par le code : c'est un **vrai fichier
 * modèle** (glTF binaire `.glb`), chargé avec le chargeur standard de
 * Three.js (`GLTFLoader`), comme n'importe quel modèle 3D.
 *
 * Deux natures de fichiers sont acceptées :
 *   1. le modèle de référence du projet (`body.glb`, base MakeHuman CC0) :
 *      il contient les repères anatomiques et les quads d'origine, donc le
 *      moteur de morphing / pose / anatomie peut s'appliquer ;
 *   2. un modèle externe (`modele.glb` ou `modele.gltf`, déposé dans
 *      `public/`) : il est affiché tel quel, avec le matériau argile studio
 *      (voir `src/lib/statue.ts`).
 *
 * L'ordre de recherche par défaut est `modele.glb` → `modele.gltf` →
 * `body.glb` : il suffit de déposer son fichier sous le nom `modele.glb`
 * pour qu'il remplace le corps de référence, sans modifier le code.
 * `?model=autre.glb` force un fichier précis (debug / comparaison).
 */

export interface LoadedBody {
  /** fichier réellement chargé (affiché dans l'interface) */
  url: string
  /** positions normalisées (hauteur du corps = 1) */
  positions: Float32Array
  /** indices triangulés (32 bits : un modèle dense dépasse 65 535 sommets) */
  indices: Uint32Array
  /** faces d'origine (polygones) : quads pour MakeHuman, triangles sinon */
  faces: Uint32Array
  /** nombre de sommets par face */
  faceSizes: Uint8Array
  /** repères anatomiques (normalisés) */
  joints: Record<string, THREE.Vector3>
  /** vrai si le mesh est la base MakeHuman (donc compatible cibles CC0) */
  makehuman: boolean
  /** scène glTF complète : affichage brut d'un modèle externe */
  scene: THREE.Group
  /** extras du fichier glTF (socle caché, provenance, cibles…) */
  extras: Record<string, unknown>
}

/** Fichiers essayés dans l'ordre quand `?model=` n'est pas fourni. */
const DEFAULT_MODEL_FILES = ['modele.glb', 'modele.gltf', 'body.glb']

let loaded: LoadedBody | null = null
const cache = new Map<string, Promise<LoadedBody>>()

/** Décode une chaîne base64 en tableau d'octets. */
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function extract(gltf: { scene: THREE.Group; userData: Record<string, unknown> }, url: string): LoadedBody {
  let mesh: THREE.Mesh | null = null
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh
  })
  if (!mesh) throw new Error(`${url} : aucun maillage trouvé`)
  const geo = (mesh as THREE.Mesh).geometry
  const posAttr = geo.getAttribute('position')
  const positions = new Float32Array(posAttr.array as ArrayLike<number>)
  const idxAttr = geo.getIndex()
  if (!idxAttr) throw new Error(`${url} : maillage non indexé`)
  const indices = new Uint32Array(idxAttr.array as ArrayLike<number>)

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

  return {
    url,
    positions,
    indices,
    faces,
    faceSizes,
    joints,
    makehuman: gltf.userData.targets === true,
    scene: gltf.scene,
    extras: gltf.userData,
  }
}

/** Fichier demandé par `?model=`, sinon null. */
function queryModel(): string | null {
  if (typeof location === 'undefined') return null
  return new URLSearchParams(location.search).get('model')
}

/**
 * Charge le modèle depuis une URL (ou tente la liste par défaut).
 * Renvoie la même instance si ce fichier est déjà chargé.
 *
 * `?model=autre.glb` permet de tester un autre modèle sans recompiler ;
 * sans paramètre, `modele.glb` puis `modele.gltf` puis `body.glb`.
 */
export function loadBodyModel(input?: string | string[], ignoreQuery = false): Promise<LoadedBody> {
  const requested = ignoreQuery ? null : queryModel()
  const urls = requested ? [requested] : input ? (Array.isArray(input) ? input : [input]) : DEFAULT_MODEL_FILES
  const key = urls.join('|')

  const cached = cache.get(key)
  if (cached) return cached

  const pending = (async () => {
    const failures: string[] = []
    for (const url of urls) {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        // En développement, Vite renvoie l'index.html pour un fichier absent :
        // il faut le rejeter explicitement au lieu de laisser le parseur glTF
        // échouer avec un message obscur.
        const type = res.headers.get('content-type') ?? ''
        if (type.includes('text/html')) throw new Error('fichier absent (index.html renvoyé)')
        const buf = await res.arrayBuffer()
        const model = await parseBodyModel(buf, url)
        loaded = model
        return model
      } catch (e) {
        failures.push(`${url} (${e instanceof Error ? e.message : String(e)})`)
      }
    }
    throw new Error(
      `aucun modèle 3D chargeable : ${failures.join(' · ')}. ` +
        `Dépose un fichier .glb/.gltf dans public/ (modele.glb ou body.glb).`,
    )
  })()

  cache.set(key, pending)
  // Un échec ne doit pas rester en cache : on peut corriger le fichier et
  // recharger la page, ou réessayer après un import.
  pending.catch(() => cache.delete(key))
  return pending
}

/** Analyse un buffer glTF binaire (utilisé aussi par les scripts Node). */
export function parseBodyModel(buffer: ArrayBuffer, url = 'body.glb'): Promise<LoadedBody> {
  return new Promise<LoadedBody>((resolve, reject) => {
    const loader = new GLTFLoader()
    const base = url.includes('/') ? url.slice(0, url.lastIndexOf('/') + 1) : ''
    loader.parse(
      buffer,
      base,
      (gltf) => {
        try {
          const model = extract(gltf, url)
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
