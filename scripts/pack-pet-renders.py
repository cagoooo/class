"""Incrementally pack and verify the active 30-pet / four-egg Blender asset set."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
KINDS = 'cat dog rabbit panda fox bear penguin owl turtle dragon capybara axolotl lion tiger elephant giraffe zebra monkey koala redpanda raccoon otter hedgehog squirrel sheep pig frog seal deer unicorn'.split()
NAMES = [f'{kind}-{stage}-{mood}' for kind in KINDS for stage in ['baby','junior','grown'] for mood in ['normal','happy','sleepy']]
NAMES += [f'mystery-egg-{stage}' for stage in ['rest','crack','splitting','hatching']]
output = ROOT / 'assets/pets/rendered'
output.mkdir(parents=True, exist_ok=True)
packed = 0
for name in NAMES:
    source = ROOT / 'art/pets/renders' / (name + '.png')
    dest = output / (name + '.webp')
    with Image.open(source) as image:
        assert image.size == (320, 360) and image.mode == 'RGBA', name
        if not dest.exists() or dest.stat().st_mtime < source.stat().st_mtime:
            image.save(dest, 'WEBP', quality=84, method=4)
            packed += 1
    with Image.open(dest) as image:
        assert image.size == (320, 360) and image.mode == 'RGBA', name
print(f'Verified {len(NAMES)} active assets; packed {packed}; {sum((output/(n+".webp")).stat().st_size for n in NAMES)} bytes')
