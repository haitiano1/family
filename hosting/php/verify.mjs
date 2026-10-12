import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,chmodSync,writeFileSync,rmSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..'),prefix='family-php-'+process.pid,network=prefix+'-net',mysql=prefix+'-mysql',dir=mkdtempSync(tmpdir()+'/family-php-'),password=randomBytes(24).toString('hex');
const containers=[];let count=0;
const docker=(...args)=>execFileSync('docker',['--config',process.env.FAMILY_DOCKER_CONFIG || process.env.DOCKER_CONFIG || path.join(dir,'docker-config'),...args],{encoding:'utf8',maxBuffer:5e6,stdio:['ignore','pipe','pipe']}).trim();
const sql=text=>docker('exec','-e','MYSQL_PWD='+password,mysql,'mysql','-h127.0.0.1','-uroot','-N','-e',text);
const port=name=>JSON.parse(docker('inspect',name))[0].NetworkSettings.Ports['80/tcp'][0].HostPort;
before(async()=>{
 execFileSync('python3',['scripts/package-php.py'],{cwd:root});
 docker('build','-q','-t','family-php-test:8.3','-f','hosting/php/Test.Dockerfile','.');
 docker('network','create',network);
 docker('run','-d','--name',mysql,'--network',network,'-e','MYSQL_ROOT_PASSWORD='+password,'-e','MYSQL_ROOT_HOST=%','mysql:8.4');
 let ready=false;for(let i=0;i<150;i++){try{sql('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}
 assert.ok(ready,'MySQL did not start');
});
after(()=>{
 for(const name of containers)try{docker('rm','-f',name);}catch{}
 try{docker('rm','-f','-v',mysql);}catch{}try{docker('network','rm',network);}catch{}
 rmSync(dir,{recursive:true,force:true});
});
async function fixture(database){
 const id=++count,name=prefix+'-web'+id,folder=dir+'/site'+id;mkdirSync(folder);chmodSync(dir,0o755);chmodSync(folder,0o755);
 execFileSync('python3',['-c',"import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",root+'/downloads/family-hostinger.zip',folder]);
 execFileSync('python3',['-c',"import os,sys;[(os.chmod(b,0o755),[os.chmod(os.path.join(b,f),0o644) for f in fs]) for b,ds,fs in os.walk(sys.argv[1])]",folder]);
 const db=database || 'f_test_'+id;if(!database)sql('CREATE DATABASE '+db+' CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');
 docker('run','-d','--name',name,'--network',network,'-p','127.0.0.1::80','-e','FAMILY_ALLOW_HTTP=1','-v',folder+'/public_html:/var/www/html:ro','-v',folder+'/family-private:/var/www/family-private:ro','family-php-test:8.3');containers.push(name);
 let base='http://127.0.0.1:'+port(name),cookie='';
 function config(origin=base){writeFileSync(folder+'/family-private/config.php',`<?php return ['public_origin'=>'${origin}','db_host'=>'${mysql}','db_port'=>3306,'db_name'=>'${db}','db_user'=>'root','db_password'=>'${password}','access_password'=>'${password}'];`);chmodSync(folder+'/family-private/config.php',0o644);}
 config();
 let ready=false;for(let i=0;i<50;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,'Apache did not start');
 async function req(endpoint,method='GET',data,status=200,extra={}){
  const response=await fetch(base+'/api/'+endpoint,{method,headers:{'Content-Type':'application/json','X-Fam-Request':'1',Cookie:cookie,Connection:'close',...extra},body:data===undefined?undefined:JSON.stringify(data)});
  assert.equal(response.status,status,await response.clone().text());return response.json();
 }
 async function login(){const response=await fetch(base+'/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:JSON.stringify({password})});assert.equal(response.status,200,await response.clone().text());cookie=response.headers.get('set-cookie').split(';')[0];}
 return {req,login,db,folder,name,setOrigin:config,get base(){return base;},async restart(){docker('restart',name);base='http://127.0.0.1:'+port(name);config();let ok=false;for(let i=0;i<50;i++){try{if((await fetch(base+'/healthz')).ok){ok=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ok,'Apache restart failed');}};
}

test('PHP protects APIs/config, initializes a separate MySQL schema and remembers access',async()=>{
 const f=await fixture();await f.req('state','GET',undefined,401);await f.req('backup','GET',undefined,401);
 const front=await fetch(f.base+'/',{redirect:'manual'});assert.equal(front.status,302);assert.equal(front.headers.get('location'),'/access');
 for(const asset of ['/access','/manifest.webmanifest','/icon-180.png'])assert.equal((await fetch(f.base+asset)).status,200);
 assert.equal((await fetch(f.base+'/family-private/config.php')).status,404);assert.equal((await fetch(f.base+'/.user.ini')).status,403);
 await f.req('access','POST',{password:'wrong'},401);await f.login();assert.equal((await f.req('state')).hosted,true);
 await f.req('families','POST',{name:'Foreign',manager_email:'foreign@example.com'},403,{Origin:'https://foreign.example'});
 await f.req('families','POST',{name:'Header',manager_email:'header@example.com'},403,{'X-Fam-Request':''});
 const page=await fetch(f.base+'/',{headers:{Cookie:(await fetch(f.base+'/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:JSON.stringify({password})})).headers.get('set-cookie').split(';')[0]}});assert.equal(page.status,200);
 const state=await f.req('state');assert.equal('jobs' in state,false);assert.equal('user' in state,false);await f.req('users','GET',undefined,404);
 await f.req('access/close','POST',{}); // Clearing the browser cookie is tested in the browser suite.
});

test('PHP Family/customer CRUD, late renewal, stale revision and calendar-month clamping',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Family',manager_email:'manager@example.com'},201);
 const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',customer_name:'Khách thử',contact:'https://facebook.com/example',note:'Note Việt',joined_at:'2025-10-05',expires_at:'2026-01-05',plan_months:3},201);
 await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:150000,paid_at:'2026-01-15',plan_months:3,apply_now:true});
 let m=(await a('state')).members[0];assert.equal(m.joined_at,'2026-01-05');assert.equal(m.expires_at,'2026-04-05');assert.equal(m.renewal_status,'not_contacted');
 const history=(await a('members/'+member.id+'/renewal-history')).history[0];assert.equal(history.paid_at,'2026-01-15');assert.equal(history.old_purchase_at,'2025-10-05');
 await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:150000,paid_at:'2026-01-15',plan_months:3,apply_now:true},409);
 await a('members/'+member.id,'PATCH',{...m,joined_at:'2023-11-30',expires_at:'2024-01-31'});m=(await a('state')).members[0];
 const clamped=await a('members/'+member.id+'/renewal','PATCH',{revision:m.renewal_revision,status:'paid',amount:100000,paid_at:'2024-02-02',plan_months:1,apply_now:true});assert.equal(clamped.expires_at,'2024-02-29');
 await a('members','POST',{family_id:family.id,email:'invalid@example.com',expires_at:'2026-02-30'},400);
 await a('families/'+family.id,'PATCH',{name:'Edited',manager_email:'newmanager@example.com',note:'Family note'});assert.equal((await a('state')).families[0].manager_email,'newmanager@example.com');
 await f.restart();assert.equal((await a('state')).members[0].contact,'https://facebook.com/example');
});

test('PHP enforces occupied capacity while retaining invitation records and protects Family conflicts',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Family',manager_email:'manager@example.com'},201);
 for(let i=0;i<5;i++)await a('members','POST',{family_id:family.id,email:`guest${i}@example.com`},201);
 await a('members','POST',{family_id:family.id,email:'sixth@example.com'},400);
 const invited=await a('members','POST',{family_id:family.id,email:'invited@example.com',membership_status:'invited',note:'chưa vào'},201);
 await a('members/'+invited.id,'PATCH',{email:'invited@example.com',membership_status:'active'},400);
 const second=await a('families','POST',{name:'Second',manager_email:'second@example.com'},201);await a('families/'+second.id,'PATCH',{name:'Conflict',manager_email:'manager@example.com'},409);
 assert.equal((await a('state')).families.find(x=>x.id===second.id).manager_email,'second@example.com');
});

test('PHP archives declined customers after selection plus seven days and restores history/contact',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Family',manager_email:'manager@example.com'},201);
 const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',contact:'Zalo archive',expires_at:'2026-01-05'},201);
 await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2026-01-15',plan_months:3,apply_now:true});
 await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'declined'});assert.equal((await a('state')).archives.length,0);
 sql(`UPDATE ${f.db}.members SET declined_at='2020-01-01T00:00:00.000Z' WHERE id=${member.id}`);assert.match(docker('exec',f.name,'php','/var/www/family-private/cron.php'),/archive check complete/);assert.equal(sql(`SELECT COUNT(*) FROM ${f.db}.archived_customers`),'1');const state=await a('state');assert.equal(state.members.length,0);assert.equal(state.archives[0].member.contact,'Zalo archive');
 const archived=state.archives[0];assert.equal((await a('archives/'+archived.id+'/history')).history.length,1);
 const restored=await a('archives/'+archived.id+'/restore','POST',{family_id:family.id});assert.equal((await a('members/'+restored.member_id+'/renewal-history')).history.length,1);assert.equal((await a('state')).members[0].renewal_status,'not_contacted');
 await a('archives/'+archived.id+'/restore','POST',{family_id:family.id},409);
});

test('PHP products use two-day Vietnam reminders and backup restores exactly into another empty app',async()=>{
 const f=await fixture(),target=await fixture();await f.login();await target.login();const a=f.req,b=target.req;
 const day=(await a('state')).today,plus=n=>new Date(Date.parse(day)+n*86400000).toISOString().slice(0,10);
 const p=await a('other-products','POST',{product:'ChatGPT',customer_name:'Buyer',contact:'Facebook note',joined_at:day,expires_at:plus(2),note:'Sản phẩm phụ'},201);assert.equal((await a('state')).other_reminders.due_soon,1);
 await a('other-products/'+p.id,'PATCH',{product:'Spotify',email:'buyer@example.com',expires_at:plus(-1),note:'Expired'});assert.equal((await a('state')).other_reminders.expired,1);
 const backup=await a('backup');await b('restore','POST',backup);const restoredBackup=await b('backup');for(const t of Object.keys(backup.tables))if(t!=='audit_events')assert.deepEqual(restoredBackup.tables[t],backup.tables[t]);assert.deepEqual(restoredBackup.tables.audit_events.slice(0,-1),backup.tables.audit_events);assert.equal(restoredBackup.tables.audit_events.at(-1).action,'Khôi phục dữ liệu');await b('restore','POST',backup,409);
 await a('other-products/'+p.id,'DELETE');assert.equal((await a('state')).other_products.length,0);
 const empty=await fixture();await empty.login();const invalid=structuredClone(backup);delete invalid.tables.other_purchases[0].note;await empty.req('restore','POST',invalid,400);assert.equal((await empty.req('state')).other_products.length,0);
});

test('PHP CSV previews and commits atomically with deduplication, stale checks and empty-cell preservation',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const payload={csv:'Email,Manager,Name,Contact,Plan,Purchase,Expiry,Payment,Amount,Status\nguest@example.com,manager@example.com,Nguyễn An,Zalo,13 tháng,10/01/2026,10/02/2027,Đã thanh toán,100.000,unknown',mapping:{email:0,manager_email:1,customer_name:2,contact:3,plan_months:4,joined_at:5,expires_at:6,payment_status:7,amount:8,membership_status:9},create_groups:true,duplicates:'skip'};
 const p=await a('import/preview','POST',payload);assert.equal(p.summary.create,1);assert.equal(p.summary.errors,0);assert.equal((await a('state')).members.length,0);
 await a('import/commit','POST',{...payload,preview_token:p.preview_token});let state=await a('state');assert.equal(state.members[0].plan_months,13);assert.equal(state.members[0].payment_status,'paid');assert.equal(state.members[0].amount,100000);assert.equal((await a('import/preview','POST',payload)).summary.skip,1);
 const update={...payload,duplicates:'update',csv:'Email,Manager,Name,Contact,Plan,Purchase,Expiry,Payment,Amount,Status\nguest@example.com,manager@example.com,New Name,,,,,,,unknown'};const up=await a('import/preview','POST',update);await a('import/commit','POST',{...update,preview_token:up.preview_token});assert.equal((await a('state')).members[0].contact,'Zalo');
 const stale=await a('import/preview','POST',update);await a('members/'+state.members[0].id,'PATCH',{...state.members[0],note:'Changed'});await a('import/commit','POST',{...update,preview_token:stale.preview_token},409);
 const invalid={...payload,csv:payload.csv+'\nbad,manager@example.com,,,,,,,,'};const bad=await a('import/preview','POST',invalid);assert.equal(bad.summary.errors,1);await a('import/commit','POST',{...invalid,preview_token:bad.preview_token},400);
});

test('PHP refuses initialization into an unrelated project database',async()=>{
 sql('CREATE DATABASE unrelated_test;CREATE TABLE unrelated_test.wordpress_data(id INT);INSERT INTO unrelated_test.wordpress_data VALUES(7)');
 const f=await fixture('unrelated_test');await f.req('access','POST',{password},503);assert.equal(sql('SELECT id FROM unrelated_test.wordpress_data'),'7');assert.equal(sql('SHOW TABLES FROM unrelated_test'),'wordpress_data');
});

test('Node SQLite backup migrates to PHP MySQL with complete renewal history and archive, and back to Node',async()=>{
 const {initDatabase}=await import('../../database.js');const {customerBackup,restoreCustomers}=await import('../../backup.js');
 const {validators}=await import('../../validation.js');const {initRenewals}=await import('../../renewal.js');const {initArchive}=await import('../../archive.js');
 const db=initDatabase(dir+'/node-source'),stamp=new Date().toISOString();
 try{
  db.prepare('INSERT INTO accounts(id,email,note,created_at) VALUES(1,?,?,?)').run('manager@example.com','Manager note',stamp);db.prepare('INSERT INTO families(id,name,manager_id,created_at,service,note) VALUES(1,?,1,?,?,?)').run('Node Family',stamp,'youtube','Family note');
  db.prepare('INSERT INTO members(id,family_id,email,customer_name,contact,note,joined_at,expires_at,plan_months) VALUES(1,1,?,?,?,?,?,?,3)').run('buyer@example.com','Khách Việt','https://facebook.com/example','Original note','2025-10-05','2026-01-05');
  const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});},log=message=>db.prepare('INSERT INTO logs(message,created_at) VALUES(?,?)').run(message,stamp);
  initRenewals(db,{fail,...validators(fail),log})(1,{revision:0,status:'paid',amount:100000,paid_at:'2026-01-15',plan_months:3,apply_now:true},{username:'Cục bộ'});
  db.prepare("INSERT INTO members(id,family_id,email,contact,renewal_status,declined_at) VALUES(2,1,'archive@example.com','Zalo archive','declined','2020-01-01T00:00:00.000Z')").run();initArchive(db,{fail,log,mode:'declined'}).sweep();
  db.prepare('INSERT INTO other_purchases(product,customer_name,email,contact,joined_at,expires_at,payment_status,amount,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run('Netflix','Khách Việt','buyer@example.com','Contact','','','unknown',0,'Gói phụ',stamp);
  const {initIssues}=await import('../../issues.js'),{withAudit,auditLog}=await import('../../audit.js');
  const issues=initIssues(db,{fail,...validators(fail),log:message=>auditLog(db,message)});const issue=await withAudit(db,'Thêm lỗi',()=>issues.save(null,{family_id:1,target_type:'member',target_id:1,title:'Lỗi được sao lưu',note:'Giữ ghi chú lỗi'}));await withAudit(db,'Sửa lỗi',()=>issues.save(issue.id,{status:'done',revision:0,resolution:'keep'}));
  const backup=JSON.parse(JSON.stringify(customerBackup(db))),f=await fixture();assert.equal(backup.tables.issues[0].resolution,'keep');assert.equal(backup.tables.audit_events.length,2);await f.login();const invalid=structuredClone(backup);invalid.tables.members[0].family_id=99999;await f.req('restore','POST',invalid,400);assert.equal((await f.req('state')).accounts.length,0);
  await f.req('restore','POST',backup);const imported=await f.req('backup');for(const t of Object.keys(backup.tables))if(t!=='audit_events')assert.deepEqual(imported.tables[t],backup.tables[t]);assert.deepEqual(imported.tables.audit_events.slice(0,-1),backup.tables.audit_events);assert.equal(imported.tables.audit_events.at(-1).action,'Khôi phục dữ liệu');
  const dest=initDatabase(dir+'/node-restored');try{restoreCustomers(dest,imported,fail);assert.deepEqual(JSON.parse(JSON.stringify(customerBackup(dest))).tables,imported.tables);}finally{dest.close();}
  db.exec('DROP TABLE other_purchases;PRAGMA user_version=7');
  const {createRequire}=await import('node:module');const {exportBackup}=createRequire(import.meta.url)('../../export-backup.cjs');
  const sourceFile=dir+'/node-source/family.sqlite',before=readFileSync(sourceFile);
  const legacy=exportBackup(sourceFile,dir+'/old-windows-backup.json');assert.equal(legacy.tables.other_purchases.length,0);assert.deepEqual(readFileSync(sourceFile),before);assert.equal(db.prepare('PRAGMA user_version').get().user_version,7);
  const oldTarget=await fixture();await oldTarget.login();await oldTarget.req('restore','POST',legacy);const legacyResult=await oldTarget.req('backup');for(const t of Object.keys(legacy.tables))if(t!=='audit_events')assert.deepEqual(legacyResult.tables[t],legacy.tables[t]);assert.deepEqual(legacyResult.tables.audit_events.slice(0,-1),legacy.tables.audit_events);
 }finally{db.close();}
});

