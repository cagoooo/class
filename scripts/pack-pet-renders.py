"""Pack original Blender renders as transparent WebP and verify the complete set."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
KINDS = 'cat dog rabbit panda fox bear penguin owl turtle dragon capybara axolotl'.split()
output = ROOT / 'assets/pets/rendered'
output.mkdir(parents=True, exist_ok=True)
for kind in KINDS:
    for stage in ['egg', 'baby', 'junior', 'grown']:
        for mood in (['normal'] if stage == 'egg' else ['normal', 'happy', 'sleepy']):
            name = f'{kind}-{stage}-{mood}'
            with Image.open(ROOT / 'art/pets/renders' / (name + '.png')) as image:
                assert image.size == (320, 360) and image.mode == 'RGBA', name
                image.save(output / (name + '.webp'), 'WEBP', quality=84, method=6)
print('Verified and packed 120 Blender renders')
