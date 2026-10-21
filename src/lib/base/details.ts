import * as THREE from 'three'

/**
 * Définition anatomique procédurale.
 *
 * Les cibles MakeHuman règlent les volumes, pas les séparations musculaires.
 * On grave donc des rainures (et on gonfle quelques masses) le long de courbes
 * définies dans le repère du corps normalisé (hauteur = 1, visage vers +z).
 *
 * Contrainte : le maillage ne fait que 13 380 sommets, soit ~2 cm d'arête.
 * Une rainure de 6 mm de large est donc sous-échantillonnée et disparaît
 * dans les normales lissées. On travaille donc en deux temps :
 *
 *   1. la géométrie est décalée (le sillon existe mais est sous-échantillonné) ;
 *   2. les normales sont **recalculées analytiquement** à partir du gradient
 *      du champ de distance, ce qui restitue le relief fin — c'est l'équivalent
 *      d'un bump mapping, et c'est ce qui rend la sculpture lisible.
 *
 * Chaque rainure est une polyligne XY ; la distance à la polyligne donne un
 * sillon gaussien. Les renflements sont des gaussiennes elliptiques appliquées
 * vers +z (vers l'avant) pour rester plaqués sur le torse.
 */

export interface AnatomyContext {
  joints: Record<string, THREE.Vector3>
  masks: {
    torso: Float32Array
    pec: Float32Array
    abs: Float32Array
    lat: Float32Array
    delt: Float32Array
    arm: Float32Array
    fore: Float32Array
    trap: Float32Array
    thigh: Float32Array
    calf: Float32Array
    side: Float32Array
  }
  H: number
}

interface Groove {
  /** points de la polyligne en coordonnées normalisées */
  pts: Array<[number, number]>
  /** demi-largeur du sillon (normalisé) */
  width: number
  /** profondeur en fraction de hauteur (positif = creux) */
  depth: number
  /** masque d'appartenance (0..1 par sommet) */
  region: (i: number, ctx: AnatomyContext) => number
  /** le sillon est dupliqué en miroir */
  mirror?: boolean
  /** face concernée : avant (défaut) ou arrière */
  face?: 'front' | 'back'
  /** boîte d'englobante (normalisé), calculée à la construction */
  bbox?: [number, number, number, number]
}

/** Boîte d'englobante d'une rainure (miroir => domaine en |x|). */
function grooveBBox(g: Groove): [number, number, number, number] {
  if (g.bbox) return g.bbox
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const [x, y] of g.pts) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const pad = g.width * 2.6
  g.bbox = [minX - pad, maxX + pad, minY - pad, maxY + pad]
  return g.bbox
}

/** Rainure dans l'espace 3D (utile pour les membres, suivant l'os). */
interface Groove3D {
  pts: THREE.Vector3[]
  width: number
  depth: number
  region: (i: number, ctx: AnatomyContext) => number
  /** centre + rayon d'une sphère englobante (rejection rapide) */
  center?: THREE.Vector3
  radius?: number
}

/** Sphère englobante d'une rainure 3D. */
function groove3DSphere(g: Groove3D): { center: THREE.Vector3; radius: number } {
  if (g.center && g.radius !== undefined) return { center: g.center, radius: g.radius }
  const c = new THREE.Vector3()
  for (const p of g.pts) c.add(p)
  c.multiplyScalar(1 / g.pts.length)
  let r = 0
  for (const p of g.pts) r = Math.max(r, p.distanceTo(c))
  r += g.width * 2.6
  g.center = c
  g.radius = r
  return { center: c, radius: r }
}

interface Bulge {
  /** centre de l'ellipse (x, y) normalisés */
  c: [number, number]
  /** rayons de l'ellipse */
  r: [number, number]
  /** amplitude (fraction de hauteur), positive = gonfle */
  depth: number
  region: (i: number, ctx: AnatomyContext) => number
  /** 'z' = poussée vers l'avant, 'normal' = le long de la normale */
  dir?: 'z' | 'normal'
  mirror?: boolean
  /** exclut la ligne médiane (pour ne pas gonfler le sternum) */
  midline?: number
  /** rotation de l'ellipse (radians) */
  rot?: number
  /** boîte d'englobante (normalisé) */
  bbox?: [number, number, number, number]
}

