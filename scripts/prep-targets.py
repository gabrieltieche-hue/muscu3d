#!/usr/bin/env python3
"""Convertit des cibles de morphing MakeHuman (.target, CC0) en couches embarquées.

Sortie : src/lib/base/targets.ts
  - TARGET_SCALE : diviseur des deltas quantifiés
  - TARGETS      : dictionnaire nom -> couche creuse
      { index: Uint16 base64, delta: Int16 base64, count }

Conventions identiques à src/lib/base/data.ts :
  - indices du maillage `body` remappé (0..BASE_VERTEX_COUNT-1)
  - deltas normalisés par la hauteur du corps (pieds 0, crâne 1)
  - un delta vaut donc « fraction de hauteur »

Le format .target est du texte ASCII simple :
  lignes '#' = en-tête, puis '<index> <dx> <dy> <dz>' par sommet déplacé.
Les indices sont ceux du base.obj COMPLET (19 158 sommets, helpers compris),
d'où le remappage vers le groupe `body` opéré ici.

Ne copie aucun code de MakeHuman (AGPL3) : ce lecteur est indépendant.
"""

import base64
import collections
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "assets" / "makehuman-base.obj"
CACHE = ROOT / "scripts" / "assets" / "targets"
OUT = ROOT / "src" / "lib" / "base" / "targets.ts"

# Précision : 1 / 20000 de hauteur ≈ 0,09 mm à 1,75 m. Int16 couvre ±1,63.
DELTA_SCALE = 20000

# Couches retenues. Le poids de chacune est décidé dans src/lib/body.ts.
LAYERS = {
    # --- macro-détails (identité + masse musculaire + masse grasse) ---
    "male": "macrodetails/caucasian-male-young.target",
    "muscleMax": "macrodetails/universal-male-young-maxmuscle-averageweight.target",
    "muscleMin": "macrodetails/universal-male-young-minmuscle-averageweight.target",
    "weightMax": "macrodetails/universal-male-young-averagemuscle-maxweight.target",
    "weightMin": "macrodetails/universal-male-young-averagemuscle-minweight.target",
    # --- anatomie locale pilotée par les sliders ---
    "vshape": "torso/torso-vshape-incr.target",
    "pectoral": "torso/torso-muscle-pectoral-incr.target",
    "dorsi": "torso/torso-muscle-dorsi-incr.target",
    "shoulderDist": "measure/measure-shoulder-dist-incr.target",
    "upperarm": "measure/measure-upperarm-circ-incr.target",
    "thigh": "measure/measure-thigh-circ-incr.target",
    "calf": "measure/measure-calf-circ-incr.target",
    "neck": "measure/measure-neck-circ-incr.target",
    "waistIn": "measure/measure-waist-circ-decr.target",
    "stomachTone": "stomach/stomach-tone-incr.target",
    "pelvisTone": "pelvis/pelvis-tone-incr.target",
    "buttocks": "buttocks/buttocks-volume-incr.target",
    "neckWide": "neck/neck-scale-horiz-incr.target",
    # --- bras et jambes : muscle et graisse par segment ---
    "upperarmMuscleL": "armslegs/l-upperarm-muscle-incr.target",
    "upperarmMuscleR": "armslegs/r-upperarm-muscle-incr.target",
    "upperarmFatL": "armslegs/l-upperarm-fat-incr.target",
    "upperarmFatR": "armslegs/r-upperarm-fat-incr.target",
    "lowerarmMuscleL": "armslegs/l-lowerarm-muscle-incr.target",
    "lowerarmMuscleR": "armslegs/r-lowerarm-muscle-incr.target",
    "lowerarmFatL": "armslegs/l-lowerarm-fat-incr.target",
    "lowerarmFatR": "armslegs/r-lowerarm-fat-incr.target",
    "upperlegMuscleL": "armslegs/l-upperleg-muscle-incr.target",
    "upperlegMuscleR": "armslegs/r-upperleg-muscle-incr.target",
    "lowerlegMuscleL": "armslegs/l-lowerleg-muscle-incr.target",
    "lowerlegMuscleR": "armslegs/r-lowerleg-muscle-incr.target",
    # --- pieds : plus petits et plus étroits (cf. référence) ---
    "footScaleL": "armslegs/l-foot-scale-decr.target",
    "footScaleR": "armslegs/r-foot-scale-decr.target",
    "footHorizL": "armslegs/l-foot-scale-horiz-decr.target",
    "footHorizR": "armslegs/r-foot-scale-horiz-decr.target",
}

