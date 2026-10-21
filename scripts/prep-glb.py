#!/usr/bin/env python3
"""Exporte le mesh de base MakeHuman (CC0) en fichier glTF binaire (.glb).

C'est le « modèle 3D » du projet : la page web ne construit plus le corps
depuis zéro, elle CHARGE ce fichier avec le chargeur standard de Three.js
(GLTFLoader), exactement comme on chargerait n'importe quel modèle 3D.

Le .glb contient :
  - le maillage `body` (positions, normales, indices) ;
  - un nœud par repère anatomique (l-shoulder, l-knee, r-ankle…) : ils
    servent de squelette logiciel au morphing et à la pose ;
  - `mesh.extras.quads` : les faces quads d'origine, encodées en base64.
    La subdivision Catmull-Clark a besoin des quads (et non des triangles)
    pour ne pas laisser de vallée le long des diagonales de triangulation.

Aucune dépendance : le format .glb est un conteneur simple
(entête 12 octets + chunk JSON + chunk BIN), écrit ici à la main.

Sortie : public/body.glb  (et public/body.glb.b64 pour le build « fichier
unique », où le modèle est embarqué dans le JS).
"""

import base64
import collections
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts" / "assets" / "makehuman-base.obj"
OUT_DIR = ROOT / "public"
OUT = OUT_DIR / "body.glb"

# Nom du groupe de maillage dans le glTF
MESH_NAME = "body"


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
                groups[cur].append([int(t.split("/")[0]) - 1 for t in line.split()[1:]])
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


def align4(b: bytes) -> bytes:
    pad = (-len(b)) % 4
    return b + (b" " if pad else b"")


def main():
    verts, groups = parse_obj(SRC)
    body = groups["body"]
    used = sorted({i for f in body for i in f})
    remap = {old: new for new, old in enumerate(used)}
    bverts = [verts[i] for i in used]

    ys = [v[1] for v in bverts]
    y0, y1 = min(ys), max(ys)
    h = y1 - y0
    # normalisation : pieds à 0, sommet du crâne à 1
    positions = [(v[0] / h, (v[1] - y0) / h, v[2] / h) for v in bverts]

    # quads remappés
    quads = []
    for f in body:
        assert len(f) == 4
        quads += [remap[i] for i in f]

    # indices triangulés
    indices = []
    for f in body:
        a, b, c, d = (remap[i] for i in f)
        indices += [a, b, c, a, c, d]

    # repères anatomiques
    joints = []
    for name, faces in groups.items():
        if name.startswith("joint-"):
            cx, cy, cz = centroid(verts, faces)
            joints.append((name[6:], cx / h, (cy - y0) / h, cz / h))

    # --- buffers ---
    bin_parts = []
    offset = 0

    def add_buffer(data: bytes, target=None) -> int:
        nonlocal offset
        while offset % 4:
            bin_parts.append(b"\x00")
            offset += 1
        bin_parts.append(data)
        idx = len(bin_parts) - 1
        offset += len(data)
        return idx

    pos_bytes = b"".join(struct.pack("<3f", *p) for p in positions)

    # normales : lissées sur les quads (une quad = 2 triangles)
    normals = [[0.0, 0.0, 0.0] for _ in positions]
    for f in body:
        q = [remap[i] for i in f]
        for a, b, c in ((q[0], q[1], q[2]), (q[0], q[2], q[3])):
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
        l = (n[0] ** 2 + n[1] ** 2 + n[2] ** 2) ** 0.5 or 1.0
        nrm_list.append((n[0] / l, n[1] / l, n[2] / l))
    nrm_bytes = b"".join(struct.pack("<3f", *p) for p in nrm_list)

    idx_bytes = struct.pack("<%dH" % len(indices), *indices)
    quad_bytes = struct.pack("<%dH" % len(quads), *quads)

    pos_off = offset
    bin_parts.append(pos_bytes)
    offset += len(pos_bytes)
    nrm_off = offset
    bin_parts.append(nrm_bytes)
    offset += len(nrm_bytes)
    idx_off = offset
    bin_parts.append(idx_bytes)
    offset += len(idx_bytes)
    quad_off = offset
    bin_parts.append(quad_bytes)
    offset += len(quad_bytes)
    blob = b"".join(bin_parts)
    while len(blob) % 4:
        blob += b"\x00"

    nV = len(positions)
    nI = len(indices)
    nQ = len(quads) // 4

    def view(off, length, target=None):
        v = {"buffer": 0, "byteOffset": off, "byteLength": length}
        if target is not None:
            v["target"] = target
        return v

    gltf = {
        "asset": {"version": "2.0", "generator": "muscu3d prep-glb.py"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": MESH_NAME, "mesh": 0}],
        # extension maison : faces quads d'origine (subdivision Catmull-Clark).
        # Placée à la racine, GLTFLoader la recopie dans scene.userData.
        # `targets: true` signale que ce mesh est la base MakeHuman : les
        # cibles de morphing CC0 ne s'appliquent qu'à cette topologie exacte.
        "extras": {"quads": base64.b64encode(quad_bytes).decode(), "targets": True},
        "meshes": [
            {
                "name": MESH_NAME,
                "primitives": [
                    {"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "mode": 4}
                ],
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
            {"bufferView": 2, "componentType": 5123, "count": nI, "type": "SCALAR"},
        ],
        "bufferViews": [
            view(pos_off, len(pos_bytes), 34962),
            view(nrm_off, len(nrm_bytes), 34962),
            view(idx_off, len(idx_bytes), 34963),
            view(quad_off, len(quad_bytes), None),
        ],
        "buffers": [{"byteLength": len(blob)}],
    }

    # nœuds de repères (le squelette logiciel du morphing)
    for name, x, y, z in sorted(joints):
        gltf["nodes"].append({"name": name, "translation": [x, y, z]})
    gltf["scenes"][0]["nodes"].append(0)
    for i in range(1, len(gltf["nodes"])):
        gltf["scenes"][0]["nodes"].append(i)

    json_bytes = align4(json.dumps(gltf, separators=(",", ":")).encode())
    bin_chunk = align4(blob)

    total = 12 + 8 + len(json_bytes) + 8 + len(bin_chunk)
    out = bytearray()
    out += struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(json_bytes), 0x4E4F534A)  # 'JSON'
    out += json_bytes
    out += struct.pack("<II", len(bin_chunk), 0x004E4942)  # 'BIN\0'
    out += bin_chunk

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(bytes(out))
    print(f"écrit {OUT.relative_to(ROOT)} : {len(out)/1024:.0f} Ko")
    print(f"  {nV} sommets, {nI//3} triangles, {nQ} quads, {len(joints)} repères")


if __name__ == "__main__":
    main()
