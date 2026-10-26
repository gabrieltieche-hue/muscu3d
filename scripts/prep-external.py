#!/usr/bin/env python3
"""Prépare un modèle de statue externe pour l'application.

Un fichier téléchargé sur internet (Meshy, Sketchfab…) contient presque
toujours un socle solidaire des pieds. L'application possède déjà son propre
socle tournant : il faut donc retirer celui du fichier, puis remettre le corps
à l'échelle de la convention du projet :

  - pieds à y = 0, sommet du crâne à y = 1 ;
  - corps centré sur x = 0, visage vers +z ;
  - maillage triangulaire + normales lisses.

Le socle est détecté automatiquement : c'est la couche du bas dont l'emprise
horizontale est nettement plus large que les chevilles. Par défaut on
**conserve** le socle mais on le place SOUS y = 0 : l'application a son propre
socle de 38 cm de rayon, le socle du fichier (généralement plus étroit)
disparaît dedans et les pieds restent intacts. `--strip` le coupe pour de bon
(et referme les jambes par un capuchon plan).

Usage :
    python3 scripts/prep-external.py scripts/assets/mon-modele.glb \
        --out public/modele.glb
    python3 scripts/prep-external.py … --strip          # retirer le socle
    python3 scripts/prep-external.py … --cut -0.904     # hauteur imposée
"""

import argparse
import json
import math
import struct
import sys
from pathlib import Path

COMP = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_gltf(path):
    """Lit un .glb ou un .gltf : renvoie (positions, indices)."""
    data = path.read_bytes()
    if data[:4] == b"glTF":
        _, _, total = struct.unpack("<III", data[:12])
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

    def accessor(i):
        acc = js["accessors"][i]
        bv = js["bufferViews"][acc["bufferView"]]
        off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
        fmt, size = COMP[acc["componentType"]]
        n = NCOMP[acc["type"]]
        count = acc["count"]
        stride = bv.get("byteStride") or size * n
        out = []
        for k in range(count):
            base = off + k * stride
            out.append(struct.unpack_from("<%d%s" % (n, fmt), blob, base))
        return out

    # le plus gros maillage = le corps
    best = None
    for m in js.get("meshes", []):
        prim = m["primitives"][0]
        n = js["accessors"][prim["attributes"]["POSITION"]]["count"]
        if best is None or n > best[0]:
            best = (n, prim)
    if best is None:
        raise SystemExit("aucun maillage dans le fichier")
    prim = best[1]
    pos = [p[:3] for p in accessor(prim["attributes"]["POSITION"])]
    idx = [i[0] for i in accessor(prim["indices"])]
    return pos, idx


def detect_cut(verts):
    """Hauteur de coupe au-dessus du socle éventuel.

    On balaie le bas du modèle : le socle est la zone où l'emprise en x reste
    proche de la largeur maximale du fichier. Dès qu'elle tombe sous 70 % de
    cette largeur, on est au-dessus du socle (chevilles).
    """
    ys = [v[1] for v in verts]
    y0, y1 = min(ys), max(ys)
    h = y1 - y0
    half = max(abs(v[0]) for v in verts)
    if half < 1e-6:
        return y0
    step = h / 400
    # un socle commence par une couche large au ras du sol ; sans elle, on ne
    # coupe rien (un corps normal a des chevilles étroites dès le bas).
    bottom = [v for v in verts if v[1] <= y0 + 0.02 * h]
    if not bottom or max(abs(v[0]) for v in bottom) < 0.8 * half:
        return y0
    # largeur de l'emprise par tranche, du bas vers le haut
    y = y0 + step
    while y < y0 + 0.2 * h:
        band = [v for v in verts if y - step <= v[1] <= y]
        if band:
            w = max(abs(v[0]) for v in band)
            if w < 0.7 * half:
                # on remonte d'une tranche pour ne pas mordre les pieds
                return y - step
        y += step
    return y0


def strip_base(verts, indices, cut):
    """Retire les triangles sous `cut` et referme les ouvertures."""
    keep = [i for i in range(len(verts)) if verts[i][1] >= cut]
    remap = {old: new for new, old in enumerate(keep)}
    out_v = [verts[i] for i in keep]

    tris = []
    for t in range(0, len(indices), 3):
        a, b, c = indices[t], indices[t + 1], indices[t + 2]
        if a in remap and b in remap and c in remap:
            tris.append((remap[a], remap[b], remap[c]))

    # arêtes de bord : présentes dans un seul triangle, avec leur orientation
    edges = {}
    for a, b, c in tris:
        for x, y in ((a, b), (b, c), (c, a)):
            key = (min(x, y), max(x, y))
            if key in edges:
                edges[key] = None  # arête partagée
            else:
                edges[key] = (x, y)
    boundary = [(x, y) for e in edges.values() if e is not None for x, y in [e]]

    # chaînage des arêtes de bord en boucles (une arête sortante par sommet
    # sur un bord sain)
    out_edges = {}
    for x, y in boundary:
        out_edges.setdefault(x, []).append(y)
    loops = []
    while out_edges:
        start = next(iter(out_edges))
        loop = [start]
        cur = start
        while True:
            lst = out_edges.get(cur)
            if not lst:
                break
            nxt = lst.pop(0)
            if not lst:
                del out_edges[cur]
            if nxt == start:
                break
            loop.append(nxt)
            cur = nxt
            if len(loop) > 100000:
                break
        if len(loop) >= 3:
            loops.append(loop)
    # capuchon : éventail autour du barycentre, orientation inversée
    caps = 0
    for loop in loops:
        cx = sum(out_v[i][0] for i in loop) / len(loop)
        cy = sum(out_v[i][1] for i in loop) / len(loop)
        cz = sum(out_v[i][2] for i in loop) / len(loop)
        centre = len(out_v)
        out_v.append((cx, cy, cz))
        for k in range(len(loop)):
            a = loop[k]
            b = loop[(k + 1) % len(loop)]
            tris.append((b, a, centre))
            caps += 1
    return out_v, tris, len(loops), caps


