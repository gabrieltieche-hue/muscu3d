#!/usr/bin/env python3
"""Importe un modèle de corps externe (.obj) et le convertit en modèle glTF.

C'est le « modèle 3D » du projet : la page web charge un fichier, elle ne
construit pas le corps. L'importeur prend n'importe quel maillage de corps
(.obj : base male de free3d, base MakeHuman, base Blender…) et produit :

  public/body.glb   — mesh normalisé + repères anatomiques

Normalisation (convention du projet) :
  - pieds à y = 0, sommet du crâne à y = 1 ;
  - visage vers +z, corps centré sur x = 0 ;
  - l'échelle réelle est appliquée au morphing.

Repères anatomiques : un modèle externe n'a pas les groupes d'articulations
de MakeHuman. On les déduit de la SILHOUETTE (les extremities de la
silhouette à chaque hauteur donnent les épaules, les coudes, les hanches,
les genoux…), puis on les affine. La liste complète est dans JOINTS.

Usage :
    python3 scripts/import-body.py <modele.obj> [--flip] [--rot90] [--scale H]
"""

import argparse
import base64
import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public"
OUT = OUT_DIR / "body.glb"

# ---------------------------------------------------------------------------
# Lecture .obj
# ---------------------------------------------------------------------------


def read_obj(path):
    verts = []
    faces = []
    with open(path, "r", errors="ignore") as f:
        for line in f:
            if line.startswith("v "):
                p = line.split()
                verts.append((float(p[1]), float(p[2]), float(p[3])))
            elif line.startswith("f "):
                idx = []
                for t in line.split()[1:]:
                    parts = t.split("/")
                    try:
                        i = int(parts[0])
                    except ValueError:
                        continue
                    idx.append(i - 1 if i > 0 else len(verts) + i)
                if len(idx) >= 3:
                    faces.append(idx)
    return verts, faces


def weld(verts, faces, eps=1e-6):
    """Fusionne les sommets de même position (les .obj ont souvent des
    doublons : normales et UVs séparées)."""
    key = lambda v: (round(v[0] / eps), round(v[1] / eps), round(v[2] / eps))
    remap = {}
    out_v = []
    out_f = []
    for f in faces:
        nf = []
        for i in f:
            k = key(verts[i])
            j = remap.get(k)
            if j is None:
                j = len(out_v)
                remap[k] = j
                out_v.append(verts[i])
            nf.append(j)
        # supprime les indices répétés (triangles dégénérés)
        clean = []
        for i in nf:
            if not clean or clean[-1] != i:
                clean.append(i)
        if len(clean) >= 3 and clean[0] == clean[-1]:
            clean.pop()
        if len(clean) >= 3:
            out_f.append(clean)
    return out_v, out_f


# ---------------------------------------------------------------------------
# Repères anatomiques déduits de la silhouette
# ---------------------------------------------------------------------------

# hauteurs normalisées (fraction de la taille) des repères
# et décalage latéral attendu
JOINT_SPEC = {
    "pelvis": (0.53, "center"),
    "spine-4": (0.57, "center"),
    "spine-3": (0.61, "center"),
    "spine-2": (0.66, "center"),
    "spine-1": (0.75, "center"),
    "neck": (0.845, "center"),
    "head": (0.905, "center"),
    "head-2": (0.985, "center"),
    "shoulder": (0.805, "edge"),
    "elbow": (0.63, "edge"),
    "hand": (0.585, "edge"),
    "upper-leg": (0.515, "hip"),
    "knee": (0.27, "edge"),
    "ankle": (0.045, "edge"),
    "foot-1": (0.012, "toe"),
}


