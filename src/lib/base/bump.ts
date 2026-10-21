import * as THREE from 'three'

/**
 * Bump map procédurale pour les abdominaux.
 *
 * Le maillage ne fait que ~13 000 sommets : un bloc d'abdominaux fait 4 × 3,5 cm
 * et n'est donc représenté que par 3 × 2,7 sommets. Impossible d'y graver un
 * 8-pack net par la géométrie — les rainures se noient et les muscles paraissent
 * en creux.
 *
 * On porte donc le relief fin dans la **couleur de normale**, calculée dans le
 * fragment shader à partir d'une texture de gradient (champ analytique
 * échantillonné en 256 × 256 sur la zone abdominale). Le champ étant
 * lisse, l'échantillonnage bilinéaire ne produit aucun aliasing : les
 * séparations restent nettes à n'importe quel zoom, comme sur la sculpture
 * de référence.
 *
 * La texture stocke le gradient du champ de déplacement (dx, dy) en
 * unités normalisées (1 = hauteur du corps). Le shader le transforme en
 * perturbation de normale en espace objet, puis en espace vue.
 */

export interface BumpField {
  /** rectangles couvrants (normalisé) */
  minX: number
  maxX: number
  minY: number
  maxY: number
  /** liste de gaussiennes : amplitude, centre, rayons, rotation */
  bumps: Array<{ a: number; cx: number; cy: number; rx: number; ry: number; rot: number }>
  /** rainures (amplitude négative) */
  grooves: Array<{ a: number; cx: number; cy: number; rx: number; ry: number; rot: number }>
}

const GROOVE_W = 0.0085

/** Champ abdominal : blocs en relief + sillons entre eux. */
export function absField(): BumpField {
  const bumps: BumpField['bumps'] = []
  const grooves: BumpField['grooves'] = []

  // 4 rangées de 2 blocs (nombril mesuré à y ≈ 0,605)
  for (const y of [0.563, 0.599, 0.635, 0.671]) {
    for (const sx of [-1, 1]) {
      bumps.push({ a: 0.0048, cx: sx * 0.026, cy: y, rx: 0.0215, ry: 0.0165, rot: 0 })
    }
  }
  // sillons horizontaux
  for (const y of [0.581, 0.617, 0.653]) {
    grooves.push({ a: -0.0042, cx: 0, cy: y, rx: 0.046, ry: GROOVE_W, rot: 0 })
  }
  // sillons verticaux (entre les deux colonnes)
  for (const sx of [-1, 1]) {
    grooves.push({ a: -0.0034, cx: sx * 0.026, cy: 0.617, rx: GROOVE_W, ry: 0.058, rot: 0 })
  }
  // ligne blanche
  grooves.push({ a: -0.0032, cx: 0, cy: 0.617, rx: GROOVE_W, ry: 0.062, rot: 0 })
  // obliques
  for (const sx of [-1, 1]) {
    bumps.push({ a: 0.0032, cx: sx * 0.072, cy: 0.648, rx: 0.024, ry: 0.055, rot: sx * 0.42 })
  }
  // dents du serratus
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      bumps.push({ a: 0.0026, cx: sx * (0.072 + k * 0.004), cy: 0.686 - k * 0.021, rx: 0.016, ry: 0.009, rot: 0 })
    }
  }
  return { minX: -0.13, maxX: 0.13, minY: 0.5, maxY: 0.76, bumps, grooves }
}

function gauss(
  x: number,
  y: number,
  g: { a: number; cx: number; cy: number; rx: number; ry: number; rot: number },
): number {
  const dx = x - g.cx
  const dy = y - g.cy
  let rx = dx
  let ry = dy
  if (g.rot) {
    const ca = Math.cos(g.rot)
    const sa = Math.sin(g.rot)
    rx = dx * ca + dy * sa
    ry = -dx * sa + dy * ca
  }
  const q = (rx / g.rx) ** 2 + (ry / g.ry) ** 2
  if (q > 9) return 0
  return g.a * Math.exp(-q)
}

function fieldValue(f: BumpField, x: number, y: number): number {
  let v = 0
  for (const g of f.bumps) v += gauss(x, y, g)
  for (const g of f.grooves) v += gauss(x, y, g)
  return v
}

/**
 * Construit la texture de gradient (RGBA float).
 * R = dF/dx, G = dF/dy, B = le champ lui-même (utile pour d'autres effets).
 */
