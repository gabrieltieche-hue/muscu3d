import * as THREE from 'three'
import { ellipseCirc, ellipsoid, loftRings, signedVolume, smoothstep, type LoftRing } from './geometry'

/**
 * Vecteur d'état corporel : c'est LUI le vrai moteur.
 * L'avatar 3D n'est qu'une projection visuelle de ce vecteur.
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

export const DEFAULT_PARAMS: BodyParams = {
  height: 175,
  fat: 18,
  belly: 30,
  neck: 45,
  shoulders: 45,
  lats: 45,
  pecs: 45,
  abs: 45,
  glutes: 45,
  thighs: 45,
  calves: 45,
  arms: 45,
  forearms: 45,
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
/** 0-100 → -1..1 */
const nn = (v: number) => (v - 50) / 50

/** Bande d'influence douce : 1 entre lo et hi, retombe sur fade. */
const band = (y: number, lo: number, hi: number, fade = 0.04) => {
  if (y < lo - fade || y > hi + fade) return 0
  return Math.min(smoothstep(lo - fade, lo, y), 1 - smoothstep(hi, hi + fade, y))
}

const BODY_MAT = new THREE.MeshPhysicalMaterial({
  color: 0xbdb3a6,
  roughness: 0.56,
  metalness: 0,
  clearcoat: 0.12,
  clearcoatRoughness: 0.6,
})
const WIRE_MAT = new THREE.MeshBasicMaterial({
  color: 0x9af0cf,
  wireframe: true,
  transparent: true,
  opacity: 0.14,
  depthWrite: false,
})

interface TorsoSection {
  y: number
  rx: number
  rzF: number
  rzB: number
  z: number
  gF: number
  gB: number
}

/** Référence : homme de 1,75 m, 18 % de gras, muscles moyens. */
const TORSO_BASE: TorsoSection[] = [
  { y: 0.47, rx: 0.058, rzF: 0.038, rzB: 0.05, z: 0.0, gF: 0, gB: 0.03 },
  { y: 0.49, rx: 0.075, rzF: 0.048, rzB: 0.066, z: 0.0, gF: 0, gB: 0.045 },
  { y: 0.51, rx: 0.09, rzF: 0.054, rzB: 0.078, z: 0.0, gF: 0, gB: 0.06 },
  { y: 0.53, rx: 0.1, rzF: 0.057, rzB: 0.09, z: 0.0, gF: 0, gB: 0.075 },
  { y: 0.548, rx: 0.1, rzF: 0.058, rzB: 0.088, z: 0.0, gF: 0, gB: 0.06 },
  { y: 0.566, rx: 0.095, rzF: 0.057, rzB: 0.078, z: 0.002, gF: 0, gB: 0.04 },
  { y: 0.588, rx: 0.089, rzF: 0.055, rzB: 0.068, z: 0.003, gF: 0.012, gB: 0.03 },
  { y: 0.612, rx: 0.087, rzF: 0.054, rzB: 0.064, z: 0.004, gF: 0.02, gB: 0.026 },
  { y: 0.638, rx: 0.088, rzF: 0.054, rzB: 0.063, z: 0.005, gF: 0.026, gB: 0.024 },
  { y: 0.664, rx: 0.092, rzF: 0.056, rzB: 0.064, z: 0.007, gF: 0.03, gB: 0.022 },
  { y: 0.69, rx: 0.099, rzF: 0.061, rzB: 0.066, z: 0.009, gF: 0.03, gB: 0.02 },
  { y: 0.714, rx: 0.106, rzF: 0.064, rzB: 0.068, z: 0.012, gF: 0.034, gB: 0.018 },
  { y: 0.736, rx: 0.112, rzF: 0.074, rzB: 0.069, z: 0.014, gF: 0.06, gB: 0.016 },
  { y: 0.755, rx: 0.115, rzF: 0.073, rzB: 0.068, z: 0.012, gF: 0.066, gB: 0.014 },
  { y: 0.773, rx: 0.115, rzF: 0.068, rzB: 0.067, z: 0.01, gF: 0.05, gB: 0.012 },
  { y: 0.791, rx: 0.112, rzF: 0.062, rzB: 0.064, z: 0.007, gF: 0.02, gB: 0.01 },
  { y: 0.808, rx: 0.106, rzF: 0.057, rzB: 0.06, z: 0.004, gF: 0, gB: 0.006 },
  { y: 0.822, rx: 0.092, rzF: 0.052, rzB: 0.055, z: 0.003, gF: 0, gB: 0 },
  { y: 0.834, rx: 0.064, rzF: 0.046, rzB: 0.049, z: 0.002, gF: 0, gB: 0 },
  { y: 0.846, rx: 0.048, rzF: 0.038, rzB: 0.041, z: 0.002, gF: 0, gB: 0 },
  { y: 0.858, rx: 0.0376, rzF: 0.033, rzB: 0.035, z: 0.003, gF: 0, gB: 0 },
  { y: 0.872, rx: 0.034, rzF: 0.031, rzB: 0.033, z: 0.004, gF: 0, gB: 0 },
  { y: 0.888, rx: 0.0325, rzF: 0.03, rzB: 0.032, z: 0.004, gF: 0, gB: 0 },
]

