// Standalone, read-only exporter for old Windows installations. No application imports.
const { DatabaseSync } = require('node:sqlite');
const { existsSync, writeFileSync } = require('node:fs');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

function exportBackup(databaseFile, outputFile) {
  if (!existsSync(databaseFile)) throw new Error('No data/family.sqlite found. Put both export files beside START-WINDOWS.cmd and your existing data folder.');
  const db = new DatabaseSync(databaseFile, { readOnly:true });
  try {
    db.exec('PRAGMA busy_timeout=5000; BEGIN');
    const version=db.prepare('PRAGMA user_version').get().user_version;
    if (version>12) throw new Error('This database is newer than this export tool. Download the latest exporter.');
    const known=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name));
    for (const name of ['accounts','families','members']) if (!known.has(name)) throw new Error('Not a Fam Manager customer database.');
    const defaults={
      accounts:{id:null,email:'',note:'',created_at:''},
      families:{id:null,name:'',manager_id:null,created_at:'',service:'youtube',note:'',trial_date:'',archived_at:''},
      members:{id:null,family_id:null,email:'',customer_name:'',contact:'',joined_at:'',expires_at:'',payment_status:'unknown',amount:0,plan_months:0,note:'',renewal_status:'not_contacted',renewal_amount:0,renewal_paid_at:'',renewal_note:'',renewal_revision:0,declined_at:'',membership_status:'unknown'},
      archived_customers:{family_archive_id:null,id:null,original_member_id:null,email:'',customer_name:'',family_name:'',manager_email:'',snapshot:'',archived_at:'',reason:'',restored_at:null,restored_by:null,restored_member_id:null},
      renewal_history:{id:null,member_id:null,email:'',customer_name:'',family_name:'',old_expires_at:'',new_expires_at:'',plan_months:0,amount:0,paid_at:'',note:'',created_at:'',created_by:'',old_purchase_at:'',new_purchase_at:'',archive_id:null},
      other_purchases:{plan_months:0,id:null,product:'',customer_name:'',email:'',contact:'',joined_at:'',expires_at:'',payment_status:'unknown',amount:0,note:'',created_at:''},
      logs:{id:null,message:'',created_at:''},
      issues:{id:null,family_id:null,family_name:'',target_type:'manager',target_id:null,subject_email:'',original_email:'',title:'',note:'',status:'todo',revision:0,created_at:'',updated_at:'',done_at:'',resolution:'',resolution_email:'',resolution_note:'',trial_date:'',reported_on:''},
      audit_events:{id:null,action:'',actor:'',message:'',details:'',created_at:''}
    };
    const tables={};
    for (const [table,base] of Object.entries(defaults)) {
      const fields=Object.keys(base);
      tables[table]=known.has(table) ? db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map(row=>Object.fromEntries(fields.map(field=>[field,Object.hasOwn(row,field) ? row[field] : base[field]]))) : [];
    }
    for (const row of tables.archived_customers) {
      const m=JSON.parse(row.snapshot);
      if (!m || typeof m!=='object' || Array.isArray(m)) throw new Error('An archived customer snapshot is invalid. No export was written.');
      // Preserve all original snapshot fields; add only absent fields needed by older installations.
      let changed=false;
      for (const [field,value] of Object.entries(m.record_type==='other_product'?defaults.other_purchases:defaults.members)) if (!Object.hasOwn(m,field)) {m[field]=value;changed=true;}
      if (changed) row.snapshot=JSON.stringify(m);
    }
    const result={format:'family-customer-backup',version:5,created_at:new Date().toISOString(),tables};
    db.exec('COMMIT');
    writeFileSync(outputFile,JSON.stringify(result),{flag:'wx',mode:0o600});
    return result;
  } catch(error) {try {db.exec('ROLLBACK');} catch {} throw error;}
  finally {db.close();}
}

if (require.main===module) {
  const file=process.argv[2] || path.join(__dirname,'data','family.sqlite');
  const out=process.argv[3] || path.join(__dirname,`family-backup-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomBytes(3).toString('hex')}.json`);
  try {
    const result=exportBackup(file,out),t=result.tables;
    console.log(`Export complete: ${t.members.length} customers, ${t.families.length} families, ${t.archived_customers.length} archive records, ${t.renewal_history.length} renewal records, ${t.other_purchases.length} other products.`);
    console.log('Backup file: '+out);
    console.log('Your original database was opened read-only and was not upgraded or changed.');
    console.log('Open your hosted Family app > Sao luu / Chuyen du lieu > choose this JSON file > Khoi phuc du lieu.');
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
module.exports={exportBackup};
