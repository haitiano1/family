#!/usr/bin/env python3
"""Create the public GitHub Release assets consumed by the PHP updater.

Run package-php.py first. No configuration, customer data or updater bootstrap
components are permitted in the remotely installable payload.
"""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'downloads'
version = json.loads((ROOT / 'package.json').read_text())['version']
build = json.loads((ROOT / 'hosting/php/family-private/version.json').read_text())
assert build['version'] == version
excluded = {
    'family-private/config.php', 'family-private/config.example.php',
    'family-private/runtime.php', 'family-private/updater.php', 'family-private/.htaccess',
    'public_html/update.php', 'public_html/.htaccess', 'public_html/.user.ini',
}
with zipfile.ZipFile(DEST / 'family-hostinger.zip') as source:
    files = {name: source.read(name) for name in source.namelist()
             if name.startswith(('family-private/', 'public_html/'))
             and name not in excluded and not name.endswith('/')}
meta = {
    'format': 'family-php-package', 'protocol': 1, 'version': version,
    'schema': build['schema'], 'min_php': '8.2.0',
    'files': {name: {'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data)}
              for name, data in sorted(files.items())},
}
archive = DEST / 'family-php-release.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
    for name, data in [*sorted(files.items()), ('family-package.json', json.dumps(meta, ensure_ascii=False, indent=2).encode())]:
        info = zipfile.ZipInfo(name)
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        output.writestr(info, data)
manifest = {
    'format': 'family-php-release', 'protocol': 1, 'version': version,
    'schema': build['schema'], 'min_php': '8.2.0',
    'size': archive.stat().st_size,
    'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
    'url': f'https://github.com/haitiano1/family/releases/download/v{version}/family-php-release.zip',
}
(DEST / 'family-latest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'Created release assets for v{version}; not published.')
