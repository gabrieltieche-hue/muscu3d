# Plan — Adonis paramétrable : base, shape keys et rendu studio

**Projet** : `/root/muscu3d`
**Date** : 27 octobre 2026
**Statut** : plan de travail, aucune modification du code n'a été faite.
**Objectif** : remplacer définitivement MakeHuman par Adonis, faire d'Adonis la
référence à 0, conserver les mêmes clés `BodyParams`, et obtenir un rendu de
statue studio réellement convaincant.

---

## 0. Décisions actées

| Sujet | Décision |
|---|---|
| Modèle de référence | **Adonis uniquement**. MakeHuman est archivé, plus utilisé par le runtime. |
| Maillot | **Conservé** (le boxer sculpté reste). Pas de génitaux ajoutés. |
| Curseurs | **Signés −100 à +100**, avec **0 = Adonis exactement**. |
| Shape keys | **Pipeline Python déterministe** (numpy/scipy) → **morph targets glTF** dans le GLB. Pas de dépendance Blender obligatoire. |
| Base | **Régénérer un Adonis de meilleure qualité**, puis nettoyage léger (option 1). Repli sur le mesh actuel si la régénération n'est pas meilleure. |
| Premier jet | Ce plan. L'implémentation commence après validation. |

---

## 1. Recommandation sur la base : régénérer, puis nettoyer

### Pourquoi régénérer

Le fichier actuel `public/modele.glb` est un scan Meshy de qualité moyenne :

- 26 581 sommets / 53 162 triangles, un seul maillage watertight ;
- **aucune UV, aucun squelette, aucun shape key** ;
- anatomie molle : pectoraux peu séparés, abdos absents, deltoïdes fondus ;
- **maillot moulé** visible à la hanche et autour des cuisses ;
- facettes et coutures de scan sur le flanc ;
- visage peu détaillé, mains partiellement fusionnées.

Un scan plus propre ne remplace pas le travail de shape keys, mais il **relève le
plafond de qualité** et réduit les réparations. C'est le meilleur investissement
avant de sculpter les cibles.

### Ce qu'il faut demander à la régénération

Le modèle doit rester **le même Adonis** (même silhouette, même pose, même
maillot). Si le nouveau modèle change d'identité, on garde l'actuel et on passe
en option 1.

Cahier des charges :

- **Corps entier**, debout, pieds à plat, bras légèrement écartés (10–15°),
  symétrique, visage neutre, **yeux ouverts si possible** ;
- **maillot conservé**, arête propre, pas de plis exagérés ;
- **pas de socle** ni de sol dans le fichier (ou socle sous les pieds, masquable) ;
- **maillage unique, watertight**, sans pièces flottantes ni auto-intersections ;
- **environ 50 000 à 80 000 triangles** pour le runtime (ou un fichier source
  plus dense que l'on décimera) ;
- **mains avec doigts séparés** et pieds lisibles ;
- export **GLB**, sans animation ni rig obligatoire ;
- pas de texture nécessaire : la matière argile est appliquée par le code.

> Si Meshy ne produit que des modèles très denses, on décime à ~50–80 k triangles
> avec Blender headless (installation ponctuelle) ou un script de décimation.
> Le budget GPU des morph targets dépend directement du nombre de sommets.

### Option 1 (repli ou complément) : nettoyage du mesh actuel

Même sans régénération, on peut :

1. **Lisser** le scan (Taubin, 2–3 itérations, conservation du volume) pour
   enlever les facettes et la couture du flanc.
2. **Symétriser** gauche/droite (le mesh est déjà symétrique à ~1,4 mm près).
3. **Nettoyer l'arête du maillot** sans le supprimer (le maillot reste, mais la
   ligne devient franche et propre).
4. **Resculpter l'anatomie de base** : pectoraux, sillon sternal, abdos,
   deltoïdes, dorsaux, quadriceps, mollets, fessiers, trapèzes.
5. **Rétablir les pieds** exactement à y = 0 et supprimer le socle du fichier.

Cette option est incluse dans le pipeline dans tous les cas : si le modèle
régénéré est bon, le nettoyage est plus léger ; s'il ne l'est pas, on conserve
l'actuel et on applique l'option 1 complète.

---

## 2. État des lieux technique

### 2.1 Le modèle

`public/modele.glb` (alias `meshy-adonis.glb`, « Grey Adonis ») :

