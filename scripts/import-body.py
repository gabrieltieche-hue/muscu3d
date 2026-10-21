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


# ---------------------------------------------------------------------------
# Lecture glTF / GLB
# ---------------------------------------------------------------------------

COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_gltf(path):
    """Lit un .glb ou un .gltf : renvoie (positions, indices, joints, noeuds)."""
    data = path.read_bytes()
    if data[:4] == b"glTF":
        magic, version, total = struct.unpack("<III", data[:12])
        off = 12
        js = None
        blob = b""
        while off < len(data):
            clen, ctype = struct.unpack("<II", data[off : off + 8])
            chunk = data[off + 8 : off + 8 + clen]
            if ctype == 0x4E4F534A:
                js = json.loads(chunk)
            else:
                blob = chunk
            off += 8 + clen
    else:
        js = json.loads(data)
        ref = js["buffers"][0].get("uri", "")
        binp = path.parent / ref
        blob = binp.read_bytes() if binp.exists() else b""

    buffers = []
    for i, b in enumerate(js.get("buffers", [])):
        if i == 0:
            buffers.append(blob)
        else:
            ref = b.get("uri", "")
            p = path.parent / ref
            buffers.append(p.read_bytes() if p.exists() else b"")

    def accessor(i):
        acc = js["accessors"][i]
        bv = js["bufferViews"][acc["bufferView"]]
        buf = buffers[bv.get("buffer", 0)]
        off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        fmt, size = COMP[acc["componentType"]]
        n = NCOMP[acc["type"]]
        count = acc["count"]
        stride = bv.get("byteStride") or size * n
        out = []
        for k in range(count):
            base = off + k * stride
            out.append(struct.unpack_from("<%d%s" % (n, fmt), buf, base))
        return out

    # --- maillage principal : le plus gros (celui du corps) ---
    best = None
    for m in js.get("meshes", []):
        prim = m["primitives"][0]
        a = js["accessors"][prim["attributes"]["POSITION"]]
        if best is None or a["count"] > best[1]:
            best = (m, a["count"])
    m = best[0]
    prim = m["primitives"][0]
    positions = [tuple(p) for p in accessor(prim["attributes"]["POSITION"])]
    if "indices" in prim:
        indices = [i[0] for i in accessor(prim["indices"])]
    else:
        indices = list(range(len(positions)))

    # --- squelette : repères en position monde (matrices d'inverse de liaison) ---
    joints = {}
    skins = js.get("skins", [])
    if skins:
        skin = skins[0]
        joints_node = skin.get("joints", [])
        ibm = skin.get("inverseBindMatrices")
        for k, ni in enumerate(joints_node):
            node = js["nodes"][ni]
            name = node.get("name", f"joint-{k}")
            if ibm is not None:
                mtx = accessor(ibm)[k]
                tx, ty, tz = mtx[12], mtx[13], mtx[14]
            else:
                t = node.get("translation", [0, 0, 0])
                tx, ty, tz = t
            joints[name] = (tx, ty, tz)
    else:
        # pas de skin : les nœuds nommés servent de repères (format .glb de
        #prep-glb.py, où chaque repère anatomique est un nœud)
        for ni, node in enumerate(js.get("nodes", [])):
            name = node.get("name")
            if not name:
                continue
            t = node.get("translation", [0, 0, 0])
            joints[name] = (t[0], t[1], t[2])
    return positions, indices, joints


# ---------------------------------------------------------------------------
# Correspondance des noms d'os -> nomenclature du projet
# ---------------------------------------------------------------------------

