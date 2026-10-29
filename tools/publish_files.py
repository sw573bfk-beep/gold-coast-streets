"""Print the supporting-file map for publishing the game (the tiles the page fetches at runtime).

Run: python3 tools/publish_files.py  -> JSON {published path: source path}, plus a size summary on stderr.
Artifact limits: 255 files and 64 MB per publish, 16 MB per file.
"""
import glob, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files, total, biggest = {}, 0, 0
for path in sorted(glob.glob(os.path.join(ROOT, 'dist', 'tiles', '*.json'))):
    name = os.path.basename(path)
    files['tiles/' + name] = os.path.relpath(path, ROOT)
    size = os.path.getsize(path); total += size; biggest = max(biggest, size)
print(json.dumps(files))
print('files %d, total %.1f MB, largest %.2f MB' % (len(files), total / 1e6, biggest / 1e6), file=sys.stderr)
if len(files) > 255 or total > 64e6 or biggest > 16e6:
    print('TOO BIG FOR ONE PUBLISH — split it', file=sys.stderr); sys.exit(1)