| Propriété | Valeur |
|---|---|
| Sommets | 26 581 |
| Triangles | 53 162 |
| Maillages | 1 |
| Composantes connexes | 1 |
| Watertight | oui (0 arête frontière, 0 arête non-manifold) |
| UV | **aucune** |
| Squelette | **aucun** |
| Shape keys | **aucune** |
| Symétrie miroir | médiane 1,4 mm, p95 4,3 mm (hauteur 1) |
| Matériau | aucun (le code applique l'argile) |
| Base | disque de socle sous y = 0, masqué par le socle du studio |

### 2.2 Le moteur actuel

`src/lib/statue.ts` → `buildParametricStatue()` :

- calcule des masques anatomiques (`computeMasks` dans `src/lib/body.ts`) ;
- à chaque mise à jour, **déplace les sommets le long des normales** ;
- recalcule les normales et les mesures à chaque image (~9 ms) ;
- ne connaît pas les muscles : un pectoral est un champ de distance, pas une
  forme anatomique.

C'est la cause principale de l'aspect « mou ». Les curseurs fonctionnent, mais
la déformation n'est pas crédible.

### 2.3 Les défauts visuels constatés sur la capture du 27/10

Capture : `/tmp/opencode/plan/actuel-34.png`.

- anatomie lisse, sans séparation pectorale ni abdos ;
- maillot visible (ligne en relief à la hanche et autour des cuisses) ;
- couture/facettes sur le flanc, aspect scan ;
- visage et mains peu lisibles ;
- cadrage trop large : le corps occupe ~60 % de la hauteur de la scène ;
- lumière plate : ambiante/hémisphérique trop fortes, ombre dure sur le flanc,
  pas de véritable contre-jour ;
- mesures fausses : **115 cm de tour de taille, 27,3 cm de bras** pour ce corps.

### 2.4 Les mesures

`src/lib/statue.ts` mesure les tours par **enveloppe convexe de tranche**. La
tranche traverse les bras, d'où les 115 cm. La méthode fiable par **coupe de
plan + assemblage des segments** existe déjà dans `scripts/dev/measure.ts`.
Elle doit être portée dans le runtime (ou dans un Web Worker).

### 2.5 L'environnement

- Blender **absent**, mais disponible via apt (`5.0.1+dfsg-1ubuntu1`, ARM64).
- numpy 2.3.5, scipy 1.16.3 disponibles.
- RAM libre ~1,5 Go : éviter Blender lourd en parallèle d'un build.
- Chromium 125 headless + `scripts/shot.sh` pour les captures (40–60 s chacune).
- Le serveur de dev tourne sur `http://127.0.0.1:5173`.

---

## 3. Architecture cible

### 3.1 Flux de production

```
Meshy brut (.glb)
   │
   ├─ scripts/prep-external.py       pieds à 0, hauteur 1, centrage, socle caché
   ▼
public/adonis-source.glb             (fichier de travail, non versionné si lourd)
   │
   ├─ scripts/sculpt/clean.py        lissage, symétrie, maillot, artefacts
   ├─ scripts/sculpt/landmarks.py    repères anatomiques → landmarks.json
   ├─ scripts/sculpt/master.py       sculpt anatomique de référence (0)
   ├─ scripts/sculpt/targets.py      15 shape keys (deltas)
   ├─ scripts/sculpt/export_glb.py   POSITION + NORMAL + morph targets + extras
   ▼
public/adonis.glb                    (runtime, morph targets inclus)
   │
   ├─ src/lib/adonis.ts              GLTFLoader → morphTargetInfluences
   ├─ src/lib/measure3d.ts           coupe de plan fiable
   ├─ src/lib/metrics.worker.ts      mesures hors thread principal
   └─ src/scene/viewer.ts            studio, lumière, caméra, matière
```

### 3.2 API conservée

Les clés de `BodyParams` ne changent pas :

```ts
height, fat, belly, neck, shoulders, lats, pecs, abs,
glutes, thighs, calves, arms, forearms
```

Le composant React continue d'envoyer un `BodyParams` et de recevoir un
`BodyMetrics`. Seule l'implémentation du moteur change.

### 3.3 Sémantique des paramètres

- `height` : centimètres (150–200), appliqué par **échelle uniforme**, pas par
  morph target.
- `fat`, `belly`, `neck`, `shoulders`, `lats`, `pecs`, `abs`, `glutes`, `thighs`,
  `calves`, `arms`, `forearms` : **−100 à +100**, avec **0 = Adonis**.
- Le pourcentage de masse grasse affiché dans la fiche devient une **valeur
  dérivée** (`BodyMetrics.fatPercent`), estimée à partir du volume et du poids
  maigre. Adonis aura une valeur de référence (≈ 12 %), mais le curseur
  « Adiposité » sera bien à 0.
- Les presets sont retraduits en valeurs signées autour d'Adonis :
  - `Sec` : muscles −15 à −25, adiposité −25 ;
  - `Athlétique` : proche de 0, légèrement sec ;
  - `Bodybuilder` : muscles +40 à +70, adiposité −15 ;
  - `Massif` : adiposité +70, ventre +80, muscles +10.

> Point à confirmer à l'implémentation : l'affichage « Masse grasse » de la
> fiche doit-il rester un pourcentage physique (avec le curseur signé à côté),
> ou devenir un simple indicateur dérivé ? Le plan retient la seconde option,
> plus cohérente avec « 0 = Adonis ».

### 3.4 Morph targets

Un seul maillage, plusieurs cibles linéaires. Chaque cible stocke :

- un delta de **position** (Float32) ;
- un delta de **normale** (Float32), pour que l'éclairage reste correct quand
  la forme change.

Three.js applique les influences sur GPU ; la mise à jour d'un curseur ne
touche plus la géométrie CPU. Le maillage filaire partage la même géométrie,
donc il se déforme aussi.

### 3.5 Mesures

- `measure3d.ts` : volume signé, poids, coupe de plan (segments), périmètres
  taille / poitrine / bras / cuisse.
- Worker : reçoit une fois les positions de base, les indices et les deltas ;
  recalcule les positions pour les influences courantes ; renvoie `BodyMetrics`.
- Fréquence : 10–12 Hz pendant un glissement. Le rendu reste à 60 fps ; les
  chiffres se mettent à jour avec un léger retard, acceptable.
- Repli : tableau linéaire précalculé si le worker n'est pas disponible.

---

## 4. Découpage en lots

### Lot 0 — Base (action utilisateur)

- Décider : régénération ou option 1 sur le mesh actuel.
- Si régénération : produire le GLB selon le cahier des charges §1 et le
  déposer dans `scripts/assets/`.
- Commande de préparation :

```bash
cd /root/muscu3d
python3 scripts/prep-external.py scripts/assets/adonis-v2.glb --out public/adonis-source.glb
```

- Contrôle automatique : nombre de sommets, watertight, composantes, symétrie,
  auto-intersections, hauteur, pieds à 0, maillot.
- **Livrable** : `public/adonis-source.glb` + rapport d'audit.

### Lot 1 — Nettoyage, repères, master sculpt

- `scripts/sculpt/clean.py` :
  - Taubin smoothing (2–3 itérations) ;
  - symétrisation gauche/droite ;
  - nettoyage de l'arête du maillot (conservé) ;
  - suppression du socle éventuel (ou maintien sous y = 0) ;
  - recalcul des normales.
- `scripts/sculpt/landmarks.py` :
  - détection automatique : cou, épaules, aisselles, coudes, poignets, hanches,
    genoux, chevilles, entrejambe, nombril, pectoraux, omoplates, crâne ;
  - validation visuelle avec `?joints=1` ;
  - export `landmarks.json`.
- `scripts/sculpt/master.py` :
  - champs anatomiques de référence (pectoraux, sillon sternal, abdos,
    deltoïdes, dorsaux, trapèzes, quadriceps, mollets, fessiers) ;
  - application à la base à une amplitude « référence » ;
  - lissage des déplacements ;
  - conservation de la silhouette (contrôle des largeurs aux niveaux clés).
- **Livrable** : `public/adonis-base.glb` + `landmarks.json` + captures
  4 vues.
- **Critères** : silhouette à ±1 cm des largeurs actuelles, aucun pic, pieds à
  plat, maillot propre, symétrie parfaite.

### Lot 2 — Shape keys

- `scripts/sculpt/fields.py` : primitives de champ :
  - capsule / ellipsoïde orienté le long d'un muscle ;
  - superellipse pour les plaques (pectoraux, abdos) ;
  - rainure / crête (sillon sternal, séparation des abdos, tendon) ;
  - atténuation par distance géodésique (respecte l'aisselle et l'aine) ;
  - lissage laplacien du champ de déplacement.
- `scripts/sculpt/targets.py` : les 15 cibles (voir §5).
- `scripts/sculpt/export_glb.py` : écriture du GLB avec morph targets,
  normales par cible, `extras` (repères, mesures, version, paramètres de
  référence).
- `scripts/sculpt/audit.py` : contrôle de chaque cible :
  - déplacement max, nombre de sommets touchés ;
  - erreur de symétrie ;
  - triangles inversés / aires minimales ;
  - auto-intersections approximatives (grille + KD-tree) ;
  - volume avant/après.
- `scripts/sculpt/qa.sh` : captures automatiques (base, chaque cible à −100 / 0
  / +100, combos extrêmes) + planche contact.
- **Livrable** : `public/adonis.glb` + `rapport-adonis.json` + planche contact.
- **Critères** : chaque cible est visible et anatomiquement plausible ; aucune
  cible ne crée de pic, de pli inversé ou d'auto-intersection aux amplitudes
  validées.

### Lot 3 — Runtime, mesures, suppression de MakeHuman

- `src/lib/bodyParams.ts` : `BodyParams`, `ADONIS_PARAMS` (zéros signés),
  `PRESETS`, `BodyMetrics`.
- `src/lib/adonis.ts` : chargement, matériau, influences, `update(p)`.
- `src/lib/measure3d.ts` + `src/lib/metrics.worker.ts`.
- `src/App.tsx` :
  - suppression du switch Adonis / MakeHuman ;
  - reset = Adonis (tous les curseurs à 0) ;
  - curseurs signés avec repère central à 0 ;
  - presets retraduits ;
  - fiche : poids, masse grasse dérivée, masse maigre, taille, poitrine, bras,
    cuisse ;
  - téléchargement de `adonis.glb`.
- `src/lib/base/model.ts` : simplification ou remplacement par un loader GLB
  dédié ; conservation de `?model=` pour le debug.
- Archivage de MakeHuman (voir §8).
- **Livrable** : application qui ne charge plus que `adonis.glb`.
- **Critères** : `npx tsc --noEmit` ✅, curseurs fluides, mesures cohérentes,
  plus aucune référence MakeHuman dans le bundle.

### Lot 4 — Rendu studio

- `src/scene/viewer.ts` :
  - cadrage plus serré (corps à ~82–85 % de la hauteur de la scène) ;
  - clé douce type softbox (`RectAreaLight` ou directionnelle large) ;
  - fill froid discret, deux contre-jours ;
  - réduction de l'ambiante/hémisphérique pour retrouver du contraste ;
  - correction de l'ombre dure / acne sur le flanc : tester `castShadow` désactivé
    sur le corps + GTAO, ou shadow map 4096 avec biais ;
  - GTAO plus propre (0,65–1,0 de résolution selon le niveau de qualité) ;
  - socle biseauté, contact shadow plus douce ;
  - mode galerie (`?gallery=1` ou touche `H`) pour cacher l'UI et capturer une
    image propre.
- Matière argile :
  - `MeshStandardMaterial` dédié, couleur ~#9a9a98, roughness ~0,62 ;
  - détail procédural **triplanaire** (pas d'UV) injecté via `onBeforeCompile` :
    grain de sculpture, sillons des abdos, striations des deltoïdes, plis ;
  - uniformes pilotés par les paramètres (`uAbs`, `uFat`, `uDetail`) ;
  - désactivation du détail au niveau de qualité le plus bas.
- Post : ACES, exposition ~1,0, vignette et grain discrets.
- **Livrable** : captures 4 vues + gros plans visage / mains / bassin / pieds.
- **Critères** : contraste et modelé proches des références, sans artefacts
  d'ombre, sans blur sur le canvas.

### Lot 5 — Nettoyage, documentation, déploiement

- Archiver MakeHuman (pas de suppression destructive) :
  - `src/lib/body.ts` (partie moteur) ;
  - `src/lib/base/*` ;
  - `src/lib/referenceProfile.ts` ;
  - `public/body.glb`, `public/statue.glb` ;
  - `scripts/prep-base.py`, `prep-glb.py`, `prep-targets.py` ;
  - `scripts/assets/makehuman-base.obj`, `scripts/assets/targets/*` ;
  - scripts de diagnostic MakeHuman.
- Mettre à jour `AGENTS.md`, `README.md`, `vercel.json`.
- `npm run build`, captures finales, déploiement Vercel.
- **Livrable** : dépôt propre, build vert, production à jour.

---

## 5. Tableau des cibles de morphing

| Cible | Curseur | Anatomie | Remarque |
|---|---|---|---|
| `neck` | `neck` | trapèzes + épaisseur du cou | signed |
| `shoulders` | `shoulders` | calottes deltoïdes + largeur du haut du dos | signed |
| `lats` | `lats` | grand dorsal, V du dos | signed |
| `pecs` | `pecs` | deux lobes, sillon sternal, bord inférieur | signed |
| `abs` | `abs` | plaque du grand droit + rainures | signed |
| `arms` | `arms` | biceps + triceps, séparation | signed |
| `forearms` | `forearms` | brachio-radial + fléchisseurs | signed |
| `glutes` | `glutes` | deux lobes + sillon | signed |
| `thighs` | `thighs` | quadriceps + ischio-jambiers | signed |
| `calves` | `calves` | gastrocnémien + soléaire | signed |
| `belly` | `belly` | projection viscérale du bas-ventre | signed |
| `fat_trunk` | `fat` | couche sous-cutanée : ventre, flancs, poitrine | signed |
| `fat_limbs` | `fat` | bras, cuisses, visage, cou | signed |
| `arms_out` | `fat` + `belly` | écarte les bras pour laisser passer le ventre | auxiliaire |
| `legs_out` | `fat` + `thighs` | écarte légèrement les cuisses | auxiliaire |

Total : **15 cibles**. Budget GPU estimé pour 26,5 k sommets :

```
15 × 26 581 × (3 + 3) × 4 octets ≈ 9,5 Mo
```

Si le modèle régénéré fait 50 k sommets : ~18 Mo. Acceptable sur tablette, mais
on plafonne le nombre de sommets ou on quantifie si nécessaire.

---

## 6. Direction artistique du rendu

La cible reste celle de `docs/reference/` : sculpture monochrome gris clair,
matière argile mate, fond gris neutre, socle cylindrique biseauté, lumière de
studio douce.

### Caméra

- Objectif équivalent 85 mm, FOV 30–34°.
- Cible à y ≈ 0,95 m, distance 3,8–4,2 m.
- Le corps doit occuper 82–85 % de la hauteur de la scène.
- Vue 3/4 par défaut, vues Face / Profil / Dos conservées.

### Lumière

- Clé chaude large (softbox) venant de la gauche, intensité 3,0–3,4.
- Fill froid très bas (0,2–0,3).
- Deux contre-jours (1,5–2,0 et 0,7–0,9) pour détacher la silhouette.
- Ambiante/hémisphérique 0,05–0,08 (contre 0,1 + 0,1 aujourd'hui).
- Environnement PMREM conservé pour les reflets, intensité 0,4–0,5.
- Ombre : privilégier le GTAO et une ombre de contact douce ; si l'ombre dure
  crée de l'acné, désactiver `castShadow` sur le corps ou passer en 4096 avec
  biais. La référence n'a pas d'ombre dure sur le corps.

### Matière

- Argile gris clair, roughness 0,60–0,65, metalness 0.
- Très léger spéculaire large (softbox) pour lire les volumes.
- Détail procédural triplanaire : grain fin, sillons, striations ; amplitude
  faible pour ne pas transformer la statue en peau.
- Pas de couleur de peau.

### Socle

- Rayon ~0,36 m, hauteur 0,05 m, biseau visible.
- Gris plus sombre que le corps, contact shadow douce.
- Le socle du fichier (sous y = 0) reste masqué.

### Mode galerie

- `?gallery=1` (ou touche `H`) : masque header, panneau, dock et hints.
- Caméra portrait pour les captures de communication.
- Indispensable pour juger le rendu sans l'UI.

---

## 7. Mesures fiables

### Ce qu'il faut calculer

- Poids : volume × 1000 × 1,02 (comme aujourd'hui).
- Masse grasse : dérivée du volume et de la masse maigre ; Adonis ≈ 12 %.
- Masse maigre : poids × (1 − fatPercent / 100).
- Tour de taille : coupe horizontale à 0,60 × H, segments assemblés.
- Tour de poitrine : coupe à 0,75 × H.
- Tour de bras : coupe perpendiculaire à l'axe épaule–coude, côté droit.
- Tour de cuisse : coupe perpendiculaire à l'axe hanche–genou.

### Méthode

- Porter `scripts/dev/measure.ts` dans `src/lib/measure3d.ts`.
- Le worker applique les deltas de morph aux positions de base, puis mesure.
- Vérifier contre la vérité Python sur 5 morphologies (sec, Adonis, massif,
  bodybuilder, obèse).
- Tolérance : ±1 cm sur les tours, ±1 kg sur le poids.

> C'est aussi une correction produit : les 115 cm actuels ne sont pas crédibles.

---

## 8. Suppression de MakeHuman

Tout est **archivé**, pas supprimé, pour pouvoir revenir en arrière.

| Élément | Destination |
|---|---|
| `src/lib/body.ts` (moteur) | `archive/makehuman/` |
| `src/lib/base/*` | `archive/makehuman/base/` |
| `src/lib/referenceProfile.ts` | `archive/makehuman/` |
| `public/body.glb` | `archive/makehuman/public/` |
| `public/statue.glb` | `archive/makehuman/public/` |
| `scripts/prep-base.py`, `prep-glb.py`, `prep-targets.py` | `archive/makehuman/scripts/` |
| `scripts/assets/makehuman-base.obj`, `scripts/assets/targets/*` | `archive/makehuman/assets/` |
| Scripts de diagnostic MakeHuman | `archive/makehuman/dev/` |

À conserver :

- `scripts/prep-external.py` (import générique) ;
- `scripts/dev/measure.ts` (mesure fiable) ;
- `scripts/shot.sh` (captures) ;
- le loader GLB et `?model=` pour le debug.

`src/lib/bodyParams.ts` est créé **avant** l'archivage, pour que les types
survivent.

---

## 9. Performance

| Point | Cible |
|---|---|
| Mise à jour d'un curseur | < 0,5 ms (influences GPU seulement) |
| Mesures | worker, < 10 ms, 10–12 Hz |
| Rendu à l'arrêt | 0 image (conservé) |
| Tablette | q2 par défaut, q1/q0 si le GPU ne suit pas |
| Détail procédural | désactivé en q0, réduit en q1 |
| Taille du GLB | viser < 8 Mo ; gzip Vercel |
| Mémoire morphs | 15 cibles × sommets × 6 × 4 octets |

Interdits rappelés par `AGENTS.md` :

- pas de `backdrop-filter` au-dessus du canvas ;
- pas de rendu continu ;
- pas de shadow map recalculée à chaque image ;
- pas de `Uint16Array` pour les indices d'un mesh dense.

---

## 10. Validation et critères d'acceptation

### Base

- [ ] Le mesh est watertight, une seule composante.
- [ ] Les pieds sont à y = 0, la hauteur vaut 1 dans le fichier normalisé.
- [ ] La symétrie miroir est < 0,5 mm.
- [ ] Le maillot est conservé et son arête est propre.
- [ ] Aucun pic, aucune facette visible sur le flanc.
- [ ] La silhouette reste celle d'Adonis (largeurs à ±1 cm).

### Shape keys

- [ ] 15 cibles exportées avec positions + normales.
- [ ] Chaque cible est visible à +100 et à −100.
- [ ] Aucun triangle inversé, aucune auto-intersection aux amplitudes validées.
- [ ] Symétrie parfaite des deltas.
- [ ] Le maillage filaire se déforme correctement.

### Runtime

- [ ] `npx tsc --noEmit` ✅.
- [ ] `npm run build` ✅.
- [ ] Curseurs fluides (pas de recalcul CPU de la géométrie).
- [ ] Mesures cohérentes avec la vérité Python.
- [ ] Plus aucune référence MakeHuman dans le bundle.
- [ ] `?stats=1` : fps proche de 60 en rotation, 0 rendu au repos.

### Rendu

- [ ] Captures 4 vues + gros plans validées.
- [ ] Contraste et modelé proches des références.
- [ ] Pas d'acné d'ombre, pas de couture de scan.
- [ ] Cadrage corps à 82–85 % de la hauteur.
- [ ] Mode galerie fonctionnel.

### Déploiement

- [ ] `dist/` régénéré.
- [ ] `adonis.glb` servi avec le bon Content-Type et le bon cache.
- [ ] Production Vercel à jour.

---

## 11. Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Le modèle régénéré change l'identité d'Adonis | Perte de la référence | Comparer les silhouettes avant de l'adopter ; repli sur l'actuel |
| Le scan reste mou malgré la régénération | Rendu décevant | Master sculpt + détail triplanaire + lumière |
| Topologie triangulaire irrégulière | Morphs moins propres | Champs lissés, symétrie, contrôle des inversions |
| Bras collés au ventre à forte adiposité | Auto-intersection | Cible `arms_out` pilotée par `fat` + `belly` |
| Cuisses qui se touchent | Auto-intersection | Cible `legs_out` |
| Morphs linéaires aux extrêmes | Formes artificielles | Amplitudes bornées, cibles auxiliaires, validation visuelle |
| Pas d'UV | Pas de normal map classique | Détail procédural triplanaire |
| Visage et mains limités par le scan | Gros plans décevants | Cadrage corps entier ; passe visage/mains optionnelle plus tard |
| Budget GPU des morphs | Chute de fps sur tablette | Plafond de sommets, qualité adaptative, quantification si besoin |
| Mesures fausses | Perte de crédibilité | Coupe de plan + worker + tests |
| Blender absent | Pas de .blend éditable | Pipeline Python ; installer Blender seulement si retopo/.blend demandé |

---

## 12. Fichiers touchés

### Nouveaux

```
scripts/sculpt/clean.py
scripts/sculpt/landmarks.py
scripts/sculpt/master.py
scripts/sculpt/fields.py
scripts/sculpt/targets.py
scripts/sculpt/export_glb.py
scripts/sculpt/audit.py
scripts/sculpt/qa.sh
src/lib/bodyParams.ts
src/lib/adonis.ts
src/lib/measure3d.ts
src/lib/metrics.worker.ts
public/adonis.glb
public/adonis-source.glb
```

### Modifiés

```
src/App.tsx
src/scene/viewer.ts
src/lib/base/model.ts  (ou remplacé par src/lib/glb.ts)
src/styles.css          (curseurs signés, repère 0, mode galerie)
index.html              (si mode galerie / meta)
AGENTS.md
README.md
vercel.json
```

### Archivés

Voir §8.

---

## 13. Commandes utiles

```bash
cd /root/muscu3d

# typecheck / build
npx tsc --noEmit
npm run build

# serveur de dev (en arrière-plan)
npm run dev

# préparation d'un modèle externe
python3 scripts/prep-external.py scripts/assets/adonis-v2.glb --out public/adonis-source.glb

# audit + shape keys (à venir)
python3 scripts/sculpt/audit.py public/adonis-source.glb
python3 scripts/sculpt/build.py --source public/adonis-source.glb --out public/adonis.glb

# captures
scripts/shot.sh /tmp/opencode/adonis-34.png "?view=troisquarts&gallery=1"
scripts/shot.sh /tmp/opencode/adonis-face.png "?view=face&gallery=1"

# mesures fiables (script existant)
node_modules/.bin/tsx scripts/dev/measure.ts
```

---

## 14. Ordre de travail recommandé

1. **Toi** : décider régénération ou option 1 ; si régénération, fournir le GLB.
2. **Moi** : lot 1 sur le mesh actuel pour valider le pipeline (nettoyage,
   repères, master sculpt, 3 cibles).
3. **Toi** : valider les captures de la tranche verticale.
4. **Moi** : lots 2 et 3 (toutes les cibles, runtime, mesures).
5. **Moi** : lot 4 (rendu), puis lot 5 (MakeHuman, docs, deploy).
6. **Toi** : test sur la tablette avec `?stats=1`, validation finale.

La tranche verticale permet de vérifier le style et la qualité avant de produire
les 15 cibles. Si la direction ne plaît pas, on corrige les champs, pas
l'architecture.

---

## 15. Ce que ce plan ne promet pas

- Un visage et des mains au niveau des images de référence : le scan ne les a
  pas. On peut les améliorer, pas les réinventer sans un autre mesh ou une passe
  de sculpt manuelle.
- Un sculpt ZBrush fait main : les cibles sont des champs anatomiques
  déterministes, pas des coups de pinceau.
- Une précision médicale : les mesures restent des estimations à ±1 cm.
- Un rendu instantané sur toutes les tablettes : la qualité adaptative est là
  pour ça, mais le GPU Mali reste le juge.

L'objectif réaliste est **une statue Adonis propre, anatomiquement lisible,
paramétrable et éclairée comme un studio**, très au-dessus du rendu actuel.