# mots-clés -> repère du projet
BONE_PATTERNS = [
    (["hips", "pelvis", "root", "coccyx"], "pelvis"),
    (["spine4", "spine04", "spine_4", "lowerspine", "abdomen", "waist"], "spine-4"),
    (["spine3", "spine03", "spine_3", "chest", "upperchest", "thorax", "ribcage"], "spine-3"),
    (["spine2", "spine02", "spine_2", "spine"], "spine-2"),
    (["spine1", "spine01", "spine_1"], "spine-1"),
    (["neck"], "neck"),
    (["head"], "head"),
    (["topofhead", "headend", "headtop"], "head-2"),
    (["shoulder"], "shoulder"),
    (["clavicle", "collar"], "clavicle"),
    (["elbow"], "elbow"),
    (["wrist", "hand"], "hand"),
    (["upleg", "upperleg", "thigh", "hip", "leg"], "upper-leg"),
    (["knee", "lowerleg", "calf", "shin"], "knee"),
    (["ball", "toebase", "toe", "toeend"], "foot-1"),
    (["ankle"], "ankle"),
    (["foot"], "foot-1"),
]


def norm_name(n: str) -> str:
    n = n.lower()
    for pre in ("mixamorig:", "def-", "bip01", "bip02", "bip", "joint", "bone", "armature", "b_"):
        n = n.replace(pre, "")
    n = n.replace("_", "").replace("-", "").replace(".", "").replace(" ", "")
    return n


