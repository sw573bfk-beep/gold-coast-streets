"""Bundle the game into single HTML files.

dist/gold-coast-streets.html  page body for publishing (the host adds the document skeleton)
dist/index.html               full document for local testing
docs/                         the public website (GitHub Pages): index.html plus the map tiles
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = lambda *p: open(os.path.join(ROOT, *p), encoding='utf-8').read()

PACK = 3  # tiles per pack side for the Claude-hosted page (it allows 511 files)
page = src('src', 'index.html')
map_js = '<script>window.MAP=' + src('data', 'map.json') + ';</script>'
game_js = '<script>\n' + '\n'.join(src('src', f) for f in ('world.js', 'post.js', 'models.js', 'details.js', 'shops.js', 'economy.js', 'gps.js', 'phone.js', 'casino.js', 'planes.js', 'weapons.js', 'arcade.js', 'devtools.js', 'tiles.js', 'grass.js', 'houses.js', 'towers.js', 'game.js')) + '\n</script>'
body = page.replace('<!--MAP-->', map_js).replace('<!--GAME-->', game_js)

os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
with open(os.path.join(ROOT, 'dist', 'gold-coast-streets.html'), 'w', encoding='utf-8') as f:
    f.write('<script>window.TILE_PACK=%d;</script>\n' % PACK + body)  # the Claude-hosted page reads tile packs
with open(os.path.join(ROOT, 'dist', 'index.html'), 'w', encoding='utf-8') as f:
    f.write('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '</head><body>\n' + body + '\n</body></html>\n')
import shutil
os.makedirs(os.path.join(ROOT, 'dist', 'tests'), exist_ok=True)
shutil.copy(os.path.join(ROOT, 'tests', 'regression.js'), os.path.join(ROOT, 'dist', 'tests', 'regression.js'))  # local test page only; never published
# the public site: the full page and every map tile (no tests)
site = os.path.join(ROOT, 'docs')
os.makedirs(os.path.join(site, 'tiles'), exist_ok=True)
# the public site counts visits with GoatCounter (only there: the Claude-hosted page doesn't load outside scripts)
GOATCOUNTER = '<script data-goatcounter="https://sw573.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>'
html = open(os.path.join(ROOT, 'dist', 'index.html'), encoding='utf-8').read().replace('</body>', GOATCOUNTER + '\n</body>', 1)
open(os.path.join(site, 'index.html'), 'w', encoding='utf-8').write(html)
open(os.path.join(site, '.nojekyll'), 'w').close()  # serve files as they are
tiles = os.path.join(ROOT, 'dist', 'tiles')
if os.path.isdir(tiles):
    for name in os.listdir(os.path.join(site, 'tiles')):
        if not os.path.exists(os.path.join(tiles, name)): os.remove(os.path.join(site, 'tiles', name))
    for name in os.listdir(tiles):
        shutil.copy(os.path.join(tiles, name), os.path.join(site, 'tiles', name))
# tile packs for the Claude-hosted page: dist/packs/p_<i//3>_<j//3>.json = {"i_j": tile, ...}
import collections
packs = os.path.join(ROOT, 'dist', 'packs')
if os.path.isdir(tiles):
    shutil.rmtree(packs, ignore_errors=True); os.makedirs(packs)
    groups = collections.defaultdict(list)
    for name in os.listdir(tiles):
        if name.startswith('t_'):
            i, j = map(int, name[2:-5].split('_')); groups[(i // PACK, j // PACK)].append((i, j, name))
    for (a, b), items in groups.items():
        with open(os.path.join(packs, 'p_%d_%d.json' % (a, b)), 'w', encoding='utf-8') as f:
            f.write('{' + ','.join('"%d_%d":%s' % (i, j, src('dist', 'tiles', name)) for i, j, name in items) + '}')
print('bundled', os.path.getsize(os.path.join(ROOT, 'dist', 'index.html')), 'bytes')
