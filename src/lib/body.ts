import * as THREE from 'three'
import { getPosedBase, posePositions } from './base/pose'
import { getBaseMesh, geometryFromPositions } from './base/mesh'
import { getLoadedBody } from './base/model'
import { getSubdivider } from './base/subdiv'
import { applyTarget } from './base/morph'
import { buildGenitals, findPubis } from './base/genitals'
import { buildEyeDetails, IRIS_MAT, PUPIL_MAT } from './base/face'
import { absField, applyBumpShader, buildBumpTexture, bumpUniforms } from './base/bump'
import { applyAnatomy, applyBumpNormals } from './base/details'

/**
 * Moteur de morphing : le vecteur corporel BodyParams pilote des déformations
 * du mesh de base. Le maillage n'est qu'une projection du vecteur — il ne
 * contient aucune donnée de vérité.
 */

export interface BodyParams {
  /** taille en cm */
  height: number
  /** masse grasse estimée en % */
  fat: number
  /** stockage abdominal local (0-100) */
  belly: number
  /** développement musculaire par région (0-100) */
  neck: number
  shoulders: number
  lats: number
  pecs: number
  abs: number
  glutes: number
  thighs: number
  calves: number
  arms: number
  forearms: number
}

/**
 * Valeurs par défaut : homme jeune sec et sportif (référence visuelle §1bis).
 * L'amplitude des muscles est calée sur les cibles MakeHuman : 45 = neutre.
 */
export const DEFAULT_PARAMS: BodyParams = {
  height: 175,
  fat: 12,
  belly: 16,
  neck: 60,
  shoulders: 78,
  lats: 76,
  pecs: 80,
  abs: 74,
  glutes: 60,
  thighs: 72,
  calves: 62,
  arms: 76,
  forearms: 62,
}

export const PRESETS: Record<string, Omit<BodyParams, 'height'>> = {
  athletique: { fat: 14, belly: 25, neck: 52, shoulders: 62, lats: 60, pecs: 58, abs: 58, glutes: 55, thighs: 56, calves: 52, arms: 55, forearms: 50 },
  bodybuilder: { fat: 15, belly: 30, neck: 68, shoulders: 88, lats: 88, pecs: 85, abs: 72, glutes: 72, thighs: 82, calves: 78, arms: 92, forearms: 78 },
  sec: { fat: 9, belly: 12, neck: 50, shoulders: 58, lats: 58, pecs: 55, abs: 65, glutes: 52, thighs: 54, calves: 50, arms: 52, forearms: 48 },
  massif: { fat: 28, belly: 72, neck: 62, shoulders: 60, lats: 55, pecs: 60, abs: 40, glutes: 55, thighs: 62, calves: 58, arms: 62, forearms: 60 },
}

