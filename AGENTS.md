# AGENTS.md — Muscu3D : contexte complet (fichier de passation)

> Ce fichier est destiné au **prochain agent IA** qui reprend le projet.
> Il contient : le but du produit, l'état exact du code, ce qui a été fait, les bugs
> connus et vérifiés, les pistes validées, et les recettes de l'environnement.
> Dernière mise à jour : **2026-10-20 (session 2)**. La session 2 a reconstruit
> la 3D : pose continue, cibles MakeHuman, anatomie gravée, génitaux, rendu
> studio. Lire **§1bis** (goal visuel) puis **§3.5** (ce qui a été fait) avant
> de toucher au code.
> Langue de travail du projet : **français** (UI, code commenté, réponses).

---

## 0. CONSIGNE EN COURS DE L'UTILISATEUR (2026-10-19)

> **« Le modèle 3D, je veux qu'il ressemble à ça »** — 8 images de référence fournies
> par l'utilisateur, copiées dans `docs/reference/`, spécification complète au **§1bis**.
> C'est le **GOAL VISUEL CLAIR ET ÉTABLI**. Il prime sur toute autre fonctionnalité.

Ordre de travail convenu :

1. Rendre le corps **masculin, anatomique et crédible** (style sculpture grise, socle)
   — c'est l'objet du §1bis et du plan §5. **FAIT en session 2** (voir §3.5).
2. Faire valider par l'utilisateur sur des captures (face / profil / dos / 3-4 + gros
   plans torse, bras, pieds) — captures dans `docs/etat-2026-10-20/`.
3. Seulement ensuite : saisie du poids réel, UI/UX, programme, nutrition, timeline.

**Ne pas lancer un autre chantier avant cette validation.**

Décisions prises par l'utilisateur pendant la session 2 (elles priment sur le §1bis
si elles le contredisent) :
- **Pas de boxer** : le modèle montre le corps nu. (Un module `garment.ts` existe
  mais n'est plus branché — à réactiver seulement sur demande explicite.)
- **Génitaux présents**, un seul modèle pour tous les corps (masculin), pas de
  variante féminine.
- Le reste du goal visuel (sculpture grise, socle, silhouette masculine, anatomie
  lisible) est inchangé et atteint.

---

## 1. Le produit (pourquoi ce dépôt existe)

Application web **locale, mono-utilisateur, en français** qui :

1. modélise le corps de l'utilisateur en **3D stylisée** (pas de photo, pas de scan) ;
2. permet de fixer un **corps objectif** ;
3. génère un **programme d'entraînement + nutrition** adapté ;
4. suit l'évolution **toutes les deux semaines** avec un avant/après 3D.

### Contraintes non négociables

- **Budget zéro** : pas d'API payante, pas de GPU loué, pas de carte bancaire.
  Tout doit tourner en local dans le navigateur.
- **Pas de backend, pas de compte, pas de paiement.** Persistance = `localStorage`.
- **Aucune photo de l'utilisateur.** L'avatar est un maillage paramétrique.
- Doit servir **débutants ET confirmés**.
- L'utilisateur choisit son **matériel** (salle / maison / rien) et son **horizon**.
- **Honnêteté** : la prédiction à 6 mois a un budget d'erreur assumé de ±4 à 8 kg.
  L'UI doit le dire, pas le cacher.

### Décisions produit déjà arbitrées

- Trois modes : **« Réel »**, **« Scénario »** (projection clairement étiquetée comme
  hypothèse) et **« Objectif »**.
- Les abdos ne sont pas un slider : ils émergent de **% de masse grasse + développement
  abdominal**.
- `BodyParams` (le vecteur corporel) est **la source de vérité**. Le maillage n'est
  qu'une projection visuelle de ce vecteur. Simulation, programme et nutrition
  viendront tous se brancher sur ce même vecteur.
- Pas d'IA/LLM pour le MVP : simulation déterministe + règles.

### Verdict utilisateur sur la v1 (à l'origine du pivot)

> « trop géométrique, trop moche, pas assez réaliste du tout »

Conséquence : **la qualité visuelle du corps 3D est la priorité n°1**, avant toute
autre fonctionnalité. Tant qu'elle n'est pas validée par l'utilisateur, ne pas
enchaîner sur le programme/nutrition.

---

## 1bis. GOAL VISUEL — spécification de la référence (à respecter)

Les 8 images de `docs/reference/` sont **la cible unique** fournie par l'utilisateur
(« voilà le goal visuel clair et établi »). Ce sont très probablement des rendus
**MakeHuman / MPFB** (même maillage de base, même boxer, même socle, même matière
grise) : la cible est donc atteignable avec les **cibles CC0 officielles** (§5),
pas en sculptant à la main.

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
| `ref-01-dos.jpg` | dos | trapèzes, rhomboides, grand dorsal en V, érecteurs du rachis, fessiers sous le boxer, triceps/avant-bras, crâne rasé |
| `ref-02-face-piedestal.jpg` | face entière | homme athlétique sec, boxer, pieds nus sur socle rond, mains le long du corps |
| `ref-03` / `ref-07` / `ref-08` (3/4) | 3/4 | pectoraux séparés, 8 abdos + obliques + serratus, deltoïdes, biceps/triceps, quadriceps (droit fémoral + vaste médial), tibial |
| `ref-04-hero-contre-plongee.jpg` | contre-plongée | effet héroïque : épaules larges, trapèzes, bras légèrement en avant, mâchoire marquée |
| `ref-05-troisquarts-surpoids-barbe.jpg` | 3/4 | obèse : ventre proéminent, poitrine tombante, cou épais, barbe — **la même base doit couvrir tous les gabarits** |
| `ref-06-plongee-muscle.jpg` | plongée 3/4 | très musclé, bras fléchis en avant, dos large |

### Ce qui doit être identique dans notre rendu

1. **Style** : sculpture monochrome **gris clair mat**, fond gris neutre, **socle
   cylindrique** à bord biseauté, ombre douce. Aucune couleur de peau, aucun vêtement
   autre que le boxer.
2. **Silhouette masculine** : épaules nettement plus larges que les hanches, taille
   marquée, fessiers hauts, cuisses galbées, mollets dessinés, cou épais, mâchoire
   carrée.
3. **Anatomie sculptée lisible** (en géométrie, pas seulement par la lumière) :
   - face : deux pectoraux séparés par un sillon sternal, téton ;
   - abdomen : 8 pack + ligne blanche + obliques + serratus (dents de scie) ;
   - épaules : deltoïde en 3 faisceaux, sillon delto-pectoral ;
   - bras : biceps/triceps séparés, avant-bras avec relief, main à 4 doigts + pouce,
     ongles suggérés ;
   - dos : trapèzes, rhomboides, grand dorsal en V, colonne lombaire, fessiers ;
   - jambes : droit fémoral, vaste médial (« larme »), vaste latéral, sartorius suggéré,
     deux chefs du mollet, tendon d'Achille, pieds nus avec orteils.
4. **Boxer** : boxer brief gris, **ceinture élastique marquée + bandes de cuisse**.
   Il masque le pubis (le mesh de base est nu et sans organes) et fait partie du look
   de référence : il doit être modélisé, pas ignoré.
5. **Tête** : visage d'adulte réaliste (yeux, sourcils, nez, lèvres, oreilles,
   pommette, mâchoire), **crâne rasé** avec ligne d'implantation visible.
