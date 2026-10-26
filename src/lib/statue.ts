import * as THREE from 'three'
import { getLoadedBody } from './base/model'
import {
  WIRE_MAT,
  computeMasks,
  computeNormals,
  meshVolume,
  slicePerimeter,
  type BodyMetrics,
  type BodyParams,
  type Masks,
} from './body'
import { FIXED_PARAMS } from './referenceProfile'

/**
 * Modèle 3D externe (téléchargé) affiché dans le studio.
 *
 * Deux cas :
 *
 *  1. **Modèle paramétrable** (`buildParametricStatue`) — un maillage unique,
 *     posé debout, que l'on peut déformer avec les curseurs. On réutilise le
 *     moteur de masques anatomiques de `body.ts` (`computeMasks`) : les
 *     régions (pectoraux, abdos, bras, cuisses…) sont déduites d'un squelette
 *     logiciel calé sur la silhouette du fichier. Les déplacements sont
 *     relatifs au profil de référence : à l'ouverture, la statue est
 *     exactement le fichier téléchargé.
 *
 *  2. **Modèle statique** (`buildStatue`) — plusieurs maillages, ou fichier
 *     dont on ne sait pas déduire l'anatomie : affiché tel quel, comme avant.
 *
 * Convention du fichier préparé (`scripts/prep-external.py`) : pieds à y = 0,
 * hauteur du corps = 1, visage vers +z. Le socle éventuel du fichier est
 * laissé sous y = 0 : le socle du studio le cache.
 */

/**
 * Matière « argile / plâtre de studio ».
 * Gris neutre, très mat, sans métal : c'est la matière des images de
 * référence (pas de couleur de peau, pas de brillance plastique).
 */
export const CLAY_MAT = new THREE.MeshStandardMaterial({
  color: 0x969696,
  roughness: 0.7,
  metalness: 0,
  envMapIntensity: 0.5,
})

const TARGET_HEIGHT = 1.75

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const nn = (v: number) => (v - 50) / 50
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Repères anatomiques du modèle importé, en coordonnées normalisées
 * (pieds = 0, crâne = 1). Ils sont calés sur la silhouette du fichier
 * `public/modele.glb` (Grey Adonis / Meshy) : épaules larges, bras légèrement
 * écartés, mains à hauteur de hanche.
 *
 * Ce ne sont pas des os rendus : seulement des axes pour les masques de
 * déformation (distance à un segment).
 */
export function statueJoints(): Record<string, THREE.Vector3> {
  const J = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const j: Record<string, THREE.Vector3> = {
    pelvis: J(0, 0.47, 0),
    'spine-4': J(0, 0.53, 0),
    'spine-3': J(0, 0.6, 0),
    'spine-2': J(0, 0.66, 0),
    'spine-1': J(0, 0.735, 0),
    neck: J(0, 0.855, 0),
    head: J(0, 0.895, 0),
    'head-2': J(0, 0.97, 0),
    'l-clavicle': J(0.045, 0.83, 0),
    'l-shoulder': J(0.115, 0.815, 0),
    'l-elbow': J(0.145, 0.65, -0.005),
    'l-hand': J(0.175, 0.515, -0.005),
    'l-finger-3-2': J(0.185, 0.44, 0),
    'l-upper-leg': J(0.055, 0.465, 0),
    'l-knee': J(0.065, 0.295, 0),
    'l-ankle': J(0.08, 0.045, -0.02),
    'l-foot-1': J(0.08, 0.012, 0.06),
    'l-eye': J(0.02, 0.93, 0.045),
  }
  for (const [name, p] of Object.entries({ ...j })) {
    if (!name.startsWith('l-')) continue
    j['r-' + name.slice(2)] = new THREE.Vector3(-p.x, p.y, p.z)
  }
  return j
}

/** Vrai si le fichier a été préparé par `scripts/prep-external.py`. */
function isPrepped(model: { extras?: Record<string, unknown> }): boolean {
  return model.extras?.bodyFloor === 0
}

interface BaseGeometry {
  /** positions normalisées : sol du corps à 0, hauteur 1 */
  positions: Float32Array
  indices: Uint32Array
  /** normales du modèle de repos (direction des déplacements) */
  normals: Float32Array
}

