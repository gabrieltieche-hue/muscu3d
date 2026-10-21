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
 * Anatomie sculptée simple, dans l'esprit de la statue : verge courte et
 * tombante le long du scrotum, scrotum en masse unique avec un léger sillon
 * médian. Tout est posé sur la surface pubienne réelle (donc le modèle
 * suit la morphologie : graisse, ventre, cuisses).
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
    const base = new THREE.Vector3(0, y - 0.004, z + 0.001)
    const dir = new THREE.Vector3(0, -0.94, 0.34).normalize()
    const len = 0.05 * scale
    const n = 14
    const path: THREE.Vector3[] = []
    const radii: number[] = []
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const p = base.clone().addScaledVector(dir, len * t)
      // léger galbe vers l'avant (la verge pend entre les cuisses)
      p.z += Math.sin(t * Math.PI) * 0.005 * scale
      path.push(p)
      // profil : large à la base, rétréci, gland un peu renflé
      let r: number
      if (t < 0.1) r = 0.0092 * scale * (0.78 + (t / 0.1) * 0.22)
      else if (t > 0.84) r = (0.0082 + (t - 0.84) / 0.16 * 0.0022) * scale
      else r = (0.0092 - 0.001 * ((t - 0.1) / 0.74)) * scale
      radii.push(r)
    }
    addSweptTube(mb, path, radii, 22)

    // --- scrotum : deux lobes joints, séparés par un sillon médian ---
    for (const sx of [-1, 1]) {
      const c = new THREE.Vector3(sx * 0.0068 * scale, y - 0.0225 * scale, z - 0.0125 * scale)
      addEllipsoid(mb, c, new THREE.Vector3(0.0078 * scale, 0.0125 * scale, 0.0102 * scale), 20, 14)
    }
    // raccord scrotum / verge
    addEllipsoid(
      mb,
      new THREE.Vector3(0, y - 0.0125 * scale, z - 0.006 * scale),
      new THREE.Vector3(0.0092 * scale, 0.0105 * scale, 0.0095 * scale),
      20,
      12,
    )
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mb.pos), 3))
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mb.idx), 1))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}
