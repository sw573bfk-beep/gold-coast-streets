"""Bundle the game into single HTML files.

dist/gold-coast-streets.html  page body for publishing (the host adds the document skeleton)
dist/index.html               full document for local testing
"""
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = lambda *p: open(os.path.join(ROOT, *p), encoding='utf-8').read()

page = src('src', 'index.html')
map_js = '<script>window.MAP=' + src('data', 'map.json') + ';</script>'
game_js = '<script>\n' + '\n'.join(src('src', f) for f in ('world.js', 'models.js', 'details.js', 'shops.js', 'weapons.js', 'arcade.js', 'devtools.js', 'tiles.js', 'houses.js', 'towers.js', 'game.js')) + '\n</script>'
body = page.replace('<!--MAP-->', map_js).replace('<!--GAME-->', game_js)

os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
with open(os.path.join(ROOT, 'dist', 'gold-coast-streets.html'), 'w', encoding='utf-8') as f:
    f.write(body)
with open(os.path.join(ROOT, 'dist', 'index.html'), 'w', encoding='utf-8') as f:
    f.write('<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
            '</head><body>\n' + body + '\n</body></html>\n')
import shutil
os.makedirs(os.path.join(ROOT, 'dist', 'tests'), exist_ok=True)
shutil.copy(os.path.join(ROOT, 'tests', 'regression.js'), os.path.join(ROOT, 'dist', 'tests', 'regression.js'))  # local test page only; never published
print('bundled', os.path.getsize(os.path.join(ROOT, 'dist', 'index.html')), 'bytes')