6. **Pose** : debout, pieds écartés d'environ une largeur de bassin, bras le long du
   corps légèrement décollés, mains relâchées (doigts légèrement fléchis), tête droite,
   regard à l'horizon. Variantes de caméra : face, 3/4, profil, dos, plongée,
   contre-plongée.
7. **Gabarits** : la même base doit couvrir maigre → athlétique → très musclé → obèse
   (`ref-05`). C'est exactement ce que permettent les cibles `weight` / `muscle` de
   MakeHuman.

### Limites honnêtes (à dire à l'utilisateur)

- Le **grain de peau / pores / cheveux rasés** des images est une **texture**, pas de la
  géométrie. Sur 13 380 sommets, on peut l'approcher par une texture procédurale
  (bruit) en phase 2 ; sans elle, le rendu sera « sculpture lisse ».
- La finesse d'un sculpt ZBrush n'est pas atteignable au sommet près avec des cibles
  linéaires. L'objectif réaliste est **« même famille visuelle »** : même silhouette,
  même anatomie lisible, même boxer, même matière, même socle.
- **Critère d'acceptation** : l'utilisateur dit que **ça ressemble** sur des captures
  face / profil / dos / 3-4 **et** des gros plans torse, visage, mains, pieds.

---

## 2. État exact du dépôt

`/root/muscu3d` — React 19 + Vite 8 + TypeScript 7 strict + Three.js 0.186, **npm**,
Node ≥ 22. Pas de dépendance à un serveur.

```
muscu3d/
  AGENTS.md                  ← ce fichier
  README.md                  ← présentation courte (partiellement obsolète : décrit la v1 loft)
  docs/preview.png           ← aperçu v1 (obsolète)
  docs/etat-2026-10-19-34.png, -face.png   ← rendus du mesh MakeHuman au 2026-10-19 (état actuel)
  docs/reference/ref-01..08-*.jpg          ← ⭐ LES 8 IMAGES DE RÉFÉRENCE (goal visuel, §1bis)
  index.html, vite.config.ts, tsconfig.json, package.json
  scripts/
    assets/makehuman-base.obj + README.md   ← mesh source CC0 (1,7 Mo, conservé pour reproductibilité)
    assets/targets/*.target                 ← cache des cibles MakeHuman (CC0)
    prep-base.py             ← convertit le .obj en données embarquées TypeScript
    prep-targets.py          ← lit les cibles .target (ASCII) → src/lib/base/targets.ts
    shot.sh                  ← capture d'écran headless (Chromium 125)
    calibrate.ts             ← script de calibration poids/mensurations (via npx tsx)
  src/
    App.tsx                  ← UI, état, persistance, deep links
    styles.css               ← thème sombre
    scene/viewer.ts          ← scène studio Three.js (lumières, socle, anneau, caméra)
    lib/body.ts              ← ⭐ params, presets, masques de déformation, morphing, métriques
    lib/geometry.ts          ← LEGACY (helpers du loft v1) — plus utilisé, supprimable
    lib/base/data.ts         ← ⚠️ GÉNÉRÉ par scripts/prep-base.py, ne pas éditer à la main
    lib/base/targets.ts      ← ⚠️ GÉNÉRÉ par scripts/prep-targets.py, ne pas éditer à la main
    lib/base/morph.ts        ← application des couches de morphing (cibles MakeHuman)
    lib/base/details.ts      ← anatomie gravée (rainures, renflements) + normales analytiques
    lib/base/genitals.ts     ← génitaux procéduraux (verge + scrotum)
    lib/base/garment.ts      ← boxer (non branché : l'utilisateur l'a refusé)
    lib/base/mesh.ts         ← décodage des données embarquées → BufferGeometry
    lib/base/pose.ts         ← pose de repos (adduction des bras/jambes) bakeée au chargement
```

