# AGENTS.md — Muscu3D : contexte complet (fichier de passation)

> Ce fichier est destiné au **prochain agent IA** qui reprend le projet.
> Il contient : le but du produit, l'état exact du code, ce qui a été fait, les bugs
> connus et vérifiés, les pistes validées, et les recettes de l'environnement.
> Dernière mise à jour : **2026-10-27 (session 6)**.
> La session 3 a basculé le projet sur l'architecture **« modèle 3D en fichier »** :
> le corps est un `.glb` chargé par `GLTFLoader`, plus une sculpture procédurale.
> La session 4 a figé le modèle et poussé le rendu studio (fond uni, argile mate,
> contre-jours, socle large, interface verrouillée) : lire **§1bis**, **§3.6** puis
> **§3.7** avant de toucher au code.
> La session 5 a refondu l'interface (galerie sombre, dock de vues, fiche profil),
> exporté la sculpture en `public/statue.glb` et préparé le déploiement Vercel :
> lire **§3.8**.
> Langue de travail du projet : **français** (UI, code commenté, réponses).

---

## 0. CONSIGNE EN COURS DE L'UTILISATEUR (2026-10-21)

> **« Je veux passer sur cette stratégie »** — la méthode standard et la plus performante
> pour afficher un modèle corporel 3D interactif : **on charge un fichier modèle 3D**
> (`.gltf` / `.glb` / `.obj`) dans la page, on configure des lumières (l'effet « ombre
> grise studio »), et l'utilisateur tourne autour avec la souris. Le code ne doit pas
> « dessiner le corps muscle par muscle à partir de rien ».

> **Modèles cités par l'utilisateur** :
> - `https://free3d.com/3d-model/male-base-mesh-6682.html` (base mesh masculine)
> - `https://www.sloyd.ai/fr/3d-human-model-generator` (générateur de corps humain)
>
> ⚠️ **free3d renvoie 403 à tous les robots** (protection Cloudflare) : le téléchargement
> doit être fait **à la main depuis un navigateur**, puis le fichier déposé dans
> `scripts/assets/`.

Ordre de travail convenu :

1. **Modèle 3D en fichier** → `public/body.glb`, chargé par `GLTFLoader` — **FAIT**
   (voir §3.6). L'import d'un modèle externe est prêt (§5.2).
2. **L'utilisateur télécharge un modèle** (sloyd / free3d) et le dépose dans
   `scripts/assets/` → je l'importe, je vérifie les repères (`?joints=1`), je compare.
3. **Rendu studio** (ombres, AO, tone mapping, socle) — **FAIT**.
4. **Anatomie / morphing** : le morphing MakeHuman (cibles CC0) ne s'applique qu'à la
   base MakeHuman ; sur un autre modèle, seul le morphing procédural joue.