export interface BodyMetrics {
  weight: number
  lean: number
  waist: number
  chest: number
  arm: number
  thigh: number
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const nn = (v: number) => (v - 50) / 50
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const gauss = (x: number, mu: number, sigma: number) => Math.exp(-(((x - mu) / sigma) ** 2))

// ---------------------------------------------------------------------------
// Couches MakeHuman : poids déduits du vecteur corporel.
// ---------------------------------------------------------------------------

export type LayerWeights = Record<string, number>

/**
 * Traduit BodyParams en poids de cibles MakeHuman.
 * 0,55 de muscle global = homme jeune moyen ; 1 = maxmuscle.
 * Une valeur locale de 45 = morphologie neutre (référence des sliders).
 */
export function getLayerWeights(p: BodyParams): LayerWeights {
  const avgMuscle = (p.shoulders + p.lats + p.pecs + p.arms + p.thighs + p.calves + p.neck) / 7
  const m01 = clamp(0.55 + ((avgMuscle - 45) / 43) * 0.6, 0, 1)
  const w01 = clamp(0.5 + ((p.fat - 14) / 24) * 0.5, 0.04, 1)
  const local = (v: number, k = 0.9) => clamp(((v - 45) / 55) * k, -0.35, 1)
  // graisse segmentaire : nulle sous 14 % de masse grasse
  const fatSeg = clamp((p.fat - 14) / 18, 0, 1) * 0.9

  return {
    male: 1,
    muscleMax: clamp(2 * m01 - 1, 0, 1),
    muscleMin: clamp(1 - 2 * m01, 0, 1),
    weightMax: clamp(2 * w01 - 1, 0, 1),
    weightMin: clamp(1 - 2 * w01, 0, 1),
    vshape: local(p.lats, 0.7),
    pectoral: local(p.pecs, 1.0),
    dorsi: local(p.lats, 0.7),
    shoulderDist: local(p.shoulders, 1.0),
    upperarm: local(p.arms, 1.0),
    thigh: local(p.thighs, 1.0),
    calf: local(p.calves, 1.0),
    neck: local(p.neck, 1.0),
    neckWide: local(p.neck, 0.8),
    waistIn: local(p.lats, 0.7),
    stomachTone: local(p.abs, 0.7),
    pelvisTone: local(p.abs, 0.35),
    buttocks: local(p.glutes, 0.8),
    // --- bras : muscle par segment, graisse par segment ---
    upperarmMuscleL: local(p.arms, 0.9),
    upperarmMuscleR: local(p.arms, 0.9),
    lowerarmMuscleL: local(p.forearms, 0.9),
    lowerarmMuscleR: local(p.forearms, 0.9),
    upperarmFatL: fatSeg,
    upperarmFatR: fatSeg,
    lowerarmFatL: fatSeg,
    lowerarmFatR: fatSeg,
    // --- jambes ---
    upperlegMuscleL: local(p.thighs, 0.85),
    upperlegMuscleR: local(p.thighs, 0.85),
    lowerlegMuscleL: local(p.calves, 0.85),
    lowerlegMuscleR: local(p.calves, 0.85),
    // --- pieds : le mesh de base a des pieds un peu larges ; on les resserre
    //     légèrement, comme sur la sculpture de référence ---
    footScaleL: 0.3,
    footScaleR: 0.3,
    footHorizL: 0.25,
    footHorizR: 0.25,
  }
}

/** Surcharge de debug : ?morph=male:1,muscleMax:1 */
function debugLayerWeights(): LayerWeights | null {
  if (typeof location === 'undefined') return null
  const raw = new URLSearchParams(location.search).get('morph')
  if (!raw) return null
  const out: LayerWeights = {}
  for (const part of raw.split(',')) {
    const [k, v] = part.split(':')
    if (k && v !== undefined && Number.isFinite(Number(v))) out[k] = Number(v)
  }
  return out
}

// ---------------------------------------------------------------------------
// Squelette logiciel : segments issus des repères du mesh de base.
// ---------------------------------------------------------------------------

interface Bone {
  key: string
  a: THREE.Vector3
  b: THREE.Vector3
  sigma: number
}

let bonesCache: Bone[] | null = null

/**
 * Squelette logiciel : segments issus des repères du mesh de base.
 * Les repères sont ceux de la pose courante (ils changent avec le morphing),
 * le cache est donc invalidé à chaque construction.
 */
function getBones(joints: Record<string, THREE.Vector3>): Bone[] {
  bonesCache = null
  const j = (name: string) => joints[name]
  const list: Bone[] = [
    { key: 'pelvis', a: j('pelvis'), b: j('spine-4'), sigma: 0.075 },
    { key: 'spine4', a: j('spine-4'), b: j('spine-3'), sigma: 0.075 },
    { key: 'spine3', a: j('spine-3'), b: j('spine-2'), sigma: 0.08 },
    { key: 'spine2', a: j('spine-2'), b: j('spine-1'), sigma: 0.08 },
    { key: 'chest', a: j('spine-1'), b: j('neck'), sigma: 0.085 },
    { key: 'neck', a: j('neck'), b: j('head'), sigma: 0.045 },
    { key: 'head', a: j('head'), b: j('head-2'), sigma: 0.075 },
  ]
  for (const side of ['l', 'r'] as const) {
    const s = side === 'l' ? 1 : -1
    const mirror = (name: string) => {
      const p = j(name)
      return new THREE.Vector3(s === 1 ? p.x : -p.x, p.y, p.z)
    }
    const suf = side === 'l' ? 'L' : 'R'
    list.push(
      { key: `clav${suf}`, a: mirror('l-clavicle'), b: mirror('l-shoulder'), sigma: 0.045 },
      { key: `uarm${suf}`, a: mirror('l-shoulder'), b: mirror('l-elbow'), sigma: 0.034 },
      { key: `farm${suf}`, a: mirror('l-elbow'), b: mirror('l-hand'), sigma: 0.032 },
      { key: `hand${suf}`, a: mirror('l-hand'), b: mirror('l-finger-3-2'), sigma: 0.028 },
      { key: `uleg${suf}`, a: mirror('l-upper-leg'), b: mirror('l-knee'), sigma: 0.055 },
      { key: `lleg${suf}`, a: mirror('l-knee'), b: mirror('l-ankle'), sigma: 0.045 },
      { key: `foot${suf}`, a: mirror('l-ankle'), b: mirror('l-foot-1'), sigma: 0.035 },
    )
  }
  bonesCache = list
  return list
}

function distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): { d: number; t: number } {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const abz = b.z - a.z
  const apx = p.x - a.x
  const apy = p.y - a.y
  const apz = p.z - a.z
  const denom = abx * abx + aby * aby + abz * abz || 1e-9
  const t = clamp((apx * abx + apy * aby + apz * abz) / denom, 0, 1)
  const dx = apx - abx * t
  const dy = apy - aby * t
  const dz = apz - abz * t
  return { d: Math.sqrt(dx * dx + dy * dy + dz * dz), t }
}