def normals(verts, tris):
    nrm = [[0.0, 0.0, 0.0] for _ in verts]
    for a, b, c in tris:
        pa, pb, pc = verts[a], verts[b], verts[c]
        e1 = [pb[i] - pa[i] for i in range(3)]
        e2 = [pc[i] - pa[i] for i in range(3)]
        n = [
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
        ]
        for i in (a, b, c):
            for k in range(3):
                nrm[i][k] += n[k]
    out = []
    for n in nrm:
        l = math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) or 1.0
        out.append((n[0] / l, n[1] / l, n[2] / l))
    return out


def write_glb(verts, nrm, tris, out_path, extras):
    pos_bytes = b"".join(struct.pack("<3f", *p) for p in verts)
    nrm_bytes = b"".join(struct.pack("<3f", *p) for p in nrm)
    idx = [i for t in tris for i in t]
    idx_bytes = struct.pack("<%dI" % len(idx), *idx)

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
    blob = b"".join(parts)
    while len(blob) % 4:
        blob += b"\x00"

    gltf = {
        "asset": {"version": "2.0", "generator": "muscu3d prep-external.py"},
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
                "count": len(verts),
                "type": "VEC3",
                "min": [min(p[0] for p in verts), min(p[1] for p in verts), min(p[2] for p in verts)],
                "max": [max(p[0] for p in verts), max(p[1] for p in verts), max(p[2] for p in verts)],
            },
            {"bufferView": 1, "componentType": 5126, "count": len(verts), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125, "count": len(idx), "type": "SCALAR"},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": pos_off, "byteLength": len(pos_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": nrm_off, "byteLength": len(nrm_bytes), "target": 34962},
            {"buffer": 0, "byteOffset": idx_off, "byteLength": len(idx_bytes), "target": 34963},
        ],
        "buffers": [{"byteLength": len(blob)}],
        "extras": extras,
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(blob)
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A)
    out += js
    out += struct.pack("<II", len(blob), 0x004E4942)
    out += blob
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(bytes(out))
    return len(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--out", default="public/modele.glb")
    ap.add_argument("--cut", type=float, default=None, help="hauteur du dessus de socle (unités du fichier)")
    ap.add_argument("--strip", action="store_true", help="couper le socle au lieu de le cacher sous y = 0")
    ap.add_argument("--flip", action="store_true", help="retourner le modèle (face vers -z)")
    args = ap.parse_args()

    path = Path(args.model)
    if not path.exists():
        print(f"introuvable : {path}", file=sys.stderr)
        sys.exit(1)

    print(f"lecture {path.name} …")
    verts, idx = read_gltf(path)
    print(f"  {len(verts)} sommets, {len(idx) // 3} triangles")

    floor = args.cut if args.cut is not None else detect_cut(verts)
    if args.strip:
        verts, tris, loops, caps = strip_base(verts, idx, floor)
        print(
            f"  socle coupé à y = {floor:.4f} : {len(tris)} triangles, "
            f"{loops} ouverture(s) refermée(s) ({caps} triangles de capuchon)"
        )
    else:
        tris = [tuple(idx[t : t + 3]) for t in range(0, len(idx), 3)]

    if args.flip:
        verts = [(v[0], v[1], -v[2]) for v in verts]

    # normalisation : dessus du socle (les pieds) à y = 0, hauteur du CORPS = 1.
    # Le socle éventuel reste dessous (y < 0) : il est masqué par le socle de
    # l'application, et les pieds ne sont pas abîmés.
    ys = [v[1] for v in verts]
    y0, y1 = min(ys), max(ys)
    h = y1 - floor
    xs = [v[0] for v in verts]
    zs = [v[2] for v in verts]
    cx = (min(xs) + max(xs)) * 0.5
    cz = (min(zs) + max(zs)) * 0.5
    verts = [((v[0] - cx) / h, (v[1] - floor) / h, (v[2] - cz) / h) for v in verts]
    print(
        f"  normalisation : corps {h:.4f} (unités source), sol du corps à y=0, "
        f"centre x {cx:.4f} z {cz:.4f}, socle sous y=0 ({floor - y0:.4f})"
    )

    nrm = normals(verts, tris)
    out = Path(args.out)
    size = write_glb(
        verts,
        nrm,
        tris,
        out,
        {
            "source": path.name,
            "generator": "Meshy AI" if "meshy" in path.name.lower() else "externe",
            "bodyFloor": 0,
            "baseBelowFloor": floor - y0 if floor > y0 else 0,
            "baseStripped": bool(args.strip),
        },
    )
    print(f"écrit {out} : {size / 1024:.0f} Ko · {len(verts)} sommets · {len(tris)} triangles")
    print("  convention : pieds y=0, hauteur 1, visage +z")


if __name__ == "__main__":
    main()