export function buildBumpTexture(f: BumpField, res = 256): THREE.DataTexture {
  const data = new Float32Array(res * res * 4)
  const dx = (f.maxX - f.minX) / (res - 1)
  const dy = (f.maxY - f.minY) / (res - 1)
  const e = Math.min(dx, dy) * 0.5
  for (let j = 0; j < res; j++) {
    const y = f.minY + j * dy
    for (let i = 0; i < res; i++) {
      const x = f.minX + i * dx
      const gx = (fieldValue(f, x + e, y) - fieldValue(f, x - e, y)) / (2 * e)
      const gy = (fieldValue(f, x, y + e) - fieldValue(f, x, y - e)) / (2 * e)
      const o = (j * res + i) * 4
      data[o] = gx
      data[o + 1] = gy
      data[o + 2] = fieldValue(f, x, y)
      data[o + 3] = 1
    }
  }
  const tex = new THREE.DataTexture(data, res, res, THREE.RGBAFormat, THREE.FloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  return tex
}

/** Uniformes partagés : la hauteur du corps change l'échelle du motif. */
export const bumpUniforms = {
  uBumpTex: { value: null as THREE.Texture | null },
  uBumpRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uBumpInvH: { value: 1 },
  uBumpStrength: { value: 0.55 },
  /** force du grain de cuir rasé (0 = désactivé) */
  uStubble: { value: 0.0 },
  /** hauteur (normalisée) à partir de laquelle le grain s'applique */
  uStubbleY: { value: 0.9 },
}

/**
 * Branche la perturbation de normale dans le shader d'un matériau standard.
 * La normale géométrique est Penwick-tiltée par le gradient du champ.
 *
 * S'y ajoute un **grain de cuir rasé** : bruit procédural en espace objet,
 * appliqué sur le crâne au-dessus de `uStubbleY`. C'est ce qui donne à la
 * tête l'aspect « crâne rasé » de la sculpture de référence, au lieu d'une
 * calotte lisse de mannequin.
 */
export function applyBumpShader(material: THREE.Material, field: BumpField, tex: THREE.Texture) {
  bumpUniforms.uBumpTex.value = tex
  bumpUniforms.uBumpRect.value.set(field.minX, field.minY, field.maxX - field.minX, field.maxY - field.minY)
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBumpTex = bumpUniforms.uBumpTex
    shader.uniforms.uBumpRect = bumpUniforms.uBumpRect
    shader.uniforms.uBumpInvH = bumpUniforms.uBumpInvH
    shader.uniforms.uBumpStrength = bumpUniforms.uBumpStrength
    shader.uniforms.uStubble = bumpUniforms.uStubble
    shader.uniforms.uStubbleY = bumpUniforms.uStubbleY
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vBumpXY;
        varying vec3 vBumpPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBumpXY = position.xy;
        vBumpPos = position;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uBumpTex;
        uniform vec4 uBumpRect;
        uniform float uBumpInvH;
        uniform float uBumpStrength;
        uniform float uStubble;
        uniform float uStubbleY;
        varying vec2 vBumpXY;
        varying vec3 vBumpPos;

        float mHash31(vec3 p) {
          p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }
        float mNoise(vec3 x) {
          vec3 i = floor(x);
          vec3 f = fract(x);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(mHash31(i), mHash31(i + vec3(1,0,0)), f.x),
                mix(mHash31(i + vec3(0,1,0)), mHash31(i + vec3(1,1,0)), f.x), f.y),
            mix(mix(mHash31(i + vec3(0,0,1)), mHash31(i + vec3(1,0,1)), f.x),
                mix(mHash31(i + vec3(0,1,1)), mHash31(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          vec2 p = vBumpXY * uBumpInvH;
          vec2 uvB = (p - uBumpRect.xy) / uBumpRect.zw;
          if (uvB.x > 0.0 && uvB.x < 1.0 && uvB.y > 0.0 && uvB.y < 1.0) {
            vec2 g = texture2D(uBumpTex, uvB).rg;
            // le gradient est en unités normalisées : on le ramène en mètres
            vec3 gObj = vec3(g.x, g.y, 0.0) / max(uBumpInvH, 1e-4);
            vec3 gView = (viewMatrix * vec4(gObj, 0.0)).xyz;
            // fondu sur les bords de la zone pour éviter la coupure nette
            vec2 fade = smoothstep(vec2(0.0), vec2(0.09), uvB) *
                        (1.0 - smoothstep(vec2(0.91), vec2(1.0), uvB));
            float f = fade.x * fade.y;
            normal = normalize(normal - gView * uBumpStrength * f);
          }
          // --- grain de cuir rasé (crâne) ---
          if (uStubble > 0.0) {
            vec3 sp = vBumpPos * uBumpInvH;
            float gate = smoothstep(uStubbleY, uStubbleY + 0.02, sp.y);
            if (gate > 0.0) {
              float e = 0.0011;
              float f0 = mNoise(sp * 700.0);
              float fx = mNoise((sp + vec3(e, 0.0, 0.0)) * 700.0);
              float fy = mNoise((sp + vec3(0.0, e, 0.0)) * 700.0);
              vec2 g = vec2(fx - f0, fy - f0) / e;
              vec3 gObj = vec3(g.x, g.y, 0.0) / max(uBumpInvH, 1e-4);
              vec3 gView = (viewMatrix * vec4(gObj, 0.0)).xyz;
              normal = normalize(normal - gView * uStubble * gate * 0.0016);
            }
          }
        }`,
      )
  }
  material.needsUpdate = true
}
