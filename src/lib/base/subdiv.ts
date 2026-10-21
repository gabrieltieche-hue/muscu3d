/**
 * Subdivision de surface Catmull-Clark (quads).
 *
 * Le mesh MakeHuman de base ne fait que 13 380 sommets : ~2,1 cm d'arête.
 * C'est trop grossier pour une sculpture : une rainure de 6 mm est
 * sous-échantillonnée, les orteils et les doigts sont des moignons, et la
 * silhouette « facettée » trahit le faible maillage.
 *
 * Catmull-Clark sur les quads d'origine (et non sur les triangles) évite la
 * vallée que laisse la diagonale de triangulation : la limite de la surface
 * est alors la vraie surface limite des quads, lisse en C2.
 *
 * Règles (quad) :
 *   - point de face  F = moyenne des 4 coins
 *   - point d'arête  E = (P0 + P1 + F_gauche + F_droite) / 4
 *   - point de sommet V' = (F + 2R + (n-3)P) / n
 *     (F = moyenne des points de face incidents, R = moyenne des milieux
 *      d'arête incidents, n = valence)
 *
 * Le maillage de base est fermé (0 arête frontière) : le cas frontière est
 * traité par prudence.
 *
 * ARCHITECTURE : la topologie ne change jamais (seules les positions
 * changent quand on bouge un curseur). On précalcule donc une fois pour
 * toutes le « plan » de subdivision (arêtes, incidences, valence) et on ne
 * recalcule que les positions à chaque construction. Sans cela, la
 * subdivision coûterait 300 ms par image — incompatible avec un curseur
 * que l'on tire.
 */

/** Un niveau de subdivision précalculé (topologie seule). */
interface LevelPlan {
  /** faces d'entrée, à plat : les indices de tous les polygones */
  inFaces: Uint32Array
  /** nombre de sommets par face (3 pour un triangle, 4 pour un quad) */
  faceSizes: Uint8Array
  /** nombre de sommets d'entrée */
  nV: number
  /** nombre de faces d'entrée */
  nF: number
  /** nombre d'arêtes d'entrée */
  nE: number
  /** extrémités des arêtes (a < b) */
  edgeA: Int32Array
  edgeB: Int32Array
  /** pour chaque face, les indices d'arête (un par côté) */
  faceEdges: Int32Array
  /** valence de chaque sommet (= nombre de faces incidentes) */
  valence: Uint16Array
  /** CSR : faces incidentes de chaque sommet */
  vFaceOffset: Int32Array
  vFaceIdx: Int32Array
  /** CSR : arêtes incidentes de chaque sommet */
  vEdgeOffset: Int32Array
  vEdgeIdx: Int32Array
  /** faces de sortie (à plat) */
  outFaces: Uint32Array
  /** nombre de sommets par face de sortie */
  outSizes: Uint8Array
  /** indices triangulés de sortie */
  outIndices: Uint32Array
}

export interface SubdivResult {
  positions: Float32Array
  indices: Uint32Array
  vertexCount: number
  triangleCount: number
}

/**
 * Table de hachage ouverte pour l'appariement des arêtes.
 * (une Map<string> serait trop lente et trop gourmande à ce volume)
 *
 * Les deux extrémités sont stockées dans deux tableaux : les index de
 * sommets dépassent 2^16 au 2e niveau de subdivision, un encodage
 * a * 65536 + b déborderait donc.
 */
class EdgeTable {
  private mask: number
  private ka: Int32Array
  private kb: Int32Array
  private vals: Int32Array

  constructor(expected: number) {
    let cap = 16
    while (cap < expected * 2) cap <<= 1
    this.mask = cap - 1
    this.ka = new Int32Array(cap).fill(-1)
    this.kb = new Int32Array(cap).fill(-1)
    this.vals = new Int32Array(cap).fill(-1)
  }

  private hash(a: number, b: number): number {
    return (Math.imul(a, 2654435761) ^ Math.imul(b, 40503)) >>> 0
  }

