"""Build the pinned, self-hosted Flow catalog. Never executes upstream code.

Offline render dependencies: pip install PyMuPDF Pillow (build tool only).
python scripts/exercise_catalog_build.py --cache ../.tmp/exercise-catalog-build
"""
import argparse
import hashlib
import io
import json
import pathlib
import re
import sys
import urllib.request
import zipfile

FLOW_REV = '961bb2739015da373daa43b960c28ee839fe93e6'
HASAN_REV = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd'
FLOW_REPO = 'ozansozuozgit/flow-exercise-dataset'
HASAN_REPO = 'hasaneyldrm/exercises-dataset'
ROOT = pathlib.Path(__file__).resolve().parents[1]

MUSCLES = dict(zip(
    ['abductors', 'abs', 'adductors', 'biceps', 'calves', 'cardiovascular system', 'delts', 'forearms', 'glutes', 'hamstrings', 'lats', 'levator scapulae', 'pectorals', 'quads', 'serratus anterior', 'spine', 'traps', 'triceps', 'upper back'],
    ['Abducteurs', 'Abdominaux', 'Adducteurs', 'Biceps', 'Mollets', 'Cardio', 'Épaules', 'Avant-bras', 'Fessiers', 'Ischio-jambiers', 'Dos', 'Élévateur de la scapula', 'Pectoraux', 'Quadriceps', 'Dentelé antérieur', 'Lombaires', 'Trapèzes', 'Triceps', 'Dos']))
MUSCLES.update(dict(zip(
    ['abdominals', 'ankle stabilizers', 'ankles', 'back', 'brachialis', 'chest', 'core', 'deltoids', 'feet', 'grip muscles', 'groin', 'hands', 'hip flexors', 'inner thighs', 'latissimus dorsi', 'lower abs', 'lower back', 'obliques', 'quadriceps', 'rear deltoids', 'rhomboids', 'rotator cuff', 'shins', 'shoulders', 'soleus', 'sternocleidomastoid', 'trapezius', 'upper chest', 'wrist extensors', 'wrist flexors', 'wrists'],
    ['Abdominaux', 'Stabilisateurs des chevilles', 'Chevilles', 'Dos', 'Brachial', 'Pectoraux', 'Ceinture abdominale', 'Épaules', 'Pieds', 'Préhension', 'Aine', 'Mains', 'Fléchisseurs des hanches', 'Adducteurs', 'Grand dorsal', 'Abdominaux inférieurs', 'Lombaires', 'Obliques', 'Quadriceps', 'Deltoïdes postérieurs', 'Rhomboïdes', 'Coiffe des rotateurs', 'Tibiaux', 'Épaules', 'Soléaire', 'Sterno-cléido-mastoïdien', 'Trapèzes', 'Pectoraux supérieurs', 'Extenseurs des poignets', 'Fléchisseurs des poignets', 'Poignets'])))
EQUIPMENT = dict(zip(
    ['assisted', 'band', 'barbell', 'body weight', 'bosu ball', 'cable', 'dumbbell', 'elliptical machine', 'ez barbell', 'hammer', 'kettlebell', 'leverage machine', 'medicine ball', 'olympic barbell', 'resistance band', 'roller', 'rope', 'skierg machine', 'sled machine', 'smith machine', 'stability ball', 'stationary bike', 'stepmill machine', 'tire', 'trap bar', 'upper body ergometer', 'weighted', 'wheel roller'],
    ['Machine assistée', 'Élastique', 'Barre', 'Aucun (poids de corps)', 'Bosu', 'Câbles', 'Haltères', 'Vélo elliptique', 'Barre EZ', 'Masse', 'Kettlebell', 'Machine à leviers', 'Médecine-ball', 'Barre olympique', 'Élastique', 'Rouleau', 'Corde', 'SkiErg', 'Machine à traîneau', 'Machine Smith', 'Ballon de stabilité', 'Vélo stationnaire', 'Escalier mécanique', 'Pneu', 'Trap bar', 'Ergomètre à bras', 'Lest', 'Roue abdominale']))