**Décisions prises par l'utilisateur (elles priment sur le §1bis si elles le contredisent) :**
- **Pas de boxer** : le modèle montre le corps nu. (Un module `garment.ts` existe mais
  n'est plus branché — à réactiver seulement sur demande explicite.)
- **Génitaux présents**, un seul modèle pour tous les corps (masculin).
- Le reste du goal visuel (sculpture grise, socle, silhouette masculine, anatomie
  lisible) est inchangé.

---

## 1. Le produit (pourquoi ce dépôt existe)

Application web **locale, mono-utilisateur, en français** qui :

1. modélise le corps de l'utilisateur en **3D stylisée** (pas de photo, pas de scan) ;
2. permet de fixer un **corps objectif** ;
3. génère un **programme d'entraînement + nutrition** adapté ;
4. suit l'évolution **toutes les deux semaines** avec un avant/après 3D.

### Contraintes non négociables

- **Budget zéro** : pas d'API payante, pas de GPU loué, pas de carte bancaire.
- **Pas de backend, pas de compte, pas de paiement.** Persistance = `localStorage`.
- **Aucune photo de l'utilisateur.** L'avatar est un maillage paramétrique.
- Doit servir **débutants ET confirmés**.
- L'utilisateur choisit son **matériel** (salle / maison / rien) et son **horizon**.
- **Honnêteté** : la prédiction à 6 mois a un budget d'erreur assumé de ±4 à 8 kg.

### Décisions produit déjà arbitrées

- Trois modes : **« Réel »**, **« Scénario »** et **« Objectif »**.
- Les abdos ne sont pas un slider : ils émergent de **% de masse grasse + développement
  abdominal**.
- `BodyParams` (le vecteur corporel) est **la source de vérité**. Le maillage n'est
  qu'une projection visuelle de ce vecteur.
- Pas d'IA/LLM pour le MVP : simulation déterministe + règles.

### Verdict utilisateur sur la v1 (à l'origine du pivot)

> « trop géométrique, trop moche, pas assez réaliste du tout »

Conséquence : **la qualité visuelle du corps 3D est la priorité n°1**.

---

## 1bis. GOAL VISUEL — spécification de la référence (à respecter)

Les 8 images de `docs/reference/` sont **la cible unique** fournie par l'utilisateur
(« voilà le goal visuel clair et établi »). Ce sont très probablement des rendus
**MakeHuman / MPFB** (même maille de base, même socle, même matière grise) : la cible
est donc atteignable avec un **mesh de base MakeHuman + les cibles CC0**, ou avec
n'importe quel modèle de corps de qualité équivalente.

**Chemins absolus** (les ouvrir avant de coder) :

```
/root/muscu3d/docs/reference/ref-01-dos.jpg
/root/muscu3d/docs/reference/ref-02-face-piedestal.jpg
/root/muscu3d/docs/reference/ref-03-troisquarts-athletique.jpg
/root/muscu3d/docs/reference/ref-04-hero-contre-plongee.jpg
/root/muscu3d/docs/reference/ref-05-troisquarts-surpoids-barbe.jpg
/root/muscu3d/docs/reference/ref-06-plongee-muscle.jpg
/root/muscu3d/docs/reference/ref-07-troisquarts-athletique.jpg
/root/muscu3d/docs/reference/ref-08-troisquarts-athletique.jpg
```

### Vue par vue

| fichier | vue | ce qu'elle montre |
|---|---|---|
| `ref-01-dos.jpg` | dos | trapèzes, rhomboides, grand dorsal en V, érecteurs, fessiers sous le boxer, triceps/avant-bras, crâne rasé |
| `ref-02-face-piedestal.jpg` | face entière | homme athlétique sec, boxer, **pieds nus à plat sur le socle**, mains le long du corps |
| `ref-03` / `ref-07` / `ref-08` | 3/4 | pectoraux séparés, 8 abdos + obliques + serratus, deltoïdes, biceps/triceps, quadriceps, tibial |
| `ref-04-hero-contre-plongee.jpg` | contre-plongée | effet héroïque : épaules larges, trapèzes, bras légèrement en avant, mâchoire marquée |
| `ref-05-troisquarts-surpoids-barbe.jpg` | 3/4 | obèse : ventre proéminent, poitrine tombante, cou épais, barbe — **la même base doit couvrir tous les gabarits** |
| `ref-06-plongee-muscle.jpg` | plongée 3/4 | très musclé, bras fléchis en avant, dos large |

### Ce qui doit être identique dans notre rendu

1. **Style** : sculpture monochrome **gris clair mat**, fond gris neutre, **socle
   cylindrique** à bord biseauté, ombre douce. Aucune couleur de peau.
2. **Silhouette masculine** : épaules nettement plus larges que les hanches, taille
   marquée, fessiers hauts, cuisses galbées, mollets dessinés, cou épais, mâchoire carrée.
3. **Anatomie sculptée lisible** : pectoraux + sillon sternal, 8 abdos + ligne blanche +
   obliques + serratus, deltoïdes, biceps/triceps séparés, dos (trapèzes, rhomboïdes,
   grand dorsal en V, colonne), jambes (droit fémoral, vaste médial, deux chefs du
   mollet, tendon d'Achille), **pieds nus avec orteils séparés**.
4. **Tête** : visage d'adulte réaliste (yeux avec iris et pupille, sourcils, nez,
   lèvres, oreilles, mâchoire), **crâne rasé** avec ligne d'implantation visible.
5. **Pose** : debout, pieds écartés d'environ une largeur de bassin et **à plat sur le
   socle**, bras le long du corps légèrement décollés, mains relâchées, tête droite.
6. **Gabarits** : la même base doit couvrir maigre → athlétique → très musclé → obèse.

### Limites honnêtes (à dire à l'utilisateur)

- Le **grain de peau / pores / cheveux rasés** des images est une **texture**, pas de la
  géométrie : c'est traité par un bruit procédural (voir `src/lib/base/bump.ts`).
- La finesse d'un sculpt ZBrush n'est pas atteignable au sommet près avec des cibles
  linéaires. L'objectif réaliste est **« même famille visuelle »**.

---

## 2. État exact du dépôt

`/root/muscu3d` — React 19 + Vite 8 + TypeScript 7 strict + Three.js 0.186, **npm**,
Node ≥ 22. Pas de dépendance à un serveur.

```
muscu3d/
  AGENTS.md                  ← ce fichier
  README.md
  vercel.json                ← build Vite + en-têtes de cache Vercel
  public/body.glb            ← ⭐ base MakeHuman CC0 (moteur complet)
  public/statue.glb          ← ⭐ sculpture figée exportée (2,6 Mo), téléchargeable
  public/fonts/              ← Inter + Instrument Serif (.woff2 auto-hébergées)
  docs/reference/ref-01..08-*.jpg   ← ⭐ LES 8 IMAGES DE RÉFÉRENCE
  docs/etat-2026-10-20/      ← captures de la session 2
  index.html, vite.config.ts, tsconfig.json, package.json
  scripts/
    assets/makehuman-base.obj + README.md   ← mesh source CC0 (1,7 Mo)
    assets/targets/*.target                  ← cache des cibles MakeHuman (CC0)
    prep-base.py       ← .obj → data.ts (obsolète : le .glb le remplace)
    prep-glb.py        ← .obj → public/body.glb  (makehuman-base.obj → .glb)
    prep-targets.py    ← cibles .target → src/lib/base/targets.ts
    import-body.py     ← ⭐ import d'un modèle EXTERNE (.obj/.glb) → .glb
    shot.sh            ← capture headless (Chromium 125)
    calibrate.ts       ← mesures (poids, tours) sur plusieurs morphologies
    export-statue.ts   ← ⭐ export navigateur de la sculpture en GLB statique
    dev/               ← scripts de diagnostic (voir §6)
  src/
    App.tsx                  ← ⭐ interface galerie, chargement, dock, fiche profil
    styles.css               ← ⭐ direction artistique (encre, papier, vert acide)
    fonts.css                ← @font-face auto-hébergées
    scene/viewer.ts          ← ⭐ scène studio Three.js (GTAO, ACES, ombres, socle)
    lib/referenceProfile.ts  ← ⭐ profil figé, partagé UI + export GLB
    lib/body.ts              ← ⭐ moteur de morphing + anatomie + mesures
    lib/base/model.ts        ← ⭐ chargement du .glb (GLTFLoader)
    lib/base/mesh.ts         ← accès au mesh de base chargé
    lib/base/subdiv.ts       ← ⭐ subdivision Catmull-Clark (quads ou triangles)
    lib/base/pose.ts         ← ⭐ pose de repos (pieds, bras, mains)
    lib/base/details.ts      ← anatomie gravée (muscles, visage, doigts)
    lib/base/face.ts         ← ⭐ iris + pupilles (sculpture)
    lib/base/genitals.ts     ← génitaux procéduraux
    lib/base/bump.ts         ← relief fin (abdos) + grain de cuir rasé
    lib/base/morph.ts        ← application des cibles MakeHuman CC0
    lib/base/targets.ts      ← ⚠️ GÉNÉRÉ (ne pas éditer à la main)
    lib/base/garment.ts      ← boxer (non branché)
```

### Git

Dépôt GitHub `gabrieltieche-hue/muscu3d` (remote `origin`, branche `main`).
Les commits de la session 5 suivent `4749a9d`.
Commits récents :

```
5aa1122 Importeur glTF (modeles riggues) + choix de modele via ?model= + reglages
0112e58 Corrige le calcul des poids de peau (src[i*3] et non src[i])
695f9db Importeur de modele externe + visualisation des reperes (?joints=1)
6762e61 Le corps devient un modele 3D charge en fichier (glTF)
a06b69b Subdivision Catmull-Clark, pose corrigee (pieds, axes articulaires), rendu studio
```

### Vérifications qui passent aujourd'hui

```bash
cd /root/muscu3d
npx tsc --noEmit        # ✅
npm run dev             # → http://127.0.0.1:5173
```

⚠️ **Lancer le serveur de dev avec le mode « background » de l'outil shell**
(`background: true`) ou `setsid nohup … &` : sinon il meurt quand la commande rend la
main. ⚠️ Après un redémarrage de la session, les vieux processus vite restent en
`tracing stop` (artefact PRoot) et le port ne répond plus : **tuer le vieux PID et
relancer** (vérifier `curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:5173/`).

---

## 3. Ce qui a été fait (chronologie)

### 3.1 v1 — prototype « loft » (commit 9de3d11)

Sliders (13 réglages), profils, presets, mesures live, caméras, rotation auto,
affichage filaire, persistance `localStorage`. Corps construit par **loft de sections
elliptiques**. Résultat : un **mannequin avec des coutures visibles**. **Abandonné.**

### 3.2 — maillage MakeHuman (session 2)

`makehuman-base.obj` (CC0) : 13 380 sommets / 13 378 quads, mesh fermé (0 arête
frontière), groupe `joint-*` (125 repères anatomiques), helpers (yeux, dents, cheveux).
Repères clés (normalisés, hauteur = 1) :

| repère | x | y | z | | repère | x | y | z |
|---|---|---|---|---|---|---|---|---|
| pelvis | 0 | 0.534 | 0.009 | | l-shoulder | 0.101 | 0.805 | 0.009 |
| spine-3 | 0 | 0.602 | 0.009 | | l-elbow | 0.188 | 0.700 | 0.008 |
| spine-1 | 0 | 0.750 | -0.004 | | l-hand | 0.259 | 0.637 | 0.105 |
| neck | 0 | 0.844 | 0.004 | | l-upper-leg | 0.066 | 0.519 | 0.007 |
| head-2 | 0 | 0.995 | 0.005 | | l-knee | 0.095 | 0.268 | 0.019 |
| l-eye | 0.019 | 0.928 | 0.075 | | l-ankle | 0.132 | 0.043 | -0.001 |
| l-upperlid | 0.019 | 0.935 | 0.095 | | l-foot-1 | 0.132 | 0.004 | 0.073 |

**Les cibles de morphing MakeHuman (CC0) ne s'appliquent qu'à CETTE topologie exacte**
(indices de sommets du `base.obj` complet). C'est pourquoi le `.glb` porte un drapeau
`extras.targets = true` : sans lui, seul le morphing procédural s'applique.

### 3.3–3.5 — session 2 : pose, anatomie, rendu (résumé)

- Anatomie gravée : pectoraux, abdos, obliques, serratus, trapèzes, dorsaux, deltoïdes,
  quadriceps, mollet (relief fin porté par une **bump map procédurale**).
- Génitaux procéduraux, visage (yeux absents au départ), correctifs d'aisselle.
- Rendu studio : fond dégradé, socle, trois lumières, tone mapping.

### 3.6 — session 3 : « modèle 3D en fichier » + corrections profondes

**1. Le corps est un fichier modèle.** `scripts/prep-glb.py` écrit `public/body.glb`
(glTF binaire écrit à la main, sans dépendance) : maillage `body` + **un nœud par
repère anatomique** + une extension maison `extras.quads` (les faces quads d'origine,
nécessaires à la subdivision). `src/lib/base/model.ts` le charge avec
**`GLTFLoader`** (chemin standard Three.js). Le blob base64 de 479 Ko a disparu du
bundle JS. `?model=autre.glb` permet d'essayer un autre modèle sans recompiler.

**2. Subdivision Catmull-Clark** (`src/lib/base/subdiv.ts`). 13 380 → **53 514**
(niveau 1, 19 ms) ou **214 050** sommets (niveau 2, 38 ms). Le **plan topologique est
précalculé une fois** (topologie fixe) et seules les positions sont recalculées à
chaque image. Généralisée aux **triangles comme aux quads** (un modèle externe en
triangles se subdivise aussi). Les quads d'origine sont préférables : la
triangulation laisserait une vallée le long des diagonales.

**3. Rendu studio** (`src/scene/viewer.ts`) : GTAO + MSAA(4) + ACES + ombre de
contact + vignette + grain + environnement studio (3 boîtes à lumière en PMREM) +
socle biseauté + `OutputPass`. Le contraste a été monté (clé 2.9, fill 0.32, rim 1.35,
env 0.5, exposure 0.92) : c'est ce qui donne le relief « sculpture ».

**4. Pose : trois bugs corrigés (ils expliquaient tous les artefacts) :**
   a. **Les axes d'os étaient pris sur le sommet de peau le plus proche** au lieu des
      repères articulaires → les cuisses se tordaient en un pli en V. Les repères
      suivent désormais le morphing (`morphedJoints` dans `lib/body.ts`).
   b. **Les poids de peau lisaient `src[i]` au lieu de `src[i*3]`** (décalage d'un
      tiers de sommet) → le pied droit était tordu, l'orteon arraché (« pics »), le
      partage jambe/bassin faux. **Le pied tourne maintenant rigidement avec la jambe.**
   c. **Le pied n'était plus à plat** : la rotation de la jambe fait pivoter le pied,
      la correction de plante n'était pas symétrique (1 face trouvée à droite contre
      56 à gauche → rotation parasite). Correction actuelle :
      `qFoot = qYaw · qFlat · q3⁻¹`, la plante étant mesurée **au repos** (donc
      parfaitement symétrique), et le poids du pied est le même dans les deux
      transformations (rigidité).

