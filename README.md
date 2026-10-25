# Muscu3D — statue 3D studio

Prototype local d'avatar masculin en 3D. Le corps n'est plus dessiné par du code
(cylindres/ellipses) : c'est un **fichier modèle glTF** chargé avec `GLTFLoader`,
affiché comme une **sculpture d'argile grise** dans une scène de studio.

Aucun compte, aucun backend : React + Three.js, tout tourne dans le navigateur.

## Lancer

```bash
npm install
npm run dev
```

Puis ouvrir <http://127.0.0.1:5173>.

```bash
npm run typecheck   # TypeScript strict, aucun emit
npm run build       # build de production dans dist/
npm run preview     # sert le build sur http://127.0.0.1:4173
```

## Utiliser un autre modèle 3D

1. Télécharger un corps masculin au format **`.glb`** (ou `.gltf`).
2. Le déposer dans `public/` sous le nom **`modele.glb`** (ou `modele.gltf`).
3. Recharger la page : le fichier est chargé automatiquement, centré, mis à
   l'échelle (1,75 m) et posé sur le socle.

Ordre de chargement : `modele.glb` → `modele.gltf` → `body.glb`.
`?model=autre.glb` force un fichier précis.

Le modèle de référence `body.glb` (base MakeHuman CC0) est le seul à posséder
les repères anatomiques et les cibles de morphing : il passe par le moteur
complet (pose, subdivision, anatomie). Un fichier externe est affiché **tel
quel** avec le matériau argile, sans déformation.

Pour un modèle externe riggé ou dans une autre pose, il faut le préparer dans
Blender (ou utiliser `scripts/import-body.py`) avant de le déposer.

## Rendu

- **Matière unique** : `MeshStandardMaterial` gris neutre, `roughness 0.7`,
  `metalness 0`, sans couleur de peau. C'est l'option « argile » ; un matcap
  n'est pas nécessaire et dépendrait d'une texture supplémentaire.
- **Lumière** : ambiance douce + clé frontale haute (modelé des pectoraux et
  des abdos) + deux contre-jours (liseré sur les épaules, le dos et les bras).
- **Fond** : gris neutre uni (`#8c8c8c`), sans ciel ni dégradé.
- **Socle** : cylindre biseauté, ombre de contact + ombres portées douces.
- **Post-traitement** : occlusion ambiante (GTAO), tone mapping ACES, MSAA,
  vignette légère et grain.

## Interface

- Caméra orbitale (glisser / pincer) et vues **Face / Profil / Dos / 3-4**.
- Rotation automatique, affichage filaire (modèle de référence uniquement).
- **Modèle figé** : les curseurs et les profils types sont volontairement
  désactivés. La morphologie affichée est un profil de référence fixe
  (`FIXED_PARAMS` dans `src/App.tsx`), calé sur les images de
  `docs/reference/`. La logique de morphing reste intacte pour la suite.

## Modèles gratuits utilisables

| Source | Licence | Format | Remarque |
|---|---|---|---|
| [MakeHuman](https://static.makehumancommunity.org/makehuman.html) + [MPFB](https://static.makehumancommunity.org/mpfb.html) | assets CC0 | export `.obj` / `.fbx`, puis `.glb` via Blender | la base du projet ; permet de régler le corps et d'exporter |
| [Blender Studio — Human Base Meshes](https://www.blender.org/download/demo-files/) | CC0 | `.blend` → export `.glb` | anatomie propre, à sculpter / poser dans Blender |
| [Innerscene — male base mesh](https://www.innerscene.com/tools/library/3d-parts/male-base-mesh-3d-person-rigged-a-pose-380e6d89) | CC0 | `.glb` 4,3 Mo, 109k triangles, riggé | fichier prêt à déposer, mais base **neutre en A-pose** (pas bodybuildé) |
| [Sketchfab — Anatomy study male body](https://sketchfab.com/3d-models/anatomy-study-basemesh-human-male-body-6ef6e7c0c2e741e6b8514b09035a0dd3) | CC-BY (compte requis) | glTF | plus proche d'une sculpture anatomique ; conserver l'attribution |
| [Free3D — Male Base Mesh](https://www.free3d.com/3d-model/male-base-mesh-6682.html) | à vérifier sur la fiche | `.obj` | téléchargement manuel depuis un navigateur (le site bloque les robots) |

Le rendu des images de `docs/reference/` correspond à un corps **MakeHuman
musclé et posé**, pas à un base mesh neutre : pour s'en approcher, il faut
poser/sculpter le modèle dans Blender, ou utiliser le corps de référence déjà
inclus (`body.glb`).

## Déploiement

Le site est un build Vite statique servi par un Worker minimal
(`deploy/worker.js`, manifeste `site.json`) sur Freebuff Sites.

```bash
npm run build
# puis déployer le manifeste site.json avec l'outil Sites
```

L'identifiant du projet Sites est conservé dans `deploy/site-id.txt`.

## Architecture

```
src/
  App.tsx              interface, chargement, profil figé
  scene/viewer.ts      scène Three.js : fond gris, lumières, socle, GTAO, caméra
  lib/base/model.ts    chargement glTF (modele.glb / body.glb), cache, repères
  lib/statue.ts        modèle externe : matériau argile, centrage, échelle, sol
  lib/body.ts          moteur de morphing / anatomie du modèle de référence
  lib/base/*           subdivision, pose, détails, visage, bump, cibles CC0
```

## Limites assumées

- Le poids et les mensurations sont **estimés** à partir du volume du maillage,
  pas mesurés.
- Un modèle externe n'a ni cibles de morphing ni repères anatomiques : il est
  affiché tel quel (pose incluse).
- La finesse d'un sculpt ZBrush n'est pas atteinte ; l'objectif est la même
  famille visuelle (sculpture grise, anatomie lisible, socle de studio).
- Pas encore de programme d'entraînement, de nutrition ni de timeline
  bimensuelle.