// ---------------------------------------------------------------------------
// Masques de déformation (calculés une fois, réutilisés à chaque morphing).
// ---------------------------------------------------------------------------

export interface Masks {
  fat: Float32Array
  belly: Float32Array
  glute: Float32Array
  pec: Float32Array
  lat: Float32Array
  abs: Float32Array
  trap: Float32Array
  delt: Float32Array
  arm: Float32Array
  fore: Float32Array
  thigh: Float32Array
  calf: Float32Array
  /** signe du côté (x) pour les déformations latérales */
  side: Float32Array
  torso: Float32Array
}

let masksCache: Masks | null = null

/**
 * Masques de déformation, calculés sur le maillage courant (dense).
 * Ils décrivent l'appartenance de chaque sommet à une région du corps :
 * graisse, ventre, pectoraux, dorsaux, abdos, bras, cuisses…
 */
export function computeMasks(
  positions: Float32Array,
  joints: Record<string, THREE.Vector3>,
): Masks {
  const bones = getBones(joints)
  const n = positions.length / 3
  const nb = bones.length
  const W = new Float32Array(n * nb)
  const T = new Float32Array(n * nb)
  const tmp = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    tmp.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
    let sum = 0
    for (let b = 0; b < nb; b++) {
      const bone = bones[b]
      const { d, t } = distToSegment(tmp, bone.a, bone.b)
      const w = Math.exp(-((d / bone.sigma) ** 2))
      W[i * nb + b] = w
      T[i * nb + b] = t
      sum += w
    }
    if (sum > 1e-6) {
      for (let b = 0; b < nb; b++) W[i * nb + b] /= sum
    }
  }
  const idx = (key: string) => bones.findIndex((b) => b.key === key)
  const iClavL = idx('clavL'), iClavR = idx('clavR')
  const iUarmL = idx('uarmL'), iUarmR = idx('uarmR')
  const iFarmL = idx('farmL'), iFarmR = idx('farmR')
  const iHandL = idx('handL'), iHandR = idx('handR')
  const iUlegL = idx('ulegL'), iUlegR = idx('ulegR')
  const iLlegL = idx('llegL'), iLlegR = idx('llegR')
  const iFootL = idx('footL'), iFootR = idx('footR')
  const iPelvis = idx('pelvis'), iSpine4 = idx('spine4'), iSpine3 = idx('spine3')
  const iSpine2 = idx('spine2'), iChest = idx('chest'), iNeck = idx('neck'), iHead = idx('head')

  const masks: Masks = {
    fat: new Float32Array(n),
    belly: new Float32Array(n),
    glute: new Float32Array(n),
    pec: new Float32Array(n),
    lat: new Float32Array(n),
    abs: new Float32Array(n),
    trap: new Float32Array(n),
    delt: new Float32Array(n),
    arm: new Float32Array(n),
    fore: new Float32Array(n),
    thigh: new Float32Array(n),
    calf: new Float32Array(n),
    side: new Float32Array(n),
    torso: new Float32Array(n),
  }

  const front = (z: number) => smoothstep(0.002, 0.035, z)
  const back = (z: number) => smoothstep(0.002, 0.035, -z)

  for (let i = 0; i < n; i++) {
    const x = positions[i * 3]
    const y = positions[i * 3 + 1]
    const z = positions[i * 3 + 2]
    const w = (k: number) => W[i * nb + k]
    const t = (k: number) => T[i * nb + k]

    const wUarm = w(iUarmL) + w(iUarmR)
    const wFarm = w(iFarmL) + w(iFarmR)
    const wHand = w(iHandL) + w(iHandR)
    const wUleg = w(iUlegL) + w(iUlegR)
    const wLleg = w(iLlegL) + w(iLlegR)
    const wFoot = w(iFootL) + w(iFootR)
    const wPelvis = w(iPelvis)
    const wSpine4 = w(iSpine4)
    const wSpine3 = w(iSpine3)
    const wSpine2 = w(iSpine2)
    const wChest = w(iChest)
    const wNeck = w(iNeck)
    const wHead = w(iHead)
    const wClav = w(iClavL) + w(iClavR)
    const torso = clamp(wPelvis + wSpine4 + wSpine3 + wSpine2 + wChest, 0, 1)

    masks.torso[i] = torso
    masks.side[i] = Math.sign(x)
    masks.fat[i] = clamp(
      1 - 0.8 * wHand - 0.8 * wFoot - 0.45 * wFarm - 0.2 * wLleg - 0.6 * wHead,
      0,
      1,
    )

    // ventre : bas du tronc, face avant
    const bellyCore = wSpine3 + 0.7 * wSpine4 + 0.5 * wSpine2
    masks.belly[i] = clamp(bellyCore * front(z) * gauss(y, 0.585, 0.075), 0, 1)

    // fessiers : bassin, face arrière
    masks.glute[i] = clamp((wPelvis + 0.35 * wSpine4) * back(z) * gauss(y, 0.51, 0.06), 0, 1)

    // pectoraux : face avant du haut du tronc
    const sidePec = 0.45 + 0.55 * smoothstep(0.004, 0.045, Math.abs(x))
    masks.pec[i] = clamp((wChest + 0.45 * wClav) * front(z) * gauss(y, 0.755, 0.055) * sidePec, 0, 1)

    // dorsaux : flancs du haut du tronc
    masks.lat[i] = clamp(
      (wChest + 0.45 * wSpine2) * smoothstep(0.03, 0.085, Math.abs(x)) * gauss(y, 0.70, 0.075),
      0,
      1,
    )

    // sangle abdominale
    masks.abs[i] = clamp((wSpine2 + wSpine3) * front(z) * gauss(y, 0.615, 0.07), 0, 1)

    // paramètre le long d'un membre (t pondéré par les poids de peau)
    const tAlong = (wL: number, wR: number, kL: number, kR: number) =>
      (wL * t(kL) + wR * t(kR)) / Math.max(wL + wR, 1e-6)

    // trapèzes / cou
    masks.trap[i] = clamp((0.8 * wNeck + 0.3 * wChest) * smoothstep(0.79, 0.86, y), 0, 1)

    // deltoïdes : proximal du bras
    const tArm = tAlong(w(iUarmL), w(iUarmR), iUarmL, iUarmR)
    const proximalArm = 1 - smoothstep(0.1, 0.55, tArm)
    masks.delt[i] = clamp(wUarm * proximalArm * smoothstep(0.74, 0.8, y), 0, 1)

    // biceps / triceps : corps du bras
    masks.arm[i] = clamp(wUarm * gauss(tArm, 0.45, 0.3), 0, 1)
    masks.fore[i] = clamp(wFarm, 0, 1)

    // cuisses et mollets
    const tLeg = tAlong(w(iUlegL), w(iUlegR), iUlegL, iUlegR)
    const tShin = tAlong(w(iLlegL), w(iLlegR), iLlegL, iLlegR)
    masks.thigh[i] = clamp(wUleg * gauss(tLeg, 0.35, 0.45), 0, 1)
    masks.calf[i] = clamp(wLleg * gauss(tShin, 0.3, 0.32), 0, 1)
  }

  return masks
}