**5. Visage** (`src/lib/base/face.ts`) : le mesh de base a les paupières soudées, on ne
peut pas ouvrir un trou proprement → on procède comme un sculpteur : la zone de l'œil
est bombée en globe, l'**iris est un anneau sphérique** posé en relief, la **pupille
est une calotte en creux**, plus le pli de paupière, l'arcade sourcilière, la ligne de
cheveux et le **grain de cuir rasé** (bruit procédural dans le shader).

**6. Ancrage au sol** : la pose soulève le pied de quelques millimètres → le maillage
est translaté pour que la plante touche exactement le socle (y = 0).

**7. Import d'un modèle externe** (`scripts/import-body.py`) : lit `.obj` **et**
`.glb`/`.gltf`, normalise (pieds à 0, hauteur 1, centré), et en déduit les repères
anatomiques — soit **depuis le squelette** (matrices d'inverse de liaison, bien plus
fiable), soit **depuis la silhouette** (détection A-pose / T-pose). Un mode
`?joints=1` affiche les repères pour valider l'import.

---

### 3.7 — session 4 : rendu « statue studio » + modèle externe + interface figée

**1. Chargement plus souple (`src/lib/base/model.ts`).** L'ordre est désormais
`modele.glb` → `modele.gltf` → `body.glb` : déposer un fichier dans `public/` suffit
à le substituer, sans recompiler. `?model=xxx.glb` force un fichier. Le cache est
indexé par URL (avant, un seul chargement global). Les indices sont passés en
**Uint32** : un modèle dense (> 65 535 sommets) était tronqué par l'ancien
`Uint16Array` (corruption silencieuse). `soleNormal()` accepte maintenant les deux
types d'indices.

