import * as THREE from 'three'
import { getBaseMesh, type BaseMesh } from './mesh'

/**
 * Pose de repos. Le mesh MakeHuman est livré en A-pose large : bras à ~40°,
 * avant-bras projetés vers l'avant (poignet 18 cm devant la hanche), jambes
 * écartées. On le ramène à une station debout naturelle :
 *
 *   - rotation rigide de la chaîne bras autour de l'épaule, puis de l'avant-bras
 *     autour du coude (le coude était plié dans le mesh source) ;
 *   - rotation de la cuisse autour de la hanche et du tibia autour du genou ;
 *   - légère rotation du pied vers l'extérieur.
 *
 * Les rotations utilisent des quaternions (axe = produit vectoriel des
 * directions, angle = angle entre elles) : contrairement à l'ancienne version
 * qui tournait dans le plan XY, elles fonctionnent quel que soit le plan du
 * membre. Les verts ET les repères d'articulations sont transformés.
 */

export interface PosedMesh extends BaseMesh {
  normals: Float32Array
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** 0 = mesh brut, 1 = pose de repos. `?pose=0` désactive la pose (debug). */
function poseStrength(): number {
  if (typeof location === 'undefined') return 1
  const v = new URLSearchParams(location.search).get('pose')
  if (v === null) return 1
  const n = Number(v)
  return Number.isFinite(n) ? clamp(n, 0, 1) : 1
}

/** Cible de l'axe du bras (unitaire) : presque vertical, léger écart. */
const ARM_DIR = new THREE.Vector3(0.2, -0.975, 0.06).normalize()
/** Cible de l'avant-bras : continuation du bras, main un peu en avant. */
const FOREARM_DIR = new THREE.Vector3(0.12, -0.975, 0.19).normalize()
/** Cible de la jambe : 3,8° d'ouverture (pieds à ~20 cm l'un de l'autre). */
const THIGH_DIR = new THREE.Vector3(0.067, -1, 0).normalize()
/** Rotation du pied vers l'extérieur (toe-out), en degrés. */
const FOOT_TOE_OUT = 7
/** Activation du relâchement des doigts (debug). */
const FINGERS_ON = true

function rotationBetween(a: THREE.Vector3, b: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize())
}

/** Poids de peau gaussien d'un os (même convention que lib/body.ts). */
function boneWeight(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, sigma: number): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const abz = b.z - a.z
  const len2 = abx * abx + aby * aby + abz * abz
  let t = 0
  if (len2 > 1e-12) {
    t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2
    t = Math.max(0, Math.min(1, t))
  }
  const dx = p.x - (a.x + abx * t)
  const dy = p.y - (a.y + aby * t)
  const dz = p.z - (a.z + abz * t)
  const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / sigma
  return Math.exp(-d * d)
}

/** Applique une rotation autour d'un pivot à des positions brutes. */
function rotatePoints(positions: Float32Array, q: THREE.Quaternion, pivot: THREE.Vector3, weightOf: (i: number) => number) {
  const v = new THREE.Vector3()
  const r = new THREE.Vector3()
  for (let i = 0; i < positions.length; i += 3) {
    const w = weightOf(i / 3)
    if (w <= 0.0005) continue
    v.set(positions[i] - pivot.x, positions[i + 1] - pivot.y, positions[i + 2] - pivot.z)
    r.copy(v).applyQuaternion(q)
    positions[i] = pivot.x + v.x + (r.x - v.x) * w
    positions[i + 1] = pivot.y + v.y + (r.y - v.y) * w
    positions[i + 2] = pivot.z + v.z + (r.z - v.z) * w
  }
}

/**
 * Poids d'appartenance à un membre, calculé sur les positions d'origine :
 * produit d'un fondu le long de l'axe et d'une gaussienne de distance
 * perpendiculaire. Sans le terme de distance, la projection seule capture
 * le bassin et les jambes (bug constaté : membres arrachés).
 */