  get(a: number, b: number): number {
    let h = this.hash(a, b) & this.mask
    for (;;) {
      if (this.ka[h] === -1) return -1
      if (this.ka[h] === a && this.kb[h] === b) return this.vals[h]
      h = (h + 1) & this.mask
    }
  }

  ensure(a: number, b: number, value: number): number {
    let h = this.hash(a, b) & this.mask
    for (;;) {
      if (this.ka[h] === -1) {
        this.ka[h] = a
        this.kb[h] = b
        this.vals[h] = value
        return value
      }
      if (this.ka[h] === a && this.kb[h] === b) return this.vals[h]
      h = (h + 1) & this.mask
    }
  }
}

/** Construit le plan topologique d'un niveau de subdivision. */
function buildLevelPlan(inFaces: Uint32Array, faceSizes: Uint8Array, nV: number): LevelPlan {
  const nF = faceSizes.length
  // début de chaque face dans le tableau à plat
  const faceStart = new Uint32Array(nF + 1)
  for (let f = 0; f < nF; f++) faceStart[f + 1] = faceStart[f] + faceSizes[f]

  // --- arêtes ---
  const table = new EdgeTable(nF * 3)
  const edgeA = new Int32Array(nF * 3)
  const edgeB = new Int32Array(nF * 3)
  let nE = 0
  const faceEdges = new Int32Array(faceStart[nF])
  for (let f = 0; f < nF; f++) {
    const base = faceStart[f]
    const sz = faceSizes[f]
    for (let k = 0; k < sz; k++) {
      const a = inFaces[base + k]
      const b = inFaces[base + ((k + 1) % sz)]
      const lo = a < b ? a : b
      const hi = a < b ? b : a
      let e = table.get(lo, hi)
      if (e < 0) {
        e = nE++
        edgeA[e] = lo
        edgeB[e] = hi
        table.ensure(lo, hi, e)
      }
      faceEdges[base + k] = e
    }
  }

  // --- incidences (CSR) ---
  const valence = new Uint16Array(nV)
  for (let f = 0; f < nF; f++) {
    const base = faceStart[f]
    for (let k = 0; k < faceSizes[f]; k++) valence[inFaces[base + k]]++
  }
  const vFaceOffset = new Int32Array(nV + 1)
  for (let v = 0; v < nV; v++) vFaceOffset[v + 1] = vFaceOffset[v] + valence[v]
  const vFaceIdx = new Int32Array(vFaceOffset[nV])
  const cursor = vFaceOffset.slice(0, nV)
  for (let f = 0; f < nF; f++) {
    const base = faceStart[f]
    for (let k = 0; k < faceSizes[f]; k++) {
      const v = inFaces[base + k]
      vFaceIdx[cursor[v]++] = f
    }
  }
  const vEdgeOffset = new Int32Array(nV + 1)
  for (let e = 0; e < nE; e++) {
    vEdgeOffset[edgeA[e] + 1]++
    vEdgeOffset[edgeB[e] + 1]++
  }
  for (let v = 0; v < nV; v++) vEdgeOffset[v + 1] += vEdgeOffset[v]
  const vEdgeIdx = new Int32Array(vEdgeOffset[nV])
  const cursor2 = vEdgeOffset.slice(0, nV)
  for (let e = 0; e < nE; e++) {
    vEdgeIdx[cursor2[edgeA[e]]++] = e
    vEdgeIdx[cursor2[edgeB[e]]++] = e
  }

  // --- faces de sortie : pour chaque polygone, un sous-polygone par côté ---
  const outSizes = new Uint8Array(nF * 4)
  let outCount = 0
  for (let f = 0; f < nF; f++) {
    const sz = faceSizes[f]
    for (let k = 0; k < sz; k++) outSizes[outCount++] = sz === 4 ? 4 : 3
  }
  const outFaces = new Uint32Array(outCount * 4)
  const outStart = new Uint32Array(outCount + 1)
  for (let f = 0; f < outCount; f++) outStart[f + 1] = outStart[f] + outSizes[f]
  for (let f = 0; f < nF; f++) {
    const base = faceStart[f]
    const sz = faceSizes[f]
    const fp = nV + nE + f
    for (let k = 0; k < sz; k++) {
      const outF = f * 4 + k
      const o = outStart[outF]
      const v = inFaces[base + k]
      const eNext = nV + faceEdges[base + k]
      const ePrev = nV + faceEdges[base + ((k + sz - 1) % sz)]
      if (sz === 4) {
        outFaces[o] = v
        outFaces[o + 1] = eNext
        outFaces[o + 2] = fp
        outFaces[o + 3] = ePrev
      } else {
        outFaces[o] = v
        outFaces[o + 1] = eNext
        outFaces[o + 2] = fp
      }
    }
  }
  // indices triangulés
  const outIndices = new Uint32Array(outCount * 6)
  let k = 0
  for (let f = 0; f < outCount; f++) {
    const o = outStart[f]
    const sz = outSizes[f]
    for (let i = 1; i < sz - 1; i++) {
      outIndices[k++] = outFaces[o]
      outIndices[k++] = outFaces[o + i]
      outIndices[k++] = outFaces[o + i + 1]
    }
  }

  return {
    inFaces,
    faceSizes,
    nV,
    nF,
    nE,
    edgeA,
    edgeB,
    faceEdges,
    valence,
    vFaceOffset,
    vFaceIdx,
    vEdgeOffset,
    vEdgeIdx,
    outFaces,
    outSizes,
    outIndices,
  }
}

