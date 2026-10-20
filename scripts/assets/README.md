# Asset source : makehuman-base.obj

Mesh de base du projet MakeHuman (base.obj, 13380 sommets, 13378 faces, manifold fermé).

- Source : https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj
- Licence : CC0 1.0 Universal (LICENSE.ASSETS.md du dépôt MakeHuman)
- Contenu : corps nu neutre, sans textures, sans matériau. Les groupes helper-*
  (yeux, dents, cheveux, jupe, organes) et joint-* (repères d'articulations)
  sont présents dans le fichier ; le script `scripts/prep-base.py` n'exporte
  que le groupe `body` et les repères `joint-*`.

Ce fichier n'est PAS servi par l'application : il est converti en données
quantifiées et embarquées dans `src/lib/base/data.ts`.
