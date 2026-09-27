"""Check delivered renders for clipping and measurable three-stage silhouette growth."""
from pathlib import Path
from PIL import Image
import ast

ROOT = Path(__file__).resolve().parents[1]
KINDS = 'cat dog rabbit panda fox bear penguin owl turtle dragon capybara axolotl lion tiger elephant giraffe zebra monkey koala redpanda raccoon otter hedgehog squirrel sheep pig frog seal deer unicorn'.split()
errors = []
palette_tree = ast.parse((ROOT/'art/pets/color-pets.py').read_text(encoding='utf-8-sig'))
palettes = ast.literal_eval(next(n.value for n in palette_tree.body if isinstance(n,ast.Assign)))
if set(palettes) != set(KINDS): errors.append('Palette species do not match the catalogue')
for kind, regions in palettes.items():
    body, belly, paws, accent = regions
    for label, other in [('belly',belly),('paws',paws),('accent',accent)]:
        distance = sum((a-b)**2 for a,b in zip(body,other))**.5
        if distance < .25: errors.append(f'{kind}: {label} color too close to body')
heights = {}
for kind in KINDS:
    heights[kind] = []
    for stage in ['baby','junior','grown']:
        for mood in ['normal','happy','sleepy','wave','curious']:
            path = ROOT/'assets/pets/rendered'/f'{kind}-{stage}-{mood}.webp'
            with Image.open(path) as image:
                if image.size != (480,540) or image.mode != 'RGBA':
                    errors.append(f'{path.name}: wrong dimensions or missing alpha')
                    continue
                bounds = image.getchannel('A').point(lambda a: 255 if a > 20 else 0).getbbox()
                if not bounds or bounds[0]<2 or bounds[1]<2 or bounds[2]>478 or bounds[3]>538:
                    errors.append(f'{path.name}: clipped/empty {bounds}')
                if mood == 'normal' and bounds:
                    heights[kind].append(bounds[3]-bounds[1])
    if len(heights[kind]) != 3 or heights[kind][1] < heights[kind][0]*1.12 or heights[kind][2] < heights[kind][1]*1.12:
        errors.append(f'{kind}: stages need visible height growth {heights[kind]}')
if errors:
    raise SystemExit('\n'.join(errors))
print('PASS 450 transparent renders: dimensions, no clipping; 30 species have >12% silhouette height growth at both evolutions and distinct body-region palettes')