URL = "https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/targets/"


def download(name: str, rel: str) -> Path:
    """Télécharge la cible si elle n'est pas déjà en cache (CC0, dépôt MakeHuman)."""
    dest = CACHE / Path(rel).name
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    CACHE.mkdir(parents=True, exist_ok=True)
    import urllib.request

    print("  téléchargement", rel)
    with urllib.request.urlopen(URL + rel, timeout=60) as r:
        dest.write_bytes(r.read())
    return dest


def parse_obj(path):
    """Renvoie (verts, groupe body) du base.obj."""
    verts = []
    groups = collections.OrderedDict()
    cur = None
    with open(path) as f:
        for line in f:
            if line.startswith("v "):
                p = line.split()
                verts.append((float(p[1]), float(p[2]), float(p[3])))
            elif line.startswith("g "):
                cur = line[2:].strip()
                groups.setdefault(cur, [])
            elif line.startswith("f "):
                groups[cur].append([int(t.split("/")[0]) - 1 for t in line.split()[1:]])
    return verts, groups


def read_target(path):
    """Lit une cible ASCII -> liste de (index, dx, dy, dz) en unités OBJ."""
    out = []
    with open(path) as f:
        for line in f:
            if line.startswith("#"):
                continue
            t = line.split()
            if len(t) != 4:
                continue
            out.append((int(t[0]), float(t[1]), float(t[2]), float(t[3])))
    return out


def b64_int16(values):
    return base64.b64encode(struct.pack("<%dh" % len(values), *values)).decode()


def b64_uint16(values):
    return base64.b64encode(struct.pack("<%dH" % len(values), *values)).decode()


def main():
    verts, groups = parse_obj(SRC)
    body = groups["body"]
    used = sorted({i for f in body for i in f})
    remap = {old: new for new, old in enumerate(used)}

    ys = [verts[i][1] for i in used]
    h = max(ys) - min(ys)
    print("base :", len(used), "sommets body, hauteur", round(h, 4), "unités")

    chunks = []
    for name, rel in LAYERS.items():
        path = download(name, rel)
        rows = read_target(path)
        idx, dx, dy, dz = [], [], [], []
        for i, x, y, z in rows:
            j = remap.get(i)
            if j is None:
                continue  # sommet d'un groupe helper (yeux, dents...)
            # normalisation en fraction de hauteur
            xi = round(x / h * DELTA_SCALE)
            yi = round(y / h * DELTA_SCALE)
            zi = round(z / h * DELTA_SCALE)
            if xi == 0 and yi == 0 and zi == 0:
                continue
            idx.append(j)
            dx.append(xi)
            dy.append(yi)
            dz.append(zi)

        # entrelacement x, y, z (comme les positions)
        deltas = []
        for k in range(len(idx)):
            deltas += [dx[k], dy[k], dz[k]]

        maxd = max((abs(v) for v in deltas), default=0) / DELTA_SCALE
        print(f"  {name:14s} {len(idx):6d} sommets  delta max {maxd:.4f} (≈ {maxd*175:.1f} cm)")

        chunks.append(
            "  %s: {\n    count: %d,\n    index:\n      '%s',\n    delta:\n      '%s',\n  },"
            % (name, len(idx), b64_uint16(idx), b64_int16(deltas))
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        f.write("// Généré par scripts/prep-targets.py — NE PAS ÉDITER À LA MAIN.\n")
        f.write("// Source : cibles MakeHuman, CC0 1.0 (dépôt makehumancommunity/makehuman).\n")
        f.write("// Deltas creux, quantifiés par TARGET_SCALE, en fraction de hauteur.\n\n")
        f.write("export interface TargetLayer {\n")
        f.write("  count: number\n")
        f.write("  /** indices des sommets (Uint16 base64) */\n")
        f.write("  index: string\n")
        f.write("  /** deltas x,y,z entrelacés (Int16 base64) */\n")
        f.write("  delta: string\n")
        f.write("}\n\n")
        f.write(f"export const TARGET_SCALE = {DELTA_SCALE}\n\n")
        f.write("export const TARGETS: Record<string, TargetLayer> = {\n")
        f.write("\n".join(chunks))
        f.write("\n}\n")

    total = sum(len(c) for c in chunks)
    print("écrit", OUT.relative_to(ROOT), f"({total/1024:.0f} Ko)")


if __name__ == "__main__":
    main()
