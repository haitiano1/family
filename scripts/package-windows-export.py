#!/usr/bin/env python3
"""Bundle the standalone helper only; no application or customer data."""
from pathlib import Path
import zipfile
root=Path(__file__).resolve().parents[1]
with zipfile.ZipFile(root/'downloads'/'family-windows-export.zip','w',zipfile.ZIP_DEFLATED) as z:
    for name in ['EXPORT-BACKUP-WINDOWS.cmd','export-backup.cjs']:
        info=zipfile.ZipInfo(name);info.external_attr=0o100644<<16;info.compress_type=zipfile.ZIP_DEFLATED
        z.writestr(info,(root/name).read_bytes())
print('Created downloads/family-windows-export.zip (two helper files only).')