**2. Modèle externe (`src/lib/statue.ts`).** Si le fichier n'est pas la base
MakeHuman (`extras.targets` absent), il est affiché **tel quel** : matériau argile
unique `MeshStandardMaterial` (`#969696`, roughness 0,7, metalness 0), échelle
normalisée à 1,75 m, centrage X/Z, pieds à y = 0. Pas de morphing, pas de métriques,
pas de filaire (le toggle est masqué). C'est le mode « mon modèle téléchargé ».

**3. Rendu studio (`src/scene/viewer.ts`).**
- fond **uni** `#8c8c8c` (l'ancien dégradé radial a été supprimé) ; l'environnement
  PMREM reste séparé, uniquement pour les reflets ;
- ambiance `AmbientLight` 0,1 + hémisphérique 0,1 ; clé `#fff8ef` 2,9 ; fill 0,28 ;
  **deux** contre-jours (1,5 et 0,7) ; exposition 0,98 ; environnement 0,38 ;
- socle élargi (rayon 0,38 m au lieu de 0,30) pour que les pieds ne débordent pas ;
- anneau d'accent supprimé (il n'existe pas sur les références) ;
- `PCFShadowMap` + ombre de contact manuelle (attention : `PCFSoftShadowMap` a été
  retiré de Three 0.186) ;
- correction des rainures abdominales : les sillons verticaux étaient placés au
  **centre** de chaque colonne (chaque abdo était coupé en deux, d'où l'aspect
  « grille »). Ils sont maintenant à la ligne blanche (x = 0) et au bord externe
  (x ≈ ±0,050), avec des rainures horizontales par colonne.

