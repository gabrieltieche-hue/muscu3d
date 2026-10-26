/**
 * Export de la sculpture de référence en GLB statique.
 *
 * Le corps affiché est construit à l'exécution (morphing MakeHuman + pose +
 * subdivision + anatomie). Ce module rejoue la même construction puis
 * sérialise le groupe avec `GLTFExporter` : le fichier obtenu est exactement
 * la statue vue dans l'application, sans dépendance au moteur de morphing.
 *
 * Il est appelé depuis un navigateur (Vite + Chromium headless), pas depuis
 * Node : les textures procédurales ont besoin d'un canvas.
 *
 *   import('/scripts/export-statue.ts').then(m => m.buildReferenceStatueGLB())
 *
 * Le résultat est écrit dans `public/statue.glb` (voir README).
 */
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { loadBodyModel } from '../src/lib/base/model'
import { buildBody } from '../src/lib/body'
import { FIXED_PARAMS } from '../src/lib/referenceProfile'

export async function buildReferenceStatueGLB(): Promise<ArrayBuffer> {
  await loadBodyModel()

  const { group } = buildBody(FIXED_PARAMS)
  group.name = 'muscu3d-reference'

  // Le maillage filaire est un doublon de la géométrie : on ne l'exporte pas.
  group.traverse((o) => {
    if (o.userData.isWire) o.visible = false
  })
  group.updateMatrixWorld(true)

  const exporter = new GLTFExporter()
  const result = await exporter.parseAsync(group, {
    binary: true,
    onlyVisible: true,
  })

  if (!(result instanceof ArrayBuffer)) {
    throw new Error('export GLB binaire attendu')
  }
  return result
}