### Git

- Dépôt initialisé **localement** (pas de remote), identité configurée dans le dépôt
  (`local@muscu3d` / `muscu3d`).
- Un seul commit : `9de3d11 Prototype v1 + body v3 (lofts lisses)`.
- **Le pivot maillage n'est PAS commité** : `git status` montre `M src/lib/body.ts`,
  `?? scripts/`, `?? src/lib/base/`, `?? AGENTS.md`, `?? docs/reference/`,
  `?? docs/etat-2026-10-19-*.png`. Penser à commiter une fois le rendu validé.

### Vérifications qui passent aujourd'hui

```bash
cd /root/muscu3d
npx tsc --noEmit        # ✅ passe (dernier passage : 2026-10-19)
npm run dev             # serveur sur http://127.0.0.1:5173
```

⚠️ **Lancer le serveur de dev avec le mode « background » de l'outil shell**
(`background: true`), pas avec un `&` dans une commande : sinon il meurt quand la
commande rend la main, et il est de toute façon tué à chaque redémarrage du serveur
opencode. Vérification : `curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:5173/`.

---

## 3. Ce qui a été fait (chronologie)

### 3.1 v1 — prototype « loft » (commit 9de3d11)

- Sliders (13 réglages), profils « corps actuel » / « corps cible », presets
  (Sec, Athlétique, Bodybuilder, Massif), mesures live, caméras, rotation auto,
  affichage filaire, persistance `localStorage` clé `muscu3d.v1`.