/** Extrait et normalise le premier maillage du fichier. */
function baseGeometry(): BaseGeometry {
  const model = getLoadedBody()
  if (!model) throw new Error('modèle 3D non chargé')

  const src = model.positions
  const n = src.length / 3
  const out = new Float32Array(src.length)

  if (isPrepped(model)) {
    out.set(src)
  } else {
    // fichier non préparé : pieds à 0, hauteur 1, centré sur x/z
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (let i = 0; i < n; i++) {
      const x = src[i * 3]
      const y = src[i * 3 + 1]
      const z = src[i * 3 + 2]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (z < minZ) minZ = z
      if (z > maxZ) maxZ = z
    }
    const h = maxY - minY || 1
    const cx = (minX + maxX) * 0.5
    const cz = (minZ + maxZ) * 0.5
    for (let i = 0; i < n; i++) {
      out[i * 3] = (src[i * 3] - cx) / h
      out[i * 3 + 1] = (src[i * 3 + 1] - minY) / h
      out[i * 3 + 2] = (src[i * 3 + 2] - cz) / h
    }
  }

  const indices = new Uint32Array(model.indices)
  const normals = computeNormals(out, indices)
  return { positions: out, indices, normals }
}

export interface StatueBody {
  group: THREE.Group
  /** applique les paramètres et renvoie les mesures estimées */
  update: (p: BodyParams) => BodyMetrics
}

/** Delta d'un paramètre musculaire par rapport au profil de référence. */
function muscleDelta(v: number, ref: number, amount: number): number {
  return (nn(v) - nn(ref)) * amount
}

/** Delta du ventre / de la graisse (mêmes formules que le moteur MakeHuman). */
function fatDelta(p: BodyParams): number {
  const ref = clamp((FIXED_PARAMS.fat - 12) / 22, -0.7, 1.4)
  return (clamp((p.fat - 12) / 22, -0.7, 1.4) - ref) * 0.011
}
function bellyDelta(p: BodyParams): number {
  const ref = clamp((FIXED_PARAMS.belly - 25) / 70, -0.45, 1.1)
  return (clamp((p.belly - 25) / 70, -0.45, 1.1) - ref) * 0.075
}

/**
 * Construit la statue paramétrable à partir du fichier externe.
 * Le groupe et la géométrie sont créés une fois ; `update` ne réécrit que
 * les positions (les curseurs restent fluides).
 */
