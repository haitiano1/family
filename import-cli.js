import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { initDatabase } from './database.js';
import { validators } from './validation.js';
import { initImporter } from './importer.js';
import { prepareSheet,suggestMapping } from './public/csv.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const dir=process.env.DATA_DIR || path.join(root,'data');
let db;
try {
  if (!process.argv[2]) throw new Error('Choose a Google Sheets CSV file.');
  const source=readFileSync(process.argv[2],'utf8');
  const parsed=prepareSheet(source);
  if (!parsed.multi_family) throw new Error('This one-click importer expects the legacy Family sheet layout. Use the application CSV import for other formats.');
  const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
  const validation=validators(fail);
  db=initDatabase(dir);
  const log=message=>db.prepare('INSERT INTO logs(message,created_at) VALUES (?,?)').run(message,new Date().toISOString());
  const importer=initImporter(db,{...validation,fail,log});
  const payload={csv:parsed.normalizedCSV,delimiter:',',mapping:suggestMapping(parsed.headers),create_groups:true,duplicates:'skip',match_by_manager:true};
  const user={username:'Windows CSV import',role:'admin'};
  const preview=importer(payload,user);
  if (preview.summary.errors) {
    console.error(`Import stopped: ${preview.summary.errors} invalid rows. No customer imported.`);
    for (const row of preview.errors) console.error(`Row ${row.line}: ${row.message}`);
    process.exitCode=1;
  } else if (!preview.summary.create && !preview.summary.update) {
    console.log(`Already imported. ${preview.summary.skip} existing customers kept unchanged.`);
  } else {
    const backup=path.join(dir,`before-csv-${Date.now()}-${randomBytes(3).toString('hex')}.sqlite`);
    db.exec(`VACUUM INTO '${backup.replaceAll("'","''")}'`);
    const result=importer({...payload,preview_token:preview.preview_token},user,true);
    console.log(`Import complete: ${result.summary.create} new customers, ${result.summary.skip} existing records skipped, ${result.summary.new_families} new families.`);
    console.log('Existing application users/passwords and customer data were preserved. A backup is in the data directory.');
    console.log('Passwords and countdown columns were not imported. Invitation-pending records are kept separately from member slots.');
  }
} catch (error) { console.error(error.message);process.exitCode=1; }
finally { db?.close(); }
