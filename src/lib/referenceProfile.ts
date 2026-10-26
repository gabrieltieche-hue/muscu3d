import { DEFAULT_PARAMS, type BodyParams } from './body'

/**
 * Profil de référence FIGÉ.
 *
 * La statue affichée est toujours ce profil, calé sur les images de
 * `docs/reference/`. Le projet ne modifie plus la géométrie en direct : le
 * fichier 3D est la source de vérité de la morphologie.
 *
 * Ce module est partagé par l'interface et par l'export GLB
 * (`scripts/export-statue.ts`), pour qu'il n'existe qu'une seule définition
 * du profil.
 */
export const FIXED_PARAMS: BodyParams = {
  ...DEFAULT_PARAMS,
  fat: 10,
  belly: 12,
  neck: 74,
  shoulders: 96,
  lats: 94,
  pecs: 88,
  abs: 84,
  glutes: 64,
  thighs: 72,
  calves: 74,
  arms: 84,
  forearms: 68,
}
