/**
 * Mesure par coupe de plan : on intersecte le maillage avec un plan et on
 * mesure le périmètre de la section obtenue.
 *
 * C'est la seule méthode fiable pour un tour de bras ou de cuisse : un
 * simple balayage de sommets dans une bande donne un résultat faux (le tour
 * est alors augmenté par les points voisins hors plan).
 */
import * as THREE from 'three'
import { buildBodyGeometry, DEFAULT_PARAMS, type BodyParams } from '../../src/lib/body'

import { loadModel } from './load-model'
await loadModel()

export interface Section {
  /** périmètre en mètres (toutes boucles confondues) */
  perimeter: number
  /** aire en m² */
  area: number
  /** nombre de segments */
  segments: number
  /** boucles individuelles (contours fermés) */
  loops?: Array<{ per: number; cx: number; cy: number; n: number }>
}

/**
 * Section du maillage par un plan (point `center`, normale `axis`).
 * `filter` permet de ne garder que la partie voulue (par exemple le bras
 * gauche, quand le plan traverse aussi le torse).
 */
export function section(
  pos: Float32Array,
  idx: Uint16Array | Uint32Array,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  filter?: (cx: number, cy: number, cz: number) => boolean,
): Section {
  const n = axis.clone().normalize()
  const d = new Float32Array(pos.length / 3)
  for (let i = 0; i < d.length; i++) {
    const px = pos[i * 3] - center.x
    const py = pos[i * 3 + 1] - center.y
    const pz = pos[i * 3 + 2] - center.z
    d[i] = px * n.x + py * n.y + pz * n.z
  }
  const u = new THREE.Vector3(1, 0, 0)
  if (Math.abs(n.x) > 0.9) u.set(0, 1, 0)
  const e1 = new THREE.Vector3().crossVectors(n, u).normalize()
  const e2 = new THREE.Vector3().crossVectors(n, e1).normalize()

  // segments de la section : paires de points 2D
  const seg: Array<[number, number, number, number]> = []
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]
    const b = idx[t + 1]
    const c = idx[t + 2]
    const da = d[a]
    const db = d[b]
    const dc = d[c]
    const neg = (da < 0 ? 1 : 0) + (db < 0 ? 1 : 0) + (dc < 0 ? 1 : 0)
    if (neg === 0 || neg === 3) continue
    if (filter) {
      const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3
      const cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3
      const cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3
      if (!filter(cx, cy, cz)) continue
    }
    const inter: number[] = []
    const edge = (i: number, j: number) => {
      const di = d[i]
      const dj = d[j]
      if (di === dj) return
      const tt = di / (di - dj)
      if (tt < 0 || tt > 1) return
      inter.push(
        pos[i * 3] + (pos[j * 3] - pos[i * 3]) * tt - center.x,
        pos[i * 3 + 1] + (pos[j * 3 + 1] - pos[i * 3 + 1]) * tt - center.y,
        pos[i * 3 + 2] + (pos[j * 3 + 2] - pos[i * 3 + 2]) * tt - center.z,
      )
    }
    edge(a, b)
    edge(b, c)
    edge(c, a)
    if (inter.length !== 6) continue
    const p0 = [inter[0], inter[1], inter[2]]
    const p1 = [inter[3], inter[4], inter[5]]
    const proj = (p: number[]) => [
      p[0] * e1.x + p[1] * e1.y + p[2] * e1.z,
      p[0] * e2.x + p[1] * e2.y + p[2] * e2.z,
    ]
    const q0 = proj(p0)
    const q1 = proj(p1)
    seg.push([q0[0], q0[1], q1[0], q1[1]])
  }
  if (seg.length < 3) return { perimeter: 0, area: 0, segments: 0 }

  // chaînage des segments en boucle(s) : index sur les DEUX extrémités
  const used = new Uint8Array(seg.length)
  const Q = 1e6
  const key = (x: number, y: number) => `${Math.round(x * Q)},${Math.round(y * Q)}`
  const byEnd = new Map<string, number[]>()
  const add = (k: string, i: number) => {
    const arr = byEnd.get(k)
    if (arr) arr.push(i)
    else byEnd.set(k, [i])
  }
  for (let k = 0; k < seg.length; k++) {
    add(key(seg[k][0], seg[k][1]), k)
    add(key(seg[k][2], seg[k][3]), k)
  }
  const findNext = (x: number, y: number): number => {
    const arr = byEnd.get(key(x, y))
    if (!arr) return -1
    for (const k of arr) if (!used[k]) return k
    return -1
  }
  let perimeter = 0
  let area2 = 0
  const loops: Array<{ per: number; cx: number; cy: number; n: number }> = []
  for (let s = 0; s < seg.length; s++) {
    if (used[s]) continue
    used[s] = 1
    let ax = seg[s][0]
    let ay = seg[s][1]
    let bx = seg[s][2]
    let by = seg[s][3]
    let per = 0
    let sx = 0
    let sy = 0
    let cnt = 0
    let guard = 0
    while (guard++ < seg.length + 2) {
      area2 += ax * by - bx * ay
      per += Math.hypot(bx - ax, by - ay)
      sx += ax
      sy += ay
      cnt++
      const next = findNext(bx, by)
      if (next < 0) break
      used[next] = 1
      ax = bx
      ay = by
      if (Math.hypot(seg[next][0] - ax, seg[next][1] - ay) < 1e-9) {
        bx = seg[next][2]
        by = seg[next][3]
      } else {
        bx = seg[next][0]
        by = seg[next][1]
      }
    }
    loops.push({ per, cx: sx / Math.max(cnt, 1), cy: sy / Math.max(cnt, 1), n: cnt })
    perimeter += per
  }
  void area2
  return { perimeter, area: 0, segments: seg.length, loops }
}