def normalize(flow, french):
    ident = flow['id']
    if not re.fullmatch(r'[0-9]{4}', ident):
        raise ValueError('Invalid exercise ID')
    if (ident != french['id'] or flow['name'].strip().casefold() != french['name'].strip().casefold()
            or flow['equipment'] != french['equipment']):
        raise ValueError('Source records do not identify the same exercise: ' + ident)
    steps = french.get('instruction_steps', {}).get('fr', [])
    if not isinstance(steps, list) or not steps or not all(isinstance(s, str) and s.strip() for s in steps):
        raise ValueError('Missing French instructions: ' + ident)
    animation = flow.get('animation')
    if animation and (animation.get('frames') != [f'assets/{ident}/frame-0{i}.svg' for i in range(3)]
                      or animation.get('sequence') != [0, 1, 2, 1]
                      or animation.get('frameDurationMs') != 180 or animation.get('license') != 'CC0-1.0'):
        raise ValueError('Unexpected animation binding: ' + ident)
    target = MUSCLES[flow['target']]
    return dict(sourceId=ident, nameOriginal=flow['name'], instructionsFr=[s.strip() for s in steps],
                groupeMusculaire=target, musclesPrimaires=[target],
                musclesSecondaires=[MUSCLES[m] for m in flow.get('secondaryMuscles', [])],
                equipementRequis=EQUIPMENT[flow['equipment']], hasAnimation=bool(animation), license='CC0-1.0')


def fetch(url, cache_file, limit):
    if cache_file.exists():
        return cache_file.read_bytes()
    request = urllib.request.Request(url, headers={'User-Agent': 'GymPass-catalog-build'})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError('Download exceeded bound')
    cache_file.parent.mkdir(parents=True, exist_ok=True)
    cache_file.write_bytes(data)
    return data


