import * as THREE from 'three'

/**
 * Détails du visage : globes oculaires, iris, pupilles.
 *
 * Le mesh MakeHuman de base est fermé : les paupières sont soudées et le
 * globe oculaire n'existe pas. On ne peut pas ouvrir un trou proprement
 * (le bord serait visible), on procède donc comme un sculpteur :
 *
 *   - la zone de l'œil est bombée en globe (déformation, cf. details.ts) ;
 *   - l'iris est un ANNEAU sphérique posé en très léger relief sur le
 *     globe (comme un iris sculpté et creusé dans la masse) ;
 *   - la pupille est un calotte sphérique légèrement ENCAISSÉE dans
 *     l'iris, ce qui donne le creux sombre caractéristique.
 *
 * Repères disponibles dans le mesh de base (CC0) :
 *   l-eye / r-eye        : centre du globe
 *   l-eye-target         : point regardé (direction du regard)
 *   l-upperlid/l-lowerlid: lignes des paupières
 */

export interface EyeDetail {
  /** anneau de l'iris */
  iris: THREE.BufferGeometry
  /** calotte de la pupille */
  pupil: THREE.BufferGeometry
}

interface MeshBuilder {
  pos: number[]
  idx: number[]
}

/**
 * Calotte / anneau sphérique autour d'un axe.
 * `angInner` > 0 produit un anneau (utilisé pour l'iris).
 */
function addSphericalCap(
  mb: MeshBuilder,
  center: THREE.Vector3,
  radius: number,
  axis: THREE.Vector3,
  angInner: number,
  angOuter: number,
  segU = 32,
  segV = 8,
) {
  const base = mb.pos.length / 3
  const z = axis.clone().normalize()
  const x = new THREE.Vector3(0, 1, 0)
  if (Math.abs(z.y) > 0.9) x.set(1, 0, 0)
  const e1 = new THREE.Vector3().crossVectors(z, x).normalize()
  const e2 = new THREE.Vector3().crossVectors(z, e1).normalize()
  const v = new THREE.Vector3()
  for (let j = 0; j <= segV; j++) {
    const a = angInner + ((angOuter - angInner) * j) / segV
    const sa = Math.sin(a)
    const ca = Math.cos(a)
    for (let i = 0; i <= segU; i++) {
      const t = (i / segU) * Math.PI * 2
      v.copy(z).multiplyScalar(ca)
      v.addScaledVector(e1, sa * Math.cos(t))
      v.addScaledVector(e2, sa * Math.sin(t))
      mb.pos.push(center.x + v.x * radius, center.y + v.y * radius, center.z + v.z * radius)
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

function toGeometry(mb: MeshBuilder): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(mb.pos), 3))
  geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mb.idx), 1))
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  return geo
}

/**
 * Construit les iris et pupilles des deux yeux.
 * @param joints   repères (normalisés)
 * @param H        taille du corps en mètres
 * @param radius   rayon du globe oculaire (normalisé)
 */
export function buildEyeDetails(
  joints: Record<string, THREE.Vector3>,
  H: number,
  radius: number,
): EyeDetail | null {
  const eye = joints['l-eye']
  const target = joints['l-eye-target']
  if (!eye || !target) return null

  const irisMb: MeshBuilder = { pos: [], idx: [] }
  const pupilMb: MeshBuilder = { pos: [], idx: [] }

  for (const side of ['l', 'r'] as const) {
    const c = joints[`${side}-eye`]
    const t = joints[`${side}-eye-target`]
    if (!c || !t) continue
    const center = new THREE.Vector3(c.x * H, c.y * H, c.z * H)
    const gaze = new THREE.Vector3(t.x - c.x, t.y - c.y, t.z - c.z).normalize()

    // l'iris : anneau de 11° à 30° (Ø 12 mm sur un globe de 24 mm)
    addSphericalCap(irisMb, center, radius * H + 0.00045, gaze, 0.19, 0.52)
    // la pupille : calotte de 11°, légèrement encaissée
    addSphericalCap(pupilMb, center, radius * H + 0.00012, gaze, 0, 0.2, 24, 6)
  }

  if (!irisMb.pos.length) return null
  return { iris: toGeometry(irisMb), pupil: toGeometry(pupilMb) }
}

/** Matériau de l'iris : gris moyen, plus poli que la peau (sclère mate). */
export const IRIS_MAT = new THREE.MeshStandardMaterial({
  color: 0x6e6a64,
  roughness: 0.45,
  metalness: 0,
  envMapIntensity: 1.0,
})

/** Matériau de la pupille : presque noir, très lisse (c'est un creux). */
export const PUPIL_MAT = new THREE.MeshStandardMaterial({
  color: 0x1a1917,
  roughness: 0.28,
  metalness: 0,
  envMapIntensity: 1.1,
})
