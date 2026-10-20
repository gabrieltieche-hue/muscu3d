/**
 * Calibration : volume, poids et mensurations pour différents jeux de paramètres.
 * Usage : npx tsx scripts/calibrate.ts
 */
import { buildBodyGeometry, DEFAULT_PARAMS, PRESETS, type BodyParams } from '../src/lib/body'

const neutral: BodyParams = { ...DEFAULT_PARAMS, fat: 12, belly: 25, neck: 50, shoulders: 50, lats: 50, pecs: 50, abs: 50, glutes: 50, thighs: 50, calves: 50, arms: 50, forearms: 50 }

const cases: Array<[string, BodyParams]> = [
  ['neutre (mesh brut)', neutral],
  ['defaut', { ...DEFAULT_PARAMS }],
  ['sec', { ...DEFAULT_PARAMS, ...PRESETS.sec }],
  ['athletique', { ...DEFAULT_PARAMS, ...PRESETS.athletique }],
  ['bodybuilder', { ...DEFAULT_PARAMS, ...PRESETS.bodybuilder }],
  ['massif', { ...DEFAULT_PARAMS, ...PRESETS.massif }],
  ['gros (fat 40 / ventre 100)', { ...DEFAULT_PARAMS, fat: 40, belly: 100 }],
  ['maigre (fat 6)', { ...DEFAULT_PARAMS, fat: 6, belly: 8 }],
  ['grand (190)', { ...DEFAULT_PARAMS, height: 190 }],
  ['petit (160)', { ...DEFAULT_PARAMS, height: 160 }],
]

console.log(
  ['cas'.padEnd(26), 'poids', 'maigre', 'taille', 'poitrine', 'bras', 'cuisse'].map((s) => s.padStart(9)).join(''),
)
for (const [name, p] of cases) {
  const { metrics } = buildBodyGeometry(p)
  console.log(
    name.padEnd(26) +
      [metrics.weight, metrics.lean, metrics.waist, metrics.chest, metrics.arm, metrics.thigh]
        .map((v) => v.toFixed(1).padStart(9))
        .join(''),
  )
}