/** Masques du maillage de base (pose de repos sans morphing) — usage debug. */
export function getMasks(): Masks {
  if (masksCache) return masksCache
  const { positions, joints } = getPosedBase()
  masksCache = computeMasks(positions, joints)
  return masksCache
}

// ---------------------------------------------------------------------------
// Morphing
// ---------------------------------------------------------------------------

/** Volume signé (m³) d'un maillage fermé indexé. */
function meshVolume(pos: Float32Array, indices: Uint16Array | Uint32Array): number {
  let v = 0
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3
    const b = indices[i + 1] * 3
    const c = indices[i + 2] * 3
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2]
    const bx = pos[b], by = pos[b + 1], bz = pos[b + 2]
    const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2]
    v +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6
  }
  return Math.abs(v)
}

/** Périmètre d'une coupe (approché par tri angulaire autour du centre). */
function slicePerimeter(
  pos: Float32Array,
  filter: (i: number) => boolean,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  slab: number,
  u: THREE.Vector3,
  v: THREE.Vector3,
): number {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < pos.length / 3; i++) {
    if (!filter(i)) continue
    const px = pos[i * 3] - center.x
    const py = pos[i * 3 + 1] - center.y
    const pz = pos[i * 3 + 2] - center.z
    if (Math.abs(px * axis.x + py * axis.y + pz * axis.z) > slab) continue
    const a = px * u.x + py * u.y + pz * u.z
    const b = px * v.x + py * v.y + pz * v.z
    pts.push([a, b])
  }
  if (pts.length < 8) return 0

  // enveloppe convexe (Andrew) : le tri angulaire créait des zigzags
  // entre la face avant et la face arrière de la tranche.
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Array<[number, number]> = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Array<[number, number]> = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1))
  let per = 0
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i]
    const b = hull[(i + 1) % hull.length]
    per += Math.hypot(b[0] - a[0], b[1] - a[1])
  }
  return per
}