/** Boîte d'englobante d'un renflement. */
function bulgeBBox(b: Bulge): [number, number, number, number] {
  if (b.bbox) return b.bbox
  const pad = 2.1
  b.bbox = [
    b.c[0] - b.r[0] * pad,
    b.c[0] + b.r[0] * pad,
    b.c[1] - b.r[1] * pad,
    b.c[1] + b.r[1] * pad,
  ]
  return b.bbox
}

/** Distance à une polyligne + point le plus proche (pour le gradient). */
const closestOnPolyline = (x: number, y: number, pts: Array<[number, number]>) => {
  let best = Infinity
  let bx = 0
  let by = 0
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, y1] = pts[k]
    const [x2, y2] = pts[k + 1]
    const dx = x2 - x1
    const dy = y2 - y1
    const len2 = dx * dx + dy * dy
    let t = 0
    if (len2 > 1e-12) t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2))
    const px = x1 + dx * t
    const py = y1 + dy * t
    const d = (px - x) ** 2 + (py - y) ** 2
    if (d < best) {
      best = d
      bx = px
      by = py
    }
  }
  return { d: Math.sqrt(best), bx, by }
}

/**
 * Distance à une polyligne 3D (calcul scalaire, sans allocation).
 * Les coordonnées sont en unités NORMALISÉES (hauteur du corps = 1) :
 * c'est indispensable, les positions de travail étant en mètres.
 */
const distToPolyline3D = (px: number, py: number, pz: number, pts: THREE.Vector3[]) => {
  let best = Infinity
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k]
    const b = pts[k + 1]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const abz = b.z - a.z
    const len2 = abx * abx + aby * aby + abz * abz
    const t =
      len2 > 1e-12
        ? Math.max(0, Math.min(1, ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / len2))
        : 0
    const dx = px - (a.x + abx * t)
    const dy = py - (a.y + aby * t)
    const dz = pz - (a.z + abz * t)
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (d < best) best = d
  }
  return best
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Rainures du torse, définies pour le côté droit puis miroir. */
function torsoGrooves(): Groove[] {
  const torso = (i: number, c: AnatomyContext) => c.masks.torso[i]
  const list: Groove[] = []

  // ligne blanche (entre les grands droits)
  list.push({
    pts: [
      [0, 0.556],
      [0, 0.600],
      [0, 0.645],
      [0, 0.688],
    ],
    width: 0.0090,
    depth: 0.0018,
    region: torso,
  })

  // sillon sternal (entre les pectoraux)
  list.push({
    pts: [
      [0, 0.700],
      [0, 0.724],
      [0, 0.752],
    ],
    width: 0.0115,
    depth: 0.0058,
    region: (i, c) => Math.max(torso(i, c), c.masks.pec[i]),
  })

  // bord inférieur des pectoraux (pli sous-mammelon) : net et profond
  list.push({
    pts: [
      [0.006, 0.6995],
      [0.038, 0.7005],
      [0.068, 0.7035],
      [0.088, 0.7145],
    ],
    width: 0.0105,
    depth: 0.0085,
    region: (i, c) => Math.max(torso(i, c), c.masks.pec[i]),
    mirror: true,
  })

  // sillon delto-pectoral
  list.push({
    pts: [
      [0.082, 0.7625],
      [0.094, 0.7415],
      [0.101, 0.7165],
    ],
    width: 0.011,
    depth: 0.005, 
    region: (i, c) => Math.max(c.masks.delt[i], c.masks.pec[i], torso(i, c)),
    mirror: true,
  })

  // rainures horizontales des abdominaux (3 lignes = 4 rangées)
  for (const y of [0.581, 0.617, 0.653]) {
    list.push({
      pts: [
        [-0.040, y + 0.004],
        [-0.021, y + 0.0005],
        [0, y - 0.001],
        [0.021, y + 0.0005],
        [0.040, y + 0.004],
      ],
      width: 0.0085,
      depth: 0.0016,
      region: (i, c) => c.masks.abs[i],
    })
  }

  // rainures verticales des abdominaux
  for (const x of [0.026, -0.026]) {
    list.push({
      pts: [
        [x, 0.5615],
        [x, 0.581],
        [x, 0.617],
        [x, 0.653],
      ],
      width: 0.0080,
      depth: 0.0014,
      region: (i, c) => c.masks.abs[i],
    })
  }

  // serratus (dents de scie) : 3 obliques sur le flanc
  for (const [k, y0] of [0.6885, 0.6675, 0.6465].entries()) {
    list.push({
      pts: [
        [0.056 + k * 0.002, y0],
        [0.078, y0 - 0.012],
        [0.094, y0 - 0.017],
      ],
      width: 0.0098,
      depth: 0.0036,
      region: (i, c) => c.masks.lat[i] * 0.9 + torso(i, c) * 0.3,
      mirror: true,
    })
  }

  return list
}

