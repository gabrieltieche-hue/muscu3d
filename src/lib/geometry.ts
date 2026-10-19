import * as THREE from 'three'

const TAU = Math.PI * 2

/**
 * Section d'un maillage lofté : une ellipse déformable posée sur un axe.
 * - rx : demi-largeur (axe local "right")
 * - rzF : demi-profondeur avant (axe local "forward", +)
 * - rzB : demi-profondeur arrière (axe local "forward", -)
 * - grooveF / grooveB : rainure douce au centre avant / arrière (fraction du rayon)
 */
export interface LoftRing {
  center: THREE.Vector3
  rx: number
  rzF: number
  rzB: number
  grooveF?: number
  grooveB?: number
}

/** Ancien format de profil, conservé pour les helpers. */
export interface ProfilePoint {
  t: number
  rx: number
  rz?: number
  rzF?: number
  rzB?: number
  off?: number
  grooveF?: number
  grooveB?: number
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * Construit une surface fermée en enfilant des sections le long d'un chemin.
 * Les sections sont orientées automatiquement (repère de Frenet simplifié),
 * ce qui permet de lofter aussi bien un torse vertical qu'un pied horizontal.
 * Les normales sont lissées (pas de flat shading) et la couture du tour est
 * moyennée pour éviter une arête verticale visible.
 */
export function loftRings(
  rings: LoftRing[],
  radialSegments = 32,
  caps: 'both' | 'none' | 'start' | 'end' = 'both',
): THREE.BufferGeometry {
  const n = Math.max(6, Math.floor(radialSegments))
  const m = rings.length
  const positions: number[] = []
  const indices: number[] = []

  for (let i = 0; i < m; i++) {
    const ring = rings[i]
    const prev = rings[Math.max(0, i - 1)].center
    const next = rings[Math.min(m - 1, i + 1)].center
    const tangent = new THREE.Vector3().subVectors(next, prev)
    if (tangent.lengthSq() < 1e-10) tangent.set(0, 1, 0)
    tangent.normalize()

    const ref = Math.abs(tangent.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
    const right = new THREE.Vector3().crossVectors(ref, tangent).normalize()
    const fwd = new THREE.Vector3().crossVectors(tangent, right).normalize()

    const rx = Math.max(ring.rx, 0.002)
    const rzF = Math.max(ring.rzF, 0.002)
    const rzB = Math.max(ring.rzB, 0.002)
    const gF = ring.grooveF ?? 0
    const gB = ring.grooveB ?? 0

    for (let j = 0; j < n; j++) {
      const ang = (j / n) * TAU
      let scale = 1
      if (gF) {
        const d = ang - Math.PI / 2
        const w = Math.atan2(Math.sin(d), Math.cos(d))
        scale -= gF * Math.exp(-((w / 0.3) ** 2))
      }
      if (gB) {
        const d = ang - (3 * Math.PI) / 2
        const w = Math.atan2(Math.sin(d), Math.cos(d))
        scale -= gB * Math.exp(-((w / 0.32) ** 2))
      }
      const sin = Math.sin(ang)
      const zr = sin >= 0 ? rzF : rzB
      const x = Math.cos(ang) * rx * scale
      const z = sin * zr * scale
      positions.push(
        ring.center.x + right.x * x + fwd.x * z,
        ring.center.y + right.y * x + fwd.y * z,
        ring.center.z + right.z * x + fwd.z * z,
      )
    }
  }

  for (let i = 0; i < m - 1; i++) {
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n
      const a0 = i * n + j
      const a1 = i * n + j2
      const b0 = (i + 1) * n + j
      const b1 = (i + 1) * n + j2
      indices.push(a0, b1, b0, a0, a1, b1)
    }
  }

  if (caps === 'both' || caps === 'start') {
    const ci = positions.length / 3
    positions.push(rings[0].center.x, rings[0].center.y, rings[0].center.z)
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n
      indices.push(ci, j2, j)
    }
  }
  if (caps === 'both' || caps === 'end') {
    const ci = positions.length / 3
    const last = rings[m - 1].center
    positions.push(last.x, last.y, last.z)
    const base = (m - 1) * n
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n
      indices.push(ci, base + j, base + j2)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  fixWinding(g)
  g.computeVertexNormals()

  // Couture du tour : moyenne des normales aux deux extrémités de chaque anneau.
  const normal = g.getAttribute('normal')
  for (let i = 0; i < m; i++) {
    const a = i * n
    const b = i * n + n - 1
    const ax = normal.getX(a), ay = normal.getY(a), az = normal.getZ(a)
    const bx = normal.getX(b), by = normal.getY(b), bz = normal.getZ(b)
    let cx = ax + bx, cy = ay + by, cz = az + bz
    const len = Math.hypot(cx, cy, cz) || 1
    cx /= len; cy /= len; cz /= len
    normal.setXYZ(a, cx, cy, cz)
    normal.setXYZ(b, cx, cy, cz)
  }
  normal.needsUpdate = true

  return g
}

/**
 * Ancien helper : loft le long d'un segment A→B à partir de profils.
 * Conservé pour les formes simples ; rzF / rzB sont optionnels.
 */
export function loftTube(
  a: THREE.Vector3,
  b: THREE.Vector3,
  profile: ProfilePoint[],
  radialSegments = 16,
  caps: 'both' | 'none' | 'start' | 'end' = 'both',
): THREE.BufferGeometry {
  const dir = new THREE.Vector3().subVectors(b, a)
  const len = dir.length()
  const axis = dir.clone().normalize()
  const ref = Math.abs(axis.z) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1)
  const right = new THREE.Vector3().crossVectors(ref, axis).normalize()
  const up = new THREE.Vector3().crossVectors(axis, right).normalize()
  const rings = profile.map((p) => {
    const rz = p.rz ?? p.rzF ?? 0
    return {
      center: a.clone().addScaledVector(axis, p.t * len).addScaledVector(up, p.off ?? 0),
      rx: p.rx,
      rzF: p.rzF ?? rz,
      rzB: p.rzB ?? rz,
      grooveF: p.grooveF,
      grooveB: p.grooveB,
    }
  })
  return loftRings(rings, radialSegments, caps)
}