export interface BodyBuild {
  geometry: THREE.BufferGeometry
  /** génitaux, modelés séparément */
  genitals: THREE.BufferGeometry | null
  /** iris + pupilles */
  eyes: { iris: THREE.BufferGeometry; pupil: THREE.BufferGeometry } | null
  metrics: BodyMetrics
  positions: Float32Array
  /** repères anatomiques après morphing + pose (normalisés) */
  joints: Record<string, THREE.Vector3>
}

/**
 * Niveau de subdivision Catmull-Clark.
 * 0 = mesh brut (13 380 sommets, ~2 cm d'arête) ; 1 = 53 512 (~1 cm) ;
 * 2 = 214 048 (~5 mm). `?subdiv=n` pour forcer une valeur.
 */
function subdivLevel(): number {
  if (typeof location === 'undefined') return 1
  const raw = new URLSearchParams(location.search).get('subdiv')
  if (raw === null) return 1
  const n = Number(raw)
  return Number.isFinite(n) ? clamp(Math.round(n), 0, 2) : 1
}

/** Normales lissées d'un maillage indexé (sans allocation Three.js). */
function computeNormals(pos: Float32Array, idx: Uint32Array): Float32Array {
  const n = new Float32Array(pos.length)
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3
    const b = idx[t + 1] * 3
    const c = idx[t + 2] * 3
    const e1x = pos[b] - pos[a]
    const e1y = pos[b + 1] - pos[a + 1]
    const e1z = pos[b + 2] - pos[a + 2]
    const e2x = pos[c] - pos[a]
    const e2y = pos[c + 1] - pos[a + 1]
    const e2z = pos[c + 2] - pos[a + 2]
    const nx = e1y * e2z - e1z * e2y
    const ny = e1z * e2x - e1x * e2z
    const nz = e1x * e2y - e1y * e2x
    n[a] += nx
    n[a + 1] += ny
    n[a + 2] += nz
    n[b] += nx
    n[b + 1] += ny
    n[b + 2] += nz
    n[c] += nx
    n[c + 1] += ny
    n[c + 2] += nz
  }
  for (let i = 0; i < n.length; i += 3) {
    const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1
    n[i] /= l
    n[i + 1] /= l
    n[i + 2] /= l
  }
  return n
}

/** Drapeaux de debug via l'URL : ?anat=0 (pas d'anatomie), ?muscle=0, ?pose=0 */
function debugFlag(name: string, def = true): boolean {
  if (typeof location === 'undefined') return def
  const v = new URLSearchParams(location.search).get(name)
  if (v === null) return def
  return v !== '0'
}

/**
 * Repères articulaires après morphing.
 *
 * Chaque repère est déplacé du déplacement moyen des K sommets les plus
 * proches (pondéré par 1/d²). C'est indispensable : les repères du mesh de
 * base sont à l'INTÉRIEUR du corps, et les cibles MakeHuman déplacent la
 * surface de plusieurs centimètres. Sans cette correction, la pose
 * partirait d'un faux axe de membre (calculé sur un sommet de peau au lieu
 * de l'articulation) et les cuisses se tordraient en un pli en V.
 */