function limbWeight(
  src: Float32Array,
  pivot: THREE.Vector3,
  axis: THREE.Vector3,
  inner: number,
  outer: number,
  lo: number,
  hi: number,
): (i: number) => number {
  return (i: number) => {
    const dx = src[i * 3] - pivot.x
    const dy = src[i * 3 + 1] - pivot.y
    const dz = src[i * 3 + 2] - pivot.z
    const along = dx * axis.x + dy * axis.y + dz * axis.z
    const px = dx - along * axis.x
    const py = dy - along * axis.y
    const pz = dz - along * axis.z
    const perp = Math.sqrt(px * px + py * py + pz * pz)
    // 1 à l'intérieur du membre, 0 au-delà de `outer` : le torse n'est pas aspiré
    return smoothstep(lo, hi, along) * (1 - smoothstep(inner, outer, perp))
  }
}

/** Applique une rotation à un point isolé (repère d'articulation). */
function rotatePoint(p: THREE.Vector3, q: THREE.Quaternion, pivot: THREE.Vector3): THREE.Vector3 {
  return p.clone().sub(pivot).applyQuaternion(q).add(pivot)
}

/** Squelette minimal pour la pose (avant transformation des repères). */
function solvePose(positions: Float32Array, jointsIn: Record<string, THREE.Vector3>, strength: number) {
  const joints: Record<string, THREE.Vector3> = {}
  for (const [k, v] of Object.entries(jointsIn)) joints[k] = v.clone()
  if (strength <= 0) return joints

  const src = new Float32Array(positions)

  /**
   * Les cibles MakeHuman déplacent les sommets AVANT la pose : l'axe du bras
   * doit donc être reconstruit sur la géométrie morphée, sinon la
   * classification des sommets (bras / main) est fausse et la main est
   * déchirée. On prend le sommet morphedé le plus proche de l'articulation.
   */
  const nearestIndex = new Map<string, number>()
  const nearestOf = (key: string): THREE.Vector3 => {
    let bi = nearestIndex.get(key)
    if (bi === undefined) {
      const j = joints[key]
      let bd = Infinity
      bi = 0
      for (let i = 0; i < src.length; i += 3) {
        const d =
          (src[i] - j.x) ** 2 + (src[i + 1] - j.y) ** 2 + (src[i + 2] - j.z) ** 2
        if (d < bd) {
          bd = d
          bi = i
        }
      }
      nearestIndex.set(key, bi)
    }
    return new THREE.Vector3(src[bi], src[bi + 1], src[bi + 2])
  }

  const sideSign = (side: 'l' | 'r') => (side === 'l' ? 1 : -1)
  // poids de transition (aisselle, entre-jambes) : ces sommets sont
  // comprimés par la déformation, on les lissera à la fin
  const transition = new Float32Array(positions.length / 3)

  /**
   * Os du torse (repères pris sur la géométrie morphée) : ils servent à
   * partager la peau entre le bras et le tronc. Sans ce partage, l'aisselle
   * se déchire : les sommets du bras partaient à 100 % avec le bras pendant
   * que ceux du torse restaient en place.
   */
  const spine1 = nearestOf('spine-1')
  const spine2 = nearestOf('spine-2')
  const spine3 = nearestOf('spine-3')
  const spine4 = nearestOf('spine-4')
  const pelvisJ = nearestOf('pelvis')
  const neckJ = nearestOf('neck')

  for (const side of ['l', 'r'] as const) {
    const s = sideSign(side)
    const dirOut = new THREE.Vector3(ARM_DIR.x * s, ARM_DIR.y, ARM_DIR.z)
    const foreOut = new THREE.Vector3(FOREARM_DIR.x * s, FOREARM_DIR.y, FOREARM_DIR.z)
    const thighOut = new THREE.Vector3(THIGH_DIR.x * s, THIGH_DIR.y, THIGH_DIR.z)

    // --- bras : déformation continue de l'axe (pas de double rotation) ---
    // Le mesh de base arrive avec le coude plié de ~43° vers l'avant. Une
    // double rotation (bras puis avant-bras) créait un effet « bonbon » : les
    // sommets du coude étaient tournés par les deux rotations avec des poids
    // incompatibles, d'où un pli franc.
    //
    // On applique donc une déformation de cylindre généralisé : chaque section
    // du bras est transportée le long d'une polyligne cible, avec une rotation
    // locale continue (tangente lissée). Le coude se déplie donc *sans*
    // discontinuité, comme un vrai bras qui se tend.
    const shoulder = nearestOf(`${side}-shoulder`)
    const elbow0 = nearestOf(`${side}-elbow`)
    const hand0 = nearestOf(`${side}-hand`)
    const L1 = shoulder.distanceTo(elbow0)
    const L2 = elbow0.distanceTo(hand0)
    const elbow2 = shoulder.clone().addScaledVector(dirOut, L1)
    const hand2 = elbow2.clone().addScaledVector(foreOut, L2)

    // Polyligne de repos / cible : points + longueurs cumulées.
    const makePath = (pts: THREE.Vector3[]) => {
      const cum = [0]
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]))
      return { pts, cum, total: cum[cum.length - 1] }
    }
    const pathRest = makePath([shoulder, elbow0, hand0])
    const pathTarget = makePath([shoulder, elbow2, hand2])

    // Os : bras d'un côté, torse de l'autre. Le poids d'un sommet pour le bras
    // est la part du bras dans le total (bras + torse) : l'aisselle, qui est
    // à égale distance des deux, est ainsi entraînée à moitié et ne se
    // déchire plus.
    const armBones: Array<[THREE.Vector3, THREE.Vector3, number]> = [
      [shoulder, elbow0, 0.034],
      [elbow0, hand0, 0.032],
      [hand0, hand0.clone().addScaledVector(foreOut, 0.1), 0.028],
    ]
    const torsoBones: Array<[THREE.Vector3, THREE.Vector3, number]> = [
      [spine1, neckJ, 0.085],
      [spine2, spine1, 0.08],
      [spine3, spine2, 0.08],
      [spine4, spine3, 0.075],
      [pelvisJ, spine4, 0.075],
    ]

    /** Point sur la polyligne à l'abscisse curviligne s. */
    const pathPoint = (path: ReturnType<typeof makePath>, s: number) => {
      const { pts, cum, total } = path
      const sc = Math.max(0, Math.min(total, s))
      for (let i = 1; i < pts.length; i++) {
        if (sc <= cum[i] || i === pts.length - 1) {
          const seg = cum[i] - cum[i - 1]
          const t = seg > 1e-9 ? (sc - cum[i - 1]) / seg : 0
          return pts[i - 1].clone().lerp(pts[i], t)
        }
      }
      return pts[pts.length - 1].clone()
    }
    /** Tangente lissée (différence finie) : évite l'angle vif au coude. */
    const pathTangent = (path: ReturnType<typeof makePath>, s: number) => {
      const d = 0.02
      const p1 = pathPoint(path, Math.max(0, s - d))
      const p2 = pathPoint(path, Math.min(path.total, s + d))
      return p2.clone().sub(p1).normalize()
    }

    /**
     * Projection d'un point sur la polyligne : distance, abscisse curviligne,
     * et distance au-delà des deux extrémités (avant l'épaule / après la
     * main). Attention : « au-delà » ne se calcule que sur le PREMIER et le
     * DERNIER segment — sinon chaque segment intérieur excluait les sommets
     * qui se projettent au-delà de lui (tout l'avant-bras était écarté, et le
     * maillage se déchirait selon le morphing).
     */
    const project = (path: ReturnType<typeof makePath>, pt: THREE.Vector3) => {
      const { pts, cum } = path
      let best = Infinity
      let bestS = 0
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]
        const b = pts[i]
        const ab = b.clone().sub(a)
        const len2 = ab.lengthSq()
        const t = len2 > 1e-12 ? Math.max(0, Math.min(1, pt.clone().sub(a).dot(ab) / len2)) : 0
        const d = pt.distanceTo(a.clone().addScaledVector(ab, t))
        if (d < best) {
          best = d
          bestS = cum[i - 1] + t * (cum[i] - cum[i - 1])
        }
      }
      // au-delà de la première extrémité
      const first = pts[1].clone().sub(pts[0])
      const l1 = first.length()
      const t1 = l1 > 1e-9 ? pt.clone().sub(pts[0]).dot(first) / (l1 * l1) : 0
      const before = Math.max(0, -t1) * l1
      // au-delà du poignet : ce sont les sommets de la main, qui forme un
      // bloc rigide (une palette plate) et ne doit PAS être transporté
      // section par section (cela l'étirait)
      const last = pts[pts.length - 1].clone().sub(pts[pts.length - 2])
      const lN = last.length()
      const tN = lN > 1e-9 ? pt.clone().sub(pts[pts.length - 2]).dot(last) / (lN * lN) : 0
      const beyond = tN > 1.02
      const distWrist = pt.distanceTo(pts[pts.length - 1])
      return { dist: best, s: bestS, before, beyond, distWrist }
    }

    const v = new THREE.Vector3()
    const off = new THREE.Vector3()
    const q = new THREE.Quaternion()
    for (let i = 0; i < positions.length; i += 3) {
      // i est déjà l'index du tableau (pas l'index du sommet)
      v.set(src[i], src[i + 1], src[i + 2])
      const pr = project(pathRest, v)
      // poids : distance à l'axe, et exclusion des zones avant l'épaule
      // (le trapèze ne doit pas bouger)
      const wStart = 1 - smoothstep(0.0, 0.022, pr.before)
      const sc = Math.max(0, Math.min(pathRest.total, pr.s))
      const rp = pathPoint(pathRest, sc)
      const tp = pathPoint(pathTarget, sc)
      q.setFromUnitVectors(pathTangent(pathRest, sc), pathTangent(pathTarget, sc))
      // partage de la peau : part du bras dans le total (bras + torse)
      let wArm = 0
      for (const [ba, bb, sg] of armBones) wArm += boneWeight(v, ba, bb, sg)
      let wTorso = 0
      for (const [ba, bb, sg] of torsoBones) wTorso += boneWeight(v, ba, bb, sg)
      let w: number
      if (pr.beyond) {
        // main : bloc rigide suivant le poignet. Le rayon doit couvrir les
        // doigts (jusqu'à ~15 cm du poignet), sinon ils restaient dans la
        // pose en A et le maillage se déchirait.
        w = (1 - smoothstep(0.15, 0.28, pr.distWrist)) * wStart
      } else {
        w = (wArm / Math.max(wArm + wTorso, 1e-6)) * wStart
      }
      w *= strength
      if (w > 0.02 && w < 0.98) transition[i / 3] = Math.max(transition[i / 3], 1 - Math.abs(w - 0.5) * 2)
      if (w <= 0.002) continue
      off.copy(v).sub(rp).applyQuaternion(q)
      const nx = tp.x + off.x
      const ny = tp.y + off.y
      const nz = tp.z + off.z
      // garde-fou : un déplacement aberrant signerait un maillage déchiré
      if (!Number.isFinite(nx) || !Number.isFinite(ny) || !Number.isFinite(nz)) continue
      // la main se déplace de ~28 cm (le poignet change de position) : le seuil
      // doit rester au-dessus, sinon certains sommets restaient en place et
      // le maillage se déchirait
      if (Math.hypot(nx - v.x, ny - v.y, nz - v.z) > 0.45) continue
      positions[i] = nx * w + v.x * (1 - w)
      positions[i + 1] = ny * w + v.y * (1 - w)
      positions[i + 2] = nz * w + v.z * (1 - w)
    }

    // repères du bras : on les replace sur la polyligne cible
    for (const key of Object.keys(joints)) {
      if (!key.startsWith(`${side}-`)) continue
      if (!/-(elbow|hand|finger.*|hand-3|hand-2)$/.test(key)) continue
      const pr = project(pathRest, joints[key])
      const sc = Math.max(0, Math.min(pathRest.total, pr.s))
      const rp = pathPoint(pathRest, sc)
      const tp = pathPoint(pathTarget, sc)
      q.setFromUnitVectors(pathTangent(pathRest, sc), pathTangent(pathTarget, sc))
      joints[key] = tp.clone().add(joints[key].clone().sub(rp).applyQuaternion(q))
    }

    // --- doigts : le mesh source les a en éventail, paume vers le bas.
    // On les resserre vers le majeur et on les replie légèrement vers la paume.
    const finger = (f: number, k: number) => joints[`${side}-finger-${f}-${k}`]
    if (FINGERS_ON && finger(1, 1) && finger(3, 1) && finger(3, 4) && finger(5, 1)) {
      const knuckle = finger(3, 1).clone()
      const dir3 = finger(3, 4).clone().sub(knuckle).normalize()
      // normale de la paume : du majeur vers la base du pouce
      const palmN = finger(1, 1).clone().sub(knuckle).normalize()
      const curlAxis = new THREE.Vector3().crossVectors(dir3, palmN).normalize()

      // 1) flexion vers la paume (22°)
      const qCurl = new THREE.Quaternion().setFromAxisAngle(curlAxis, (11 * Math.PI) / 180)
      rotatePoints(positions, qCurl, knuckle, (i) => {
        const dx = positions[i * 3] - knuckle.x
        const dy = positions[i * 3 + 1] - knuckle.y
        const dz = positions[i * 3 + 2] - knuckle.z
        const along = dx * dir3.x + dy * dir3.y + dz * dir3.z
        const perp = Math.hypot(
          dx - along * dir3.x,
          dy - along * dir3.y,
          dz - along * dir3.z,
        )
        return smoothstep(0.008, 0.04, along) * (1 - smoothstep(0.014, 0.034, perp)) * strength
      })

      // 2) resserrement : chaque doigt pivote vers le majeur
      for (const f of [2, 4, 5]) {
        const b = finger(f, 1)
        const t = finger(f, 4)
        if (!b || !t) continue
        const df = t.clone().sub(b).normalize()
        const q = new THREE.Quaternion().setFromUnitVectors(df, dir3)
        const partial = new THREE.Quaternion().slerp(q, 0.16)
        rotatePoints(positions, partial, b, (i) => {
          const dx = positions[i * 3] - b.x
          const dy = positions[i * 3 + 1] - b.y
          const dz = positions[i * 3 + 2] - b.z
          const along = dx * df.x + dy * df.y + dz * df.z
          const perp = Math.hypot(dx - along * df.x, dy - along * df.y, dz - along * df.z)
          return smoothstep(-0.008, 0.018, along) * (1 - smoothstep(0.009, 0.026, perp)) * strength
        })
        for (const k of [1, 2, 3, 4]) {
          const key = `${side}-finger-${f}-${k}`
          if (joints[key]) joints[key] = rotatePoint(joints[key], partial, b)
        }
      }
      for (const f of [1, 2, 3, 4, 5]) {
        for (const k of [1, 2, 3, 4]) {
          const key = `${side}-finger-${f}-${k}`
          if (joints[key]) joints[key] = rotatePoint(joints[key], qCurl, knuckle)
        }
      }
    }

    // --- jambe : rotation unique de toute la chaîne autour de la hanche ---
    // Le mesh de base a la jambe quasi droite et le pied à plat : une seule
    // rotation frontale suffit et évite les froissements au genou (qui
    // aplatissaient les pieds). La rotation se fait dans le plan XY, donc la
    // plante du pied reste à plat et pointe toujours vers l'avant.
    const hip = nearestOf(`${side}-upper-leg`)
    const ankleRest = nearestOf(`${side}-ankle`)
    const knee0 = nearestOf(`${side}-knee`)
    const toe0 = nearestOf(`${side}-foot-1`)
    const otherSide = side === 'l' ? 'r' : 'l'
    const otherHip = nearestOf(`${otherSide}-upper-leg`)
    const otherKnee = nearestOf(`${otherSide}-knee`)
    const otherAnkle = nearestOf(`${otherSide}-ankle`)
    // os : la jambe d'un côté, le bassin + l'autre jambe de l'autre
    const legBones: Array<[THREE.Vector3, THREE.Vector3, number]> = [
      [hip, knee0, 0.055],
      [knee0, ankleRest, 0.045],
      [ankleRest, toe0, 0.035],
    ]
    const pelvisBones: Array<[THREE.Vector3, THREE.Vector3, number]> = [
      [pelvisJ, spine4, 0.075],
      [spine4, spine3, 0.075],
      [otherHip, otherKnee, 0.055],
      [otherKnee, otherAnkle, 0.045],
    ]
    const legRest = ankleRest.clone().sub(hip).normalize()
    const q3 = rotationBetween(legRest, thighOut)
    // même partage de peau que pour le bras : la cuisse appartient à la jambe,
    // le bassin et l'autre jambe au tronc (sinon l'entre-jambes se déchire)
    const wLeg = (i: number) => {
      const p = new THREE.Vector3(src[i], src[i + 1], src[i + 2])
      let wLegB = 0
      for (const [ba, bb, sg] of legBones) wLegB += boneWeight(p, ba, bb, sg)
      let wPelv = 0
      for (const [ba, bb, sg] of pelvisBones) wPelv += boneWeight(p, ba, bb, sg)
      return wLegB / Math.max(wLegB + wPelv, 1e-6)
    }
    rotatePoints(positions, q3, hip, (i) => wLeg(i) * strength)

    for (const key of [`${side}-knee`, `${side}-ankle`, `${side}-foot-1`, `${side}-foot-2`]) {
      if (!joints[key]) continue
      joints[key] = rotatePoint(joints[key], q3, hip)
    }

    // --- pied : légère ouverture vers l'extérieur ---
    const ankle = joints[`${side}-ankle`].clone()
    if (joints[`${side}-foot-1`]) {
      const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (-s * FOOT_TOE_OUT * Math.PI) / 180)
      // bande large : sinon les orteils pivotent à un angle différent de
      // la plante et le pied se vrille
      const wFoot = limbWeight(src, ankle, new THREE.Vector3(0, -1, 0), 0.105, 0.15, -0.004, 0.02)
      rotatePoints(positions, qYaw, ankle, (i) => wFoot(i) * strength)
      for (const key of [`${side}-foot-1`, `${side}-foot-2`]) {
        if (!joints[key]) continue
        joints[key] = rotatePoint(joints[key], qYaw, ankle)
      }
    }
  }

  // Lissage des plis : l'aisselle et l'entre-jambes sont des zones où la
  // peau est partagée entre deux membres ; la déformation y comprime les
  // sommets et crée une fente sombre. On relaxe ces sommets uniquement
  // (2 itérations, relaxation faible : au-delà, le maillage se déchire).
  if (strength > 0) {
    const { indices } = getBaseMesh()
    const n = positions.length / 3
    const isActive = new Uint8Array(n)
    let count = 0
    for (let i = 0; i < n; i++) {
      if (transition[i] > 0.15) {
        isActive[i] = 1
        count++
      }
    }
    if (count) {
      for (let iter = 0; iter < 2; iter++) {
        const copy = new Float32Array(positions)
        const acc = new Float32Array(positions.length)
        const cnt = new Uint16Array(n)
        for (let t = 0; t < indices.length; t += 3) {
          const a = indices[t]
          const b = indices[t + 1]
          const c = indices[t + 2]
          // laplacien de a : (b + c - 2a)
          if (isActive[a]) {
            for (let k = 0; k < 3; k++) {
              acc[a * 3 + k] += copy[b * 3 + k] + copy[c * 3 + k] - 2 * copy[a * 3 + k]
            }
            cnt[a]++
          }
          if (isActive[b]) {
            for (let k = 0; k < 3; k++) {
              acc[b * 3 + k] += copy[c * 3 + k] + copy[a * 3 + k] - 2 * copy[b * 3 + k]
            }
            cnt[b]++
          }
          if (isActive[c]) {
            for (let k = 0; k < 3; k++) {
              acc[c * 3 + k] += copy[a * 3 + k] + copy[b * 3 + k] - 2 * copy[c * 3 + k]
            }
            cnt[c]++
          }
        }
        for (let i = 0; i < n; i++) {
          if (!cnt[i]) continue
          const w = 0.35 * transition[i]
          for (let k = 0; k < 3; k++) positions[i * 3 + k] += (acc[i * 3 + k] / cnt[i]) * w
        }
      }
    }
  }

  return joints
}

/**
 * Applique la pose de repos à un jeu de positions (mesh brut ou morphé).
 * Les positions d'entrée ne sont pas modifiées.
 */
export function posePositions(
  positionsIn: Float32Array,
  jointsIn: Record<string, THREE.Vector3>,
  strength = poseStrength(),
): { positions: Float32Array; joints: Record<string, THREE.Vector3> } {
  const positions = new Float32Array(positionsIn)
  const joints = solvePose(positions, jointsIn, strength)
  return { positions, joints }
}

let cache: PosedMesh | null = null

export function getPosedBase(): PosedMesh {
  if (cache) return cache
  const base = getBaseMesh()
  const { positions, joints } = posePositions(base.positions, base.joints)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3))
  geo.setIndex(new THREE.BufferAttribute(base.indices.slice(), 1))
  geo.computeVertexNormals()
  const normals = new Float32Array(geo.getAttribute('normal').array as ArrayLike<number>)
  geo.dispose()

  cache = { positions, indices: base.indices, joints, normals }
  return cache
}
