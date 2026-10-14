import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,readdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {initDatabase} from '../database.js';
import {customerBackup,restoreCustomers} from '../backup.js';
const {exportBackup}=createRequire(import.meta.url)('../export-backup.cjs');
const digest=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};

test('standalone old-Windows exporter preserves v7 customers/contact/history and leaves original SQLite unchanged',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'fam-export-v7-'));try{
  const db=initDatabase(dir),file=path.join(dir,'family.sqlite'),out=path.join(dir,'backup.json');
  db.exec("DROP TABLE other_purchases;PRAGMA user_version=7;CREATE TABLE users(id INTEGER,password_hash TEXT);INSERT INTO users VALUES(1,'DO-NOT-EXPORT');INSERT INTO accounts VALUES(1,'manager@example.com','Group contact','2026-01-01');INSERT INTO families(id,name,manager_id,created_at,service,note) VALUES(1,'Family',1,'2026-01-01','youtube','Family note');INSERT INTO members(id,family_id,email,customer_name,contact,note,plan_months,joined_at,expires_at) VALUES(1,1,'buyer@example.com','Khách Việt','https://facebook.com/example','Original note',3,'2026-01-05','2026-04-05');");
  db.prepare('INSERT INTO renewal_history(member_id,email,customer_name,family_name,old_expires_at,new_expires_at,plan_months,amount,paid_at,note,created_at,created_by,old_purchase_at,new_purchase_at) VALUES(1,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('buyer@example.com','Khách Việt','Family','2026-01-05','2026-04-05',3,150000,'2026-01-15','Receipt note','2026-01-15','Owner','2025-10-05','2026-01-05');db.close();
  const before=digest(file),files=readdirSync(dir);
  const output=execFileSync(process.execPath,['export-backup.cjs',file,out],{encoding:'utf8'});assert.match(output,/Export complete: 1 customers, 1 families/);assert.equal(output.includes('DO-NOT-EXPORT'),false);
  const result=JSON.parse(readFileSync(out));assert.equal(result.tables.members[0].contact,'https://facebook.com/example');assert.equal(result.tables.members[0].note,'Original note');assert.equal(result.tables.renewal_history[0].paid_at,'2026-01-15');assert.deepEqual(result.tables.other_purchases,[]);assert.equal('users' in result.tables,false);assert.equal(readFileSync(out,'utf8').includes('DO-NOT-EXPORT'),false);
  assert.equal(digest(file),before);assert.deepEqual(readdirSync(dir).filter(n=>n!=='backup.json').sort(),files.sort());
  const source=new DatabaseSync(file,{readOnly:true});assert.equal(source.prepare('PRAGMA user_version').get().user_version,7);source.close();
  const dest=initDatabase(path.join(dir,'dest'));try{restoreCustomers(dest,result,fail);assert.equal(dest.prepare('SELECT contact FROM members').get().contact,'https://facebook.com/example');assert.equal(dest.prepare('SELECT old_purchase_at FROM renewal_history').get().old_purchase_at,'2025-10-05');}finally{dest.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('read-only exporter supports minimal old schema without inventing purchase dates or upgrading data',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'fam-export-old-'));try{
  const file=path.join(dir,'family.sqlite'),out=path.join(dir,'backup.json');const db=new DatabaseSync(file);db.exec("CREATE TABLE accounts(id INTEGER PRIMARY KEY,email TEXT,note TEXT,created_at TEXT);CREATE TABLE families(id INTEGER PRIMARY KEY,name TEXT,manager_id INTEGER,created_at TEXT);CREATE TABLE members(id INTEGER PRIMARY KEY,family_id INTEGER,email TEXT);INSERT INTO accounts VALUES(1,'manager@example.com','','2026-01-01');INSERT INTO families VALUES(1,'Old',1,'2026-01-01');INSERT INTO members VALUES(1,1,'guest@example.com');");db.close();const before=digest(file);
  const result=exportBackup(file,out);assert.equal(result.tables.members[0].joined_at,'');assert.equal(result.tables.members[0].expires_at,'');assert.equal(result.tables.members[0].plan_months,0);assert.equal(result.tables.members[0].payment_status,'unknown');assert.equal(result.tables.families[0].service,'youtube');assert.deepEqual(result.tables.renewal_history,[]);assert.equal(digest(file),before);
  const dest=initDatabase(path.join(dir,'dest'));try{restoreCustomers(dest,result,fail);assert.equal(dest.prepare('SELECT email FROM members').get().email,'guest@example.com');}finally{dest.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('current database export retains exact archive snapshots and products and refuses to overwrite output',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'fam-export-current-'));try{
  const db=initDatabase(dir),file=path.join(dir,'family.sqlite'),out=path.join(dir,'backup.json');
  const member={id:2,family_id:1,email:'archived@example.com',customer_name:'Archived',contact:'Zalo',joined_at:'',expires_at:'',payment_status:'unknown',amount:0,note:'Note',plan_months:3,renewal_status:'declined',renewal_amount:0,renewal_paid_at:'',renewal_note:'',renewal_revision:1,declined_at:'2026-01-01',membership_status:'invited',family_name:'Family',manager_email:'manager@example.com'};
  db.prepare('INSERT INTO archived_customers(original_member_id,email,customer_name,family_name,manager_email,snapshot,archived_at,reason) VALUES(?,?,?,?,?,?,?,?)').run(2,member.email,'Archived','Family','manager@example.com',JSON.stringify(member),'2026-01-08','Declined');
  db.prepare('INSERT INTO other_purchases(product,customer_name,email,contact,joined_at,expires_at,payment_status,amount,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('ChatGPT','Buyer','','Contact','2026-01-01','2026-02-01','paid',100000,'Product note','2026-01-01');const expected=JSON.parse(JSON.stringify(customerBackup(db))).tables;db.close();const before=digest(file);
  const result=exportBackup(file,out);assert.deepEqual(result.tables,expected);assert.equal(digest(file),before);const saved=readFileSync(out,'utf8');assert.throws(()=>exportBackup(file,out),/EEXIST/);assert.equal(readFileSync(out,'utf8'),saved);assert.equal(digest(file),before);
  const missing=path.join(dir,'missing.sqlite');assert.throws(()=>exportBackup(missing,path.join(dir,'missing.json')),/No data/);assert.equal(readdirSync(dir).includes('missing.sqlite'),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('read-only exporter preserves archived product type and original purchase data for restoring without a Family',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'fam-export-product-'));try{
  const db=initDatabase(dir),file=path.join(dir,'family.sqlite'),out=path.join(dir,'backup.json'),snapshot={record_type:'other_product',id:1,product:'ChatGPT',customer_name:'Standalone',email:'',contact:'FB/Zalo',joined_at:'2026-10-13',expires_at:'',payment_status:'paid',amount:100000,note:'Keep note',created_at:'2026-10-13T00:00:00.000Z',plan_months:3};
  db.prepare('INSERT INTO archived_customers(original_member_id,email,customer_name,family_name,manager_email,snapshot,archived_at,reason) VALUES(?,?,?,?,?,?,?,?)').run(1,'','Standalone','Sản phẩm khác','',JSON.stringify(snapshot),'2026-10-13T01:00:00.000Z','Product archive');db.close();const before=digest(file),result=exportBackup(file,out);assert.equal(result.version,7);assert.deepEqual(JSON.parse(result.tables.archived_customers[0].snapshot),snapshot);assert.equal(digest(file),before);
  const dest=initDatabase(path.join(dir,'dest'));try{restoreCustomers(dest,result,fail);assert.deepEqual(JSON.parse(dest.prepare('SELECT snapshot FROM archived_customers').get().snapshot),snapshot);}finally{dest.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('read-only exporter preserves encrypted vault rows without exporting session keys or plaintext',async()=>{
 const {randomBytes}=await import('node:crypto'),{wrapMaster,seal,normalizeTotp}=await import('../vault-crypto.js');const dir=mkdtempSync(path.join(tmpdir(),'fam-vault-export-'));try{
  const db=initDatabase(dir),file=path.join(dir,'family.sqlite'),out=path.join(dir,'backup.json'),key=randomBytes(32),stamp=new Date().toISOString(),password='Exporter-vault-password',seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const item={email:'private-export@example.com',password:'Private-export-password',label:'Private export label',recovery_email:'private-recovery@example.com',totp:normalizeTotp(seed)};db.prepare("INSERT INTO vault_meta(name,value) VALUES('config',?)").run(JSON.stringify(wrapMaster(password,key)));db.prepare('INSERT INTO vault_items(id,payload,revision,created_at,updated_at) VALUES(1,?,0,?,?)').run(JSON.stringify(seal(JSON.stringify(item),key,'family-vault-item-v1:1')),stamp,stamp);db.prepare('INSERT INTO vault_sessions(token_hash,expires_at) VALUES(?,?)').run('Public test session hash',Date.now()+900000);
  const expected=JSON.parse(JSON.stringify(customerBackup(db).tables));db.close();const before=digest(file),result=exportBackup(file,out);assert.equal(result.version,7);assert.deepEqual(result.tables,expected);assert.equal('vault_sessions' in result.tables,false);const content=readFileSync(out,'utf8');for(const value of [password,seed,item.email,item.password,item.recovery_email,item.label,'Public test session hash'])assert.equal(content.includes(value),false);assert.equal(digest(file),before);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