/** Rainures du dos : trapèzes, rhomboïdes, dorsaux, colonne, omoplates. */
function backGrooves(): Groove[] {
  const torso = (i: number, c: AnatomyContext) => c.masks.torso[i]
  const list: Groove[] = []

  // sillon de la colonne vertébrale
  list.push({
    pts: [
      [0, 0.60],
      [0, 0.66],
      [0, 0.72],
      [0, 0.78],
      [0, 0.84],
    ],
    width: 0.011,
    depth: 0.0042,
    region: torso,
    face: 'back',
  })

  // bord inférieur du trapèze (de la nuque vers l'acromion)
  list.push({
    pts: [
      [0.012, 0.832],
      [0.055, 0.808],
      [0.098, 0.775],
      [0.135, 0.735],
    ],
    width: 0.0115,
    depth: 0.0036,
    region: (i, c) => Math.max(c.masks.trap[i], torso(i, c) * 0.6),
    mirror: true,
    face: 'back',
  })

  // bord des rhomboïdes (entre l'omoplate et la colonne)
  list.push({
    pts: [
      [0.022, 0.775],
      [0.05, 0.752],
      [0.072, 0.732],
    ],
    width: 0.0095,
    depth: 0.0028,
    region: (i, c) => Math.max(c.masks.trap[i], torso(i, c) * 0.5),
    mirror: true,
    face: 'back',
  })

  // bord inférieur du grand dorsal (le V du dos)
  list.push({
    pts: [
      [0.1, 0.7],
      [0.086, 0.655],
      [0.062, 0.612],
      [0.04, 0.575],
    ],
    width: 0.012,
    depth: 0.004,
    region: (i, c) => Math.max(c.masks.lat[i], torso(i, c) * 0.5),
    mirror: true,
    face: 'back',
  })

  return list
}