def map_bones(joints):
    """Associe les os du modèle aux repères du projet (l-/r-)."""
    out = {}
    for name, p in joints.items():
        nn = norm_name(name)
        side = None
        if any(s in nn for s in ("left", "lft", "_l", "l_")) or nn.startswith("l"):
            side = "l"
        elif any(s in nn for s in ("right", "rgt", "_r", "r_")) or nn.startswith("r"):
            side = "r"
        for keys, rep in BONE_PATTERNS:
            for k in keys:
                if k in nn:
                    if side:
                        out.setdefault(f"{side}-{rep}", p)
                    else:
                        out.setdefault(rep, p)
                    break
            else:
                continue
            break
    return out



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

    Le modèle peut être en A-pose (bras le long du corps) ou en T-pose
    (bras horizontaux) : on le détecte sur la largeur de la silhouette
    (à hauteur d'épaule et à hauteur de hanche).
    """
    n = len(verts)
    ys = [v[1] for v in verts]
    y0, y1 = min(ys), max(ys)
    h = y1 - y0
    joints = {}

    def band(fy, half=0.03):
        lo = y0 + (fy - half) * h
        hi = y0 + (fy + half) * h
        return [i for i in range(n) if lo <= verts[i][1] <= hi]

    def width(sel):
        if not sel:
            return 0.0
        return max(verts[i][0] for i in sel) - min(verts[i][0] for i in sel)

    w_sh = width(band(0.82))
    w_hip = width(band(0.55))
    tpose = w_sh > max(2.2 * w_hip, 0.30)
    print(f"  largeur épaules {w_sh:.3f} / hanches {w_hip:.3f} → {'T-pose' if tpose else 'A-pose'}")

    def edge_at(fy, half=0.03):
        sel = band(fy, half)
        if not sel:
            return None
        lo = min(sel, key=lambda i: verts[i][0])
        hi = max(sel, key=lambda i: verts[i][0])
        return lo, hi

    def center_at(fy, half=0.03):
        sel = band(fy, half)
        if not sel:
            return None
        cx = sum(verts[i][0] for i in sel) / len(sel)
        cz = sum(verts[i][2] for i in sel) / len(sel)
        return cx, cz

    # --- axe central : pelvis, colonne, cou, tête ---
    for name, fy in (
        ("pelvis", 0.53),
        ("spine-4", 0.575),
        ("spine-3", 0.61),
        ("spine-2", 0.66),
        ("spine-1", 0.75),
        ("neck", 0.845),
        ("head", 0.905),
        ("head-2", 0.985),
    ):
        c = center_at(fy)
        if c:
            joints[name] = (c[0], y0 + fy * h, c[1])

    # --- membres ---
    sh = edge_at(0.815)
    if not sh:
        return joints
    sx = abs(verts[sh[1]][0])
    for name, (fx, fy, kind) in {
        "shoulder": (None, 0.805, "sh"),
        "elbow": (None, 0.635, "el"),
        "hand": (None, 0.585, "ha"),
        "upper-leg": (None, 0.515, "hip"),
        "knee": (None, 0.27, "kn"),
        "ankle": (None, 0.045, "an"),
        "foot-1": (None, 0.012, "to"),
    }.items():
        if kind == "sh":
            x = sx
        elif kind == "hip":
            e = edge_at(0.5)
            x = abs(verts[e[1]][0]) if e else sx * 0.7
        elif kind == "kn":
            e = edge_at(0.27)
            x = abs(verts[e[1]][0]) if e else sx * 0.5
        elif kind == "an":
            e = edge_at(0.05)
            x = abs(verts[e[1]][0]) if e else sx * 0.35
        elif kind == "to":
            sel = band(0.015, 0.025)
            if not sel:
                continue
            i = max(sel, key=lambda i: verts[i][2])
            joints[name] = (verts[i][0], verts[i][1], verts[i][2])
            continue
        else:
            # coude / main : en A-pose le bras est le long du corps
            x = sx * (1.0 if kind == "el" else 1.02)
            if tpose:
                # en T-pose, le bras part horizontalement de l'épaule
                x = sx * (0.45 if kind == "el" else 0.95)
        y = y0 + fy * h
        # z : devant ou derrière ? on prend la position moyenne en z du membre
        sel = band(fy, 0.025)
        z = sum(verts[i][2] for i in sel) / len(sel) if sel else 0.0
        joints[name] = (x, y, z)
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
    ap.add_argument("--out", default=None, help="fichier .glb de sortie (défaut : public/body-<nom>.glb)")
    ap.add_argument("--flip", action="store_true", help=" retourne le modèle (face vers -z)")
    ap.add_argument("--rot90", action="store_true", help=" pivote de 90° autour de Y")
    ap.add_argument("--force", action="store_true", help=" écrase public/body.glb (le modèle par défaut)")
    args = ap.parse_args()

    path = Path(args.model)
    if not path.exists():
        print(f"introuvable : {path}", file=sys.stderr)
        sys.exit(1)

    print(f"lecture {path.name} …")
    bone_joints = {}
    if path.suffix.lower() in (".glb", ".gltf"):
        verts, idxs, bone_joints = read_gltf(path)
        faces = [idxs[i : i + 3] for i in range(0, len(idxs), 3)]
        print(f"  {len(verts)} sommets, {len(idxs)} indices, {len(bone_joints)} os")
    else:
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

    # --- repères anatomiques ---
    if bone_joints:
        # modèle riggé : les os donnent les repères (bien plus fiable que
        # la silhouette). On les normalise comme les sommets.
        norm_bones = {
            n: ((p[0] - cx) / h, (p[1] - y0) / h, (p[2]) / h) for n, p in bone_joints.items()
        }
        final = map_bones(norm_bones)
        print(f"  repères issus du squelette : {len(final)}")
        if len(final) < 6:
            print("  (squelette inexploitable → repli sur la silhouette)")
            final = {}
    else:
        final = {}

    if not final:
        joints = silhouette_joints(verts, faces)
        for name in list(joints.keys()):
            if name.endswith("@mirror"):
                continue
            x, y, z = joints[name]
            final[name] = (x, y, z)
            final["l-" + name] = (abs(x), y, z)
            final["r-" + name] = (-abs(x), y, z)

    out_path = OUT
    if args.out:
        out_path = Path(args.out)
    elif not args.force:
        out_path = OUT_DIR / ("body-" + path.stem.lower().replace(" ", "-") + ".glb")
    size = write_glb(verts, indices, final, out_path)
    try:
        shown = out_path.relative_to(ROOT)
    except ValueError:
        shown = out_path
    print(f"écrit {shown} : {size/1024:.0f} Ko")
    print(f"  {len(verts)} sommets, {len(indices)//3} triangles, {len(final)} repères")
    for k in sorted(final):
        if k.startswith("l-") or "-" not in k:
            print(f"   {k:16s} {tuple(round(v, 3) for v in final[k])}")


if __name__ == "__main__":
    main()
