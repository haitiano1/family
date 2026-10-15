#!/usr/bin/env python3
"""Build a Hostinger upload ZIP from shared frontend + PHP source. No customer data."""
from pathlib import Path
import zipfile
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'downloads'/'family-hostinger.zip'
assets=['index.html','app.js','statistics.js','vault.js','vault-sheet.js','style.css','csv.js','contacts.js','access.html','access.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png']
DEST.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(DEST,'w',zipfile.ZIP_DEFLATED) as z:
    for name in assets:
        content=(ROOT/'public'/name).read_bytes()
        if name=='app.js':
            content=content.replace('ứng dụng cục bộ'.encode(),'website Family'.encode())
        z.writestr('public_html/'+name,content)
    z.write(ROOT/'domain.js','public_html/domain.js')
    z.write(ROOT/'vault-families.js','public_html/vault-families.js')
    for folder in ['public_html','family-private']:
        for file in sorted((ROOT/'hosting/php'/folder).iterdir()):
            if file.is_file() and file.name!='config.php':z.write(file,folder+'/'+file.name)
    if (ROOT/'hosting/php/INSTALL.md').exists():z.write(ROOT/'hosting/php/INSTALL.md','INSTALL.md')
# Normalize portable read permissions; no executable or secret files are bundled.
with zipfile.ZipFile(DEST) as z: contents=[(i.filename,z.read(i.filename)) for i in z.infolist()]
with zipfile.ZipFile(DEST,'w',zipfile.ZIP_DEFLATED) as z:
    for name,content in contents:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-hostinger.zip (PHP source + shared assets only).')
# Existing installations need only changed code/assets; configuration is never bundled.
update_names=['public_html/statistics.js','family-private/statistics.php','public_html/app.js','public_html/vault.js','public_html/vault-sheet.js','public_html/vault-families.js','public_html/csv.js','public_html/domain.js','public_html/contacts.js','public_html/index.html','public_html/style.css','public_html/api.php','family-private/core.php','family-private/vault.php','family-private/vault.sql','family-private/business.php','family-private/audit.php','family-private/issues.php','family-private/features.sql','family-private/cron.php','family-private/import.php']
with zipfile.ZipFile(DEST) as z:
    update_contents=[(name,z.read(name)) for name in update_names]
with zipfile.ZipFile(ROOT/'downloads'/'family-hostinger-update.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('UPDATE.md',(ROOT/'hosting/php/UPDATE.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-hostinger-update.zip (changed files only; no config.php).')