/** Volume signé d'un maillage fermé (théorème de la divergence). */
export function signedVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position')
  const idx = geo.getIndex()
  const nTri = idx ? idx.count / 3 : pos.count / 3
  let v = 0
  for (let i = 0; i < nTri; i++) {
    const a = idx ? idx.getX(i * 3) : i * 3
    const b = idx ? idx.getX(i * 3 + 1) : i * 3 + 1
    const c = idx ? idx.getX(i * 3 + 2) : i * 3 + 2
    const ax = pos.getX(a), ay = pos.getY(a), az = pos.getZ(a)
    const bx = pos.getX(b), by = pos.getY(b), bz = pos.getZ(b)
    const cx = pos.getX(c), cy = pos.getY(c), cz = pos.getZ(c)
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  return v
}

/** Retourne le sens des triangles si le maillage est inversé (volume négatif). */
export function fixWinding(geo: THREE.BufferGeometry): void {
  if (signedVolume(geo) >= 0) return
  const idx = geo.getIndex()
  if (!idx) return
  const arr = idx.array as Uint16Array | Uint32Array
  for (let i = 0; i < arr.length; i += 3) {
    const t = arr[i + 1]
    arr[i + 1] = arr[i + 2]
    arr[i + 2] = t
  }
  idx.needsUpdate = true
  geo.computeVertexNormals()
}

/** Périmètre d'une ellipse (approximation de Ramanujan). */
export function ellipseCirc(rx: number, rz: number): number {
  const a = Math.max(rx, 0.001)
  const b = Math.max(rz, 0.001)
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))
}

/** Petite ellipsoïde lissée (oreilles, pouce, nez...). */
export function ellipsoid(
  center: THREE.Vector3,
  sx: number,
  sy: number,
  sz: number,
  segments = 20,
): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, segments, Math.max(8, Math.round(segments * 0.7)))
  g.scale(sx, sy, sz)
  g.translate(center.x, center.y, center.z)
  return g
}

export { smoothstep }