/** Renflements : pectoraux, deltoïdes, avant-bras, ventre plat. */
function bulges(ctx: AnatomyContext): Bulge[] {
  const list: Bulge[] = []
  // pectoraux : galbe large et plat, collé à la cage thoracique
  list.push({
    c: [0.05, 0.744],
    r: [0.062, 0.045],
    depth: 0.0058,
    region: (i, c) => Math.max(c.masks.pec[i], c.masks.torso[i] * 0.5),
    dir: 'z',
    mirror: true,
    midline: 0.010,
  })
  // deltoïdes : rond, en avant de l'épaule
  list.push({
    c: [0.101, 0.776],
    r: [0.044, 0.055],
    depth: 0.0018,
    region: (i, c) => c.masks.delt[i],
    dir: 'normal',
    mirror: true,
  })
  // biceps : galbe vers l'avant, au milieu du bras
  for (const side of ['l', 'r'] as const) {
    const sh = ctx.joints[`${side}-shoulder`]
    const el = ctx.joints[`${side}-elbow`]
    if (!sh || !el) continue
    const c = sh.clone().lerp(el, 0.42)
    list.push({
      c: [c.x, c.y],
      r: [0.034, 0.055],
      depth: 0.0055,
      region: (i, cc) => cc.masks.arm[i],
      dir: 'z',
    })
  }
  // mollet : séparation des deux chefs (gastrocnémien / soléaire)
  for (const side of ['l', 'r'] as const) {
    const kl = ctx.joints[`${side}-knee`]
    const al = ctx.joints[`${side}-ankle`]
    if (!kl || !al) continue
    const c = kl.clone().lerp(al, 0.55)
    const sgn = side === 'l' ? 1 : -1
    list.push({
      c: [c.x, c.y],
      r: [0.03, 0.05],
      depth: -0.0018,
      region: (i, cc) => cc.masks.calf[i],
      dir: 'normal',
    })
    void sgn
  }
  // renflement de l'avant-bras juste sous le coude (brachio-radialien)
  for (const side of ['l', 'r'] as const) {
    const el = ctx.joints[`${side}-elbow`]
    const wr = ctx.joints[`${side}-hand`]
    if (!el || !wr) continue
    const c = el.clone().lerp(wr, 0.3)
    list.push({
      c: [c.x, c.y],
      r: [0.03, 0.045],
      depth: 0.0032,
      region: (i, cc) => Math.max(cc.masks.arm[i], cc.masks.fore[i] * 0.7),
      dir: 'normal',
    })
  }
  // érecteurs du rachis : deux colonnes de part et d'autre de la colonne
  for (const side of ['l', 'r'] as const) {
    const pel = ctx.joints[`${side}-upper-leg`]
    const nk = ctx.joints['neck']
    if (!pel || !nk) continue
    const c = pel.clone().lerp(nk, 0.62)
    const sgn = side === 'l' ? 1 : -1
    list.push({
      c: [c.x + sgn * 0.028, c.y],
      r: [0.022, 0.07],
      depth: 0.0038,
      region: (i, cc) => cc.masks.torso[i],
      dir: 'normal',
    })
    // creux de l'omoplate
    list.push({
      c: [c.x + sgn * 0.072, c.y + 0.13],
      r: [0.038, 0.045],
      depth: -0.0026,
      region: (i, cc) => Math.max(cc.masks.trap[i], cc.masks.torso[i] * 0.5),
      dir: 'normal',
    })
  }
  // plancher ventral : aplatit le ventre sous les abdominaux
  list.push({
    c: [0, 0.578],
    r: [0.06, 0.03],
    depth: 0.0022,
    region: (i, c) => c.masks.abs[i],
    dir: 'z',
  })
  return list
}

/** Rainures des membres inférieurs. */
function legGrooves(): Groove[] {
  const list: Groove[] = []
  const thigh = (i: number, c: AnatomyContext) => c.masks.thigh[i]
  // séparation droit fémoral / vaste latéral
  list.push({
    pts: [
      [0.060, 0.460],
      [0.066, 0.425],
      [0.072, 0.390],
      [0.077, 0.355],
      [0.081, 0.320],
      [0.084, 0.295],
    ],
    width: 0.013,
    depth: 0.0028,
    region: thigh,
    mirror: true,
  })
  // larme du vaste médial (bord interne au-dessus du genou)
  list.push({
    pts: [
      [0.044, 0.345],
      [0.041, 0.318],
      [0.040, 0.296],
    ],
    width: 0.016,
    depth: 0.0016,
    region: thigh,
    mirror: true,
  })
  return list
}

/**
 * Séparation biceps / triceps : rainure 3D le long du bord latéral du bras,
 * repositionnée à chaque construction d'après les articulations (le bras est
 * incliné, un repère 2D ne conviendrait pas).
 */
function armGrooves3D(ctx: AnatomyContext): Groove3D[] {
  const out: Groove3D[] = []
  for (const side of ['l', 'r'] as const) {
    const sh = ctx.joints[`${side}-shoulder`]
    const el = ctx.joints[`${side}-elbow`]
    const wr = ctx.joints[`${side}-hand`]
    if (!sh || !el || !wr) continue
    const s = side === 'l' ? 1 : -1
    const lat = new THREE.Vector3(s, 0, 0)
    out.push({
      // décalages calés sur le rayon réel du bras (deltoïde, biceps, coude)
      pts: [
        sh.clone().addScaledVector(lat, 0.05).add(new THREE.Vector3(0, -0.015, 0)),
        sh.clone().lerp(el, 0.45).addScaledVector(lat, 0.043),
        el.clone().addScaledVector(lat, 0.032),
      ],
      width: 0.0095,
      depth: 0.0062,
      region: (i, c) => c.masks.arm[i],
    })
    // creux sous le deltoïde (ligne brachio-deltoïdienne)
    out.push({
      pts: [
        sh.clone().addScaledVector(lat, 0.045).add(new THREE.Vector3(0, -0.004, 0.014)),
        sh.clone().lerp(el, 0.2).addScaledVector(lat, 0.036).add(new THREE.Vector3(0, 0, 0.018)),
      ],
      width: 0.009,
      depth: 0.004,
      region: (i, c) => Math.max(c.masks.delt[i], c.masks.arm[i] * 0.6),
    })
  }
  return out
}

