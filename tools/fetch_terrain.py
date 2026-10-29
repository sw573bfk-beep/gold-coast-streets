"""Download ground height and aerial photos for the region from Queensland Government open services.

Run: python3 tools/fetch_terrain.py  -> data/region/dem_<r>_<c>.bin (+ dem.json), data/region/air_<r>_<c>.bin (+ air.json)

Sources (both open licences, credited in the game and README):
- Elevation/DEM_TimeSeries_AllUsers: LiDAR bare-earth terrain (no buildings or trees), CC BY 3.0,
  © State of Queensland (Department of Natural Resources and Mines, Manufacturing and Regional and Rural Development).
- TimeSeries/AerialOrtho_AllUsers: public aerial photos (three years or older), CC BY 4.0, © State of Queensland.
Both are fetched as raw band-sequential pixels (format=bsq), so no image libraries are needed to read them.
"""
import json, os, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'data', 'region')
os.makedirs(OUT, exist_ok=True)
S, W, N, E = -28.110, 153.355, -27.935, 153.468
BASE = 'https://spatial-img.information.qld.gov.au/arcgis/rest/services/'
DEM_PX = 5.0   # metres per height sample
AIR_PX = 2.0   # metres per photo pixel
MX, MZ = 98330.0, 110574.0  # metres per degree (lon at this latitude, lat)


def fetch(url, path, expect, tries=8):
    for attempt in range(tries):
        subprocess.run(['curl', '-s', '-m', '600', '-A', 'GoldCoastStreetsGame/0.1 (personal project)', '-o', path + '.part', url])
        if os.path.exists(path + '.part') and os.path.getsize(path + '.part') >= expect:
            os.replace(path + '.part', path)
            return True
        if attempt + 1 < tries:
            print('  retry', attempt + 1, flush=True)
            time.sleep(10 * (attempt + 1))
    if os.path.exists(path + '.part'): os.remove(path + '.part')
    return False


def fetch_split(make_url, path, w0, s, e0, n, cw, ch, bands, nbytes):
    """Some areas (open ocean, the edges of photo runs) refuse to export. Split into quarters down to 128 px,
    keep the parts that work and leave the rest zero (the builder treats zero pixels as no photo)."""
    if fetch(make_url(w0, s, e0, n, cw, ch), path, cw * ch * bands * nbytes, tries=2 if cw >= 1024 else 1):
        return open(path, 'rb').read()[:cw * ch * bands * nbytes]
    out = bytearray(cw * ch * bands * nbytes)
    if cw <= 256: return out
    hw, hh = cw // 2, ch // 2
    for (qx, qy, qw, qh) in ((0, 0, hw, hh), (hw, 0, cw - hw, hh), (0, hh, hw, ch - hh), (hw, hh, cw - hw, ch - hh)):
        lon0 = w0 + (e0 - w0) * qx / cw; lon1 = w0 + (e0 - w0) * (qx + qw) / cw
        lat1 = n - (n - s) * qy / ch; lat0 = n - (n - s) * (qy + qh) / ch
        part = fetch_split(make_url, path + '.q', lon0, lat0, lon1, lat1, qw, qh, bands, nbytes)
        for b in range(bands):
            for y in range(qh):
                src = (b * qw * qh + y * qw) * nbytes; dst = (b * cw * ch + (qy + y) * cw + qx) * nbytes
                out[dst:dst + qw * nbytes] = part[src:src + qw * nbytes]
    if os.path.exists(path + '.q'): os.remove(path + '.q')
    return out


def chunked(kind, px, service, query, bands, nbytes, CHUNK):
    """Fetch the region in square chunks (bigger exports are refused); each file is band-sequential pixels plus a 1-bit mask."""
    w = round((E - W) * MX / px); h = round((N - S) * MZ / px)
    dlon = (E - W) / w; dlat = (N - S) / h
    chunks = []
    for r in range(0, h, CHUNK):
        for c in range(0, w, CHUNK):
            cw, ch = min(CHUNK, w - c), min(CHUNK, h - r)
            n = N - r * dlat; s = n - ch * dlat; w0 = W + c * dlon; e0 = w0 + cw * dlon
            name = '%s_%d_%d.bin' % (kind, r // CHUNK, c // CHUNK)
            chunks.append(dict(file=name, row=r, col=c, w=cw, h=ch))
            p = os.path.join(OUT, name)
            if os.path.exists(p):
                continue
            make_url = lambda a, b, c_, d, ww, hh: (BASE + service + '/ImageServer/exportImage?bbox=%.7f,%.7f,%.7f,%.7f&bboxSR=4326&imageSR=4326&size=%d,%d&format=bsq'
                                                     '&interpolation=RSP_BilinearInterpolation&f=image' + query) % (a, b, c_, d, ww, hh)
            data = fetch_split(make_url, p + '.tmp', w0, s, e0, n, cw, ch, bands, nbytes)
            open(p, 'wb').write(data)
            if os.path.exists(p + '.tmp'): os.remove(p + '.tmp')
            print(name, cw, 'x', ch, 'blank' if not any(data[::997]) else 'ok', flush=True)
    json.dump(dict(bbox=[W, S, E, N], w=w, h=h, px=px, bands=bands, bytes=nbytes, size=CHUNK, chunks=chunks, rows='north first'),
              open(os.path.join(OUT, kind + '.json'), 'w'))


chunked('dem', DEM_PX, 'Elevation/DEM_TimeSeries_AllUsers', '&pixelType=F32', 1, 4, 2048)
chunked('air', AIR_PX, 'TimeSeries/AerialOrtho_AllUsers', '&pixelType=U8&bandIds=0,1,2', 3, 1, 1024)  # 2048-pixel photo exports fail where several photo runs overlap
print('done', flush=True)