- Corps construit par **loft de sections elliptiques** (`src/lib/geometry.ts` :
  `loftRings`, normales lissées, volume signé, périmètre d'ellipse de Ramanujan).
- Trois itérations de lissage (v2 → v4) : le résultat restait un **mannequin avec des
  coutures visibles** aux jonctions (épaule/deltoïde, hanche/aine, genou, chevilles,
  mains en « pagaie », tête en œuf).
- **Décision : abandon du loft.** Le corps v3 loft reste consultable dans le commit.

### 3.2 Pivot — maillage de base MakeHuman (état actuel, non commité)

Le fichier `scripts/assets/makehuman-base.obj` est le mesh de base officiel de
MakeHuman, **CC0 1.0** (voir `scripts/assets/README.md`) :

- groupe `body` : **13 380 sommets / 13 378 faces** (quads) → **26 756 triangles**,
  **0 arête frontière** (manifold fermé : pas de trou aux yeux ni à l'aine) ;
- contient aussi des groupes `helper-*` (yeux, dents, cheveux, jupe, organes) et
  `joint-*` (repères d'articulations) — **seuls `body` et `joint-*` sont utilisés** ;
- coordonnées normalisées par `prep-base.py` : **pieds à y = 0, sommet du crâne à
  y = 1, visage vers +z** ;
- volume du mesh brut : **0,01187 m³** (hauteur 1) → **63,6 L** à 1,75 m.

`src/lib/base/data.ts` (≈332 Ko) embarque :
`BASE_POS_Q` (positions Int16 quantifiées ×3000, base64), `BASE_INDEX` (Uint16 base64),
`BASE_SCALE`, `JOINTS` (≈100 repères normalisés), `BASE_STATS`.
Embarquement en base64 volontaire : **le build `vite-plugin-singlefile` prévu pour la
suite doit rester un seul fichier HTML**, donc pas d'asset externe à charger.

Repères clés (normalisés, hauteur du corps = 1, retrouvés dans `JOINTS`) :

| repère | x | y | z |
|---|---|---|---|
| pelvis | 0 | 0,534 | 0,009 |
| spine-3 (taille) | 0 | 0,602 | 0,009 |
| spine-2 | 0 | 0,658 | 0,016 |
| spine-1 (haut poitrine) | 0 | 0,750 | -0,004 |
| neck | 0 | 0,844 | 0,004 |
| l-shoulder | 0,101 | 0,805 | 0,009 |
| l-elbow | 0,188 | 0,700 | 0,008 |
| l-hand | 0,259 | 0,637 | 0,105 |
| l-upper-leg | 0,066 | 0,519 | 0,007 |
| l-knee | 0,095 | 0,268 | 0,019 |
| l-ankle | 0,132 | 0,043 | -0,001 |
| l-foot-1 (orteils) | 0,132 | 0,004 | 0,073 |

`src/lib/base/pose.ts` — **pose de repos bakeée au premier chargement** (le mesh
MakeHuman est livré en A-pose large, bras à ~40° du corps, pieds écartés) :

- adduction des bras par rotation dans le plan frontal autour de l'épaule,
  `SHOULDER_TARGET = 26°`, fondu `smoothstep(-0.16, 0.22)` le long de l'os ;
- adduction des jambes `LEG_ADDUCT = 3.5°` autour de la hanche ;
- contre-rotation du pied pour le garder à plat.
- Les verts **et** les repères d'articulations sont transformés (sinon le squelette
  logiciel ne correspond plus au maillage).

`src/lib/body.ts` — moteur de morphing (remplace l'ancien body.ts loft) :

- `BodyParams` inchangé (13 scalaires, mêmes noms qu'en v1).
- **Squelette logiciel** : 21 segments (`pelvis`, `spine4..spine2`, `chest`, `neck`,
  `head`, ×2 `clav/uarm/farm/hand/uleg/lleg/foot`) construits à partir des `JOINTS`.
- **Poids de peau** : pour chaque sommet, `w = exp(-(d/σ)²)` normalisé, σ par os
  (0,028 → 0,085). Calculés **une fois** puis mis en cache.
- **Masques de déformation** (`getMasks()`, 14 masques) : `fat`, `belly`, `glute`,
  `pec`, `lat`, `abs`, `trap`, `delt`, `arm`, `fore`, `thigh`, `calf`, `torso`, `side`.
- **Déplacements** : le long de la normale de repos (graisse, muscles) ou le long de
  ±z / ±x (ventre, pectoraux, abdos, fessiers, dorsaux). Amplitudes actuelles :
  `fat 0.0062 · bellyD 0.034 · glute 0.013 · pec 0.012 · lat 0.015 · abs 0.006 ·
  trap 0.010 · delt 0.013 · arm 0.012 · fore 0.008 · thigh 0.012 · calf 0.011`
  (unités normalisées, ×hauteur ensuite). **Non calibrées** — à régler visuellement.
- Référence des paramètres : `fat = 12` et tous les muscles à 50 = mesh brut sans
  déformation ; `DEFAULT_PARAMS` = `fat 18, belly 30, muscles 45`.
- `buildBody(params)` → `{ group, metrics }` (API inchangée pour `App.tsx`) ;
  `buildBodyGeometry(params)` → `{ geometry, metrics, positions }` (utilisée par le
  script de calibration).
- Métriques : volume signé du maillage fermé + périmètres par tranche.

### 3.3 Rendu actuel — problèmes identifiés (voir les captures `docs/etat-2026-10-19-*.png`)

1. **Le mesh MakeHuman neutre est très féminin** : hanches larges, poitrine bombée,
   épaules étroites, membres fins. La silhouette ne ressemble pas à un homme adulte.
   → **C'est le problème n°1 actuel.**
2. **Le poids affiché est faux** : `10,4 kg` au lieu de ~70 kg (bug identifié, §4).
3. **Tour de poitrine absurde** : `517,7 cm` (bug identifié, §4). Taille `109 cm`
   également trop grande.
4. **Pose des mains** : les doigts partent en avant/en griffe ; les avant-bras sont
   inclinés vers l'avant (`z` du poignet = 0,105 soit ~18 cm devant la cuisse).
   Le pied/la cheville restent raides.
5. Le visage est une tête lisse aux paupières fermées (pas d'yeux). Acceptable pour un
   mannequin, à valider avec l'utilisateur.

### 3.4 Piste validée pour la suite (format confirmé au §5)

Le dépôt `makehumancommunity/makehuman` contient les **cibles de morphing officielles**
(`.target`, **texte ASCII**, **CC0**) qui transforment le mesh de base et permettent de
régler proportions, V-taper, pectoraux, tour de bras, etc. Le format exact, les tailles
et le plan d'intégration sont décrits au **§5**.

---

### 3.5 Session 2 — reconstruction complète de la 3D (2026-10-20)

C'est le gros du travail : le corps est passé de « mannequin lisse androgyne » à
« sculpture masculine musclée » conforme au §1bis.

**1. Pose (`src/lib/base/pose.ts`) — réécrite.** Le mesh MakeHuman arrive en A-pose
large, coude plié de ~43° vers l'avant. L'ancienne pose (rotations successives
épaule puis coude) produisait un « effet bonbon » au coude et des mains
déchirées. Elle est remplacée par une **déformation de cylindre généralisé** :
chaque section du membre est transportée le long d'une polyligne cible
(épaule → coude → poignet) avec une rotation locale continue (tangente lissée au
coude). Points à ne pas casser :
- l'axe doit être reconstruit sur la **géométrie morphée** (`nearestOf()`), pas sur
  les articulations d'origine, sinon la classification main/bras est fausse ;
- la main est un **bloc rigide** suivant le poignet (`beyond`), pas transportée
  section par section (sinon la palette plate s'étire) ;
- le rayon de la main doit couvrir les doigts (0,15 → 0,28 normalisé) ;
- garde-fou de déplacement à 0,45 : la main se déplace légitimement de ~28 cm.

**2. Cibles MakeHuman (`scripts/prep-targets.py` + `src/lib/base/targets.ts`).**
34 couches (674 Ko) : identité masculine, muscle/grassesse par segment, V-taper,
pectoraux, dorsaux et mesures (épaules, bras, cuisses, mollet, cou, taille).
Poids déduits des sliders dans `getLayerWeights()`. Le mesh de base est en fait
**neutre** : c'est la couche `caucasian-male-young` qui donne le virage masculin.

**3. Anatomie gravée (`src/lib/base/details.ts`).** Rainures (polylignes 2D pour le
torse, 3D pour les membres) et renflements : pectoraux + sillon sternal + pli
sous-mammelon, abdominaux (4 rangées calées sur le nombril réel du mesh, mesuré à
y≈0,605), linea alba, obliques, serratus, trapèzes, rhomboïdes, grand dorsal,
colonne, érecteurs, deltoïdes, biceps/triceps, brachio-radialien, quadriceps,
mollet. Deux compétences acquises :
- à 13 380 sommets (~1,5 cm d'arête) une rainure de 6 mm est **sous-échantillonnée** :
  il faut l'élargir à ~1,5-2 cm, sinon elle disparaît dans les normales lissées ;
- le **bump mapping analytique** (normales par fragment) aliasse violemment à cette
  densité : `applyBumpNormals` existe mais son gain est mis à 0 (à réactiver
  seulement avec un maillage plus dense).

**4. Génitaux (`src/lib/base/genitals.ts`).** Maillage procédural (verge balayée +
scrotum), posé sur la surface pubienne réelle (relevée sur le corps construit),
échelle = taille du corps. Un seul modèle pour tous (décision utilisateur).

**5. Rendu studio (`src/scene/viewer.ts`).** Gris mat, fond dégradé gris neutre,
socle cylindrique clay, exposition 0,66, clé directionnelle douce.

**6. Métriques (`src/lib/body.ts`).** Bug du poids (÷H³) corrigé ; périmètres
recalculés par **enveloppe convexe** de la tranche (le tri angulaire créait des
zigzags) ; plan de coupe **recentré sur la géométrie réelle** du membre.

Captures de validation : `docs/etat-2026-10-20/`.
**Correctif de la session 2 bis — aisselles déchirées.** Le partage de la peau
entre le bras et le torse était fait par une bande radiale (0,07 → 0,115 autour
de l'axe du bras) : trop large, elle entrainait le torse avec le bras et
déchirait l'aisselle (trous visibles, arêtes en dents de scie). Remplacé par un
**vrai partage par poids de peau** (mêmes gaussiennes que `lib/body.ts` :
os du bras d'un côté, os du thorax de l'autre, poids = part du bras dans le
total). Même traitement pour les jambes (bassin + autre jambe côté tronc), sinon
c'est l'entre-jambes qui se déchire. Enfin, un **lissage de relaxation** (2
itérations, facteur 0,35) est appliqué aux seuls sommets de transition
(aisselle, entre-jambes) : ces zones étaient comprimées par la déformation et
formaient une fente sombre.

**Session 2 ter — abdominaux et « curseur dorsaux ».** Deux problems distincts :
- les abdominaux paraissaient *en creux* : mes rainures faisaient 2 cm de large,
  elles rongeaient les blocs. Et surtout, à 13 000 sommets, un bloc de 4 × 3,5 cm
  n'est représenté que par 3 × 2,7 sommets : impossible de graver un 8-pack net
  par la géométrie. Le relief fin est désormais porté par une **bump map
  procédurale** (`src/lib/base/bump.ts`) : le champ de déplacement des abdominaux
  est échantillonné en 256 × 256, son gradient est stocké en texture et injecté
  dans la normale **par fragment** (`onBeforeCompile`). Aucun aliasing, séparations
  nettes à tout zoom, exactement comme une sculpture retouchée.
  → `uBumpStrength` = 0,55, `uBumpInvH` suit la taille du corps.
- le curseur « dorsaux » creusait les flancs : la cible MakeHuman `vshape`
  (poids 0,9) rentrait le torse au mauvais endroit. Gain ramené à 0,45 et
  compensé par un renflement des dorsaux contrôlé (`dLat` 0,015 → 0,024).
- les rainures des genoux ont été adoucies (le « V » du vaste médial faisait un
  pli anguleux).
- Ajout d'une surcharge des paramètres par l'URL (debug) :
  `?fat=20&lats=30&arms=80` — pratique pour isoler l'effet d'un curseur.

## 4. Bugs connus, causes identifiées

### Bug 1 — poids divisé par H³ (affiché 10,4 kg)

Dans `src/lib/body.ts`, `buildBodyGeometry()` :

```ts
const volNorm = meshVolume(out, base.indices) / (H * H * H)
const weight = volNorm * 1000 * 1.0      // ❌ 10,4 kg
```

`out` est **déjà à l'échelle réelle** (mètres). Le volume renvoyé par `meshVolume` est
donc déjà en m³. Correctif attendu :

```ts
const volM3 = meshVolume(out, base.indices)   // m³ (mesh à l'échelle réelle)
const weight = volM3 * 1000 * K               // K ≈ 1.0 à calibrer
```

Repère : mesh brut à 1,75 m = 63,6 L. Pour que `DEFAULT_PARAMS` affiche ~74-75 kg
(crédible pour un homme de 1,75 m), soit `K ≈ 1,0` avec une morphologie par défaut
qui ajoute ~10 L (calibrer les amplitudes de graisse/muscle), soit `K ≈ 1,15` en
corrigeant le biais du mesh, qui est plus fin qu'un corps réel. **Décision à
prendre explicitement et à documenter dans l'UI** (c'est une estimation).

### Bug 2 — périmètres aberrants (poitrine 517 cm)

`slicePerimeter()` trie par angle autour du barycentre des points de la tranche puis
somme les distances. Deux causes probables :

- la bande horizontale de la poitrine (`0,755 · H`) contient aussi des **sommets des
  bras** (les bras ont été ramenés le long du corps, ils traversent la même tranche) →
  un jeu de points non convexe et multi-lobes fait exploser le périmètre ;
- le seuil de filtre `masks.torso[i] > 0.55` n'est pas suffisant pour exclure les bras
  après adduction.

Correctif attendu : filtrer par appartenance au membre (poids de peau du bras < seuil),
et/ou calculer le périmètre par **coupe dans un plan** (intersection triangle/plan)
plutôt que par tri de sommets. Vérifier taille/poitrine/bras/cuisse sur plusieurs
morphologies avant de s'y fier.

### Bug 3 — morphologie jugée « féminine » au rendu

⚠️ À lire avec le **bug 5** : le mesh de base **est déjà** un homme jeune moyen
(la cible `universal-male-young-averagemuscle-averageweight` est vide, cf. §5). Le
rendu « hanches larges / poitrine bombée / épaules étroites » vient donc très
probablement de la **pose bake** et/ou d'amplitudes de masques non calibrées
(`delt`, `lat`, `pec`), pas du maillage. Vérifier dans cet ordre avant de changer de
base ou de retélécharger quoi que ce soit.

### Bug 4 — mesures de calibration (2026-10-19, `npx tsx scripts/calibrate.ts`)

Le script fonctionne (le premier essai silencieux était un artefact de piping).
Sortie brute de référence, **à comparer après chaque correction** :

| cas | poids | maigre | taille | poitrine | bras | cuisse |
|---|---|---|---|---|---|---|
| neutre (mesh brut, sans morph) | 9,8 | 8,6 | 107,2 | 490,8 | 30,0 | 39,7 |
| défaut | 10,4 | 8,5 | 109,0 | 517,7 | 31,2 | 40,4 |
| sec | 9,4 | 8,6 | 104,8 | 469,3 | 29,3 | 39,6 |
| athlétique | 10,3 | 8,8 | 108,0 | 496,0 | 31,3 | 42,0 |
| bodybuilder | 11,7 | 9,9 | 109,3 | 511,2 | 36,0 | 48,3 |
| massif | 12,9 | 9,3 | 115,4 | 558,9 | 36,6 | 47,8 |
| gros (fat 40 / ventre 100) | 14,2 | 8,5 | 122,1 | 695,7 | 37,9 | 47,8 |
| maigre (fat 6) | 8,7 | 8,1 | 103,3 | 426,0 | 27,6 | 36,8 |
| grand (190 cm) | 10,4 | 8,5 | 118,3 | 562,0 | 33,9 | 43,8 |
| petit (160 cm) | 10,4 | 8,5 | 99,7 | 473,3 | 28,5 | 36,9 |

Lecture :

- le poids est **10× trop faible** (bug 1) et **invariant en taille** (le `/H³`
  annule exactement la mise à l'échelle — deuxième confirmation du bug) ;
- **taille et poitrine sont fausses** (107 cm de tour de taille pour un mesh fin,
  490 à 700 cm de poitrine) → `slicePerimeter` inutilisable sur le tronc en l'état ;
- les valeurs de **bras (28-38 cm) et de cuisse (37-48 cm)** sont dans des ordres de
  grandeur plausibles : la méthode marche sur les membres, elle casse sur le tronc
  (bande horizontale traversée par les bras + coupe non convexe).

### Bug 5 (hypothèse prioritaire) — la pose bake peut déformer le haut du torse

Le rendu actuel montre des épaules étroites et deux renflements de poitrine qui
ressemblent à des seins. Or les cibles MakeHuman (§5) montrent que
`universal-male-young-averagemuscle-averageweight` est **vide** : **le mesh de base est
déjà un homme jeune moyen**, la morphologie « féminine » n'est donc probablement **pas**
dans le mesh.

Suspect n°1 : `src/lib/base/pose.ts`, adduction de 26° avec un fondu
`smoothstep(-0.16, 0.22)` le long de l'axe du bras → des sommets du **haut du torse**
(t > −0,16, donc « derrière » l'épaule) sont entraînés par la rotation, ce qui peut
creuser les pectoraux et rentrer les épaules.

**À faire avant de toucher aux masques** : rendre le mesh **sans pose** (ajouter un
`?pose=0` de debug) et comparer. Si le torse est sain sans pose, corriger le fondu
(p. ex. `smoothstep(0.02, 0.45)`) ou déplacer le pivot.

---

## 5. Piste validée : les cibles de morphing MakeHuman (CC0)

### Ce que c'est

MakeHuman construit ses personnages en partant du même `base.obj` puis en appliquant
des **cibles** (deltas par sommet), éventuellement pondérées. Le dépôt contient :

```
makehuman/data/targets/macrodetails/universal-male-young-averagemuscle-averageweight.target
makehuman/data/targets/macrodetails/universal-male-young-{min|max}muscle-{min|average|max}weight.target
makehuman/data/targets/macrodetails/caucasian-male-young.target
makehuman/data/targets/torso/torso-vshape-incr.target          ← taille fine / épaules larges
makehuman/data/targets/torso/torso-muscle-pectoral-incr.target ← pectoraux
makehuman/data/targets/torso/torso-muscle-dorsi-incr.target    ← dorsaux
makehuman/data/targets/measure/measure-shoulder-dist-incr.target
makehuman/data/targets/measure/measure-waist-circ-decr.target
makehuman/data/targets/measure/measure-upperarm-circ-incr.target
makehuman/data/targets/measure/measure-thigh-circ-incr.target
makehuman/data/targets/measure/measure-calf-circ-incr.target
makehuman/data/targets/measure/measure-neck-circ-incr.target
makehuman/data/targets/hip/hip-scale-horiz-decr.target
makehuman/data/targets/stomach/stomach-tone-incr.target
... (des centaines d'autres : nez, bouche, yeux, âge, ethnie…)
```

URL brute : `https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/<chemin>`
Licence des **assets** : CC0 1.0 (`LICENSE.ASSETS.md` du même dépôt).
⚠️ Le **code** de MakeHuman est AGPL3 : ne pas copier-coller `makehuman/lib/targets.py`
dans le projet. Écrire un lecteur indépendant (le format est simple) et le documenter.

### Format `.target` — **confirmé** (2026-10-19, fichiers téléchargés et inspectés)

- **Texte brut ASCII** (pas binaire, pas compressé) :
  - lignes `#` = en-tête. Licence **explicitement CC0** : « This asset was explicitly
    released as CC0 in september 2020 », copyrights Manuel Bastioni (2014), Data
    Collection AB, Joel Palmius, Jonas Hauquier (2020) ;
  - ligne `# basemesh hm08` = version du mesh de base (celle de notre `base.obj`) ;
  - puis **une ligne par sommet déplacé** : `<index> <dx> <dy> <dz>`,
    ex. `760 .011 -.018 -.002`.
- **Indices** : ceux du `base.obj` **complet** (19 158 sommets, helpers compris) → il
  faut les utiliser **avant** le remappage du groupe `body` fait dans `prep-base.py`.
- **Unités** : celles du `base.obj`, hauteur du corps = **16,659 unités** →
  **1 unité ≈ 0,105 m** à 1,75 m. Exemple : un delta de 0,416 ≈ **4,4 cm**.
- **Combinaison linéaire** : `mesh = base + Σ w_i × delta_i`, poids 0 → 1 (modèle
  MakeHuman).

### Tailles et contenu des cibles déjà téléchargées (repères)

| cible | sommets déplacés | delta max | ≈ cm |
|---|---|---|---|
| `universal-male-young-averagemuscle-averageweight` | **0** | — | — |
| `universal-male-young-maxmuscle-averageweight` | 6 825 | 0,416 | 4,4 |
| `universal-male-young-averagemuscle-maxweight` | 7 354 | 0,260 | 2,7 |
| `caucasian-male-young` | 19 150 | 1,328 | 14,0 |

**Découverte majeure** : `universal-male-young-averagemuscle-averageweight` est **vide**
(0 delta) → **le `base.obj` EST déjà le corps « homme jeune, muscle moyen, poids
moyen »**. La silhouette jugée « féminine » vient donc de notre pose/morphing
(voir §4 bug 5), pas du mesh. Conséquence : inutile de chercher une « base mâle »
ailleurs ; il faut corriger la pose, puis empiler les cibles `muscle`/`weight` et les
cibles anatomiques.

### Plan d'intégration recommandé (révisé)

1. `scripts/prep-targets.py` : **lecteur ASCII indépendant** (ne pas copier le code
   AGPL3 de MakeHuman), téléchargement + cache des cibles dans
   `scripts/assets/targets/`, puis export de **couches de déformation** dans
   `src/lib/base/targets.ts` :
   - encodage **creux** (seuls les sommets déplacés) : `Uint16` index + `Int16`×3 delta,
     ≈ 8 octets/sommet → ~55 Ko par cible, ~0,7 Mo pour 12 cibles ;
   - quantifier les deltas (×4000) avec un facteur d'échelle par couche ;
   - conserver les conventions actuelles (pieds à 0, hauteur 1, visage +z).
2. Ordre des couches, poids pilotés par les sliders :
   `male` (`caucasian-male-young`, poids 1 par défaut) → `muscle` (min/average/max) →
   `weight` (min/average/max) → `vshape`, `pectoral`, `dorsi`, `stomach-tone`,
   `pelvis-tone`, `measure-shoulder-dist`, `measure-waist-circ`,
   `measure-upperarm-circ`, `measure-thigh-circ`, `measure-calf-circ`,
   `measure-neck-circ`.
3. **Boxer brief procédural** (indispensable pour coller aux images) : sélectionner les
   sommets hanches/cuisses, les décaler le long des normales (~8 mm), fermer par une
   **ceinture** et des **bandes de cuisse**. Il suit ainsi toutes les morphologies et
   masque le pubis.
4. **Yeux** : `makehuman/data/eyes/low-poly/low-poly.obj` (CC0). Le groupe `body` est
   watertight (paupières fermées) → vérifier au rendu avant d'investir.
5. **Matière** : gris clay mat (roughness ~0,7, **sans clearcoat**), fond gris,
   socle cylindrique biseauté (déjà présent), lumière 3 points douce.
6. **Cheveux rasés** : phase 2 (texture procédurale), non bloquant.

### Ce qu'il ne faut PAS refaire

- Ne pas retenter un mesh loft maison (§3.1) : rejeté par l'utilisateur.
- Ne pas chercher un autre mesh de base : celui-ci est propre, manifold, CC0, et
  **déjà masculin**.
- Ne pas appliquer `caucasian-male-young` sans vérifier visuellement : c'est une couche
  lourde (19 150 sommets, jusqu'à 14 cm) ; l'essayer en premier à poids 1 sur la base
  **non posée**.

---

## 6. Recettes de l'environnement (tablette Android / PRoot Ubuntu)

Contexte machine complet : **`/root/AGENTS.md`** (à lire). L'essentiel pour ce projet :

- **Serveur de dev** : `cd /root/muscu3d && npm run dev` → `http://127.0.0.1:5173`.
  Vérifier avec `curl -s -o /dev/null -w '%{http_code}' -m 5 http://127.0.0.1:5173/`.
- **Screenshot headless** (Firefox n'a pas de WebGL ici, **utiliser Chromium**) :

  ```bash
  scripts/shot.sh /tmp/opencode/sortie.png "?view=troisquarts"
  # = LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe \
  #   /root/.local/chromium-125/chrome --headless=new --no-sandbox \
  #   --disable-gpu-sandbox --disable-dev-shm-usage --use-angle=gl-egl \
  #   --ignore-gpu-blocklist --user-data-dir=/tmp/chrome-shot-XXXX \
  #   --window-size=1400,900 --virtual-time-budget=12000 --screenshot=… URL
  ```

- **Typecheck** : `npx tsc --noEmit` (doit rester vert avant toute capture).
- **Calibration** : `npx tsx scripts/calibrate.ts` (⚠️ bug 4).
- **Deep links de test** (dans l'URL) :
  `?view=face|profil|dos|troisquarts` · `?wire=1` · `?preset=sec|athletique|bodybuilder|massif`
  · `?mode=target` · `?cam=x,y,z&target=x,y,z` (caméra libre pour les gros plans).
- **Un seul gros job à la fois** (build, install, capture) : ~2 Go de RAM libres.
- **Jamais `rm -rf`.** Utiliser `trash <fichier>`.
- `npm`/`npx` résolvent vers les binaires **Termux**, `node` vers Ubuntu : ne pas
  s'étonner, vérifier avec `command -v`.
- Pas de systemd/cron : les services vivent en tmux ou en boucle.

---

## 7. Roadmap (après validation visuelle)

Ordre imposé par l'utilisateur — **ne pas sauter d'étape** :

1. ✅/⏳ **Qualité du corps 3D — PRIORITÉ ABSOLUE** (en cours) : obtenir le rendu du
   §1bis, dans cet ordre :
   1. rendre le mesh **sans pose** (`?pose=0`) → vérifier/corriger le bug 5 ;
   2. écrire `scripts/prep-targets.py` (lecteur ASCII, §5) et empiler `caucasian-male-young`
      puis `maxmuscle` / `maxweight` → silhouettes masculines réalistes ;
   3. générer le **boxer brief** procédural ;
   4. ajouter la **définition anatomique** manquante (masques procéduraux : abdos, serratus,
      sartorius, séparations) ;
   5. matière grise mate + cadrages de contrôle (face/profil/dos/3-4, plongée,
      contre-plongée, gros plans) ;
   6. **validation utilisateur** (captures) avant tout le reste.
2. **Saisie du poids réel** — exigence explicite : « c'est pas un truc estimé ».
   L'utilisateur doit pouvoir entrer son vrai poids (et éventuellement ses mensurations)
   pour recaler le modèle. Le poids estimé reste un fallback, clairement étiqueté.
3. **Refonte UI/UX** — constat utilisateur : « on comprend rien ». Repenser la
   hiérarchie : d'abord « où j'en suis », puis « où je veux aller », puis le plan.
4. **Générateur de programme** (salle / maison / rien, horizon au choix, débutant →
   avancé) — **le programme doit réellement s'afficher après saisie des infos**
   (défaut constaté en v1 : rien ne s'affichait).
5. **Nutrition** conditionnelle (prise de masse / sèche / maintien).
6. **Timeline bimensuelle** : mise à jour du vecteur corporel + avant/après 3D.
7. **Jauge de faisabilité** objectif vs horizon, avec explication des limites et
   budget d'erreur ±4-8 kg assumé.

---

## 8. Journal des manipulations déjà effectuées

- `git init` + commit de la v1 loft ; identité locale au dépôt.
- Téléchargement de `makehuman-base.obj` → `scripts/assets/` (+ README de provenance).
- Écriture de `scripts/prep-base.py` (OBJ → `src/lib/base/data.ts`, quantifié Int16
  ×3000, base64) puis exécution.
- Écriture de `src/lib/base/mesh.ts` (décodage, `getBaseMesh`, `geometryFromPositions`).
- Écriture de `src/lib/base/pose.ts` (pose de repos bakeée).
- Réécriture complète de `src/lib/body.ts` (squelette logiciel, poids de peau, masques,
  morphing, métriques) — `App.tsx` et `viewer.ts` **inchangés** grâce à l'API conservée.
- `npx tsc --noEmit` : vert.
- Captures `/tmp/opencode/m3-base-34.png` et `m3-base-face.png`
  (copiées dans `docs/etat-2026-10-19-*.png`) → diagnostic §3.3.
- Écriture de `scripts/shot.sh` et `scripts/calibrate.ts`.
- Téléchargement et inspection de 4 cibles MakeHuman (`macrodetails/`) : format ASCII
  confirmé, tailles et deltas mesurés (§5).
- Copie des **8 images de référence** dans `docs/reference/` avec un nom par vue
  (mappage : planche contact 4×2 générée via ffmpeg depuis `/sdcard/Download/image_*.jpg`).
- Rédaction/mise à jour de `AGENTS.md` : §0 consigne, §1bis goal visuel + chemins,
  §4 bug 5 (pose), §5 format + plan confirmés.

### Fichiers à ne PAS éditer à la main

- `src/lib/base/data.ts` — **généré**. Modifier `scripts/prep-base.py` puis régénérer
  (`python3 scripts/prep-base.py`).
- `docs/etat-2026-10-19-*.png` — captures d'état, à remplacer par les suivantes.

### Raccourcis de lecture du code

- `src/lib/base/mesh.ts` — décodage des données et `geometryFromPositions(pos)` :
  crée une `BufferGeometry` (positions + index + normales lissées) depuis un
  `Float32Array` de positions.
- `src/lib/base/pose.ts` — `getPosedBase()` : applique la pose de repos (bras
  descendus) une seule fois et renvoie positions + articulations + normales.