let cachedGrooves: Groove[] | null = null
let cachedBulges: Bulge[] | null = null
function getGrooves(): Groove[] {
  if (!cachedGrooves) cachedGrooves = [...torsoGrooves(), ...backGrooves(), ...legGrooves()]
  return cachedGrooves
}
function getBulges(ctx: AnatomyContext): Bulge[] {
  if (!cachedBulges) cachedBulges = bulges(ctx)
  return cachedBulges
}

export interface AnatomyResult {
  /** gradient du champ en X (normalisé) */
  gx: Float32Array
  /** gradient du champ en Y (normalisé) */
  gy: Float32Array
}

/**
 * Applique les rainures et les renflements aux positions (échelle réelle, m)
 * et renvoie le gradient du champ, utilisé pour reconstruire les normales.
 */
export function applyAnatomy(
  positions: Float32Array,
  normals: Float32Array,
  ctx: AnatomyContext,
): AnatomyResult {
  const grooves = getGrooves()
  const bl = getBulges(ctx)
  const n = positions.length / 3
  const H = ctx.H
  const gx = new Float32Array(n)
  const gy = new Float32Array(n)
  const grooves3D = armGrooves3D(ctx)
  const tmpVec = new THREE.Vector3()

  for (let i = 0; i < n; i++) {
    const x = positions[i * 3] / H
    const y = positions[i * 3 + 1] / H
    const nz = normals[i * 3 + 2]
    const frontGate = smoothstep(0.05, 0.4, nz)
    const backGate = smoothstep(-0.05, -0.4, nz)
    if (frontGate <= 0 && backGate <= 0) continue

    // --- rainures : déplacement le long de la normale ---
    let disp = 0
    const ax = Math.abs(x)
    for (const g of grooves) {
      const gate = g.face === 'back' ? backGate : frontGate
      if (gate <= 0) continue
      // rejection rapide par boîte d'englobante (indispensable : le maillage
      // dense compte plus de 200 000 sommets, on ne peut pas tester chaque
      // polyligne sur chaque sommet)
      const bb = grooveBBox(g)
      const testX = g.mirror ? ax : x
      if (testX < bb[0] || testX > bb[1] || y < bb[2] || y > bb[3]) continue
      const region = g.region(i, ctx)
      if (region <= 0.02) continue
      const w = g.width
      let c = closestOnPolyline(x, y, g.pts)
      if (g.mirror) {
        const cm = closestOnPolyline(-x, y, g.pts)
        if (cm.d < c.d) c = cm
      }
      if (c.d > w * 2.4) continue
      const e = Math.exp(-((c.d / w) ** 2))
      disp -= g.depth * e * region
      // gradient de -depth*exp(-(d/w)^2) : positif vers le sillon
      const k = (g.depth * 2 * e * region * gate) / (w * w)
      if (c.d > 1e-6) {
        gx[i] += k * ((x - c.bx) / c.d)
        gy[i] += k * ((y - c.by) / c.d)
      }
    }
    if (disp !== 0) {
      const k = disp * H
      positions[i * 3] += normals[i * 3] * k
      positions[i * 3 + 1] += normals[i * 3 + 1] * k
      positions[i * 3 + 2] += normals[i * 3 + 2] * k
    }

    // --- rainures 3D (membres) ---
    // Les polylignes sont en unités normalisées : on compare dans ce repère.
    const zn = positions[i * 3 + 2] / H
    for (const g of grooves3D) {
      const sph = groove3DSphere(g)
      const dx3 = x - sph.center.x
      const dy3 = y - sph.center.y
      const dz3 = zn - sph.center.z
      if (dx3 * dx3 + dy3 * dy3 + dz3 * dz3 > sph.radius * sph.radius) continue
      const region = g.region(i, ctx)
      if (region <= 0.02) continue
      const d = distToPolyline3D(x, y, zn, g.pts)
      if (d > g.width * 2.4) continue
      const e = Math.exp(-((d / g.width) ** 2))
      const k = -g.depth * e * region * H * frontGate
      positions[i * 3] += normals[i * 3] * k
      positions[i * 3 + 1] += normals[i * 3 + 1] * k
      positions[i * 3 + 2] += normals[i * 3 + 2] * k
    }

    // --- renflements ---
    for (const b of bl) {
      const bb = bulgeBBox(b)
      const testX = b.mirror ? ax : x
      if (testX < bb[0] || testX > bb[1] || y < bb[2] || y > bb[3]) continue
      const region = b.region(i, ctx)
      if (region <= 0.02) continue
      let dx = x - b.c[0]
      if (b.mirror) dx = Math.abs(dx) - b.c[0]
      const dy = y - b.c[1]
      let q: number
      if (b.rot) {
        const ca = Math.cos(b.rot)
        const sa = Math.sin(b.rot)
        const rx = dx * ca + dy * sa
        const ry = -dx * sa + dy * ca
        q = (rx / b.r[0]) ** 2 + (ry / b.r[1]) ** 2
      } else {
        q = (dx / b.r[0]) ** 2 + (dy / b.r[1]) ** 2
      }
      if (q > 4) continue
      let f = b.depth * Math.exp(-q) * region
      let midline = 1
      if (b.midline) {
        midline = smoothstep(b.midline, b.midline * 1.8, Math.abs(x))
        f *= midline
      }
      const k = f * H * frontGate
      if (b.dir === 'z') {
        positions[i * 3 + 2] += k
      } else {
        positions[i * 3] += normals[i * 3] * k
        positions[i * 3 + 1] += normals[i * 3 + 1] * k
        positions[i * 3 + 2] += normals[i * 3 + 2] * k
      }
      // gradient du renflement
      const e = b.depth * Math.exp(-q) * region * midline
      const sx = b.mirror ? Math.sign(x) || 1 : 1
      gx[i] += -e * 2 * (dx * sx) / (b.r[0] * b.r[0])
      gy[i] += -e * 2 * dy / (b.r[1] * b.r[1])
    }
  }

  return { gx, gy }
}