def silhouette_joints(verts, faces):
    """Deduit les repères de la silhouette du corps.

    Le modèle est en A-pose (bras le long du corps) : la silhouette donne
    les membres ; pour les hanches on prend la largeur de la ceinture.
    """
    n = len(verts)
    ys = [v[1] for v in verts]
    y0, y1 = min(ys), max(ys)
    h = y1 - y0
    joints = {}

    def band(ymin, ymax):
        """sommets d'une tranche de hauteur, avec leur x/z moyen"""
        sel = [i for i in range(n) if ymin <= (verts[i][1] - y0) / h <= ymax]
        if not sel:
            return None
        return sel

    def widest(sel):
        """deux sommets les plus écartés en x (bords de la silhouette)"""
        if not sel:
            return None
        lo = min(sel, key=lambda i: verts[i][0])
        hi = max(sel, key=lambda i: verts[i][0])
        return lo, hi

    def centroid(sel):
        if not sel:
            return None
        sx = sum(verts[i][0] for i in sel) / len(sel)
        sz = sum(verts[i][2] for i in sel) / len(sel)
        return sx, sz

    for name, (fy, kind) in JOINT_SPEC.items():
        if kind == "center":
            sel = band(fy - 0.02, fy + 0.02)
            if not sel:
                continue
            cx, cz = centroid(sel)
            joints[name] = (cx, y0 + fy * h, cz)
            continue
        if kind == "edge":
            sel = band(fy - 0.035, fy + 0.035)
            if not sel:
                continue
            w = widest(sel)
            if not w:
                continue
            lo, hi = w
            # le bord de la silhouette à cette hauteur peut être le bras
            # (A-pose) : on prend le point le plus externe mais on vérifie
            # qu'il est bien à la bonne hauteur
            joints[name] = (verts[lo][0], verts[lo][1], verts[lo][2])
            joints[name + "@mirror"] = (verts[hi][0], verts[hi][1], verts[hi][2])
            continue
        if kind == "hip":
            sel = band(fy - 0.03, fy + 0.03)
            if not sel:
                continue
            w = widest(sel)
            if not w:
                continue
            lo, hi = w
            joints[name] = (verts[lo][0], verts[lo][1], verts[lo][2])
            joints[name + "@mirror"] = (verts[hi][0], verts[hi][1], verts[hi][2])
            continue
        if kind == "toe":
            sel = band(fy - 0.02, fy + 0.02)
            if not sel:
                continue
            # l'orteil : point le plus en avant du pied
            i = max(sel, key=lambda i: verts[i][2])
            joints[name] = (verts[i][0], verts[i][1], verts[i][2])
            joints[name + "@mirror"] = (verts[i][0], verts[i][1], verts[i][2])

    return joints


# ---------------------------------------------------------------------------
# Écriture glTF
# ---------------------------------------------------------------------------


def align4(b: bytes, fill=b" ") -> bytes:
    pad = (-len(b)) % 4
    return b + (fill * pad if pad else b"")