export function buildParametricStatue(params: BodyParams): StatueBody {
  const base = baseGeometry()
  const joints = statueJoints()
  const masks: Masks = computeMasks(base.positions, joints)
  const n = base.positions.length / 3

  // le socle du fichier (sous y = 0) et le dessous des pieds restent rigides
  const bodyGate = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    bodyGate[i] = smoothstep(-0.004, 0.012, base.positions[i * 3 + 1])
  }

  const positions = new Float32Array(base.positions.length)
  const normals = new Float32Array(base.positions.length)

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geometry.setIndex(new THREE.BufferAttribute(base.indices.slice(), 1))
  geometry.computeBoundingSphere()

  const group = new THREE.Group()
  group.name = 'statue-parametrique'
  const solid = new THREE.Mesh(geometry, CLAY_MAT)
  solid.castShadow = true
  solid.receiveShadow = true
  solid.userData.isWire = false
  group.add(solid)

  const wire = new THREE.Mesh(geometry, WIRE_MAT)
  wire.userData.isWire = true
  wire.visible = false
  group.add(wire)

  // --- mesures (une fois les positions à l'échelle réelle) ---
  const up = new THREE.Vector3(0, 1, 0)
  const xAxis = new THREE.Vector3(1, 0, 0)
  const zAxis = new THREE.Vector3(0, 0, 1)
  const bodyTris: number[] = []
  for (let t = 0; t < base.indices.length; t += 3) {
    const a = base.indices[t]
    const b = base.indices[t + 1]
    const c = base.indices[t + 2]
    // le socle du fichier est sous y = 0 : on l'exclut du volume
    if ((base.positions[a * 3 + 1] + base.positions[b * 3 + 1] + base.positions[c * 3 + 1]) / 3 > -0.002) {
      bodyTris.push(a, b, c)
    }
  }
  const bodyIndices = new Uint32Array(bodyTris)

  const torsoFilter = (i: number) => masks.torso[i] > 0.5 && masks.arm[i] < 0.45

  function measure(out: Float32Array, H: number, p: BodyParams): BodyMetrics {
    const volume = meshVolume(out, bodyIndices)
    const weight = volume * 1000 * 1.02
    const lean = weight * (1 - p.fat / 100)

    const waist = slicePerimeter(
      out,
      torsoFilter,
      new THREE.Vector3(0, 0.6 * H, 0),
      up,
      0.012 * H,
      xAxis,
      zAxis,
    )
    const chest = slicePerimeter(
      out,
      torsoFilter,
      new THREE.Vector3(0, 0.75 * H, 0),
      up,
      0.012 * H,
      xAxis,
      zAxis,
    )

    const shoulder = joints['l-shoulder']
    const elbow = joints['l-elbow']
    const armAxis = new THREE.Vector3().subVectors(elbow, shoulder).normalize()
    const armCenter = new THREE.Vector3().lerpVectors(shoulder, elbow, 0.45).multiplyScalar(H)
    const au = new THREE.Vector3().crossVectors(armAxis, up).normalize()
    const av = new THREE.Vector3().crossVectors(armAxis, au).normalize()
    const arm = slicePerimeter(
      out,
      (i) => masks.arm[i] > 0.3 && out[i * 3] > 0,
      armCenter,
      armAxis,
      0.012 * H,
      au,
      av,
    )

    const hip = joints['l-upper-leg']
    const knee = joints['l-knee']
    const thighAxis = new THREE.Vector3().subVectors(knee, hip).normalize()
    const thighCenter = new THREE.Vector3().lerpVectors(hip, knee, 0.5).multiplyScalar(H)
    const tu = new THREE.Vector3().crossVectors(thighAxis, zAxis).normalize()
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

    return {
      weight,
      lean,
      waist: waist * 100,
      chest: chest * 100,
      arm: arm * 100,
      thigh: thigh * 100,
    }
  }

  const update = (p: BodyParams): BodyMetrics => {
    const H = clamp(p.height, 140, 210) / 100

    const dFat = fatDelta(p)
    const dBelly = bellyDelta(p)
    const dTrap = muscleDelta(p.neck, FIXED_PARAMS.neck, 0.013)
    const dDelt = muscleDelta(p.shoulders, FIXED_PARAMS.shoulders, 0.017)
    const dArm = muscleDelta(p.arms, FIXED_PARAMS.arms, 0.016)
    const dFore = muscleDelta(p.forearms, FIXED_PARAMS.forearms, 0.011)
    const dThigh = muscleDelta(p.thighs, FIXED_PARAMS.thighs, 0.014)
    const dCalf = muscleDelta(p.calves, FIXED_PARAMS.calves, 0.013)
    const dPec = muscleDelta(p.pecs, FIXED_PARAMS.pecs, 0.016)
    const dLat = muscleDelta(p.lats, FIXED_PARAMS.lats, 0.03)
    const dAbs = muscleDelta(p.abs, FIXED_PARAMS.abs, 0.007)
    const dGlute = muscleDelta(p.glutes, FIXED_PARAMS.glutes, 0.014)

    for (let i = 0; i < n; i++) {
      const gate = bodyGate[i]
      const x = base.positions[i * 3]
      const y = base.positions[i * 3 + 1]
      const z = base.positions[i * 3 + 2]
      const nx = base.normals[i * 3]
      const ny = base.normals[i * 3 + 1]
      const nz = base.normals[i * 3 + 2]

      const alongNormal =
        dFat * masks.fat[i] +
        dTrap * masks.trap[i] +
        dDelt * masks.delt[i] +
        dArm * masks.arm[i] +
        dFore * masks.fore[i] +
        dThigh * masks.thigh[i] +
        dCalf * masks.calf[i]
      const alongZ = dBelly * masks.belly[i] + dPec * masks.pec[i] + dAbs * masks.abs[i] - dGlute * masks.glute[i]
      const alongX = dLat * masks.lat[i] * masks.side[i]

      positions[i * 3] = (x + (nx * alongNormal + alongX) * gate) * H
      positions[i * 3 + 1] = (y + ny * alongNormal * gate) * H
      positions[i * 3 + 2] = (z + (nz * alongNormal + alongZ) * gate) * H
    }

    normals.set(computeNormals(positions, base.indices))
    geometry.getAttribute('position').needsUpdate = true
    geometry.getAttribute('normal').needsUpdate = true
    geometry.computeBoundingSphere()

    return measure(positions, H, p)
  }

  update(params)
  return { group, update }
}

/**
 * Affichage d'un modèle 3D externe « tel quel » (plusieurs maillages, ou
 * anatomie impossible à déduire). Le fichier n'est pas modifié : on ne touche
 * qu'aux matériaux, à l'échelle et à l'ancrage au sol.
 */
export function buildStatue(): { group: THREE.Group } {
  const model = getLoadedBody()
  if (!model) throw new Error('modèle 3D non chargé')

  const root = model.scene
  const group = new THREE.Group()
  group.name = 'statue'
  group.add(root)

  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.material = CLAY_MAT
    mesh.castShadow = true
    mesh.receiveShadow = true
    if (!mesh.geometry.getAttribute('normal')) mesh.geometry.computeVertexNormals()
  })

  // échelle : hauteur du modèle -> 1,75 m (taille humaine de référence)
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const scale = size.y > 1e-5 ? TARGET_HEIGHT / size.y : 1
  root.scale.multiplyScalar(scale)
  root.updateMatrixWorld(true)

  // centrage : X/Z au centre du socle, pieds exactement à y = 0
  box.setFromObject(root)
  const center = box.getCenter(new THREE.Vector3())
  root.position.x -= center.x
  root.position.z -= center.z
  root.position.y -= box.min.y
  root.updateMatrixWorld(true)

  return { group }
}