/** Tour d'un membre : plan perpendiculaire à l'os, au milieu du segment. */
export function limbPerimeter(
  pos: Float32Array,
  idx: Uint16Array | Uint32Array,
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  side: number,
  maxR: number,
): Section {
  const dir = new THREE.Vector3().subVectors(b, a).normalize()
  const center = a.clone().lerp(b, t)
  // on ne garde que les triangles proches de l'axe du membre (sinon le plan
  // traverse aussi le torse et le tour est faux)
  const ab = new THREE.Vector3().subVectors(b, a)
  const len2 = ab.lengthSq()
  return section(pos, idx, center, dir, (cx, cy, cz) => {
    const px = cx - a.x
    const py = cy - a.y
    const pz = cz - a.z
    const u = Math.max(0, Math.min(1, (px * ab.x + py * ab.y + pz * ab.z) / len2))
    const dx = px - ab.x * u
    const dy = py - ab.y * u
    const dz = pz - ab.z * u
    return Math.hypot(dx, dy, dz) < maxR && cx * side > -0.02
  })
}

export function measure(p: BodyParams, label: string) {
  const { positions, geometry, joints } = buildBodyGeometry(p)
  const idx = geometry.getIndex()!.array as Uint32Array
  const H = p.height / 100
  const V = (name: string) => {
    const j = joints[name]
    return new THREE.Vector3(j.x * H, j.y * H, j.z * H)
  }
  const rows: string[] = []
  /** pour un membre : la boucle centrée sur l'axe (la plus proche du centre) */
  const putLimb = (name: string, s: Section) => {
    if (!s.loops || !s.loops.length) return
    let best: (typeof s.loops)[number] | null = null
    let bestD = Infinity
    for (const l of s.loops) {
      if (l.n < 4 || l.per < 0.03) continue
      const d = Math.hypot(l.cx, l.cy)
      if (d < bestD) {
        bestD = d
        best = l
      }
    }
    if (best) rows.push(`${name} ${(best.per * 100).toFixed(1)}`)
  }
  /** pour le torse : la plus grande boucle */
  const putBig = (name: string, s: Section) => {
    if (!s.loops || !s.loops.length) return
    let best = s.loops[0]
    for (const l of s.loops) if (l.per > best.per) best = l
    rows.push(`${name} ${(best.per * 100).toFixed(1)}`)
  }
  putLimb('bras', limbPerimeter(positions, idx, V('l-shoulder'), V('l-elbow'), 0.5, 1, 0.2))
  putLimb('av-bras', limbPerimeter(positions, idx, V('l-elbow'), V('l-hand'), 0.4, 1, 0.18))
  putLimb('cuisse', limbPerimeter(positions, idx, V('l-upper-leg'), V('l-knee'), 0.45, 1, 0.22))
  putLimb('mollet', limbPerimeter(positions, idx, V('l-knee'), V('l-ankle'), 0.4, 1, 0.18))
  putLimb('cou', limbPerimeter(positions, idx, V('neck'), V('head'), 0.5, 1, 0.16))
  const horiz = (name: string, y: number, r: number) => {
    const c = new THREE.Vector3(0, y * H, 0)
    const s = section(positions, idx, c, new THREE.Vector3(0, 1, 0), (cx, cy, cz) => {
      return Math.hypot(cx, cz) < r
    })
    putBig(name, s)
  }
  horiz('poitrine', 0.76, 0.3)
  horiz('taille', 0.6, 0.3)
  horiz('hanches', 0.5, 0.3)
  console.log(label.padEnd(12), '→', rows.join(' · '), '(cm)')
}

/** Références : homme 1,75 m athlétique (tour de bras 40 cm, cuisse 58 cm…) */
export const NORMS = {
  bras: 40,
  'av-bras': 29,
  cuisse: 58,
  mollet: 37,
  cou: 39,
  poitrine: 102,
  taille: 82,
  hanches: 96,
}

if (process.argv[1]?.includes('measure')) {
  measure(DEFAULT_PARAMS, 'défaut')
}