function morphedJoints(
  base: { positions: Float32Array; joints: Record<string, THREE.Vector3> },
  morphed: Float32Array,
): Record<string, THREE.Vector3> {
  const K = 8
  const nV = base.positions.length / 3
  const out: Record<string, THREE.Vector3> = {}
  for (const [name, j] of Object.entries(base.joints)) {
    // K plus proches sommets du repère
    const bi = new Int32Array(K)
    const bd = new Float64Array(K).fill(Infinity)
    for (let i = 0; i < nV; i++) {
      const dx = base.positions[i * 3] - j.x
      const dy = base.positions[i * 3 + 1] - j.y
      const dz = base.positions[i * 3 + 2] - j.z
      const d = dx * dx + dy * dy + dz * dz
      if (d >= bd[K - 1]) continue
      let p = K - 1
      while (p > 0 && bd[p - 1] > d) {
        bd[p] = bd[p - 1]
        bi[p] = bi[p - 1]
        p--
      }
      bd[p] = d
      bi[p] = i
    }
    let sx = 0
    let sy = 0
    let sz = 0
    let sw = 0
    for (let k = 0; k < K; k++) {
      if (!Number.isFinite(bd[k])) continue
      const w = 1 / (bd[k] + 1e-5)
      const i = bi[k]
      sx += (morphed[i * 3] - base.positions[i * 3]) * w
      sy += (morphed[i * 3 + 1] - base.positions[i * 3 + 1]) * w
      sz += (morphed[i * 3 + 2] - base.positions[i * 3 + 2]) * w
      sw += w
    }
    out[name] = new THREE.Vector3(j.x + sx / sw, j.y + sy / sw, j.z + sz / sw)
  }
  return out
}

