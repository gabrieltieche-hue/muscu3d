import * as THREE from 'three'

/**
 * Génitaux : maillages procéduraux, masculins et féminins.
 *
 * Le mesh MakeHuman de base n'a pas d'organes génitaux (le groupe `body` est
 * fermé et lisse au niveau du pubis) : on les génère donc nous-mêmes, en
 * sculpture simple (lathe de profil), cohérente avec le style « statue
 * grise » du reste du modèle.
 *
 * Les volumes sont exprimés en fraction de hauteur (1 = taille du corps),
 * comme le reste du projet, et sont posés sur la surface pubienne réelle du
 * corps construit (donc ils suivent la morphologie : graisse, ventre, etc.).
 */

interface MeshBuilder {
  pos: number[]
  idx: number[]
}

/** Ellipsoïde (sphère déformée) ajoutée au maillage. */
function addEllipsoid(
  mb: MeshBuilder,
  center: THREE.Vector3,
  radii: THREE.Vector3,
  segU = 20,
  segV = 14,
  rot?: THREE.Quaternion,
) {
  const base = mb.pos.length / 3
  const v = new THREE.Vector3()
  for (let j = 0; j <= segV; j++) {
    const phi = (j / segV) * Math.PI
    for (let i = 0; i <= segU; i++) {
      const theta = (i / segU) * Math.PI * 2
      v.set(
        Math.sin(phi) * Math.cos(theta) * radii.x,
        Math.cos(phi) * radii.y,
        Math.sin(phi) * Math.sin(theta) * radii.z,
      )
      if (rot) v.applyQuaternion(rot)
      mb.pos.push(center.x + v.x, center.y + v.y, center.z + v.z)
    }
  }
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = base + j * (segU + 1) + i
      const b = a + segU + 1
      mb.idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
}

/**
 * Tube balayé le long d'un axe (utilisé pour la verge) : profil de rayon
 * donné, sections perpendiculaires à l'axe.
 */
function addSweptTube(
  mb: MeshBuilder,
  path: THREE.Vector3[],
  radii: number[],
  segU = 18,
  capStart = true,
  capEnd = true,
) {
  const base = mb.pos.length / 3
  const n = path.length
  const dir = new THREE.Vector3()
  const up = new THREE.Vector3(0, 0, 1)
  const ex = new THREE.Vector3()
  const ey = new THREE.Vector3()
  for (let j = 0; j < n; j++) {
    const p = path[j]
    const next = path[Math.min(n - 1, j + 1)]
    const prev = path[Math.max(0, j - 1)]
    dir.copy(next).sub(prev)
    if (dir.lengthSq() < 1e-12) dir.set(0, -1, 0)
    dir.normalize()
    ex.copy(up).cross(dir)
    if (ex.lengthSq() < 1e-8) ex.set(1, 0, 0)
    ex.normalize()
    ey.copy(dir).cross(ex).normalize()
    for (let i = 0; i <= segU; i++) {
      const a = (i / segU) * Math.PI * 2
      const c = Math.cos(a) * radii[j]
      const s = Math.sin(a) * radii[j]
      mb.pos.push(p.x + ex.x * c + ey.x * s, p.y + ex.y * c + ey.y * s, p.z + ex.z * c + ey.z * s)
    }
  }
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < segU; i++) {
      const a = base + j * (segU + 1) + i
      const b = a + segU + 1
      mb.idx.push(a, a + 1, b, a + 1, b + 1, b)
    }
  }
  if (capStart) {
    const c = path[0]
    const ci = mb.pos.length / 3
    mb.pos.push(c.x, c.y, c.z)
    const ring = base
    for (let i = 0; i < segU; i++) mb.idx.push(ci, ring + i + 1, ring + i)
  }
  if (capEnd) {
    const c = path[n - 1]
    const ci = mb.pos.length / 3
    mb.pos.push(c.x, c.y, c.z)
    const ring = base + (n - 1) * (segU + 1)
    for (let i = 0; i < segU; i++) mb.idx.push(ci, ring + i, ring + i + 1)
  }
}