/**
 * Construit l'avatar à partir du vecteur corporel, et estime les mensurations
 * correspondantes (en cm). Objectif : un mannequin crédible, lissé, avec des
 * articulations fondues — pas une figurine low-poly.
 */
export function buildBody(p: BodyParams): { group: THREE.Group; metrics: BodyMetrics } {
  const H = clamp(p.height, 140, 210) / 100
  const fatD = clamp((p.fat - 18) / 22, -0.7, 1.1)
  const bellyD = clamp((p.belly - 30) / 70, -0.45, 1)
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

  const group = new THREE.Group()
  let volume = 0

  const addGeo = (geo: THREE.BufferGeometry) => {
    volume += Math.abs(signedVolume(geo))
    const solid = new THREE.Mesh(geo, BODY_MAT)
    solid.userData.isWire = false
    const wire = new THREE.Mesh(geo, WIRE_MAT)
    wire.scale.setScalar(1.0015)
    wire.userData.isWire = true
    wire.visible = false
    group.add(solid, wire)
  }

  // ---------------------------------------------------------------- torse + cou
  const torso: TorsoSection[] = TORSO_BASE.map((s) => {
    const sec = { ...s }
    const y = sec.y

    const fw = band(y, 0.49, 0.7, 0.05) + 0.4 * band(y, 0.7, 0.78, 0.03)
    sec.rx += fatD * 0.022 * fw
    sec.rzF += fatD * 0.016 * fw
    sec.rzB += fatD * 0.018 * fw

    const bw = band(y, 0.57, 0.71, 0.035)
    sec.rzF += bellyD * 0.034 * bw
    sec.z += bellyD * 0.011 * bw
    sec.rx += bellyD * 0.006 * bw

    const aw = band(y, 0.56, 0.7, 0.03)
    sec.rx -= absD * 0.005 * aw
    sec.rzF -= absD * 0.003 * aw

    const gw = band(y, 0.5, 0.585, 0.03)
    sec.rzB += glutD * 0.022 * gw
    sec.z -= glutD * 0.005 * gw

    const lw = band(y, 0.68, 0.79, 0.03)
    sec.rx += latsD * 0.024 * lw

    const pw = band(y, 0.715, 0.765, 0.02)
    sec.rzF += pecsD * 0.018 * pw
    sec.rx += pecsD * 0.003 * pw

    const sw = band(y, 0.775, 0.833, 0.02)
    sec.rx += shD * 0.016 * sw

    const nw = band(y, 0.833, 0.89, 0.012)
    const ns = 1 + neckD * 0.18 * nw
    sec.rx *= ns
    sec.rzF *= ns
    sec.rzB *= ns

    return sec
  })

  addGeo(
    loftRings(
      torso.map((s) => ({
        center: new THREE.Vector3(0, s.y * H, s.z * H),
        rx: s.rx * H,
        rzF: s.rzF * H,
        rzB: s.rzB * H,
        grooveF: s.gF,
        grooveB: s.gB,
      })),
      36,
      'both',
    ),
  )

  // ---------------------------------------------------------------- tête
  const headRings = [
    { y: 0.87, rx: 0.019, rzF: 0.032, rzB: 0.024, z: 0.012 },
    { y: 0.881, rx: 0.033, rzF: 0.04, rzB: 0.034, z: 0.009 },
    { y: 0.895, rx: 0.041, rzF: 0.045, rzB: 0.042, z: 0.004 },
    { y: 0.912, rx: 0.045, rzF: 0.05, rzB: 0.05, z: 0.002 },
    { y: 0.93, rx: 0.0465, rzF: 0.05, rzB: 0.056, z: 0.0 },
    { y: 0.948, rx: 0.047, rzF: 0.048, rzB: 0.06, z: -0.001 },
    { y: 0.965, rx: 0.044, rzF: 0.044, rzB: 0.056, z: -0.002 },
    { y: 0.98, rx: 0.036, rzF: 0.035, rzB: 0.045, z: -0.003 },
    { y: 0.993, rx: 0.022, rzF: 0.021, rzB: 0.026, z: -0.003 },
    { y: 1.0, rx: 0.004, rzF: 0.004, rzB: 0.005, z: -0.003 },
  ]
  addGeo(
    loftRings(
      headRings.map((s) => ({
        center: new THREE.Vector3(0, s.y * H, s.z * H),
        rx: s.rx * H,
        rzF: s.rzF * H,
        rzB: s.rzB * H,
      })),
      32,
      'both',
    ),
  )

  for (const s of [1, -1]) {
    addGeo(ellipsoid(new THREE.Vector3(s * 0.0475 * H, 0.928 * H, -0.004 * H), 0.0055 * H, 0.015 * H, 0.01 * H, 16))
  }
  addGeo(ellipsoid(new THREE.Vector3(0, 0.914 * H, 0.051 * H), 0.0085 * H, 0.02 * H, 0.0125 * H, 20))

  // ---------------------------------------------------------------- bras
  const upperLen = 0.171 * H
  const foreLen = 0.15 * H
  const armAngle = (6 * Math.PI) / 180
  const foreAngle = (7 * Math.PI) / 180
  const shX = (0.098 + shD * 0.012) * H
  const shY = 0.815 * H
  const shZ = 0.004 * H

  const upperProfile = [
    { t: 0.08, rx: 0.042, rzF: 0.041, rzB: 0.043 },
    { t: 0.18, rx: 0.036, rzF: 0.038, rzB: 0.037 },
    { t: 0.38, rx: 0.032, rzF: 0.036, rzB: 0.032 },
    { t: 0.62, rx: 0.029, rzF: 0.031, rzB: 0.029 },
    { t: 0.85, rx: 0.027, rzF: 0.028, rzB: 0.027 },
    { t: 1.0, rx: 0.0265, rzF: 0.0275, rzB: 0.0265 },
  ].map((pt) => {
    const grow = 1 + armD * 0.2 * smoothstep(0.12, 0.3, pt.t)
    const delt = shD * 0.006 * (1 - smoothstep(0.2, 0.4, pt.t))
    return {
      ...pt,
      rx: pt.rx * grow + delt,
      rzF: pt.rzF * grow + delt,
      rzB: pt.rzB * grow + delt,
    }
  })

  const foreBase = [
    { t: 0.0, rx: 0.027, rzF: 0.028, rzB: 0.028 },
    { t: 0.18, rx: 0.029, rzF: 0.03, rzB: 0.029 },
    { t: 0.55, rx: 0.023, rzF: 0.024, rzB: 0.023 },
    { t: 0.85, rx: 0.0175, rzF: 0.018, rzB: 0.0175 },
    { t: 1.0, rx: 0.016, rzF: 0.017, rzB: 0.016 },
  ]
  const foreScale = 1 + foreD * 0.18

  const bicepRing = {
    rx: upperProfile[2].rx * H,
    rz: ((upperProfile[2].rzF + upperProfile[2].rzB) * 0.5) * H,
  }

  for (const s of [1, -1]) {
    const shoulder = new THREE.Vector3(s * shX, shY, shZ)
    const elbow = new THREE.Vector3(
      shoulder.x + s * Math.sin(armAngle) * upperLen,
      shoulder.y - Math.cos(armAngle) * upperLen,
      shoulder.z + 0.011 * H,
    )
    const wrist = new THREE.Vector3(
      elbow.x + s * Math.sin(foreAngle) * foreLen,
      elbow.y - Math.cos(foreAngle) * foreLen,
      elbow.z + 0.005 * H,
    )

    // dôme d'épaule : sommet arrondi glissé sous l'acromion, puis deltoïde
    const topRings: LoftRing[] = [
      { center: new THREE.Vector3(s * (shX - 0.004 * H), 0.8225 * H, shZ - 0.002 * H), rx: 0.004 * H, rzF: 0.005 * H, rzB: 0.005 * H },
      { center: new THREE.Vector3(s * (shX - 0.003 * H), 0.819 * H, shZ - 0.001 * H), rx: 0.016 * H, rzF: 0.019 * H, rzB: 0.02 * H },
      { center: new THREE.Vector3(s * (shX - 0.001 * H), 0.816 * H, shZ), rx: 0.028 * H, rzF: 0.031 * H, rzB: 0.032 * H },
      { center: shoulder.clone(), rx: 0.036 * H, rzF: 0.039 * H, rzB: 0.04 * H },
    ]
    const armRings: LoftRing[] = [
      ...topRings,
      ...upperProfile.map((pt) => ({
        center: shoulder.clone().addScaledVector(elbow.clone().sub(shoulder), pt.t),
        rx: pt.rx * H,
        rzF: pt.rzF * H,
        rzB: pt.rzB * H,
      })),
    ]
    addGeo(loftRings(armRings, 26, 'both'))

    addGeo(
      loftRings(
        foreBase.map((pt) => ({
          center: elbow
            .clone()
            .addScaledVector(new THREE.Vector3().subVectors(elbow, wrist).normalize(), 0.008 * H)
            .lerp(wrist, pt.t),
          rx: pt.rx * H * foreScale,
          rzF: pt.rzF * H * foreScale,
          rzB: pt.rzB * H * foreScale,
        })),
        24,
        'both',
      ),
    )

    // main : paume + doigts recroquevillés, pouce
    const handDir = new THREE.Vector3().subVectors(wrist, elbow).normalize()
    const handLen = 0.097 * H
    const handStart = wrist.clone().addScaledVector(handDir, -0.005 * H)
    const inward = new THREE.Vector3(-s, 0, 0)
    const handBase = [
      { t: 0.0, rx: 0.016, rzF: 0.0175, rzB: 0.0165 },
      { t: 0.22, rx: 0.0145, rzF: 0.0245, rzB: 0.024 },
      { t: 0.55, rx: 0.014, rzF: 0.023, rzB: 0.023 },
      { t: 0.82, rx: 0.012, rzF: 0.02, rzB: 0.02 },
      { t: 1.0, rx: 0.0075, rzF: 0.013, rzB: 0.013 },
    ]
    const handRings: LoftRing[] = handBase.map((pt) => {
      const c = handStart.clone().addScaledVector(handDir, pt.t * handLen)
      c.addScaledVector(inward, 0.004 * H * smoothstep(0.2, 1, pt.t))
      const g = 0.9 + 0.1 * foreScale
      return {
        center: c,
        rx: pt.rx * H * g,
        rzF: pt.rzF * H * g,
        rzB: pt.rzB * H * g,
      }
    })
    addGeo(loftRings(handRings, 22, 'both'))

    const thumbCenter = wrist
      .clone()
      .addScaledVector(handDir, 0.024 * H)
      .add(new THREE.Vector3(-s * 0.003 * H, 0, 0.023 * H))
    const thumbDir = new THREE.Vector3(-s * 0.18, -0.72, 0.67).normalize()
    const thumb = new THREE.SphereGeometry(1, 16, 12)
    thumb.scale(0.0095 * H, 0.017 * H, 0.0105 * H)
    const tq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), thumbDir)
    thumb.applyQuaternion(tq)
    thumb.translate(thumbCenter.x, thumbCenter.y, thumbCenter.z)
    addGeo(thumb)
  }

  // ---------------------------------------------------------------- jambes
  const hip = new THREE.Vector3(0.056 * H, 0.535 * H, 0)
  const kneeX = 0.047 * H
  const kneeY = 0.287 * H
  const ankleY = 0.045 * H
  const thighTop = new THREE.Vector3(
    hip.x,
    hip.y + 0.03 * H,
    0,
  )
  const thighBase = [
    { t: 0.0, rx: 0.038, rzF: 0.043, rzB: 0.048 },
    { t: 0.12, rx: 0.046, rzF: 0.052, rzB: 0.06 },
    { t: 0.24, rx: 0.05, rzF: 0.055, rzB: 0.064 },
    { t: 0.34, rx: 0.053, rzF: 0.057, rzB: 0.062 },
    { t: 0.46, rx: 0.054, rzF: 0.057, rzB: 0.057 },
    { t: 0.58, rx: 0.051, rzF: 0.054, rzB: 0.052 },
    { t: 0.72, rx: 0.047, rzF: 0.049, rzB: 0.046 },
    { t: 0.86, rx: 0.041, rzF: 0.043, rzB: 0.04 },
    { t: 0.95, rx: 0.038, rzF: 0.04, rzB: 0.037 },
    { t: 1.0, rx: 0.035, rzF: 0.038, rzB: 0.035 },
  ]
  const thighScale = 1 + thighD * 0.2
  const calfBase = [
    { t: 0.0, rx: 0.0365, rzF: 0.036, rzB: 0.035 },
    { t: 0.055, rx: 0.0358, rzF: 0.044, rzB: 0.0355 },
    { t: 0.16, rx: 0.034, rzF: 0.035, rzB: 0.04 },
    { t: 0.4, rx: 0.03, rzF: 0.031, rzB: 0.035 },
    { t: 0.68, rx: 0.023, rzF: 0.024, rzB: 0.026 },
    { t: 0.88, rx: 0.018, rzF: 0.019, rzB: 0.02 },
    { t: 1.0, rx: 0.0165, rzF: 0.017, rzB: 0.018 },
  ]
  const calfScale = 1 + calfD * 0.2
  const footSections = [
    { z: -0.043, rx: 0.016, h: 0.018, cy: 0.02 },
    { z: -0.03, rx: 0.021, h: 0.022, cy: 0.024 },
    { z: -0.01, rx: 0.026, h: 0.024, cy: 0.026 },
    { z: 0.015, rx: 0.029, h: 0.021, cy: 0.023 },
    { z: 0.045, rx: 0.03, h: 0.016, cy: 0.018 },
    { z: 0.075, rx: 0.028, h: 0.012, cy: 0.014 },
    { z: 0.1, rx: 0.022, h: 0.009, cy: 0.011 },
    { z: 0.107, rx: 0.014, h: 0.006, cy: 0.008 },
  ]

  for (const s of [1, -1]) {
    const knee = new THREE.Vector3(s * kneeX, kneeY, 0.005 * H)
    const ankle = new THREE.Vector3(s * 0.0455 * H, ankleY, 0)
    const top = new THREE.Vector3(s * thighTop.x, thighTop.y, 0)

    addGeo(
      loftRings(
        thighBase.map((pt) => {
          const c = top.clone().lerp(knee, pt.t)
          return {
            center: c,
            rx: pt.rx * H * thighScale,
            rzF: pt.rzF * H * thighScale,
            rzB: pt.rzB * H * thighScale,
          }
        }),
        28,
        'both',
      ),
    )

    const calfTop = new THREE.Vector3(s * 0.0465 * H, 0.302 * H, 0.004 * H)
    addGeo(
      loftRings(
        calfBase.map((pt) => ({
          center: calfTop.clone().lerp(ankle, pt.t),
          rx: pt.rx * H * calfScale,
          rzF: pt.rzF * H * calfScale,
          rzB: pt.rzB * H * calfScale,
        })),
        26,
        'both',
      ),
    )

    const footRings: LoftRing[] = footSections.map((f) => ({
      center: new THREE.Vector3(
        s * 0.0455 * H + s * (f.z + 0.043) * H * 0.1,
        f.cy * H,
        f.z * H,
      ),
      rx: f.rx * H,
      rzF: f.h * H,
      rzB: f.h * H,
    }))
    addGeo(loftRings(footRings, 24, 'both'))
  }

  // ---------------------------------------------------------------- estimations
  const weight = volume * 1000 * 0.97
  const lean = weight * (1 - p.fat / 100)
  const waistSec = torso[6]
  const chestSec = torso[12]
  const thighRing = thighBase[5]
  const metrics: BodyMetrics = {
    weight,
    lean,
    waist: ellipseCirc(waistSec.rx * H, ((waistSec.rzF + waistSec.rzB) * 0.5) * H) * 100,
    chest: ellipseCirc(chestSec.rx * H, ((chestSec.rzF + chestSec.rzB) * 0.5) * H) * 100,
    arm: ellipseCirc(bicepRing.rx, bicepRing.rz) * 100,
    thigh: ellipseCirc(thighRing.rx * H * thighScale, ((thighRing.rzF + thighRing.rzB) * 0.5) * H * thighScale) * 100,
  }

  return { group, metrics }
}
