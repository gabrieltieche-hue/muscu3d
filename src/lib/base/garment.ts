import * as THREE from 'three'

/**
 * Boxer brief (slip) : coque de tissu construite par décalage de la peau.
 *
 * On duplique la surface de la région hanches/cuisses, on la décolle de
 * 9 mm le long des normales et on referme le bord par les triangles de
 * transition (l'équivalent de l'épaisseur d'un tissu). Le tout est dans la
 * même matière que la peau, légèrement assombri : sur les images de
 * référence le boxer est ton chair, pas une bande noire.
 *
 * Découpe : ceinture haute (niveau du nombril),[{2}] jambe coupée à mi-cuisse.
 */

export interface GarmentOptions {
  /** hauteur de la ceinture (normalisée) */
  waist: number
  /** hauteur de l'ourlet de cuisse (normalisée) */
  hem: number
  /** épaisseur du tissu (normalisée) */
  thickness: number
  /** couleur du tissu */
  color: number
  /** assombrissement de la ceinture et des ourlets */
  bandShade: number
}

export const DEFAULT_GARMENT: GarmentOptions = {
  waist: 0.556,
  hem: 0.428,
  thickness: 0.009,
  color: 0xb2afa9,
  bandShade: 0.86,
}

/**
 * @param positions positions du corps (mètres, à l'échelle réelle)
 * @param normals   normales du corps
 * @param indices   index du corps
 * @param masks     masques de la peau (pour écarter les bras)
 */
export function buildGarment(
  positions: Float32Array,
  normals: Float32Array,
  indices: Uint16Array,
  masks: { fore: Float32Array; arm: Float32Array },
  H: number,
  opts: GarmentOptions = DEFAULT_GARMENT,
): THREE.BufferGeometry | null {
  const n = positions.length / 3
  const inside = new Uint8Array(n)
  const fade = new Float32Array(n)

  for (let i = 0; i < n; i++) {
    const y = positions[i * 3 + 1] / H
    if (y > opts.waist || y < opts.hem) continue
    // les bras/avant-bras passent à la même hauteur : on les exclut
    if (masks.fore[i] > 0.12 || masks.arm[i] > 0.12) continue
    inside[i] = 1
    // fondu doux sur 6 mm : le bord du tissu reste lisible sans bavure
    fade[i] =
      Math.min(
        1,
        Math.max(0, (y - opts.hem) / 0.006),
        Math.max(0, (opts.waist - y) / 0.006),
      )
    fade[i] = fade[i] * fade[i] * (3 - 2 * fade[i])
  }

  const kept: number[] = []
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t]
    const b = indices[t + 1]
    const c = indices[t + 2]
    if (!inside[a] && !inside[b] && !inside[c]) continue
    kept.push(a, b, c)
  }
  if (!kept.length) return null

  const pos = new Float32Array(positions.length)
  const col = new Float32Array(positions.length)
  const nrm = new Float32Array(normals.length)
  const skin = new THREE.Color(0xc2bfba)
  const cloth = new THREE.Color(opts.color)
  const tmp = new THREE.Color()

  for (let i = 0; i < n; i++) {
    const o = inside[i] ? opts.thickness * (0.35 + 0.65 * fade[i]) : 0
    pos[i * 3] = positions[i * 3] + normals[i * 3] * o
    pos[i * 3 + 1] = positions[i * 3 + 1] + normals[i * 3 + 1] * o
    pos[i * 3 + 2] = positions[i * 3 + 2] + normals[i * 3 + 2] * o
    nrm[i * 3] = normals[i * 3]
    nrm[i * 3 + 1] = normals[i * 3 + 1]
    nrm[i * 3 + 2] = normals[i * 3 + 2]

    if (!inside[i]) {
      tmp.copy(skin)
    } else {
      const y = positions[i * 3 + 1] / H
      const x = positions[i * 3] / H
      tmp.copy(cloth)
      // ceinture élastique (haut) et ourlet de cuisse (bas)
      const band = Math.max(
        1 - Math.min(1, Math.max(0, (opts.waist - 0.02 - y) / 0.012)),
        1 - Math.min(1, Math.max(0, (y - opts.hem) / 0.012)),
      )
      tmp.multiplyScalar(1 - (1 - opts.bandShade) * band)
      // couture de la fermeture devant (fly)
      const fly = 1 - Math.min(1, Math.max(0, (Math.abs(x) - 0.004) / 0.006))
      if (fly > 0 && positions[i * 3 + 2] > 0.02) tmp.multiplyScalar(1 - 0.12 * fly)
    }
    col[i * 3] = tmp.r
    col[i * 3 + 1] = tmp.g
    col[i * 3 + 2] = tmp.b
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
  geo.setIndex(new THREE.BufferAttribute(new Uint16Array(kept), 1))
  geo.computeBoundingSphere()
  return geo
}
