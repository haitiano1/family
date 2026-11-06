#!/usr/bin/env python3
"""Build a Hostinger upload ZIP from shared frontend + PHP source. No customer data."""
from pathlib import Path
import zipfile
import json
import re
ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'downloads'/'family-hostinger.zip'
assets=['product-import.js','sync-status.css','updater.js','sheets.js','index.html','app.js','statistics.js','vault.js','vault-sheet.js','moves.js','tra-cuu.html','tra-cuu.js','tra-cuu.css','style.css','csv.js','contacts.js','access.html','access.js','manifest.webmanifest','icon-180.png','icon-192.png','icon-512.png']
DEST.parent.mkdir(exist_ok=True)
version=json.loads((ROOT/'package.json').read_text())['version']
schema=int(re.search(r'^const FAMILY_DATA_SCHEMA_VERSION=(\d+);',(ROOT/'hosting/php/family-private/core.php').read_text(),re.M).group(1))
build={'version':version,'schema':schema,'protocol':1}
(ROOT/'hosting/php/family-private/version.json').write_text(json.dumps(build,indent=2)+'\n')
(ROOT/'hosting/php/family-private/version.php').write_text("<?php return ['version'=>'"+version+"','schema'=>"+str(schema)+",'protocol'=>1];\n")
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
    z.write(ROOT/'hosting/php/THONG-KE-MUA-MOI.md','THONG-KE-MUA-MOI.md')
    z.write(ROOT/'hosting/php/CAP-NHAT-MOT-CHAM.md','CAP-NHAT-MOT-CHAM.md')
    z.write(ROOT/'hosting/php/SLOT-VA-CHUYEN-FAMILY.md','SLOT-VA-CHUYEN-FAMILY.md')
    z.write(ROOT/'hosting/php/NGAY-NHAN-TIEN-GIA-HAN.md','NGAY-NHAN-TIEN-GIA-HAN.md')
    z.write(ROOT/'hosting/php/GIAO-DIEN-HIEN-DAI.md','GIAO-DIEN-HIEN-DAI.md')
    z.write(ROOT/'hosting/php/TRA-CUU-CHUYEN-NHOM.md','TRA-CUU-CHUYEN-NHOM.md')
    z.write(ROOT/'hosting/php/LINK-NGAN.md','LINK-NGAN.md')
    z.write(ROOT/'hosting/php/link-ngan/index.php','link-ngan/index.php')
# Normalize portable read permissions; no executable or secret files are bundled.
with zipfile.ZipFile(DEST) as z: contents=[(i.filename,z.read(i.filename)) for i in z.infolist()]
with zipfile.ZipFile(DEST,'w',zipfile.ZIP_DEFLATED) as z:
    for name,content in contents:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-hostinger.zip (PHP source + shared assets only).')
# Existing installations need only changed code/assets; configuration is never bundled.
update_names=['public_html/product-import.js','public_html/sync-status.css','family-private/product-import.php','public_html/updater.js','public_html/update.php','public_html/index.php','family-private/runtime.php','family-private/updater.php','family-private/version.php','family-private/version.json','family-private/schema.sql','family-private/records.php','family-private/sheets.php','public_html/sheets.js','public_html/statistics.js','family-private/statistics.php','public_html/app.js','public_html/vault.js','public_html/vault-sheet.js','public_html/vault-families.js','public_html/csv.js','public_html/domain.js','public_html/contacts.js','public_html/index.html','public_html/access.html','public_html/manifest.webmanifest','public_html/style.css','public_html/api.php','family-private/core.php','family-private/vault.php','family-private/vault.sql','family-private/business.php','family-private/audit.php','family-private/issues.php','family-private/features.sql','family-private/cron.php','family-private/import.php','family-private/lookup.php','family-private/lookup.sql','public_html/moves.js','public_html/tra-cuu.html','public_html/tra-cuu.js','public_html/tra-cuu.css']
with zipfile.ZipFile(DEST) as z:
    update_contents=[(name,z.read(name)) for name in update_names]