/**
 * Recalcule les normales d'une géométrie en y injectant le gradient
 * analytique du relief : c'est ce qui restitue les séparations muscles
 * que la tessellation ne peut pas représenter.
 */
export function applyBumpNormals(
  geometry: THREE.BufferGeometry,
  res: AnatomyResult,
  gain = 0,
): void {
  const attr = geometry.getAttribute('normal') as THREE.BufferAttribute
  const arr = attr.array as Float32Array
  const idx = geometry.getIndex()
  if (!idx) return
  const n = arr.length / 3
  const index = idx.array as ArrayLike<number>

  // Lissage du gradient sur la topologie : échantillonné tous les ~2 cm, le
  // gradient brut oscille d'un sommet à l'autre et produirait des taches.
  const sum = new Float32Array(n * 2)
  const cnt = new Uint16Array(n)
  for (let pass = 0; pass < 2; pass++) {
    sum.fill(0)
    cnt.fill(0)
    for (let t = 0; t < index.length; t += 3) {
      for (let k = 0; k < 3; k++) {
        const a = index[t + k]
        const b = index[t + ((k + 1) % 3)]
        sum[a * 2] += res.gx[b]
        sum[a * 2 + 1] += res.gy[b]
        cnt[a]++
        sum[b * 2] += res.gx[a]
        sum[b * 2 + 1] += res.gy[a]
        cnt[b]++
      }
    }
    for (let i = 0; i < n; i++) {
      if (!cnt[i]) continue
      res.gx[i] = (res.gx[i] + (sum[i * 2] / cnt[i]) * 2) / 3
      res.gy[i] = (res.gy[i] + (sum[i * 2 + 1] / cnt[i]) * 2) / 3
    }
  }

  for (let i = 0; i < n; i++) {
    const bx = res.gx[i]
    const by = res.gy[i]
    if (bx === 0 && by === 0) continue
    const nx = arr[i * 3] - bx * gain
    const ny = arr[i * 3 + 1] - by * gain
    const nz = arr[i * 3 + 2]
    const len = Math.hypot(nx, ny, nz) || 1
    arr[i * 3] = nx / len
    arr[i * 3 + 1] = ny / len
    arr[i * 3 + 2] = nz / len
  }
  attr.needsUpdate = true
}
