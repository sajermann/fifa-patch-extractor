"""Boots, goalkeeper gloves and balls of the source game: which ones it has, their names, files and pictures.

  boot   players.shoetypecode    -> data/sceneassets/shoe/shoe_<code>.rx3 (mesh) + shoe_<code>_<design>_textures.rx3;
         listed by the `playerboots` rows (shoetype), named CreatePlayerBoot_<code>
  glove  players.gkglovetypecode -> data/sceneassets/gkglove/gkglove_<code>.rx3 + gkglove_<code>_textures.rx3;
         named GkGlovePattern_<code> (other tools write GKGlovePattern_ / gkglovepattern_ too)
  ball   teams.balltype          -> data/sceneassets/ball/ball_<code>.rx3 + ball_<code>_textures.rx3; listed by the
         `teamballs` rows (ballid), named BallName_<code>, with the match settings picture
         data/ui/artassets/settingsimg/ball_<code>.big
Code 0 = none (the generic boot painted by colour codes): never listed.
"""
import re

import numpy as np
from PIL import Image

from . import rx3, rx3mesh

KINDS = ('boot', 'glove', 'ball')
# (the table and column of the code, the name's string id prefixes, the folder, the files of one code (`{}` = the
# code), the rows that list it (table, column) or None)
EQUIPMENT = {
    'boot': ('players', 'shoetypecode', ('CreatePlayerBoot_',), 'data/sceneassets/shoe/',
             r'shoe_{}(?:_\d+_textures)?\.rx3', ('playerboots', 'shoetype')),
    'glove': ('players', 'gkglovetypecode', ('GkGlovePattern_', 'GKGlovePattern_', 'gkglovepattern_'),
              'data/sceneassets/gkglove/', r'gkglove_{}(?:_textures)?\.rx3', None),
    'ball': ('teams', 'balltype', ('BallName_',), 'data/sceneassets/ball/', r'ball_{}(?:_textures)?\.rx3',
             ('teamballs', 'ballid')),
}
MESH = {'boot': 'shoe_{}.rx3', 'glove': 'gkglove_{}.rx3', 'ball': 'ball_{}.rx3'}
MESH_NAME = {k: re.compile(v.replace('{}', r'(\d+)').replace('.', r'\.') + '$') for k, v in MESH.items()}
TEXTURE = {'boot': 'shoe_{}_0_textures.rx3', 'glove': 'gkglove_{}_textures.rx3', 'ball': 'ball_{}_textures.rx3'}
COLOR_TEXTURE = {'boot': 'shoe_cm', 'glove': 'gkglove_cm', 'ball': 'ball_cm'}
BALL_PICTURE = 'data/ui/artassets/settingsimg/ball_{}.big'


def folder(kind: str) -> str:
    return EQUIPMENT[kind][3]


def mesh_path(kind: str, code: int) -> str:
    return folder(kind) + MESH[kind].format(code)


def texture_path(kind: str, code: int) -> str:
    return folder(kind) + TEXTURE[kind].format(code)


def code_files(kind: str, code: int, listing: list[str]) -> list[str]:
    """Every file of one code in the kind's folder (boots: the mesh and every design's textures)."""
    own = re.compile(EQUIPMENT[kind][4].replace('{}', str(code)) + '$')
    return sorted(p for p in listing if own.fullmatch(p.rsplit('/', 1)[-1]))


def names(src, kind: str) -> dict[int, str]:
    """{code: name} in the source's language database (the first spelling wins)."""
    out: dict[int, str] = {}
    for prefix in EQUIPMENT[kind][2]:
        for code, v in src._names({'name': prefix}, (prefix,)).items():  # noqa: SLF001
            out.setdefault(code, v['name'])
    return out


def items(src, kind: str) -> dict[int, dict]:
    """The kind's items the game has a mesh for (any code above 0): {code: {code, name, files, wearers, listed}}.
    wearers: how many players (boots, gloves) or teams (balls) use it; listed: it has a row in the list table."""
    table, column, _, _, _, rows = EQUIPMENT[kind]
    listing = list(src.files.list(folder(kind)))
    codes = sorted({int(m.group(1)) for p in listing if (m := MESH_NAME[kind].fullmatch(p.rsplit('/', 1)[-1]))
                    and int(m.group(1)) > 0})
    wearers: dict[int, int] = {}
    for r in (src.players if table == 'players' else src.teams).values():
        c = r.get(column)
        if isinstance(c, int) and c > 0:
            wearers[c] = wearers.get(c, 0) + 1
    listed = {r.get(rows[1]) for r in src.rows(rows[0])} if rows else set()
    named = names(src, kind)
    return {c: {'code': c, 'name': named.get(c), 'files': code_files(kind, c, listing), 'wearers': wearers.get(c, 0),
                'listed': c in listed if rows else None} for c in codes}


# ---------------------------------------------------------------- pictures
def triangles(indices: list[int]) -> np.ndarray:
    """Triangles of a mesh's indices: a list (boots, gloves), or a strip (the balls: repeated indices mark its joins).
    A list never repeats an index inside one triangle (it may across two, so that alone does not mark a strip)."""
    if len(indices) % 3 == 0:
        tris = np.array(indices).reshape(-1, 3)
        if not ((tris[:, 0] == tris[:, 1]) | (tris[:, 1] == tris[:, 2]) | (tris[:, 0] == tris[:, 2])).any():
            return tris
    out = []
    for k in range(len(indices) - 2):
        a, b, c = indices[k:k + 3]
        if a == b or b == c or a == c:
            continue
        out.append((a, b, c) if k % 2 == 0 else (b, a, c))
    return np.array(out).reshape(-1, 3)