**4. Interface figée (`src/App.tsx`).** `FIXED_PARAMS` (profil de référence) est la
seule source : les 13 curseurs et les 4 profils types étaient `disabled`, les modes
actuel/cible et le `localStorage` ont été retirés. *(La session 5 a remplacé les
curseurs morts par une fiche profil ; `FIXED_PARAMS` vit désormais dans
`src/lib/referenceProfile.ts`.)* Les vues caméra, la rotation auto,
le socle et le toggle filaire (modèle de référence) fonctionnent toujours. Les chips
de mesures restent celles du profil figé. Un bandeau explique le verrouillage et
comment déposer un `modele.glb`.

**5. Vérifications faites en session 4 (VM cloud, pas la tablette).**
`npx tsc --noEmit` ✅, `npm run build` ✅ (bundle ~1,7 Mo), captures headless
Chromium/SwiftShader en Face / Profil / Dos / 3-4, et audit DOM : 13/13 curseurs
désactivés, 4/4 presets désactivés, canvas présent, source `body.glb`, mode externe
testé avec un GLB CC0 de 109k triangles (chargé, centré, posé), erreur propre sur
`?model=introuvable.glb`. Le script `scripts/shot.sh` reste celui de la tablette.

**6. Limites ajoutées.** Un modèle externe garde sa pose (souvent A-pose) et n'a pas
de cibles de morphing. Le profil de référence reste le corps MakeHuman du dépôt :
c'est lui qui ressemble le plus aux images. `README.md` a été réécrit (liens vers
MakeHuman/MPFB, Blender Studio CC0, Innerscene CC0, Sketchfab CC-BY).

### 3.8 — session 5 : refonte de l'interface, export GLB, Vercel

**1. Interface entièrement refaite (`src/App.tsx`, `src/styles.css`).**
Direction « galerie / atelier » : encre `#0a0a0b` et papier `#f4f1e9`, un seul
accent vert acide `#d6ff4b`. En-tête fin, scène plein cadre, dock flottant
(vues Face/Profil/Dos/3-4, rotation, maillage, socle), fiche latérale éditoriale
(titres Instrument Serif, mesures en gros chiffres, barres de développement,
fichier 3D, téléchargement). Les 13 curseurs et les 4 presets ont été retirés :
plus aucun contrôle mort. Les vues s'animent en 620 ms (`camTween` dans
`viewer.ts`), le socle est masquable (`setPedestalVisible`).

**2. Polices auto-hébergées (`public/fonts`, `src/fonts.css`).** Inter (variable
300–600) et Instrument Serif (normal + italique) sont servies par le site :
plus de dépendance à Google Fonts, et le rendu est identique hors ligne. Le
premier screenshot headless avait un texte invisible faute de police système :
c'est cette absence qui a motivé l'auto-hébergement.

**3. Export GLB (`scripts/export-statue.ts` → `public/statue.glb`).**
`buildReferenceStatueGLB()` recharge le modèle, rejoue `buildBody(FIXED_PARAMS)`
puis sérialise le groupe avec `GLTFExporter` (binaire, `onlyVisible`). Le
fichier fait 2,6 Mo, s'ouvre dans Blender/three.js et correspond exactement à
la statue affichée. Il ne contient plus les cibles de morphing. Le bouton
« Télécharger le GLB » et la fiche pointent dessus.

**4. Modèle 3D : décision honnête.** La recherche n'a trouvé aucun GLB gratuit
de bodybuilder parfait, sans compte et redistribuable. Les options utiles sont
le base mesh CC0 d'Innerscene (4,3 Mo, A-pose, moins musclé que la référence)
et le bundle CC0 Blender Studio (`.blend` à exporter). La sculpture du dépôt
reste donc le modèle principal ; les liens sources sont dans le README et dans
l'accordéon « Utiliser un autre modèle ».

**5. Déploiement.** `vercel.json` (framework Vite, `npm run build`, `dist`,
cache des polices et du GLB) et `.vercelignore`. Le build statique ne nécessite
aucun serveur Node. Déployé en production sur **<https://muscu3d.vercel.app>**
(équipe Vercel `gabriels-projects-811a62ab`, projet `muscu3d`, CLI 65.2.0).
Le site Freebuff Sites existant (`site.json`,
`deploy/worker.js`) est mis à jour avec le même build.

**6. Vérifications session 5.** `npx tsc --noEmit` ✅, `npm run build` ✅
(bundle 1,71 Mo, avertissement de taille non bloquant), captures Chromium
1440×900 et 390×844, export GLB relu dans l'app via `?model=statue.glb`,
`Content-Type: model/gltf-binary` et `Content-Length` corrects.

### 3.9 — session 6 : fluidité sur tablette (2026-10-27)

> ⚠️ Ce document s'arrête à la session 5, mais le dépôt va plus loin
> (commit `936a100`) : le modèle affiché est `public/modele.glb` (alias
> `meshy-adonis.glb`, « Grey Adonis »), **paramétrable** — `buildParametricStatue`
> dans `src/lib/statue.ts`, curseurs et presets réactivés dans `App.tsx`.
> Les §3.7 et §3.8 décrivent donc l'interface *précédente*.

Constat utilisateur : « le site lag, c'est lent et ça lag ». Trois causes
mesurées, aucune n'était la géométrie (26 581 sommets) :