export function buildBodyGeometry(p: BodyParams): BodyBuild {
  const base = getBaseMesh()

  // 1. morphologie : cibles MakeHuman empilées sur le mesh brut.
  //    Ces cibles ne s'appliquent qu'à la base MakeHuman (topologie exacte) :
  //    sur un modèle externe, seul le morphing procédural s'applique.
  const morphed = new Float32Array(base.positions)
  if (getLoadedBody()?.makehuman) {
    const weights = debugLayerWeights() ?? getLayerWeights(p)
    for (const [name, w] of Object.entries(weights)) applyTarget(morphed, name, w)
  }

  // 2. pose de repos appliquée au corps morphé (au niveau de base : rapide)
  const pq = posePositions(morphed, morphedJoints(base, morphed))

  // 3. subdivision Catmull-Clark : on densifie AVANT de graver l'anatomie,
  //    sinon les rainures de 6 mm seraient mangées par la maille de 2 cm.
  const level = subdivLevel()
  const dense = getSubdivider(base.faces, base.faceSizes, level).apply(pq.positions)
  const src = dense.positions
  const idx = dense.indices
  const n = src.length / 3

  // 4. normales du maillage dense (les masques s'appuient dessus)
  const nrm = computeNormals(src, idx)

  // 5. masques de déformation sur le maillage dense
  const masks = computeMasks(src, pq.joints)

  const H = clamp(p.height, 140, 210) / 100
  setBumpHeight(H * 100)
  const fatD = clamp((p.fat - 12) / 22, -0.7, 1.4)
  const bellyD = clamp((p.belly - 25) / 70, -0.45, 1.1)
  const neckD = nn(p.neck)
  const shD = nn(p.shoulders)
  const latsD = nn(p.lats)
  const pecsD = nn(p.pecs)
  const absD = nn(p.abs)
  const glutD = nn(p.glutes)
  const thighD = nn(p.thighs)
  const calfD = nn(p.calves)
  const armD = nn(p.arms)
  const foreD = nn(p.forearms)

  const dFat = fatD * 0.011
  const dBelly = bellyD * 0.075
  const dGlute = glutD * 0.02
  const dPec = pecsD * 0.012
  const dLat = latsD * 0.024
  const dAbs = absD * 0.006
  const dTrap = neckD * 0.01
  const dDelt = shD * 0.013
  const dArm = armD * 0.012
  const dFore = foreD * 0.008
  const dThigh = thighD * 0.012
  const dCalf = calfD * 0.011

  const out = new Float32Array(src.length)
  const muscleOn = debugFlag('muscle')
  for (let i = 0; i < n; i++) {
    const x = src[i * 3]
    const y = src[i * 3 + 1]
    const z = src[i * 3 + 2]
    const nx = nrm[i * 3]
    const ny = nrm[i * 3 + 1]
    const nz = nrm[i * 3 + 2]

    const alongNormal = muscleOn
      ? dFat * masks.fat[i] +
        dTrap * masks.trap[i] +
        dDelt * masks.delt[i] +
        dArm * masks.arm[i] +
        dFore * masks.fore[i] +
        dThigh * masks.thigh[i] +
        dCalf * masks.calf[i]
      : 0
    const alongZ = muscleOn
      ? dBelly * masks.belly[i] + dPec * masks.pec[i] + dAbs * masks.abs[i] - dGlute * masks.glute[i]
      : 0
    const alongX = muscleOn ? dLat * masks.lat[i] * masks.side[i] : 0

    out[i * 3] = (x + nx * alongNormal + alongX) * H
    out[i * 3 + 1] = (y + ny * alongNormal) * H
    out[i * 3 + 2] = (z + nz * alongNormal + alongZ) * H
  }

  // 6. définition anatomique gravée (pectoraux, abdos, serratus, jambes)
  //    les détails du visage sont calés sur les positions normalisées
  const norm = new Float32Array(out.length)
  for (let i = 0; i < out.length; i++) norm[i] = out[i] / H
  const anat = debugFlag('anat')
    ? applyAnatomy(out, nrm, {
        joints: pq.joints,
        positions: norm,
        masks,
        H,
        digits: debugFlag('digits'),
      })
    : { gx: new Float32Array(n), gy: new Float32Array(n) }

  // 7. ancrage au sol : les pieds doivent reposer exactement sur le socle.
  //    La pose (rotation de la jambe autour de la hanche) soulève le pied de
  //    quelques millimètres ; sans cette correction le corps flotte.
  let minY = Infinity
  for (let i = 1; i < out.length; i += 3) if (out[i] < minY) minY = out[i]
  if (Number.isFinite(minY) && minY !== 0) {
    for (let i = 1; i < out.length; i += 3) out[i] -= minY
  }

  const geometry = geometryFromPositions(out, idx)
  // normales analytiques : le relief fin des rainures est réinjecté ici
  applyBumpNormals(geometry, anat)

  // --- métriques ---
  // `out` est déjà à l'échelle réelle : le volume est en m³.
  // K compense la différence entre volume géométrique et masse réelle
  // (densité ~1,03 kg/L, plus les organes non modélisés).
  const volM3 = meshVolume(out, idx)
  const weight = volM3 * 1000 * 1.02
  const lean = weight * (1 - p.fat / 100)

  const bones = getBones(pq.joints)
  const b = (key: string) => bones.find((bb) => bb.key === key)!
  const up = new THREE.Vector3(0, 1, 0)
  const xAxis = new THREE.Vector3(1, 0, 0)

  const waistCenter = new THREE.Vector3(0, 0.60 * H, 0)
  const chestCenter = new THREE.Vector3(0, 0.755 * H, 0)
  const waist = slicePerimeter(out, (i) => masks.torso[i] > 0.55, waistCenter, up, 0.012 * H, xAxis, new THREE.Vector3(0, 0, 1))
  const chest = slicePerimeter(out, (i) => masks.torso[i] > 0.55, chestCenter, up, 0.012 * H, xAxis, new THREE.Vector3(0, 0, 1))

  const uarm = b('uarmL')
  const armAxis = new THREE.Vector3().subVectors(uarm.b, uarm.a).normalize()
  const armCenter = new THREE.Vector3().lerpVectors(uarm.a, uarm.b, 0.45).multiplyScalar(H)
  // l'axe des articulations n'est pas exactement l'axe du membre (la cible
  // féminine décale le bras) : on recale le plan de coupe sur la géométrie
  // réelle, sinon la tranche est vide et le tour de bras vaut 0.
  const recenter = (
    center: THREE.Vector3,
    a: THREE.Vector3,
    bb: THREE.Vector3,
    axis: THREE.Vector3,
    mask: Float32Array,
    side: number,
  ) => {
    const p0 = a.clone().multiplyScalar(H)
    const p1 = bb.clone().multiplyScalar(H)
    const ax = p1.clone().sub(p0)
    const len2 = ax.lengthSq()
    const acc = new THREE.Vector3()
    let n = 0
    for (let i = 0; i < out.length / 3; i++) {
      if (mask[i] < 0.45) continue
      const x = out[i * 3]
      if (side > 0 ? x <= 0 : x >= 0) continue
      const p = new THREE.Vector3(x, out[i * 3 + 1], out[i * 3 + 2])
      const t = Math.max(0, Math.min(1, p.clone().sub(p0).dot(ax) / len2))
      acc.add(p.sub(p0.clone().addScaledVector(ax, t)))
      n++
    }
    if (n > 0) center.add(acc.divideScalar(n))
    return center
  }
  recenter(armCenter, uarm.a, uarm.b, armAxis, masks.arm, 1)
  const uu = new THREE.Vector3().crossVectors(armAxis, up).normalize()
  const vv = new THREE.Vector3().crossVectors(armAxis, uu).normalize()
  const arm = slicePerimeter(
    out,
    (i) => masks.arm[i] > 0.3 && out[i * 3] > 0,
    armCenter,
    armAxis,
    0.012 * H,
    uu.multiplyScalar(H).normalize(),
    vv.multiplyScalar(H).normalize(),
  )

  const uleg = b('ulegL')
  const thighAxis = new THREE.Vector3().subVectors(uleg.b, uleg.a).normalize()
  const thighCenter = new THREE.Vector3().lerpVectors(uleg.a, uleg.b, 0.5).multiplyScalar(H)
  recenter(thighCenter, uleg.a, uleg.b, thighAxis, masks.thigh, 1)
  const tu = new THREE.Vector3().crossVectors(thighAxis, new THREE.Vector3(0, 0, 1)).normalize()
  const tv = new THREE.Vector3().crossVectors(thighAxis, tu).normalize()
  const thigh = slicePerimeter(
    out,
    (i) => masks.thigh[i] > 0.3 && out[i * 3] > 0,
    thighCenter,
    thighAxis,
    0.012 * H,
    tu,
    tv,
  )

  const metrics: BodyMetrics = {
    weight,
    lean,
    waist: waist * 100,
    chest: chest * 100,
    arm: arm * 100,
    thigh: thigh * 100,
  }

  // génitaux : maillages procéduraux posés sur la surface pubienne réelle
  const pubis = findPubis(out, H)
  const genitals = buildGenitals(pubis, H / 1.75)
  genitals.scale(H, H, H)

  // --- visage : rayon du globe oculaire puis iris / pupilles ---
  let eyeR = 0.0069
  const eyeJ = pq.joints['l-eye']
  if (eyeJ) {
    let sum = 0
    let cnt = 0
    for (let i = 0; i < n; i++) {
      const dx = src[i * 3] - eyeJ.x
      const dy = src[i * 3 + 1] - eyeJ.y
      const dz = src[i * 3 + 2] - eyeJ.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < 0.0095) {
        sum += d
        cnt++
      }
    }
    if (cnt > 4) eyeR = sum / cnt
  }
  const eyes = buildEyeDetails(pq.joints, H, eyeR)

  return { geometry, genitals, eyes, metrics, positions: out, joints: pq.joints }
}

