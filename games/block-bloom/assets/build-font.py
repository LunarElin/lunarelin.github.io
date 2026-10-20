"""Build the local Jua derivative: python build-font.py /path/to/Jua-Regular.ttf.

Build-only dependencies: fonttools, brotli. Not needed to run the game.
"""
import sys
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parent.parent
text = ''.join(p.read_text(encoding='utf-8-sig') for p in root.iterdir() if p.suffix in {'.html', '.mjs', '.css'})
options = subset.Options()
options.flavor = 'woff2'
options.layout_features = ['*']
font = TTFont(sys.argv[1])
worker = subset.Subsetter(options=options)
worker.populate(unicodes=set(range(32, 127)) | {ord(c) for c in text})
worker.subset(font)
for entry in font['name'].names:
    replacements = {1: 'Bloom UI', 2: 'Regular', 3: 'Bloom UI Subset 2026', 4: 'Bloom UI Regular', 6: 'BloomUI-Regular'}
    if entry.nameID in replacements:
        entry.string = replacements[entry.nameID].encode(entry.getEncoding())
font.flavor = 'woff2'
target = root / 'assets/fonts/bloom-ui.woff2'
font.save(target)
print(f'{target.name}: {target.stat().st_size:,} bytes')