**1. Le rendu tournait en continu, même à l'arrêt.** `animate()` appelait
`composer.render()` à chaque image ; le GPU restait à 100 %, chauffait et
faisait throttler la tablette. Désormais **rendu à la demande** : un drapeau
`needsRender` (`invalidate()`), alimenté par l'événement `change` d'OrbitControls
(rotation, inertie, molette, auto-rotation), par les transitions de caméra, par
les changements de modèle/réglages et par `visibilitychange`. À l'arrêt :
**0 image rendue** (mesuré). `Viewer.refresh()` sert aux changements de
géométrie faits de l'extérieur (curseurs).

**2. Le coût était dans le remplissage.** À DPR 2 + 1,45 Mpx, la chaîne
GTAO (plein écran, 16 échantillons + débruitage) + **SMAA** + MSAA 4 + tone
mapping dominait tout.
- **SMAA supprimé** : redondant avec le MSAA 4 du `WebGLRenderTarget`.
- **GTAO en demi-résolution** (`AO_SCALE = 0.5`, override de `setSize`) : l'AO
  est basse fréquence, l'upscale bilinéaire est invisible ; coût ÷ 4.
- **Carte d'ombre statique** : `shadowMap.autoUpdate = false` +
  `needsUpdate` sur `setBody` / `setPedestalVisible` (plus de passe 2048² par
  image pour une statue immobile).
- **Qualité adaptative** (`QUALITY` dans `viewer.ts`) : 4 niveaux de DPR
  (1,0 / 1,25 / 1,5 / 2,0) et d'échantillons AO (8 / 12 / 16 / 16). Départ au
  niveau 2 (DPR 1,5), descente si la médiane des images rendues dépasse 26 ms,
  remontée sous 11 ms, 2,5 s d'hystérésis. **`?q=0..3`** force un niveau,
  **`?stats=1`** affiche `fps|repos · q · dpr · taille du tampon` et expose
  `window.__viewer.renderCount`.

**3. Le CSS floutait le canvas en continu.** Le dock, la pastille de titre, le
loader et l'overlay utilisaient `backdrop-filter: blur(...)` **au-dessus du
canvas WebGL** : le compositeur devait relire et flouter la scène à chaque
image — très cher sur GPU mobile. Remplacés par des fonds opaques (aucune
différence visible sur fond gris). **Ne jamais réintroduire de
`backdrop-filter` au-dessus de `.stage canvas`.**

**4. Curseurs.** `statue.update()` coûte ~9 ms (médiane, mesuré sur cette
machine avec `scripts/dev/perf-statue.ts`) : 26 k sommets + normales +
`measure()`. Les événements d'un glissement rapide s'empilaient ; ils sont
maintenant **coalescés à une mise à jour par image** (`requestAnimationFrame`
dans `App.tsx`) et suivis d'un `viewer.refresh()`.

**Mesures** (Chromium 125 headless, rendu logiciel llvmpipe — donc pessimiste) :

| scénario | avant | après |
|---|---|---|
| 900×700, DPR 1 | 972 ms/image (1 fps) | **16,9 ms/image (59 fps)** |
| 800×600, DPR 2 | (non mesurable : > 1 s) | **16,7 ms/image (60 fps)** |
| à l'arrêt | rendu continu | **0 rendu / 3 s** |