def _rasterize(X, Y, depth, uv, shade_v, tris, tex, width, height):
    """(rgb float32 HxWx3, alpha uint8 HxW) of textured triangles drawn per pixel with a z-buffer (larger depth =
    nearer)."""
    th, tw = tex.shape[:2]
    rgb = np.zeros((height, width, 3), np.float32)
    alpha = np.zeros((height, width), np.uint8)
    zb = np.full((height, width), -np.inf)
    for t in tris:
        x, y, z = X[t], Y[t], depth[t]
        x0, x1 = max(0, int(np.floor(x.min()))), min(width - 1, int(np.ceil(x.max())))
        y0, y1 = max(0, int(np.floor(y.min()))), min(height - 1, int(np.ceil(y.max())))
        den = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2])
        if x1 < x0 or y1 < y0 or abs(den) < 1e-9:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((y[1] - y[2]) * (gx - x[2]) + (x[2] - x[1]) * (gy - y[2])) / den
        w1 = ((y[2] - y[0]) * (gx - x[2]) + (x[0] - x[2]) * (gy - y[2])) / den
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        w0, w1, w2 = w0[inside], w1[inside], w2[inside]
        px, py = (gx[inside] - 0.5).astype(int), (gy[inside] - 0.5).astype(int)
        zz = w0 * z[0] + w1 * z[1] + w2 * z[2]
        front = zz > zb[py, px]
        if not front.any():
            continue
        px, py, w0, w1, w2, zz = px[front], py[front], w0[front], w1[front], w2[front], zz[front]
        u = w0 * uv[t[0], 0] + w1 * uv[t[1], 0] + w2 * uv[t[2], 0]
        v = w0 * uv[t[0], 1] + w1 * uv[t[1], 1] + w2 * uv[t[2], 1]
        shade = w0 * shade_v[t[0]] + w1 * shade_v[t[1]] + w2 * shade_v[t[2]]
        texel = tex[np.clip((v * th).astype(int) % th, 0, th - 1), np.clip((u * tw).astype(int) % tw, 0, tw - 1)]
        zb[py, px] = zz
        rgb[py, px] = texel * shade[:, None]
        alpha[py, px] = 255
    return rgb, alpha


def _color(texture: bytes, kind: str) -> np.ndarray:
    img = rx3.to_image(texture, rx3.by_name(texture, COLOR_TEXTURE[kind])).convert('RGB')
    if max(img.size) > 512:
        img = img.resize((max(1, img.width * 512 // max(img.size)), max(1, img.height * 512 // max(img.size))))
    return np.asarray(img)


def thumbnail(kind: str, mesh: bytes, texture: bytes, width: int = 256, supersample: int = 2) -> Image.Image:
    """The item's picture drawn from its files: the boot's outer side (right foot), the back of the right glove, the
    ball from the front. Raises on files it cannot read."""
    m = rx3mesh.meshes(mesh)[0]
    p = np.array(m['attrs']['p0'])[:, :3]
    uv = np.array(m['attrs']['t0'])[:, :2]
    nrm = np.array(m['attrs']['n0'])[:, :3] if 'n0' in m['attrs'] else np.tile([0.0, 0.0, 1.0], (len(p), 1))
    tris = triangles(m['indices'])
    tex = _color(texture, kind)
    if kind == 'boot':
        tris = tris[(p[tris][:, :, 0] > 0).all(1)]
        sx, sy, depth, light = p[:, 2], -p[:, 1], p[:, 0], (0.6, 0.6, 0.5)
    elif kind == 'glove':
        tris = tris[(p[tris][:, :, 0] > 0).all(1)]
        sx, sy, depth, light = p[:, 0], p[:, 2], p[:, 1], (0.3, 0.9, 0.4)
    else:
        sx, sy, depth, light = p[:, 0], -p[:, 1], p[:, 2], (-0.4, 0.6, 0.7)
    if not len(tris):
        tris = triangles(m['indices'])
    used = np.unique(tris)
    lo = np.array([sx[used].min(), sy[used].min()])
    hi = np.array([sx[used].max(), sy[used].max()])
    size = width * supersample
    pad = size // 16
    scale = (size - 2 * pad) / max(float(max(hi - lo)), 1e-6)
    h = int((hi[1] - lo[1]) * scale) + 2 * pad
    X = (size - (hi[0] - lo[0]) * scale) / 2 + (sx - lo[0]) * scale
    Y = pad + (sy - lo[1]) * scale
    lv = np.array(light) / np.linalg.norm(light)
    shade_v = 0.5 + 0.5 * np.clip(nrm @ lv, 0, 1)
    rgb, alpha = _rasterize(X, Y, depth, uv, shade_v, tris, tex, size, h)
    img = Image.fromarray(np.dstack([rgb.clip(0, 255).astype(np.uint8), alpha]), 'RGBA')
    return img.resize((width, max(1, h // supersample)), Image.LANCZOS)