/** Applique un niveau de subdivision à un jeu de positions. */
function applyLevel(plan: LevelPlan, positions: Float32Array): Float32Array {
  const { nV, nF, nE } = plan
  const faceStart = new Uint32Array(nF + 1)
  for (let f = 0; f < nF; f++) faceStart[f + 1] = faceStart[f] + plan.faceSizes[f]

  // points de face
  const facePos = new Float32Array(nF * 3)
  for (let f = 0; f < nF; f++) {
    const base = faceStart[f]
    const sz = plan.faceSizes[f]
    let sx = 0
    let sy = 0
    let sz2 = 0
    for (let k = 0; k < sz; k++) {
      const i = plan.inFaces[base + k] * 3
      sx += positions[i]
      sy += positions[i + 1]
      sz2 += positions[i + 2]
    }
    const inv = 1 / sz
    facePos[f * 3] = sx * inv
    facePos[f * 3 + 1] = sy * inv
    facePos[f * 3 + 2] = sz2 * inv
  }

  // accumulation des points de face par arête
  const edgeFaceAcc = new Float32Array(nE * 3)
  for (let f = 0; f < nF; f++) {
    const base = faceStart[f]
    for (let k = 0; k < plan.faceSizes[f]; k++) {
      const e = plan.faceEdges[base + k]
      edgeFaceAcc[e * 3] += facePos[f * 3]
      edgeFaceAcc[e * 3 + 1] += facePos[f * 3 + 1]
      edgeFaceAcc[e * 3 + 2] += facePos[f * 3 + 2]
    }
  }

  const outV = nV + nE + nF
  const outPos = new Float32Array(outV * 3)

  // points de sommet : V' = (F + 2R + (n-3)P) / n
  for (let v = 0; v < nV; v++) {
    const n = plan.valence[v]
    const o = v * 3
    if (n === 0) {
      outPos[o] = positions[o]
      outPos[o + 1] = positions[o + 1]
      outPos[o + 2] = positions[o + 2]
      continue
    }
    let fx = 0
    let fy = 0
    let fz = 0
    const fs = plan.vFaceOffset[v]
    const fe = plan.vFaceOffset[v + 1]
    for (let k = fs; k < fe; k++) {
      const f = plan.vFaceIdx[k] * 3
      fx += facePos[f]
      fy += facePos[f + 1]
      fz += facePos[f + 2]
    }
    let rx = 0
    let ry = 0
    let rz = 0
    const es = plan.vEdgeOffset[v]
    const ee = plan.vEdgeOffset[v + 1]
    for (let k = es; k < ee; k++) {
      const e = plan.vEdgeIdx[k]
      const a = plan.edgeA[e] * 3
      const b = plan.edgeB[e] * 3
      rx += (positions[a] + positions[b]) * 0.5
      ry += (positions[a + 1] + positions[b + 1]) * 0.5
      rz += (positions[a + 2] + positions[b + 2]) * 0.5
    }
    const inv = 1 / n
    const k2 = n - 3
    outPos[o] = (fx * inv + 2 * rx * inv + k2 * positions[o]) * inv
    outPos[o + 1] = (fy * inv + 2 * ry * inv + k2 * positions[o + 1]) * inv
    outPos[o + 2] = (fz * inv + 2 * rz * inv + k2 * positions[o + 2]) * inv
  }

  // points d'arête : (P0 + P1 + F1 + F2) / 4
  for (let e = 0; e < nE; e++) {
    const o = (nV + e) * 3
    const a = plan.edgeA[e] * 3
    const b = plan.edgeB[e] * 3
    outPos[o] = (positions[a] + positions[b] + edgeFaceAcc[e * 3]) * 0.25
    outPos[o + 1] = (positions[a + 1] + positions[b + 1] + edgeFaceAcc[e * 3 + 1]) * 0.25
    outPos[o + 2] = (positions[a + 2] + positions[b + 2] + edgeFaceAcc[e * 3 + 2]) * 0.25
  }

  // points de face
  for (let f = 0; f < nF; f++) {
    const o = (nV + nE + f) * 3
    outPos[o] = facePos[f * 3]
    outPos[o + 1] = facePos[f * 3 + 1]
    outPos[o + 2] = facePos[f * 3 + 2]
  }

  return outPos
}

