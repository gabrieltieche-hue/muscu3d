#!/usr/bin/env python3
"""Convertit le mesh de base MakeHuman (base.obj, CC0) en données embarquées.

Sortie : src/lib/base/data.ts
  - BASE_POS_Q : positions quantifiées Int16 (x, y, z) encodées en base64
  - BASE_INDEX  : indices Uint16 encodés en base64
  - BASE_SCALE  : diviseur des positions quantifiées (positions = q / BASE_SCALE)
  - JOINTS      : repères anatomiques normalisés (hauteur du corps = 1)
  - BASE_STATS  : infos utiles (hauteur, volume...)

Convention : pieds à y = 0, sommet du crâne à y = 1, visage vers +z.
"""

import base64
import collections
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "assets" / "makehuman-base.obj"
OUT = ROOT / "src" / "lib" / "base" / "data.ts"
SCALE = 3000


def parse_obj(path):
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
                idxs = [int(t.split("/")[0]) - 1 for t in line.split()[1:]]
                groups[cur].append(idxs)
    return verts, groups


def centroid(verts, faces):
    idx = {i for f in faces for i in f}
    n = len(idx)
    sx = sy = sz = 0.0
    for i in idx:
        x, y, z = verts[i]
        sx += x
        sy += y
        sz += z
    return (sx / n, sy / n, sz / n)


def main():
    verts, groups = parse_obj(SRC)
    body = groups["body"]
    used = sorted({i for f in body for i in f})
    remap = {old: new for new, old in enumerate(used)}
    bverts = [verts[i] for i in used]

    ys = [v[1] for v in bverts]
    y0, y1 = min(ys), max(ys)
    h = y1 - y0
    # normalisation : pieds à 0, sommet à 1
    nverts = [(v[0] / h, (v[1] - y0) / h, v[2] / h) for v in bverts]

    joints = {}
    for name, faces in groups.items():
        if name.startswith("joint-"):
            cx, cy, cz = centroid(verts, faces)
            joints[name[6:]] = [cx / h, (cy - y0) / h, cz / h]

    # --- stats : largeurs par tranche (en fraction de hauteur) ---
    def band(lo, hi, xlim=0.2):
        xs = [abs(p[0]) for p in nverts if lo <= p[1] < hi and abs(p[0]) < xlim]
        zs = [p[2] for p in nverts if lo <= p[1] < hi and abs(p[0]) < xlim]
        if not xs:
            return None
        return (round(2 * max(xs), 4), round(min(zs), 4), round(max(zs), 4))

    slices = {}
    for lo in [i / 100 for i in range(0, 100, 2)]:
        b = band(lo, lo + 0.02)
        if b:
            slices[f"{lo:.2f}"] = b

    # volume signé (m³ pour une hauteur de 1) — triangles
    tris = []
    for f in body:
        for k in range(1, len(f) - 1):
            tris.append((remap[f[0]], remap[f[k]], remap[f[k + 1]]))
    vol = 0.0
    for ia, ib, ic in tris:
        a, b, c = nverts[ia], nverts[ib], nverts[ic]
        vol += (
            a[0] * (b[1] * c[2] - b[2] * c[1])
            - a[1] * (b[0] * c[2] - b[2] * c[0])
            + a[2] * (b[0] * c[1] - b[1] * c[0])
        ) / 6

    # quantisation
    q = []
    for x, y, z in nverts:
        q += [round(x * SCALE), round(y * SCALE), round(z * SCALE)]
    pos_b64 = base64.b64encode(struct.pack("<%dh" % len(q), *q)).decode()
    idx = []
    for f in body:
        for k in range(1, len(f) - 1):
            idx += [remap[f[0]], remap[f[k]], remap[f[k + 1]]]
    idx_b64 = base64.b64encode(struct.pack("<%dH" % len(idx), *idx)).decode()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w") as f:
        f.write("// Généré par scripts/prep-base.py — NE PAS ÉDITER À LA MAIN.\n")
        f.write("// Source : MakeHuman base.obj (CC0 1.0). Voir scripts/assets/README.md.\n\n")
        f.write(f"export const BASE_SCALE = {SCALE}\n")
        f.write(f"export const BASE_VERTEX_COUNT = {len(nverts)}\n")
        f.write(f"export const BASE_INDEX_COUNT = {len(idx)}\n\n")
        f.write("export const BASE_POS_Q =\n  '")
        f.write(pos_b64)
        f.write("'\n\n")
        f.write("export const BASE_INDEX =\n  '")
        f.write(idx_b64)
        f.write("'\n\n")
        f.write("export const JOINTS: Record<string, [number, number, number]> = ")
        f.write(json.dumps(joints, indent=2))
        f.write("\n\n")
        f.write("export const BASE_STATS = ")
        f.write(
            json.dumps(
                {
                    "height": 1.0,
                    "volume": round(vol, 6),
                    "slices": slices,
                },
                indent=2,
            )
        )
        f.write("\n")
    print("verts", len(nverts), "tris", len(idx) // 3)
    print("volume (hauteur 1) :", round(vol, 5), "m³ → 1,75 m :", round(vol * 1.75**3 * 1000, 2), "L")
    for k in ["0.48", "0.52", "0.6", "0.64", "0.68", "0.72", "0.76", "0.8", "0.84", "0.88", "0.92"]:
        if k in slices:
            print("  v", k, "largeur", slices[k][0], "z", slices[k][1], slices[k][2])
    print("joints clés :", {k: [round(c, 3) for c in v] for k, v in joints.items() if k in
          ("pelvis", "spine-4", "spine-3", "spine-2", "spine-1", "neck", "head-2",
           "l-shoulder", "l-elbow", "l-hand", "l-upper-leg", "l-knee", "l-ankle", "l-foot-1")})


if __name__ == "__main__":
    main()
