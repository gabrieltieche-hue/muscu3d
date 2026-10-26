# Muscu3D — le corps, en volume

Prototype local d'avatar masculin en 3D. Le corps n'est pas dessiné par du code
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

## Télécharger le modèle

Le bouton **Télécharger le GLB** de l'interface sert `public/statue.glb` : la
sculpture exacte affichée (profil de référence, pose, anatomie), exportée en
glTF binaire statique. Elle est aussi accessible directement sur
`/statue.glb` une fois le site déployé.

Le ficher source de la topologie est `public/body.glb` (base **MakeHuman CC0**,
modifiée à l'exécution par les cibles de morphing procédurales). `statue.glb`
est une **photo de la sculpture** : il ne contient plus de cibles de morphing,
mais il s'ouvre dans Blender, three.js, un viewer glTF ou un moteur de jeu.

Pour régénérer l'export après une modification du profil :

```bash
npm run dev
# dans un navigateur, sur la page de l'app :
#   import('/scripts/export-statue.ts').then(m => m.buildReferenceStatueGLB())
# puis écrire le résultat dans public/statue.glb
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
quel** avec le matériau argile, sans déformation ni estimation de volume.

## Interface

- Scène plein cadre, **caméra orbitale** (glisser / pincer) et vues
  **Face / Profil / Dos / 3-4** avec transition douce.
- Dock flottant : rotation automatique, maillage, socle. Raccourcis
  `1`–`4`, `R`, `M`, `S`.
- Fiche profil éditoriale : mesures estimées, développement musculaire,
  fichier 3D et téléchargement.
- **Aucun curseur mort** : le profil est figé (`src/lib/referenceProfile.ts`),
  calé sur les images de `docs/reference/`. Le moteur de morphing reste
  intact pour la suite.
- Polices **auto-hébergées** (`public/fonts`, `src/fonts.css`) : le rendu ne
  dépend d'aucun CDN.
- Adaptation mobile : scène en haut, fiche scrollable en bas.

## Rendu

- **Matière unique** : `MeshStandardMaterial` gris neutre, `roughness 0.7`,
  `metalness 0`, sans couleur de peau.
- **Lumière** : ambiance douce + clé frontale haute + deux contre-jours.
- **Fond** : gris neutre uni (`#8c8c8c`), sans ciel ni dégradé.
- **Socle** : cylindre biseauté, ombre de contact + ombres portées douces.
- **Post-traitement** : occlusion ambiante (GTAO), tone mapping ACES, MSAA,
  vignette légère et grain.

## Modèles libres utilisables

| Source | Licence | Format | Remarque |
|---|---|---|---|
| **`public/body.glb`** (dépôt) | CC0 (MakeHuman) | `.glb` | base du projet, passe par tout le moteur d'anatomie |
| **`public/statue.glb`** (dépôt) | CC0 | `.glb` 2,6 Mo | sculpture figée exportée, prête à télécharger |
| [MakeHuman](https://static.makehumancommunity.org/makehuman.html) + [MPFB](https://static.makehumancommunity.org/mpfb.html) | assets CC0 | export `.obj` / `.fbx`, puis `.glb` | la base du projet ; permet de régler le corps |
| [Blender Studio — Human Base Meshes](https://www.blender.org/download/demo-files/) | CC0 | `.blend` → export `.glb` | anatomie propre, à sculpter / poser dans Blender |
| [Innerscene — male base mesh](https://www.innerscene.com/tools/library/3d-parts/male-base-mesh-3d-person-rigged-a-pose-380e6d89) | CC0 | `.glb` 4,3 Mo, 109k triangles, riggé | fichier prêt à déposer, mais base **neutre en A-pose** |
| [Sketchfab — modèles anatomiques](https://sketchfab.com/3d-models/male-base-muscular-anatomy-0954aa04666d45aab9633009318f7b66) | CC-BY (compte requis) | glTF | plus proche d'un écorché ; conserver l'attribution |

Il n'existe pas de GLB gratuit « bodybuilder parfait » sans compte : les images
de `docs/reference/` sont des rendus **MakeHuman/MPFB** avec cibles musculaires.
Le corps du dépôt est déjà la meilleure approximation libre de cette famille.

## Déploiement

Build statique Vite (`dist/`), aucun serveur Node en production.

### Vercel

`vercel.json` fixe le framework, le build et les en-têtes de cache.

```bash
npx vercel --prod          # après connexion au compte Vercel
```

Ou importer le dépôt GitHub dans Vercel : framework **Vite** détecté,
build `npm run build`, sortie `dist`.

### Freebuff Sites

Le manifeste `site.json` et le Worker statique `deploy/worker.js` servent le
même build. L'identifiant du projet est dans `deploy/site-id.txt`.

## Architecture

```
src/
  App.tsx                    interface, chargement, contrôles, fiche profil
  scene/viewer.ts            scène Three.js : fond, lumières, socle, GTAO, caméra
  lib/referenceProfile.ts    profil figé, partagé par l'UI et l'export GLB
  lib/base/model.ts          chargement glTF (modele.glb / body.glb), cache, repères
  lib/statue.ts              modèle externe : argile, centrage, échelle, sol
  lib/body.ts                moteur de morphing / anatomie du modèle de référence
  lib/base/*                 subdivision, pose, détails, visage, bump, cibles CC0
  fonts.css                  @font-face auto-hébergées
scripts/
  export-statue.ts           export navigateur de la sculpture en GLB
public/
  body.glb                   base MakeHuman CC0 (moteur complet)
  statue.glb                 sculpture figée téléchargeable
  fonts/                     Inter + Instrument Serif (.woff2)
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