def build(args):
    if args.python_deps:
        sys.path.insert(0, str(pathlib.Path(args.python_deps).resolve()))
    import pymupdf
    from PIL import Image

    cache = pathlib.Path(args.cache)
    output = pathlib.Path(args.output)
    raw = fetch(f'https://codeload.github.com/{FLOW_REPO}/zip/{FLOW_REV}', cache / f'flow-{FLOW_REV}.zip', 100_000_000)
    french_raw = fetch(f'https://raw.githubusercontent.com/{HASAN_REPO}/{HASAN_REV}/data/exercises.json', cache / f'hasan-{HASAN_REV}.json', 30_000_000)
    upstream = zipfile.ZipFile(io.BytesIO(raw))
    prefix = f'flow-exercise-dataset-{FLOW_REV}/'

    def read(name):
        info = upstream.getinfo(prefix + name)
        if info.file_size > 25_000_000:
            raise ValueError('Archive member exceeds bound')
        return upstream.read(info)

    flow = json.loads(read('data/exercises.json'))
    french = {r['id']: r for r in json.loads(french_raw)}
    normalized = [normalize(r, french[r['id']]) for r in flow]
    if len(normalized) != 1324 or len({r['sourceId'] for r in normalized}) != 1324 or sum(r['hasAnimation'] for r in normalized) != 1257:
        raise ValueError('Pinned dataset coverage changed unexpectedly')
    checksums = json.loads(read('data/checksums.json'))
    # Upstream stores a path -> hash mapping inside "sha256".
    if isinstance(checksums, dict) and 'sha256' in checksums:
        checksums = checksums['sha256']
    if isinstance(checksums, dict) and 'files' in checksums:
        checksums = checksums['files']
    if isinstance(checksums, list):
        checksums = {r['path']: r['sha256'] for r in checksums}
    media = output / 'flow' / FLOW_REV
    media.mkdir(parents=True, exist_ok=True)
    assets = {}
    for index, exercise in enumerate(flow):
        if not exercise.get('animation'):
            continue
        ident = exercise['id']
        frames = []
        for name in exercise['animation']['frames']:
            svg = read(name)
            if len(svg) > 200_000 or hashlib.sha256(svg).hexdigest() != checksums[name]:
                raise ValueError('Frame hash/size mismatch: ' + name)
            # Rasterize only static vector paths; never load external resources.
            if re.search(rb'<(?:script|image|foreignObject|use)\b|(?:href|url\s*\()|<!ENTITY', svg, re.I):
                raise ValueError('Unexpected non-vector content: ' + name)
            doc = pymupdf.open(stream=svg, filetype='svg')
            page = doc[0]
            pix = page.get_pixmap(matrix=pymupdf.Matrix(256 / page.rect.width, 256 / page.rect.height), alpha=True)
            rgba = Image.frombytes('RGBA', (pix.width, pix.height), pix.samples)
            image = Image.new('RGB', rgba.size, '#0d0f12')
            image.paste(rgba, mask=rgba.getchannel('A'))
            frames.append(image)
            doc.close()
        frames[0].save(media / f'{ident}.png', optimize=True)
        sequence = [frames[i] for i in (0, 1, 2, 1)]
        sequence[0].save(media / f'{ident}.gif', save_all=True, append_images=sequence[1:], duration=750, loop=0, optimize=False, disposal=2)
        for suffix in ('gif', 'png'):
            path = media / f'{ident}.{suffix}'
            assets[str(path.relative_to(output)).replace('\\', '/')] = hashlib.sha256(path.read_bytes()).hexdigest()
        if index % 100 == 0:
            print(f'Rendered {index + 1}/{len(flow)} records', flush=True)

    for name in ('LICENSE', 'NOTICE.md', 'ARTWORK-LICENSE'):
        (output / ('FLOW-' + name)).write_bytes(read(name))
    for name in ('LICENSE', 'NOTICE.md'):
        try:
            data = fetch(f'https://raw.githubusercontent.com/{HASAN_REPO}/{HASAN_REV}/{name}', cache / ('HASAN-' + name), 100_000)
            (output / ('HASAN-' + name)).write_bytes(data)
        except urllib.error.HTTPError as error:
            if name == 'LICENSE' or error.code != 404:
                raise
    (output / 'catalog.json').write_text(json.dumps(dict(version=1, source='flow', revision=FLOW_REV, dataRevision=HASAN_REV, exercises=normalized), ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / 'checksums.json').write_text(json.dumps(dict(sourceArchiveSha256=hashlib.sha256(raw).hexdigest(), frenchDataSha256=hashlib.sha256(french_raw).hexdigest(), assets=assets), indent=2) + '\n', encoding='utf-8')
    (output / 'README.md').write_text(f'''# GymBro exercise catalog

Flow: https://github.com/{FLOW_REPO}/tree/{FLOW_REV}
French text: https://github.com/{HASAN_REPO}/tree/{HASAN_REV}

1,324 records, 1,257 animated demonstrations, 67 without media.
Data: MIT (see notices). Artwork: CC0-1.0 to the extent of upstream rights held.
Only Flow custom vector artwork was rasterized; no Hasan/Gym Visual media was copied.
Upstream artwork is experimental and not professionally verified coaching.
Original prompt evidence exists for only 13 of 1,257 animations; upstream does not
promise independently established clean-room origin or third-party clearance.
Review each animation and French instruction before publication.

256px GIF/PNG, dark background, original 0/1/2/1 sequence slowed to 750ms per frame.
Timing illustrates motion and is not a recommended exercise tempo.
All upstream frame SHA-256 hashes were checked before rendering.
Generated checksums cover every served asset. Runtime has no GitHub dependency.
Rebuild with scripts/exercise_catalog_build.py (PyMuPDF + Pillow, build only).
''', encoding='utf-8')
    print(json.dumps({'records': len(normalized), 'animated': 1257, 'assets': len(assets), 'output': str(output)}), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', default=str(ROOT.parent / '.tmp/exercise-catalog-build'))
    parser.add_argument('--output', default=str(ROOT.parent / '.tmp/exercise-catalog-build/rendered'))
    parser.add_argument('--python-deps')
    build(parser.parse_args())
