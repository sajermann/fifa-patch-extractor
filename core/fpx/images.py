"""Pictures: DDS decoding, kit textures, crest background removal and PNG encoding."""
import io
import struct
import zlib
from collections import deque

import numpy as np
from PIL import Image

from . import chunk, rx3

# what reading a broken or unknown game file raises (Pillow's own errors are OSError / ValueError subclasses)
UNREADABLE = (OSError, ValueError, KeyError, IndexError, struct.error, zlib.error, chunk.ChunkError,
              Image.DecompressionBombError)
KIT_TEXTURES = {'jersey': 'jersey_cm', 'shorts': 'shorts_cm'}


def decode_dds(data: bytes) -> Image.Image:
    with Image.open(io.BytesIO(data)) as img:
        return img.convert('RGBA')


APT_DATA = b'Apt Data'
APT_SHAPE_SIZE = 164  # offset of the drawn picture's width and height (two floats) in a one-picture Apt data entry


def _big_entries(blob: bytes) -> dict[str, bytes]:
    """{name: bytes} of a small BIG archive kept in memory (BIGF/BIG4, big-endian index)."""
    count = struct.unpack('>I', blob[8:12])[0]
    p, out = 16, {}
    for _ in range(count):
        offset, size = struct.unpack('>II', blob[p:p + 8])
        end = blob.index(b'\0', p + 8)
        out[blob[p + 8:end].decode('latin1')] = blob[offset:offset + size]
        p = end + 1
    return out


def apt_picture(blob: bytes) -> Image.Image:
    """The picture of a menu screen archive (an Apt movie with one texture, e.g. a stadium): its DDS texture, cut to
    the size the screen draws (the texture is larger; the rest is filler). Raises one of UNREADABLE."""
    entries = _big_entries(blob)
    texture = next((d for d in entries.values() if d[:4] == b'DDS '), None)
    if texture is None:
        raise ValueError('no texture in the archive')
    img = decode_dds(texture)
    data = next((d for d in entries.values() if d.startswith(APT_DATA)), b'')
    if len(data) >= APT_SHAPE_SIZE + 8:
        w, h = struct.unpack('<ff', data[APT_SHAPE_SIZE:APT_SHAPE_SIZE + 8])
        if 0 < w <= img.width and 0 < h <= img.height:
            img = img.crop((0, 0, round(w), round(h)))
    return img


def png(img: Image.Image) -> bytes:
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return buf.getvalue()


def thumbnail(img: Image.Image, size: int) -> Image.Image:
    img = img.copy()
    img.thumbnail((size, size))
    return img


def kit_textures(data: bytes) -> dict[str, Image.Image]:
    """{'jersey': image, 'shorts': image} of a kit RX3 file. A file it cannot read raises one of UNREADABLE."""
    d = rx3.unpack(data)
    return {part: rx3.to_image(d, rx3.by_name(d, name)).convert('RGB') for part, name in KIT_TEXTURES.items()}


def _is_background(px) -> bool:
    r, g, b, a = px
    return a < 16 or (r >= 235 and g >= 235 and b >= 235)


def remove_background(img: Image.Image) -> Image.Image:
    """Makes transparent the light tile drawn around some crests: a flood fill from the borders over near-white or
    transparent pixels; light pixels left touching the cleared area get half their alpha (soft edge)."""
    arr = np.array(img.convert('RGBA'))
    h, w = arr.shape[:2]
    visited = np.zeros((h, w), dtype=bool)
    queue = deque([(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)] +
                  [(y, 0) for y in range(1, h - 1)] + [(y, w - 1) for y in range(1, h - 1)])
    while queue:
        y, x = queue.popleft()
        if visited[y, x]:
            continue
        visited[y, x] = True
        if not _is_background(arr[y, x]):
            continue
        arr[y, x, 3] = 0
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and _is_background(arr[ny, nx]):
                queue.append((ny, nx))
    clear = arr[..., 3] == 0
    near = np.zeros_like(clear)
    near[1:, :] |= clear[:-1, :]
    near[:-1, :] |= clear[1:, :]
    near[:, 1:] |= clear[:, :-1]
    near[:, :-1] |= clear[:, 1:]
    light = (arr[..., 0] >= 200) & (arr[..., 1] >= 200) & (arr[..., 2] >= 200)
    edge = near & light & ~clear
    arr[..., 3] = np.where(edge, arr[..., 3] // 2, arr[..., 3])
    return Image.fromarray(arr, 'RGBA')