test('PHP Family issues support keep/replace for manager and customer with atomic conflict/stale guards',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Fix Family',manager_email:'manager-a@example.com'},201);const member=await a('members','POST',{family_id:family.id,email:'customer-a@example.com',contact:'Zalo contact',note:'Customer note'},201);
 const issue=await a('issues','POST',{family_id:family.id,target_type:'manager',title:'Manager error'},201);
 await a('issues/'+issue.id,'PATCH',{status:'done',revision:0},400);await a('issues/'+issue.id,'PATCH',{status:'doing',revision:0});
 sql(`CREATE TRIGGER ${f.db}.reject_issue_completion BEFORE UPDATE ON ${f.db}.issues FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected issue write failure'`);
 const journalBefore=(await a('journal')).total;await a('issues/'+issue.id,'PATCH',{status:'done',revision:1,resolution:'replace',replacement_email:'manager-b@example.com'},500);
 assert.equal((await a('state')).families[0].manager_email,'manager-a@example.com');assert.equal((await a('state')).issues[0].status,'doing');assert.equal((await a('journal')).total,journalBefore);
 sql(`DROP TRIGGER ${f.db}.reject_issue_completion`);await a('issues/'+issue.id,'PATCH',{status:'done',revision:1,resolution:'replace',replacement_email:'manager-b@example.com'});
 let state=await a('state');assert.equal(state.families[0].manager_email,'manager-b@example.com');assert.equal(state.issues[0].original_email,'manager-a@example.com');assert.match(state.issues[0].resolution_note,/manager-a@example.com.*manager-b@example.com/);
 await a('issues/'+issue.id,'PATCH',{status:'todo',revision:1},409);
 const customer=await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'Customer error'},201);
 await a('issues/'+customer.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'manager-b@example.com'},409);assert.equal((await a('state')).issues.find(i=>i.id===customer.id).status,'todo');assert.equal((await a('state')).members[0].email,'customer-a@example.com');
 await a('issues/'+customer.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'customer-b@example.com'});state=await a('state');assert.equal(state.members[0].email,'customer-b@example.com');assert.equal(state.members[0].note,'Customer note');assert.equal(state.members[0].contact,'Zalo contact');
 const keep=await a('issues','POST',{family_id:family.id,title:'Keep'},201);await a('issues/'+keep.id,'PATCH',{status:'done',revision:0,resolution:'keep'});assert.equal((await a('state')).families[0].manager_email,'manager-b@example.com');
 await f.restart();assert.equal((await a('state')).issues.filter(i=>i.status==='done').length,3);
});