/** Groupe prêt à afficher : solide + maillage filaire superposé. */
export function buildBody(p: BodyParams): { group: THREE.Group; metrics: BodyMetrics } {
  const { geometry, genitals, eyes, metrics } = buildBodyGeometry(p)
  const group = new THREE.Group()
  const solid = new THREE.Mesh(geometry, BODY_MAT)
  solid.userData.isWire = false
  solid.castShadow = true
  solid.receiveShadow = true
  group.add(solid)
  if (genitals) {
    const g = new THREE.Mesh(genitals, BODY_MAT)
    g.userData.isWire = false
    g.castShadow = true
    group.add(g)
  }
  if (eyes) {
    const iris = new THREE.Mesh(eyes.iris, IRIS_MAT)
    iris.userData.isWire = false
    iris.castShadow = true
    group.add(iris)
    const pupil = new THREE.Mesh(eyes.pupil, PUPIL_MAT)
    pupil.userData.isWire = false
    group.add(pupil)
  }
  const wire = new THREE.Mesh(geometry, WIRE_MAT)
  wire.userData.isWire = true
  wire.visible = false
  group.add(wire)
  return { group, metrics }
}

/**
 * Matière « plâtre de studio » : gris mat légèrement chaud, sans métal,
 * avec un spéculaire large et doux (les muscles captent la lumière comme
 * sur la sculpture de référence).
 */
export const BODY_MAT = new THREE.MeshStandardMaterial({
  color: 0x8d8b87,
  roughness: 0.6,
  metalness: 0,
  envMapIntensity: 0.85,
})

// Relief fin des abdominaux : la géométrie est trop grossière pour le graver,
// le relief est donc porté par une bump map procédurale (voir base/bump.ts).
applyBumpShader(BODY_MAT, absField(), buildBumpTexture(absField(), 256))

// Grain de cuir rasé sur le crâne : sans lui, la tête reste une calotte
// lisse de mannequin au lieu du crâne rasé de la sculpture de référence.
bumpUniforms.uStubble.value = 0.11
bumpUniforms.uStubbleY.value = 0.945

/** Met à jour l'échelle du motif (la taille du corps change la coordonnée). */
export function setBumpHeight(heightCm: number) {
  bumpUniforms.uBumpInvH.value = 1 / (heightCm / 100)
}

export const WIRE_MAT = new THREE.MeshBasicMaterial({
  color: 0x9af0cf,
  wireframe: true,
  transparent: true,
  opacity: 0.14,
  depthWrite: false,
})