**Vérifications** : `npx tsc --noEmit` ✅, `npm run build` ✅ (1,66 Mo),
captures 1280×800 DPR 2 et 900×760 (corps à 38 % de masse grasse après
glissement du curseur : l'image se met bien à jour), 0 rendu en veille.

**Limite honnête** : le rendu final n'a pas pu être mesuré sur le GPU Mali de
la tablette (le Chromium de cette machine n'a que le rendu logiciel). Sur la
tablette, ouvrir **`?stats=1`** : le HUD doit afficher un `fps` proche de 60
pendant une rotation et `repos` à l'arrêt. Si le niveau descend à `q1`/`q0`,
c'est que le GPU ne suit pas — `?q=0` donne le maximum de fluidité.

**Mise en ligne (2026-10-27)** : commit `78d2718` poussé sur `origin/main`
(réseau GitHub) ; déploiement Vercel `dpl_TWrFNKpEe9NTV61eAFHd5kVhBn2Q`
(`READY`, cible production), alias **<https://muscu3d.vercel.app>**. Contrôle :
le `index.html` de production référence bien `assets/index-CJBxJ7rh.js`, le
même fichier que `dist/` local. Commande utilisée (le jeton est lu depuis
`/root/.config/snowball-pro/vercel_token`, jamais en clair) :

```bash
VERCEL_TOKEN=$(tr -d '\r\n' < /root/.config/snowball-pro/vercel_token) \
  npx --yes vercel deploy --prod --yes --token "$VERCEL_TOKEN"
```

## 4. Bugs connus, causes identifiées

### 4.1 ⚠️ Le mesh de base n'est plus embarqué

`src/lib/base/data.ts` a été **supprimé** (le `.glb` le remplace). `scripts/prep-base.py`
est devenu inutile. `scripts/dev/*.ts` qui utilisaient `getBaseMesh()` doivent
**appeler `await loadModel()`** (voir `scripts/dev/load-model.ts`) sinon ils lèvent
« modèle 3D non chargé ».

### 4.2 Les mesures du panneau (UI) restent approximatives

`lib/body.ts` mesure les tours par **enveloppe convexe de tranche** : c'est faux sur le
torse (la tranche traverse les bras). La mesure fiable est par **coupe de plan** avec
assemblage des segments — implémentée dans `scripts/dev/measure.ts` (à reporter dans
`lib/body.ts` quand les mesures de l'UI compteront). Relevé actuel (défaut, 1,75 m) :
bras 42,6 · avant-bras 26,2 · cuisse 66,7 · mollet 48,0 · poitrine 107,9 · taille 89,7 cm.

### 4.3 Points faibles visuels restants (par ordre d'impact)

1. **Les mains** : les doigts restent un peu en raquette (le maillage de base les fusionne) ;
   la séparation est一笔 gravée (sillons d'orteils/doigts) mais le modelé reste grossier.
2. **La masse musculaire** : le maximum MakeHuman + morphing procédural donne un corps
   « sec et sportif » ; la référence est un bodybuilder. Passer les curseurs muscles à
   100 donne plus de volume mais reste en dessous.
3. **Les génitaux** : anatomiquement plausibles mais lisiblement « ajoutés » de profil.
4. Le **cou** reste un peu long malgré l'épaississement.

### 4.4 Pièges d'implémentation à ne pas refaire

- **Toujours vérifier l'indexation des tableaux plats** : `src[i]` ≠ `src[i*3]`
  (cf. §3.6 b). C'est le bug le plus coûteux de la session.
- `baseIndices` (les triangles du mesh de base) sert à la **normale de plante** : il doit
  correspondre à la topologie du mesh **courant**.
- Les **cibles MakeHuman** s'appliquent par index : ne jamais les appliquer à un autre
  maillage (corruption silencieuse). Le drapeau `extras.targets` protège.

---

## 5. Le modèle 3D du corps

### 5.1 Chaîne actuelle

```
scripts/assets/makehuman-base.obj  (CC0)
        │  scripts/prep-glb.py
        ▼
public/body.glb   ──►  src/lib/base/model.ts  ──►  GLTFLoader
        │                    (positions, indices, quads, 125 repères)
        │
        └─► morphing (cibles MakeHuman CC0) ─► pose ─► subdivision ─► anatomie ─► rendu
```

### 5.2 Importer un modèle externe (sloyd.ai, free3d, Blender…)

```bash
# 1) le fichier (glb/gltf/obj) est déposé dans scripts/assets/
# 2) import + normalisation + repères :
cd /root/muscu3d
python3 scripts/import-body.py scripts/assets/monmodele.glb
#    → écrit public/body-monmodele.glb (sans écraser body.glb)
# 3) essai immédiat dans l'app, sans recompiler :
#    http://127.0.0.1:5173/?model=body-monmodele.glb
# 4) validation des repères :
#    http://127.0.0.1:5173/?model=body-monmodele.glb&joints=1
# 5) si tout va bien :
python3 scripts/import-body.py scripts/assets/monmodele.glb --force
```

Options de `import-body.py` : `--flip` (retourner), `--rot90`, `--out`, `--force`.

**Limites connues :**
- Un modèle en **T-pose** : la pose de repos ramène les bras le long du corps
  (le transport d'avant-bras gère la rotation) — à vérifier visuellement.
- Un modèle **non riggé** : les repères sont déduits de la silhouette, donc approximatifs
  (épaule, coude, main, hanche, genou, cheville). Les refining de chaque zone se font
  dans `JOINT_SPEC` / `BONE_PATTERNS` de `import-body.py`.
- Les **doigts et orteils** ne sont repérés que si le modèle expose des os
  `finger-*` / `toe-*` (MakeHuman) — sinon les sillons de séparation sont ignorés.
- Un modèle externe **n'a pas de cibles MakeHuman** : le morphing n'est plus que
  procédural (les curseurs muscles auraont moins d'effet).

### 5.3 Format glTF produit par `prep-glb.py`

- `mesh` : POSITION + NORMAL, indices triangles.
- `nodes` : `body` + **un nœud par repère** (`l-shoulder`, `r-knee`, `l-finger-3-2`…).
- `extras.quads` : faces quads d'origine, base64 de `Uint16` (indispensable à la
  subdivision Catmull-Clark).
- `extras.targets` : `true` si le mesh est la base MakeHuman (donc compatible cibles CC0).

### 5.4 Sources de meshes CC0 déjà sur la machine

`scripts/assets/makehuman-base.obj` (MakeHuman base mesh, CC0 1.0 — voir
`scripts/assets/README.md` pour la provenance). Les cibles de morphing sont dans
`scripts/assets/targets/*.target` (MakeHuman, CC0).

---

## 6. Recettes de l'environnement (tablette Android / PRoot Ubuntu)

Contexte machine complet : **`/root/AGENTS.md`** (à lire). L'essentiel pour ce projet :

- **Serveur de dev** : `cd /root/muscu3d && npm run dev` → `http://127.0.0.1:5173`.
- **Screenshot headless** (Firefox n'a pas de WebGL ici, **utiliser Chromium**) :

  ```bash
  scripts/shot.sh /tmp/opencode/sortie.png "?view=troisquarts"
  # = LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \
  #   /root/.local/chromium-125/chrome --headless=new --no-sandbox \
  #   --disable-gpu-sandbox --disable-dev-shm-usage --use-angle=gl-egl \
  #   --ignore-gpu-blocklist --user-data-dir=/tmp/chrome-shot-XXXX \
  #   --window-size=1400,900 --virtual-time-budget=12000 --screenshot=… URL
  ```
  ⚠️ Une capture prend **40 à 60 s** (rendu logiciel + GTAO) : lancer en *background*,
  ne pas blinder.
- **Typecheck** : `npx tsc --noEmit`.
- **Scripts Node** : `node_modules/.bin/tsx scripts/....ts` (tsx est en devDependency).
  ⚠️ `npx tsx` peut rester bloqué sur une vérification de registre : utiliser le binaire
  local.
- **Deep links de test** :
  `?view=face|profil|dos|troisquarts` · `?wire=1` · `?joints=1` (repères) ·
  `?model=xxx.glb` (autre modèle) · `?subdiv=0|1|2` · `?anat=0` · `?muscle=0` ·
  `?pose=0` · `?nofoot=1` · `?noleg=1` · `?shadow=0` · `?fat=20&lats=30&arms=80` ·
  `?cam=x,y,z&target=x,y,z` (caméra libre) · `?preset=sec|athletique|bodybuilder|massif`.
- **Un seul gros job à la fois** : ~2 Go de RAM libres.
- **Jamais `rm -rf`.** Utiliser `trash <fichier>`.
- `npm`/`npx` résolvent vers les binaires **Termux**, `node` vers Ubuntu.
- Pas de systemd/cron : les services vivent en tmux ou en boucle.

### Scripts de diagnostic (`scripts/dev/`)

| script | ce qu'il contrôle |
|---|---|
| `load-model.ts` | charge le `.glb` (obligatoire avant les autres) |
| `subdiv-check.ts` | subdivision : volume, bbox, temps par image |
| `measure.ts` | tours de bras/cuisse/poitrine par coupe de plan (fiable) |
| `check-topo.ts` | faces dégénérées / orientation du mesh de base |
| `find-crease.ts` | localise les plis francs du maillage |
| `probe-sole.ts` | symétrie de la normale de plante (les deux pieds) |
| `probe-symetrie.ts` | symétrie gauche/droite du mesh (base vs morphing) |
| `probe-cibles-pied.ts` | les cibles de pieds rétrécissent-elles le bon pied ? |
| `probe-pubis.ts` | position de la surface pubienne / des génitaux |
| `probe-toes.ts`, `probe-winding.ts` | repères d'orteils, orientation des faces |

---

## 7. Roadmap (après validation visuelle)

Ordre imposé par l'utilisateur — **ne pas sauter d'étape** :

1. ✅ **Modèle 3D en fichier** (`public/body.glb` + `GLTFLoader`) — **FAIT**.
2. ⏳ **Modèle externe** : l'utilisateur télécharge (sloyd.ai / free3d) → import →
   validation des repères → comparaison avec la référence.
3. ⏳ **Rendu studio** — fait, à affiner (grade, fond, cadrages).
4. ✅ **Densité de maillage** (subdivision) — **FAIT**.
5. ✅ **Pose / pieds** — **FAIT** (§3.6).
6. ⏳ **Mains** : doigts réellement séparés, malgré le maillage de base.
7. **Saisie du poids réel** — exigence explicite : « c'est pas un truc estimé ».
8. **Refonte UI/UX** — constat utilisateur : « on comprend rien ».
9. **Générateur de programme** (salle / maison / rien, horizon au choix).
10. **Nutrition** conditionnelle (prise de masse / sèche / maintien).
11. **Timeline bimensuelle** : mise à jour du vecteur corporel + avant/après 3D.
12. **Jauge de faisabilité** objectif vs horizon, budget d'erreur ±4-8 kg assumé.

---

## 8. Journal des manipulations déjà effectuées

- `git init` + commit de la v1 loft ; identité locale au dépôt.
- Téléchargement de `makehuman-base.obj` (CC0) + des cibles MakeHuman (CC0).
- `scripts/prep-base.py` (.obj → base64 TS) puis `scripts/prep-targets.py`
  (cibles .target → `targets.ts`).
- `src/lib/base/pose.ts` : transport d'avant-bras, pose des doigts, rotation de jambe.
- `src/lib/body.ts` : squelette logiciel, poids de peau, masques, morphing, mesures.
- Session 5 : refonte UI (`App.tsx`, `styles.css`), polices auto-hébergées,
  `src/lib/referenceProfile.ts`, `scripts/export-statue.ts` → `public/statue.glb`,
  `vercel.json` + `.vercelignore`, captures desktop/mobile.
- `src/lib/base/details.ts` : anatomie gravée (torse, dos, jambes, bras).
- `src/lib/base/genitals.ts` : génitaux procéduraux (resculptés en session 3).
- `src/lib/base/bump.ts` : bump map des abdominaux + grain de cuir rasé.
- `src/lib/base/face.ts` : iris annulaire + pupille en creux (session 3).
- `src/lib/base/subdiv.ts` : subdivision Catmull-Clark quads + triangles (session 3).
- `src/lib/base/model.ts` + `scripts/prep-glb.py` : le corps devient un `.glb` (session 3).
- `scripts/import-body.py` : import d'un modèle externe (obj/glb) (session 3).
- `src/scene/viewer.ts` : GTAO, ACES, ombre de contact, vignette, studio IBL.
- `scripts/shot.sh`, `scripts/calibrate.ts`, `scripts/dev/*` (diagnostics).

### Fichiers à ne PAS éditer à la main

- `src/lib/base/targets.ts` — **généré** par `scripts/prep-targets.py`.
- `public/body.glb` — **généré** par `scripts/prep-glb.py` (ou `import-body.py`).