test('PHP journal retains before/after edits and deletion cascades; v1 MySQL upgrades preserve data',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Gia đình Việt',manager_email:'manager@example.com'},201);const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',contact:'Original contact',note:'Original note'},201);
 // Simulate the installed previous PHP schema: same customer tables, no feature tables.
 sql(`DROP TABLE ${f.db}.issues;DROP TABLE ${f.db}.audit_events;UPDATE ${f.db}.app_meta SET value='1' WHERE name='schema_version'`);
 let state=await a('state');assert.equal(state.members[0].contact,'Original contact');assert.equal(state.families[0].name,'Gia đình Việt');assert.equal(sql(`SELECT value FROM ${f.db}.app_meta WHERE name='schema_version'`),'2');
 await a('members/'+member.id,'PATCH',{email:'guest@example.com',contact:'Edited contact',note:'Edited note'});let journal=await a('journal?search=guest@example.com');const changed=journal.entries.find(e=>e.action==='Sửa khách');const detail=await a('journal/audit/'+changed.id);assert.equal(detail.changes[0].before.contact,'Original contact');assert.equal(detail.changes[0].after.contact,'Edited contact');
 const count=(await a('journal')).total;await a('members/'+member.id,'PATCH',{email:'bad'},400);assert.equal((await a('journal')).total,count);
 const issue=await a('issues','POST',{family_id:family.id,title:'Still open'},201);await a('families/'+family.id,'DELETE');state=await a('state');assert.equal(state.issues[0].id,issue.id);assert.equal(state.issues[0].family_id,null);assert.equal(state.issues[0].target_available,false);
 journal=await a('journal?search=manager@example.com');const deletion=journal.entries.find(e=>e.action==='Xóa Family');assert.ok(deletion);const deleted=await a('journal/audit/'+deletion.id);assert.equal(deleted.changes.find(c=>c.table==='members').before.contact,'Edited contact');assert.equal(deleted.changes.find(c=>c.table==='members').after,null);
 assert.ok((await a('journal?search='+encodeURIComponent('GIA ĐÌNH VIỆT'))).total>0);
});