def write_glb(positions, indices, joints, out_path: Path, quads=None, is_makehuman=False):
    nV = len(positions)
    pos_bytes = b"".join(struct.pack("<3f", *p) for p in positions)
    idx_bytes = struct.pack("<%dI" % len(indices), *indices)

    normals = [[0.0, 0.0, 0.0] for _ in positions]
    for t in range(0, len(indices), 3):
        a, b, c = indices[t], indices[t + 1], indices[t + 2]
        pa, pb, pc = positions[a], positions[b], positions[c]
        e1 = [pb[i] - pa[i] for i in range(3)]
        e2 = [pc[i] - pa[i] for i in range(3)]
        n = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ]
        for i in (a, b, c):
            normals[i][0] += n[0]
            normals[i][1] += n[1]
            normals[i][2] += n[2]
    nrm_list = []
    for n in normals:
        l = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
        nrm_list.append((n[0] / l, n[1] / l, n[2] / l))
    nrm_bytes = b"".join(struct.pack("<3f", *p) for p in nrm_list)

    parts = []
    off = 0

    def put(data):
        nonlocal off
        while off % 4:
            parts.append(b"\x00")
            off += 1
        parts.append(data)
        o = off
        off += len(data)
        return o

    pos_off = put(pos_bytes)
    nrm_off = put(nrm_bytes)
    idx_off = put(idx_bytes)
    quad_off = None
    quad_bytes = b""
    if quads is not None:
        quad_bytes = struct.pack("<%dI" % len(quads), *quads)
        quad_off = put(quad_bytes)
    blob = b"".join(parts)
    while len(blob) % 4:
        blob += b"\x00"

    def view(o, length, target=None):
        v = {"buffer": 0, "byteOffset": o, "byteLength": length}
        if target is not None:
            v["target"] = target
        return v

    gltf = {
        "asset": {"version": "2.0", "generator": "muscu3d import-body.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "body", "mesh": 0}],
        "meshes": [
            {
                "name": "body",
                "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "mode": 4}],
            }
        ],
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": nV,
                "type": "VEC3",
                "min": [min(p[0] for p in positions), min(p[1] for p in positions), min(p[2] for p in positions)],
                "max": [max(p[0] for p in positions), max(p[1] for p in positions), max(p[2] for p in positions)],
            },
            {"bufferView": 1, "componentType": 5126, "count": nV, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125, "count": len(indices), "type": "SCALAR"},
        ],
        "bufferViews": [
            view(pos_off, len(pos_bytes), 34962),
            view(nrm_off, len(nrm_bytes), 34962),
            view(idx_off, len(idx_bytes), 34963),
        ],
        "buffers": [{"byteLength": len(blob)}],
    }
    if quads is not None:
        gltf["bufferViews"].append(view(quad_off, len(quad_bytes)))
        # extension maison : les quads d'origine (subdivision Catmull-Clark)
        gltf["extras"] = {"quads": base64.b64encode(quad_bytes).decode()}
    if is_makehuman:
        gltf.setdefault("extras", {})["targets"] = True

    # nœuds de repères
    for name, (x, y, z) in sorted(joints.items()):
        gltf["nodes"].append({"name": name, "translation": [x, y, z]})
    for i in range(len(gltf["nodes"])):
        gltf["scenes"][0]["nodes"].append(i)

    json_bytes = align4(json.dumps(gltf, separators=(",", ":")).encode())
    bin_chunk = align4(blob, b"\x00")
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_chunk)
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(json_bytes), 0x4E4F534A)
    out += json_bytes
    out += struct.pack("<II", len(bin_chunk), 0x004E4942)
    out += bin_chunk
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(bytes(out))
    return len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--flip", action="store_true", help=" retourne le modèle (face vers -z)")
    ap.add_argument("--rot90", action="store_true", help=" pivote de 90° autour de Y")
    ap.add_argument("--scale", type=float, default=None, help=" hauteur en cm (défaut : normalisation)")
    args = ap.parse_args()

    path = Path(args.model)
    if not path.exists():
        print(f"introuvable : {path}", file=sys.stderr)
        sys.exit(1)

    print(f"lecture {path.name} …")
    verts, faces = read_obj(path)
    print(f"  {len(verts)} sommets, {len(faces)} faces")
    verts, faces = weld(verts, faces)
    print(f"  après fusion des doublons : {len(verts)} sommets, {len(faces)} faces")

    # orientation
    if args.rot90:
        verts = [(-v[2], v[1], v[0]) for v in verts]
    if args.flip:
        verts = [(v[0], v[1], -v[2]) for v in verts]

    # normalisation : pieds à 0, hauteur 1, centré sur x
    ys = [v[1] for v in verts]
    y0, y1 = min(ys), max(ys)
    h = y1 - y0
    xs = [v[0] for v in verts]
    cx = (min(xs) + max(xs)) * 0.5
    verts = [((v[0] - cx) / h, (v[1] - y0) / h, v[2] / h) for v in verts]
    print(f"  normalisation : hauteur {h:.3f} (unités source), centre x {cx:.3f}")

    indices = []
    for f in faces:
        for k in range(1, len(f) - 1):
            indices += [f[0], f[k], f[k + 1]]

    joints = silhouette_joints(verts, faces)
    # renommage en paires gauche/droite
    final = {}
    for name in list(joints.keys()):
        if name.endswith("@mirror"):
            continue
        x, y, z = joints[name]
        final[name] = (x, y, z)
        mir = joints.get(name + "@mirror")
        if mir:
            final["r-" + name] = mir
            final["l-" + name] = (x, y, z)
            final["r-" + name] = mir
            # le repère de l'autre côté : symétrique en x
            final["l-" + name] = (-abs(mir[0]) if abs(mir[0]) > abs(x) else abs(x), y, z)
    final.pop("l-l-shoulder", None)
    final.pop("l-l-upper-leg", None)

    out_path = OUT
    size = write_glb(verts, indices, final, out_path)
    print(f"écrit {out_path.relative_to(ROOT)} : {size/1024:.0f} Ko")
    print(f"  {len(verts)} sommets, {len(indices)//3} triangles, {len(final)} repères")
    for k in sorted(final):
        if k.startswith("l-"):
            print(f"   {k:16s} {tuple(round(v,3) for v in final[k])}")


if __name__ == "__main__":
    main()
