"""Build an intentionally unsafe ZIP to test the installer's path boundary."""
import hashlib
import json
import sys
import zipfile
source, destination = sys.argv[1:]
with zipfile.ZipFile(source) as z:
    original = json.loads(z.read('family-package.json'))
    files = {name: z.read(name) for name in original['files']}
parts = original['version'].split('.')
version = '.'.join([parts[0], parts[1], str(int(parts[2]) + 2)])
files['family-private/version.json'] = json.dumps({'version': version, 'schema': 8, 'protocol': 1}).encode()
files['family-private/version.php'] = ("<?php return ['version'=>'" + version + "','schema'=>8,'protocol'=>1];").encode()
files['public_html/../escape.php'] = b'<?php echo "must never be installed";'
meta = {'format': 'family-php-package', 'protocol': 1, 'version': version, 'schema': 8,
        'files': {name: {'size': len(value), 'sha256': hashlib.sha256(value).hexdigest()} for name, value in files.items()}}
with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as z:
    for name, value in files.items():
        z.writestr(name, value)
    z.writestr('family-package.json', json.dumps(meta))
