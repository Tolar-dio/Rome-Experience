#!/usr/bin/env python3
"""Generate MapLibre SDF glyph PBFs from TTF fonts (no native deps beyond freetype-py + scipy).

python3 tools/make_glyphs.py <ttf> "<Fontstack Name>" [<ttf> "<name>" ...]
Writes data/fonts/<name>/<start>-<end>.pbf for the Latin, Latin Extended, Greek and punctuation ranges.
"""
import os, sys
import numpy as np
import freetype
from scipy.ndimage import distance_transform_edt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SIZE, BUFFER, RADIUS, CUTOFF = 24, 3, 8, 0.25
RANGES = [0, 256, 512, 768, 7680, 7936, 8192]  # 0-255 latin, 256-511 ext-A/B, 512-767, 768-1023 greek, 7680-7935 ext add., 7936-8191 greek ext, 8192-8447 punct


def varint(n):
    out = bytearray()
    while True:
        b = n & 0x7F
        n >>= 7
        if n:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def zz(n):
    return (n << 1) ^ (n >> 31)


def field(num, wt, payload):
    key = varint((num << 3) | wt)
    if wt == 0:
        return key + varint(payload)
    return key + varint(len(payload)) + payload


def sdf(bitmap):
    h, w = bitmap.shape
    pad = BUFFER
    a = np.zeros((h + 2 * pad, w + 2 * pad), dtype=float)
    a[pad:pad + h, pad:pad + w] = bitmap / 255.0
    inside = a > 0.5
    d_out = distance_transform_edt(~inside)
    d_in = distance_transform_edt(inside)
    # subpixel refinement from antialiasing
    d = d_out - d_in + (0.5 - a) * (a > 0) * (a < 1)
    v = 255 - 255 * (d / RADIUS + CUTOFF)
    return np.clip(np.round(v), 0, 255).astype(np.uint8)


def glyph_msg(face, cp):
    idx = face.get_char_index(cp)
    if idx == 0 and cp != 32:
        return None
    face.load_char(chr(cp), freetype.FT_LOAD_RENDER | freetype.FT_LOAD_TARGET_NORMAL)
    g = face.glyph
    bm = g.bitmap
    w, h = bm.width, bm.rows
    adv = int(round(g.advance.x / 64))
    msg = field(1, 0, cp)
    if w > 0 and h > 0:
        arr = np.array(bm.buffer, dtype=np.uint8).reshape(h, bm.pitch)[:, :w]
        msg += field(2, 2, sdf(arr).tobytes())
    msg += field(3, 0, w) + field(4, 0, h) + field(5, 0, zz(g.bitmap_left)) + field(6, 0, zz(g.bitmap_top - 26)) + field(7, 0, adv)
    return msg


def build(ttf, name):
    face = freetype.Face(ttf)
    face.set_pixel_sizes(0, SIZE)
    outdir = os.path.join(ROOT, 'data', 'fonts', name)
    os.makedirs(outdir, exist_ok=True)
    for start in RANGES:
        end = start + 255
        glyphs = b''
        for cp in range(start, end + 1):
            m = glyph_msg(face, cp)
            if m:
                glyphs += field(3, 2, m)
        stack = field(1, 2, name.encode()) + field(2, 2, f'{start}-{end}'.encode()) + glyphs
        with open(os.path.join(outdir, f'{start}-{end}.pbf'), 'wb') as f:
            f.write(field(1, 2, stack))
    print('built', name)


if __name__ == '__main__':
    args = sys.argv[1:]
    for i in range(0, len(args), 2):
        build(args[i], args[i + 1])