/**
 * Position de la surface pubienne (point le plus en avant dans la zone du
 * pubis), en coordonnées normalisées.
 */
export function findPubis(positions: Float32Array, H: number): { y: number; z: number } {
  let bestZ = -9
  let bestY = 0.5
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3] / H
    const y = positions[i * 3 + 1] / H
    const z = positions[i * 3 + 2] / H
    if (Math.abs(x) > 0.035) continue
    if (y < 0.465 || y > 0.535) continue
    if (z > bestZ) {
      bestZ = z
      bestY = y
    }
  }
  return { y: bestY, z: bestZ }
}

/**
 * Construit le maillage génital (unique, le même pour tous les corps).
 *
 * Anatomie sculptée dans l'esprit de la statue de plâtre :
 *   - le SCROTUM est la masse principale : un gros ovoïde bas, slightly
 *     en arrière, fendu en deux lobes par un sillon médian ;
 *   - la VERGE pend devant le scrotum, légèrement galbée, avec un gland
 *     arrondi un peu plus large que la hampe ;
 *   - une racine ellipsoïdale raccorde le tout à la surface pubienne,
 *     pour qu'il n'y ait pas de « tuyau » planté dans le corps.
 *
 * Tout est posé sur la surface pubienne réelle (donc le modèle suit la
 * morphologie : graisse, ventre, cuisses).
 *
 * @param pubis   position de la surface pubienne (normalisée)
 * @param scale   facteur d'échelle (plus grand sur un corps plus grand)
 */
export function buildGenitals(pubis: { y: number; z: number }, scale = 1): THREE.BufferGeometry {
  const mb: MeshBuilder = { pos: [], idx: [] }
  const y = pubis.y
  const z = pubis.z

  {
    // --- verge : du pubis vers le bas, légèrement en avant, gland en bas ---
    // La base est légèrement EN AVANT de la surface pubienne : elle doit
    // sembler émerger du corps, pas y être plantée.
    const base = new THREE.Vector3(0, y - 0.009, z - 0.005)
    const len = 0.031 * scale
    const n = 16
    const path: THREE.Vector3[] = []
    const radii: number[] = []
    for (let i = 0; i <= n; i++) {
      const t = i / n
      // la verge pend : elle part vers l'avant puis revient vers l'arrière
      const p = base.clone()
      p.y -= len * t
      p.z += Math.sin(t * 1.1) * 0.0055 * scale
      path.push(p)
      // profil : racine large, hampe fine, gland arrondi un peu plus large
      let r: number
      if (t < 0.16) r = 0.0086 * scale * (0.72 + (t / 0.16) * 0.28)
      else if (t < 0.74) r = (0.0086 - 0.0018 * ((t - 0.16) / 0.58)) * scale
      else if (t < 0.88) r = (0.0070 + 0.0014 * ((t - 0.74) / 0.14)) * scale
      else r = (0.0084 - 0.0032 * ((t - 0.88) / 0.12)) * scale
      radii.push(r)
    }
    addSweptTube(mb, path, radii, 24)

    // --- scrotum : deux lobes joints sous la verge, sillon médian entre eux ---
    for (const sx of [-1, 1]) {
      const c = new THREE.Vector3(sx * 0.0072 * scale, y - 0.0235 * scale, z - 0.0145 * scale)
      addEllipsoid(mb, c, new THREE.Vector3(0.0084 * scale, 0.0150 * scale, 0.0116 * scale), 22, 16)
    }
    // racine : raccorde la verge à la surface pubienne (pas de « tuyau »)
    addEllipsoid(
      mb,
      new THREE.Vector3(0, y - 0.0105 * scale, z - 0.0065 * scale),
      new THREE.Vector3(0.0104 * scale, 0.0112 * scale, 0.0104 * scale),
      22,
      14,
    )
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mb.pos), 3))
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mb.idx), 1))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}
