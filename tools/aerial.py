"""Read the ground-height and aerial-photo chunks written by tools/fetch_terrain.py.

Raster('dem').value(lat, lon)   -> metres above sea level (bilinear), or None outside the data
Raster('air').rgb(lat, lon)     -> (r, g, b) of the nearest photo pixel, or None
Pure Python (array module), so no image libraries are needed.
"""
import array, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'data', 'region')


class Raster:
    def __init__(self, kind):
        meta = json.load(open(os.path.join(DIR, kind + '.json')))
        self.W, self.S, self.E, self.N = meta['bbox']
        self.w, self.h, self.bands = meta['w'], meta['h'], meta['bands']
        self.dlon = (self.E - self.W) / self.w; self.dlat = (self.N - self.S) / self.h
        self.chunks = {}  # (row, col) of the chunk origin -> (w, h, data)
        self.size = meta.get('size', 2048)
        for c in meta['chunks']:
            p = os.path.join(DIR, c['file'])
            if not os.path.exists(p): continue
            raw = open(p, 'rb').read()
            n = c['w'] * c['h'] * self.bands
            if kind == 'dem':
                data = array.array('f'); data.frombytes(raw[:n * 4])
            else:
                data = raw[:n]
            self.chunks[(c['row'] // self.size, c['col'] // self.size)] = (c['w'], c['h'], data)

    def complete(self):
        return len(self.chunks) == ((self.h + self.size - 1) // self.size) * ((self.w + self.size - 1) // self.size)

    def px(self, lat, lon):
        return (lon - self.W) / self.dlon - 0.5, (self.N - lat) / self.dlat - 0.5

    def at(self, x, y, band=0):
        """Pixel value at integer pixel (x, y) of the whole mosaic, or None."""
        if x < 0 or y < 0 or x >= self.w or y >= self.h: return None
        ch = self.chunks.get((y // self.size, x // self.size))
        if not ch: return None
        cw, chh, data = ch
        return data[band * cw * chh + (y % self.size) * cw + (x % self.size)]

    def value(self, lat, lon):
        x, y = self.px(lat, lon)
        x0, y0 = int(x // 1), int(y // 1); fx, fy = x - x0, y - y0
        v = [self.at(x0, y0), self.at(x0 + 1, y0), self.at(x0, y0 + 1), self.at(x0 + 1, y0 + 1)]
        if any(q is None or q < -1000 for q in v):
            ok = [q for q in v if q is not None and q > -1000]
            return sum(ok) / len(ok) if ok else None
        return (v[0] * (1 - fx) + v[1] * fx) * (1 - fy) + (v[2] * (1 - fx) + v[3] * fx) * fy

    def rgb(self, lat, lon):
        x, y = self.px(lat, lon); x, y = int(round(x)), int(round(y))
        r = self.at(x, y, 0)
        if r is None: return None
        c = (r, self.at(x, y, 1), self.at(x, y, 2))
        return None if c == (0, 0, 0) else c  # zero = an area the service had no photo for