/** Triangulation d'un maillage à polygones quelconque. */
function triangulate(faces: Uint32Array, faceSizes: Uint8Array): Uint32Array {
  let total = 0
  for (const s of faceSizes) total += (s - 2) * 3
  const indices = new Uint32Array(total)
  let k = 0
  let base = 0
  for (let f = 0; f < faceSizes.length; f++) {
    const sz = faceSizes[f]
    for (let i = 1; i < sz - 1; i++) {
      indices[k++] = faces[base]
      indices[k++] = faces[base + i]
      indices[k++] = faces[base + i + 1]
    }
    base += sz
  }
  return indices
}

/**
 * Subdiviseur réutilisable : le plan topologique est calculé une fois,
 * seules les positions sont recalculées à chaque construction.
 */
export class Subdivider {
  private plans: LevelPlan[] = []
  outIndices: Uint32Array

  constructor(faces: Uint32Array, faceSizes: Uint8Array, levels: number) {
    let cur = faces
    let curSizes = faceSizes
    // nombre de sommets du maillage d'entrée (déduit des faces)
    let nV = 0
    for (let i = 0; i < faces.length; i++) if (faces[i] + 1 > nV) nV = faces[i] + 1
    for (let l = 0; l < levels; l++) {
      const plan = buildLevelPlan(cur, curSizes, nV)
      this.plans.push(plan)
      nV = plan.nV + plan.nE + plan.nF
      cur = plan.outFaces
      curSizes = plan.outSizes
    }
    this.outIndices = levels > 0 ? this.plans[levels - 1].outIndices : triangulate(faces, faceSizes)
  }

  /** Applique la subdivision à un jeu de positions. */
  apply(positions: Float32Array): SubdivResult {
    let pos = positions
    for (const plan of this.plans) pos = applyLevel(plan, pos)
    return {
      positions: pos,
      indices: this.outIndices,
      vertexCount: pos.length / 3,
      triangleCount: this.outIndices.length / 3,
    }
  }
}

let cached: Subdivider | null = null
let cachedLevels = -1

/** Subdiviseur mis en cache pour la topologie de base. */
export function getSubdivider(
  faces: Uint32Array,
  faceSizes: Uint8Array,
  levels: number,
): Subdivider {
  if (cached && cachedLevels === levels) return cached
  cached = new Subdivider(faces, faceSizes, levels)
  cachedLevels = levels
  return cached
}