with zipfile.ZipFile(ROOT/'downloads'/'family-hostinger-update.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('GIAO-DIEN-HIEN-DAI.md',(ROOT/'hosting/php/GIAO-DIEN-HIEN-DAI.md').read_bytes()),('NGAY-NHAN-TIEN-GIA-HAN.md',(ROOT/'hosting/php/NGAY-NHAN-TIEN-GIA-HAN.md').read_bytes()),('UPDATE.md',(ROOT/'hosting/php/UPDATE.md').read_bytes()),('THONG-KE-MUA-MOI.md',(ROOT/'hosting/php/THONG-KE-MUA-MOI.md').read_bytes()),('CAP-NHAT-MOT-CHAM.md',(ROOT/'hosting/php/CAP-NHAT-MOT-CHAM.md').read_bytes()),('SLOT-VA-CHUYEN-FAMILY.md',(ROOT/'hosting/php/SLOT-VA-CHUYEN-FAMILY.md').read_bytes()),('TRA-CUU-CHUYEN-NHOM.md',(ROOT/'hosting/php/TRA-CUU-CHUYEN-NHOM.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-hostinger-update.zip (changed files only; no config.php).')
with zipfile.ZipFile(ROOT/'downloads'/'family-cap-nhat-mot-cham.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('HUONG-DAN.md',(ROOT/'hosting/php/CAP-NHAT-MOT-CHAM.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-cap-nhat-mot-cham.zip (one-time updater bootstrap).')
with zipfile.ZipFile(ROOT/'downloads'/'family-slot-va-chuyen-family.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('HUONG-DAN.md',(ROOT/'hosting/php/SLOT-VA-CHUYEN-FAMILY.md').read_bytes()),('SLOT-VA-CHUYEN-FAMILY.md',(ROOT/'hosting/php/SLOT-VA-CHUYEN-FAMILY.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-slot-va-chuyen-family.zip (occupied slots and transfers above five).')
with zipfile.ZipFile(ROOT/'downloads'/'family-sua-ngay-nhan-tien.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('HUONG-DAN.md',(ROOT/'hosting/php/NGAY-NHAN-TIEN-GIA-HAN.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-sua-ngay-nhan-tien.zip (actual renewal receipt dates).')
with zipfile.ZipFile(ROOT/'downloads'/'family-giao-dien-hien-dai.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('HUONG-DAN.md',(ROOT/'hosting/php/GIAO-DIEN-HIEN-DAI.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-giao-dien-hien-dai.zip (modern responsive digital-services UI).')
with zipfile.ZipFile(ROOT/'downloads'/'family-dong-bo-va-san-pham.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('HUONG-DAN.md',(ROOT/'hosting/php/DONG-BO-VA-SAN-PHAM.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-dong-bo-va-san-pham.zip.')
with zipfile.ZipFile(ROOT/'downloads'/'family-fix-doi-mail-tu-kho.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('HUONG-DAN.md',(ROOT/'hosting/php/DOI-MAIL-TU-KHO.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-fix-doi-mail-tu-kho.zip.')
with zipfile.ZipFile(ROOT/'downloads'/'family-sua-mail-family.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('HUONG-DAN.md',(ROOT/'hosting/php/SUA-MAIL-FAMILY.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-sua-mail-family.zip.')
with zipfile.ZipFile(ROOT/'downloads'/'family-tra-cuu-chuyen-nhom.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('HUONG-DAN.md',(ROOT/'hosting/php/TRA-CUU-CHUYEN-NHOM.md').read_bytes()),('UPDATE.md',(ROOT/'hosting/php/UPDATE.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-tra-cuu-chuyen-nhom.zip (customer lookup page and bulk Family moves).')
with zipfile.ZipFile(ROOT/'downloads'/'family-ma-tra-cuu-gmail.zip','w',zipfile.ZIP_DEFLATED) as z:
    sheets_dir=ROOT/'integrations'/'google-sheets'
    for name,content in update_contents+[('HUONG-DAN.md',(sheets_dir/'MA-TRA-CUU-VA-GMAIL.md').read_bytes()),('UPDATE.md',(ROOT/'hosting/php/UPDATE.md').read_bytes()),('apps-script/Code.gs',(sheets_dir/'Code.gs').read_bytes()),('apps-script/appsscript.json',(sheets_dir/'appsscript.json').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-ma-tra-cuu-gmail.zip (lookup codes on the web and Sheet, invite links from Gmail).')
# A named update for the existing Hostinger installation; retain prior fixes.
with zipfile.ZipFile(ROOT/'downloads'/'family-thong-ke-mua-moi.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,content in update_contents+[('HUONG-DAN.md',(ROOT/'hosting/php/THONG-KE-MUA-MOI.md').read_bytes()),('THONG-KE-MUA-MOI.md',(ROOT/'hosting/php/THONG-KE-MUA-MOI.md').read_bytes()),('UPDATE.md',(ROOT/'hosting/php/UPDATE.md').read_bytes())]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,content)
print('Created downloads/family-thong-ke-mua-moi.zip (new purchases, expiry-month statistics and compact monthly menu).')
# Bundle the reviewed connector and exact website update together for onboarding.
connector=ROOT/'integrations'/'google-sheets'
def add_vault_entry_update(z):
    # Current Apps Script v5 needs the matching PHP endpoint even in older layout bundles.
    for name,source in [('GHI-KHO-TRUOC-DINH-DANG.md',connector/'GHI-KHO-TRUOC-DINH-DANG.md'),('XAC-NHAN-BO-CUC-KHO.md',connector/'XAC-NHAN-BO-CUC-KHO.md'),('SUA-HIEN-THI-KHO.md',connector/'SUA-HIEN-THI-KHO.md'),('SUA-LOI-BO-CUC-KHO.md',connector/'SUA-LOI-BO-CUC-KHO.md'),('NHAP-TAI-KHOAN.md',connector/'NHAP-TAI-KHOAN.md'),('family-private/sheets.php',ROOT/'hosting/php/family-private/sheets.php')]:
        if name not in z.namelist():
            info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,source.read_bytes())
with zipfile.ZipFile(ROOT/'downloads'/'family-google-sheets.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['Code.gs','appsscript.json','HUONG-DAN.md','MA-TRA-CUU-VA-GMAIL.md','CAP-NHAT-BO-CUC.md','SUA-KET-NOI.md','SUA-KHOA-DATABASE.md','CHAY-DOI-BO-CUC.md','GON-COT-VA-CON-NGAY.md','SUA-DONG-KHO-TRONG.md','SUA-MAT-KET-NOI-MYSQL.md','SUA-GHI-FAMILY-TABLE.md']:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,(connector/name).read_bytes())
    info=zipfile.ZipInfo('family-hostinger-update.zip');info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
    z.writestr(info,(ROOT/'downloads'/'family-hostinger-update.zip').read_bytes())
    add_vault_entry_update(z)
print('Created downloads/family-google-sheets.zip (Apps Script, guide and website update).')

# Layout upgrade with the matching PHP endpoint for an already connected website.
with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-theo-family.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['Code.gs','CAP-NHAT-BO-CUC.md']:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,(connector/name).read_bytes())
    add_vault_entry_update(z)
print('Created downloads/family-sheet-theo-family.zip (grouped customer layout and matching PHP endpoint).')

# Minimal patch for selecting the right deployment without resetting sync state.
with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-sua-ket-noi.zip','w',zipfile.ZIP_DEFLATED) as z:
    files={'Code.gs':connector/'Code.gs','SUA-KET-NOI.md':connector/'SUA-KET-NOI.md','family-private/core.php':ROOT/'hosting/php/family-private/core.php','family-private/sheets.php':ROOT/'hosting/php/family-private/sheets.php','public_html/sheets.js':ROOT/'public/sheets.js','public_html/style.css':ROOT/'public/style.css'}
    for name,source in files.items():
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,source.read_bytes())
    add_vault_entry_update(z)
print('Created downloads/family-sheet-sua-ket-noi.zip (endpoint and runtime diagnostics).')

# Short upgrade path for already connected sites affected by slow Google calls.
with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-sua-khoa.zip','w',zipfile.ZIP_DEFLATED) as z:
    files={'SUA-KHOA-DATABASE.md':connector/'SUA-KHOA-DATABASE.md','family-private/core.php':ROOT/'hosting/php/family-private/core.php','family-private/sheets.php':ROOT/'hosting/php/family-private/sheets.php','public_html/sheets.js':ROOT/'public/sheets.js','public_html/style.css':ROOT/'public/style.css'}
    for name,source in files.items():
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,source.read_bytes())
print('Created downloads/family-sheet-sua-khoa.zip (short database lock fix).')

# Direct owner-run formatting, independent of the website connection.
with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-ap-dung-bo-cuc.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['Code.gs','CHAY-DOI-BO-CUC.md']:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,(connector/name).read_bytes())
    add_vault_entry_update(z)
print('Created downloads/family-sheet-ap-dung-bo-cuc.zip (owner-run customer formatting).')

# Compact seven-column customer layout and locale-independent countdown fix.
with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-gon-va-con-ngay.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['Code.gs','GON-COT-VA-CON-NGAY.md']:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,(connector/name).read_bytes())
    add_vault_entry_update(z)
print('Created downloads/family-sheet-gon-va-con-ngay.zip (compact columns and expiry - TODAY - 2).')

with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-nhap-tai-khoan.zip','w',zipfile.ZIP_DEFLATED) as z:
    info=zipfile.ZipInfo('Code.gs');info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
    z.writestr(info,(connector/'Code.gs').read_bytes())
    add_vault_entry_update(z)
print('Created downloads/family-sheet-nhap-tai-khoan.zip (direct account entry, Apps Script + PHP + guide).')

# Script-only repair for sites that already installed the vault-entry PHP endpoint.
with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-sua-loi-bo-cuc-kho.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['Code.gs','SUA-LOI-BO-CUC-KHO.md']:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,(connector/name).read_bytes())
print('Created downloads/family-sheet-sua-loi-bo-cuc-kho.zip (vault date repair and read-only preflight).')

with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-sua-hien-thi-kho.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['Code.gs','SUA-HIEN-THI-KHO.md']:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,(connector/name).read_bytes())
print('Created downloads/family-sheet-sua-hien-thi-kho.zip (account verification and explicit presentation warnings).')

with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-xac-nhan-bo-cuc-kho.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['Code.gs','XAC-NHAN-BO-CUC-KHO.md']:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,(connector/name).read_bytes())
print('Created downloads/family-sheet-xac-nhan-bo-cuc-kho.zip (required vault header verification and exact Sheet URL).')

with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-ghi-kho-truoc-dinh-dang.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['Code.gs','GHI-KHO-TRUOC-DINH-DANG.md']:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,(connector/name).read_bytes())
print('Created downloads/family-sheet-ghi-kho-truoc-dinh-dang.zip (commit and verify data before presentation).')

# Existing Apps Script responses already contain these codes; no redeploy needed.
with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-phan-biet-loi.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,source in [('family-private/sheets.php',ROOT/'hosting/php/family-private/sheets.php'),('HUONG-DAN.md',connector/'PHAN-BIET-LOI-DONG-BO.md')]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,source.read_bytes())
print('Created downloads/family-sheet-phan-biet-loi.zip (safe Apps Script error classification).')

with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-xac-dinh-buoc-loi.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,source in [('Code.gs',connector/'Code.gs'),('family-private/sheets.php',ROOT/'hosting/php/family-private/sheets.php'),('HUONG-DAN.md',connector/'XAC-DINH-BUOC-LOI.md')]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,source.read_bytes())
print('Created downloads/family-sheet-xac-dinh-buoc-loi.zip (safe operation and source-line diagnostics).')

with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-sua-gia-han.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,source in [('Code.gs',connector/'Code.gs'),('HUONG-DAN.md',connector/'SUA-GIA-HAN-SHEET.md')]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,source.read_bytes())
print('Created downloads/family-sheet-sua-gia-han.zip (skip unchanged Family writes during customer renewal).')

with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-sua-dong-trong.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,source in [('Code.gs',connector/'Code.gs'),('HUONG-DAN.md',connector/'SUA-DONG-KHO-TRONG.md')]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,source.read_bytes())
print('Created downloads/family-sheet-sua-dong-trong.zip (ignore cleared vault input rows with leftover hidden IDs).')

with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-chan-doan-php.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,source in [('family-private/sheets.php',ROOT/'hosting/php/family-private/sheets.php'),('HUONG-DAN.md',connector/'CHAN-DOAN-PHP-SHEET.md')]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,source.read_bytes())
print('Created downloads/family-sheet-chan-doan-php.zip (safe local PHP sync diagnostics).')

with zipfile.ZipFile(ROOT/'downloads'/'family-sheet-sua-mat-ket-noi.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name,source in [('family-private/sheets.php',ROOT/'hosting/php/family-private/sheets.php'),('HUONG-DAN.md',connector/'SUA-MAT-KET-NOI-MYSQL.md')]:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,source.read_bytes())
print('Created downloads/family-sheet-sua-mat-ket-noi.zip (recover MySQL connections at Google I/O boundaries).')
