import {test,before,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,chmodSync,writeFileSync,rmSync,mkdirSync,readFileSync,cpSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {summarizeRenewals,summarizeNewPurchases} from '../../statistics.js';
const root=path.resolve(import.meta.dirname,'../..'),prefix='family-php-'+process.pid,network=prefix+'-net',mysql=prefix+'-mysql',dir=mkdtempSync(tmpdir()+'/family-php-'),password=randomBytes(24).toString('hex');
const databaseImage=process.env.FAMILY_PHP_DATABASE_IMAGE||'mysql:8.4',databaseClient=databaseImage.startsWith('mariadb:')?'mariadb':'mysql';
const containers=[],writableContainers=new Set();let count=0;
const docker=(...args)=>execFileSync('docker',['--config',process.env.FAMILY_DOCKER_CONFIG || process.env.DOCKER_CONFIG || path.join(dir,'docker-config'),...args],{encoding:'utf8',maxBuffer:5e6,stdio:['ignore','pipe','pipe']}).trim();
const sql=text=>docker('exec','-e','MYSQL_PWD='+password,mysql,databaseClient,'--default-character-set=utf8mb4','-h127.0.0.1','-uroot','-N','-e',text);
const port=name=>JSON.parse(docker('inspect',name))[0].NetworkSettings.Ports['80/tcp'][0].HostPort;
before(async()=>{
 if(process.env.FAMILY_PHP_SOURCE_ONLY!=='1'){
  execFileSync('python3',['scripts/package-php.py'],{cwd:root});
  execFileSync('python3',['scripts/package-release.py'],{cwd:root});
 }
 if(process.env.FAMILY_PHP_USE_EXISTING_IMAGE==='1')docker('image','inspect','family-php-test:8.3');
 else docker('build','-q','-t','family-php-test:8.3','-f','hosting/php/Test.Dockerfile','.');
 docker('run','--rm','-v',root+'/hosting/php:/source:ro','family-php-test:8.3','bash','-o','pipefail','-c',"find /source -type f -name '*.php' ! -name 'config.php' -print0 | xargs -0 -n1 php -l");
 docker('network','create',network);
 docker('run','-d','--name',mysql,'--network',network,'-e','MYSQL_ROOT_PASSWORD='+password,'-e','MYSQL_ROOT_HOST=%',databaseImage);
 let ready=false;for(let i=0;i<150;i++){try{sql('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}
 assert.ok(ready,'MySQL did not start');
});
after(()=>{
 for(const name of containers)try{if(writableContainers.has(name))docker('exec',name,'chmod','-R','a+rwX','/var/www/family-private/.updates');docker('rm','-f',name);}catch{}
 try{docker('rm','-f','-v',mysql);}catch{}try{docker('network','rm',network);}catch{}
 rmSync(dir,{recursive:true,force:true});
});
afterEach(()=>{
 for(const name of containers.splice(0)){if(writableContainers.has(name)){docker('exec',name,'chmod','-R','a+rwX','/var/www/family-private/.updates');writableContainers.delete(name);}docker('rm','-f',name);}
 for(const database of sql('SHOW DATABASES').split('\n').filter(n=>/^f_test_\d+$/.test(n)||n==='unrelated_test'))sql('DROP DATABASE `'+database+'`');
});
async function fixture(database,writable=false){
 const id=++count,name=prefix+'-web'+id,folder=dir+'/site'+id;mkdirSync(folder);chmodSync(dir,0o755);chmodSync(folder,0o755);
 if(process.env.FAMILY_PHP_SOURCE_ONLY==='1'){
  cpSync(root+'/hosting/php/public_html',folder+'/public_html',{recursive:true});
  cpSync(root+'/hosting/php/family-private',folder+'/family-private',{recursive:true,filter:source=>path.basename(source)!=='config.php'});
  cpSync(root+'/public',folder+'/public_html',{recursive:true});cpSync(root+'/domain.js',folder+'/public_html/domain.js');cpSync(root+'/vault-families.js',folder+'/public_html/vault-families.js');
 }else execFileSync('python3',['-c',"import zipfile,sys;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])",root+'/downloads/family-hostinger.zip',folder]);
 execFileSync('python3',['-c',"import os,sys;[(os.chmod(b,0o755),[os.chmod(os.path.join(b,f),0o644) for f in fs]) for b,ds,fs in os.walk(sys.argv[1])]",folder]);
 if(writable){chmodSync(folder+'/family-private',0o777);chmodSync(folder+'/public_html',0o777);}
 const db=database || 'f_test_'+id;if(!database)sql('CREATE DATABASE '+db+' CHARACTER SET utf8mb4 COLLATE utf8mb4_bin');
 docker('run','-d','--name',name,'--network',network,'-p','127.0.0.1::80','-e','FAMILY_ALLOW_HTTP=1','-v',folder+'/public_html:/var/www/html:'+(writable?'rw':'ro'),'-v',folder+'/family-private:/var/www/family-private:'+(writable?'rw':'ro'),'family-php-test:8.3');containers.push(name);if(writable)writableContainers.add(name);
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

test('PHP immediately archives declined customers in the renewal transaction and restores history/contact',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Family',manager_email:'manager@example.com'},201);
 const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',contact:'Zalo archive',expires_at:'2026-01-05'},201);
 const issue=await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'Before cancellation'},201);
 await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2026-01-15',plan_months:3,apply_now:true});
 const count=(await a('journal')).total;sql(`CREATE TRIGGER ${f.db}.reject_archive BEFORE INSERT ON ${f.db}.archived_customers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected archive write failure'`);await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'declined'},500);assert.equal((await a('state')).members[0].renewal_status,'not_contacted');assert.equal((await a('state')).archives.length,0);assert.equal((await a('journal')).total,count);sql(`DROP TRIGGER ${f.db}.reject_archive`);
 const result=await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'declined'});assert.equal(result.archived,true);assert.equal(sql(`SELECT COUNT(*) FROM ${f.db}.members`),'0');assert.equal(sql(`SELECT COUNT(*) FROM ${f.db}.archived_customers`),'1');const state=await a('state');assert.equal(state.members.length,0);assert.equal(state.archives[0].id,result.archive_id);assert.equal(state.archives[0].member.contact,'Zalo archive');
 const archived=state.archives[0];assert.equal((await a('archives/'+archived.id+'/history')).history.length,1);
 sql(`ALTER TABLE ${f.db}.members AUTO_INCREMENT=${member.id}`);const replacement=await a('members','POST',{family_id:family.id,email:'different@example.com',expires_at:'2027-01-01'},201);assert.equal(replacement.id,member.id);assert.equal((await a('state')).issues[0].target_available,false);await a('issues/'+issue.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'wrong@example.com'},409);assert.equal((await a('state')).members[0].email,'different@example.com');
 const restored=await a('archives/'+archived.id+'/restore','POST',{family_id:family.id});assert.equal((await a('members/'+restored.member_id+'/renewal-history')).history.length,1);assert.equal((await a('state')).members[0].renewal_status,'not_contacted');
 await a('archives/'+archived.id+'/restore','POST',{family_id:family.id},409);
 sql(`UPDATE ${f.db}.members SET renewal_status='declined',declined_at='' WHERE id=${restored.member_id}`);assert.match(docker('exec',f.name,'php','/var/www/family-private/cron.php'),/archive check complete/);assert.equal(sql(`SELECT COUNT(*) FROM ${f.db}.members`),'1');assert.equal(sql(`SELECT COUNT(*) FROM ${f.db}.archived_customers WHERE restored_at IS NULL`),'1');
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
  db.exec("UPDATE families SET trial_date='2026-08-10'");
  const issues=initIssues(db,{fail,...validators(fail),log:message=>auditLog(db,message)});const issue=await withAudit(db,'Thêm lỗi',()=>issues.save(null,{family_id:1,target_type:'member',target_id:1,title:'Lỗi được sao lưu',note:'Giữ ghi chú lỗi'}));await withAudit(db,'Sửa lỗi',()=>issues.save(issue.id,{status:'done',revision:0,resolution:'keep'}));
  db.exec("UPDATE issues SET reported_on='2026-08-15'");
  const backup=JSON.parse(JSON.stringify(customerBackup(db))),f=await fixture();assert.equal(backup.tables.issues[0].resolution,'keep');assert.equal(backup.tables.audit_events.length,2);await f.login();const invalid=structuredClone(backup);invalid.tables.members[0].family_id=99999;await f.req('restore','POST',invalid,400);assert.equal((await f.req('state')).accounts.length,0);
  await f.req('restore','POST',backup);assert.equal((await f.req('state')).issues[0].days_used,5);const imported=await f.req('backup');for(const t of Object.keys(backup.tables))if(t!=='audit_events')assert.deepEqual(imported.tables[t],backup.tables[t]);assert.deepEqual(imported.tables.audit_events.slice(0,-1),backup.tables.audit_events);assert.equal(imported.tables.audit_events.at(-1).action,'Khôi phục dữ liệu');
  const dest=initDatabase(dir+'/node-restored');try{restoreCustomers(dest,imported,fail);assert.deepEqual(JSON.parse(JSON.stringify(customerBackup(dest))).tables,imported.tables);}finally{dest.close();}
  db.exec('DROP TABLE other_purchases;PRAGMA user_version=7');
  const {createRequire}=await import('node:module');const {exportBackup}=createRequire(import.meta.url)('../../export-backup.cjs');
  const sourceFile=dir+'/node-source/family.sqlite',before=readFileSync(sourceFile);
  const legacy=exportBackup(sourceFile,dir+'/old-windows-backup.json');assert.equal(legacy.tables.other_purchases.length,0);assert.deepEqual(readFileSync(sourceFile),before);assert.equal(db.prepare('PRAGMA user_version').get().user_version,7);
  const oldTarget=await fixture();await oldTarget.login();await oldTarget.req('restore','POST',legacy);const legacyResult=await oldTarget.req('backup');for(const t of Object.keys(legacy.tables))if(t!=='audit_events')assert.deepEqual(legacyResult.tables[t],legacy.tables[t]);assert.deepEqual(legacyResult.tables.audit_events.slice(0,-1),legacy.tables.audit_events);
 }finally{db.close();}
});

test('PHP receipt dates are blank while waiting, default to actual payment day and retain the expiry-month statistics',async()=>{
const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Receipt date test',manager_email:'receipt-owner@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'receipt-guest@example.com',joined_at:'2026-08-10',expires_at:'2026-09-10'},201),current=(await a('state')).today;
 await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'awaiting_payment',amount:165000,paid_at:'2026-10-15'});let row=(await a('state')).members.find(m=>m.id===member.id);assert.equal(row.renewal_paid_at,'');assert.equal(row.expires_at,'2026-09-10');assert.equal((await a('members/'+member.id+'/renewal-history')).history.length,0);
 await a('members/'+member.id+'/renewal','PATCH',{revision:row.renewal_revision,status:'paid',amount:165000,plan_months:3,apply_now:true});const history=(await a('members/'+member.id+'/renewal-history')).history[0];assert.equal(history.paid_at,current);assert.equal(history.old_expires_at,'2026-09-10');assert.equal(history.new_expires_at,'2026-12-10');assert.equal((await a('statistics?month=2026-09')).selected.amount,165000);
 const second=await a('members','POST',{family_id:family.id,email:'receipt-partial@example.com',expires_at:'2026-09-12'},201);await a('members/'+second.id+'/renewal','PATCH',{revision:0,status:'partial',amount:10000,paid_at:'2026-10-15'});row=(await a('state')).members.find(m=>m.id===second.id);assert.equal(row.renewal_paid_at,'2026-10-15');await a('members/'+second.id+'/renewal','PATCH',{revision:row.renewal_revision,status:'paid',amount:100000,plan_months:1,apply_now:true});assert.equal((await a('members/'+second.id+'/renewal-history')).history[0].paid_at,current);
 const third=await a('members','POST',{family_id:family.id,email:'receipt-manual@example.com',expires_at:'2026-09-14'},201);await a('members/'+third.id+'/renewal','PATCH',{revision:0,status:'paid',amount:50000,paid_at:'2026-10-20',plan_months:1,apply_now:true});assert.equal((await a('members/'+third.id+'/renewal-history')).history[0].paid_at,'2026-10-20');

});

test('PHP Family issues support keep/replace for manager and customer with atomic conflict/stale guards',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Fix Family',manager_email:'manager-a@example.com',trial_date:'2026-08-10'},201);const member=await a('members','POST',{family_id:family.id,email:'customer-a@example.com',contact:'Zalo contact',note:'Customer note'},201);
 const issue=await a('issues','POST',{family_id:family.id,target_type:'manager',title:'Manager error'},201);
 await a('issues/'+issue.id,'PATCH',{status:'done',revision:0},400);await a('issues/'+issue.id,'PATCH',{status:'doing',revision:0});
 sql(`CREATE TRIGGER ${f.db}.reject_issue_completion BEFORE UPDATE ON ${f.db}.issues FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected issue write failure'`);
 const before=(await a('backup')).tables,reported=(await a('state')).issues[0];const journalBefore=(await a('journal')).total;await a('issues/'+issue.id,'PATCH',{status:'done',revision:1,resolution:'replace',replacement_email:'manager-b@example.com'},500);
 assert.equal((await a('state')).families[0].manager_email,'manager-a@example.com');assert.equal((await a('state')).issues[0].status,'doing');assert.equal((await a('journal')).total,journalBefore);assert.deepEqual((await a('backup')).tables,before);
 sql(`DROP TRIGGER ${f.db}.reject_issue_completion`);await a('issues/'+issue.id,'PATCH',{status:'done',revision:1,resolution:'replace',replacement_email:'manager-b@example.com'});
 let state=await a('state');assert.equal(state.families[0].manager_email,'manager-b@example.com');assert.equal(state.issues[0].original_email,'manager-a@example.com');assert.match(state.issues[0].resolution_note,/manager-a@example.com.*manager-b@example.com/);
 const fixed=state.issues[0],expected=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(fixed.done_at));assert.equal(state.families[0].trial_date,expected);assert.equal(fixed.trial_date,reported.trial_date);assert.equal(fixed.reported_on,reported.reported_on);assert.equal(fixed.days_used,reported.days_used);assert.ok(fixed.resolution_note.includes(expected.split('-').reverse().join('/')));
 const audit=(await a('journal')).entries.find(e=>e.action==='Sửa lỗi'),detail=await a('journal/audit/'+audit.id),change=detail.changes.find(c=>c.table==='families');assert.equal(change.before.trial_date,'2026-08-10');assert.equal(change.after.trial_date,expected);assert.ok(detail.changes.some(c=>c.table==='accounts'&&c.after.email==='manager-b@example.com'));
 await a('families/'+family.id,'PATCH',{name:'Fix Family',manager_email:'manager-b@example.com',trial_date:'2026-09-01'});await a('issues/'+issue.id,'PATCH',{status:'done',revision:fixed.revision,note:'Edited completed note'});assert.equal((await a('state')).families[0].trial_date,'2026-09-01');

 await a('issues/'+issue.id,'PATCH',{status:'todo',revision:1},409);
 const customer=await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'Customer error'},201);
 await a('issues/'+customer.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'manager-b@example.com'},409);assert.equal((await a('state')).issues.find(i=>i.id===customer.id).status,'todo');assert.equal((await a('state')).members[0].email,'customer-a@example.com');
 await a('issues/'+customer.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'customer-b@example.com'});state=await a('state');assert.equal(state.members[0].email,'customer-b@example.com');assert.equal(state.families[0].trial_date,'2026-09-01');assert.equal(state.members[0].note,'Customer note');assert.equal(state.members[0].contact,'Zalo contact');
 const keep=await a('issues','POST',{family_id:family.id,title:'Keep'},201);await a('issues/'+keep.id,'PATCH',{status:'done',revision:0,resolution:'keep'});assert.equal((await a('state')).families[0].manager_email,'manager-b@example.com');assert.equal((await a('state')).families[0].trial_date,'2026-09-01');
 await f.restart();assert.equal((await a('state')).issues.filter(i=>i.status==='done').length,3);
});

test('PHP journal retains before/after edits and deletion cascades; v1 MySQL upgrades preserve data',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Gia đình Việt',manager_email:'manager@example.com'},201);const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',contact:'Original contact',note:'Original note'},201);
 // Simulate the installed previous PHP schema: same customer tables, no feature tables.
 sql(`DROP TABLE ${f.db}.issues;DROP TABLE ${f.db}.audit_events;UPDATE ${f.db}.app_meta SET value='1' WHERE name='schema_version'`);
 let state=await a('state');assert.equal(state.members[0].contact,'Original contact');assert.equal(state.families[0].name,'Gia đình Việt');assert.equal(sql(`SELECT value FROM ${f.db}.app_meta WHERE name='schema_version'`),'8');
 await a('members/'+member.id,'PATCH',{email:'guest@example.com',contact:'Edited contact',note:'Edited note'});let journal=await a('journal?search=guest@example.com');const changed=journal.entries.find(e=>e.action==='Sửa khách');const detail=await a('journal/audit/'+changed.id);assert.equal(detail.changes[0].before.contact,'Original contact');assert.equal(detail.changes[0].after.contact,'Edited contact');
 const count=(await a('journal')).total;await a('members/'+member.id,'PATCH',{email:'bad'},400);assert.equal((await a('journal')).total,count);
 const issue=await a('issues','POST',{family_id:family.id,title:'Still open'},201);await a('families/'+family.id,'DELETE');state=await a('state');assert.equal(state.issues[0].id,issue.id);assert.equal(state.issues[0].family_id,family.id);assert.equal(state.issues[0].target_available,false);
 journal=await a('journal?search=manager@example.com');const deletion=journal.entries.find(e=>e.action==='Xóa Family');assert.ok(deletion);const deleted=await a('journal/audit/'+deletion.id);assert.equal(deleted.changes.find(c=>c.table==='members').before.contact,'Edited contact');assert.equal(deleted.changes.find(c=>c.table==='members').after,null);
 assert.ok((await a('journal?search='+encodeURIComponent('GIA ĐÌNH VIỆT'))).total>0);
});

test('PHP snapshots trial/report dates, counts five days and deletes only done cases with retained audit history',async()=>{
 const f=await fixture();await f.login();const a=f.req,current=(await a('state')).today,trial=new Date(Date.parse(current)-5*86400000).toISOString().slice(0,10);
 const family=await a('families','POST',{name:'Trial Family',manager_email:'trial@example.com',trial_date:trial},201);await a('members','POST',{family_id:family.id,email:'guest@example.com',contact:'Original Zalo'},201);
 await a('families/'+family.id,'PATCH',{name:'Trial Family',manager_email:'trial@example.com',trial_date:'2026-02-30'},400);
 const issue=await a('issues','POST',{family_id:family.id,title:'Trial error',reported_on:'1990-01-01',trial_date:'1990-01-01'},201);let row=(await a('state')).issues[0];assert.equal(row.reported_on,current);assert.equal(row.trial_date,trial);assert.equal(row.days_used,5);
 await a('issues/'+issue.id,'DELETE',{revision:0,expected_created_at:row.created_at},400);await a('issues/'+issue.id,'PATCH',{status:'doing',revision:0});
 await a('families/'+family.id,'PATCH',{name:'Trial Family',manager_email:'trial@example.com',trial_date:current});assert.equal((await a('state')).issues[0].days_used,5);
 const backup=await a('backup');assert.equal(backup.version,9);for(const version of [1,2]){const old=structuredClone(backup);old.version=version;for(const r of old.tables.families)delete r.trial_date;for(const r of old.tables.issues){delete r.trial_date;delete r.reported_on;r.created_at='2026-08-14T23:30:00.000Z';}if(version===1){delete old.tables.issues;delete old.tables.audit_events;}const target=await fixture();await target.login();await target.req('restore','POST',old);const state=await target.req('state');assert.equal(state.members[0].contact,'Original Zalo');assert.equal(state.families[0].trial_date,'');if(version===2){assert.equal(state.issues[0].reported_on,'2026-08-15');assert.equal(state.issues[0].days_used,null);}}
 await f.restart();assert.equal((await a('state')).issues[0].days_used,5);
 await a('issues/'+issue.id,'PATCH',{status:'done',revision:1,resolution:'keep'});await a('issues/'+issue.id,'DELETE',{revision:1,expected_created_at:row.created_at},409);await a('issues/'+issue.id,'DELETE',{revision:2,expected_created_at:row.created_at});const state=await a('state');assert.equal(state.issues.length,0);assert.equal(state.families[0].manager_email,'trial@example.com');assert.equal(state.members[0].contact,'Original Zalo');
 const deletion=(await a('journal?search=trial@example.com')).entries.find(e=>e.action==='Xóa lỗi'),detail=await a('journal/audit/'+deletion.id),change=detail.changes.find(c=>c.table==='issues');assert.equal(change.before.trial_date,trial);assert.equal(change.before.reported_on,current);assert.equal(change.after,null);
 const oldIssue=await a('issues','POST',{family_id:family.id,title:'Existing v2 case'},201);sql(`ALTER TABLE ${f.db}.families DROP COLUMN trial_date;ALTER TABLE ${f.db}.issues DROP COLUMN trial_date;ALTER TABLE ${f.db}.issues DROP COLUMN reported_on;UPDATE ${f.db}.issues SET created_at='2026-08-14T23:30:00.000Z';UPDATE ${f.db}.app_meta SET value='2' WHERE name='schema_version'`);
 const migrated=await a('state');assert.equal(sql(`SELECT value FROM ${f.db}.app_meta WHERE name='schema_version'`),'8');assert.equal(migrated.members[0].contact,'Original Zalo');assert.equal(migrated.issues[0].id,oldIssue.id);assert.equal(migrated.issues[0].reported_on,'2026-08-15');assert.equal(migrated.issues[0].days_used,null);
});

test('PHP customer queue sorts deadlines and combines overdue/confirmed/partial without including paid renewals',async()=>{
 const f=await fixture();await f.login();const a=f.req,current=(await a('state')).today,date=n=>new Date(Date.parse(current)+n*86400000).toISOString().slice(0,10),family=await a('families','POST',{name:'Queue',manager_email:'queue@example.com'},201),second=await a('families','POST',{name:'Queue2',manager_email:'queue2@example.com'},201);
 async function member(email,expires_at,family_id=family.id){return a('members','POST',{family_id,email,expires_at},201);}
 const unknown=await member('unknown@example.com',''),future=await member('confirmed@example.com',date(20)),due=await member('due@example.com',date(1)),overdue=await member('overdue@example.com',date(-1)),paid=await member('received@example.com',date(-2)),partial=await member('partial@example.com',date(10),second.id);
 await a('members/'+future.id+'/renewal','PATCH',{revision:0,status:'awaiting_payment'});await a('members/'+paid.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:current,apply_now:false});await a('members/'+partial.id+'/renewal','PATCH',{revision:0,status:'partial',amount:10000,paid_at:current});
 const state=await a('state');assert.deepEqual(state.members.map(m=>m.id),[paid.id,overdue.id,due.id,partial.id,future.id,unknown.id]);assert.equal(state.reminders.confirmed_pending,3);assert.equal(state.reminders.due_soon,1);assert.equal(state.reminders.renewal_paid_pending,1);
});

test('PHP auto purchase expiry and Family/customer archival preserve payment, cases, six guests and backup restore',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Family 48',manager_email:'archive@example.com',trial_date:'2026-10-02',note:'Keep Family note'},201);
 const member=await a('members','POST',{family_id:family.id,email:'buyer@example.com',contact:'https://zalo.me/123',joined_at:'2024-01-31',plan_months:1,note:'Customer note'},201);assert.equal((await a('state')).members[0].expires_at,'2024-02-29');
 await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2024-03-10',plan_months:3,apply_now:true});await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'awaiting_payment',note:'Confirmed'});
 await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'Keep target'},201);
 const archived=await a('members/'+member.id,'DELETE');assert.equal((await a('archives/'+archived.archive_id+'/history')).history.length,1);await a('archives/'+archived.archive_id+'/restore','POST',{family_id:family.id});let state=await a('state');assert.equal(state.members[0].renewal_status,'awaiting_payment');assert.equal(state.issues[0].target_available,true);
 for(let i=0;i<5;i++)await a('members','POST',{family_id:family.id,email:`invite${i}@example.com`,membership_status:'invited'},201);
 const empty=await a('families','POST',{name:'Empty',manager_email:'empty@example.com'},201);await a('families/'+empty.id,'DELETE');await a('families/'+family.id,'DELETE');state=await a('state');assert.equal(state.families.length,0);assert.equal(state.archives.length,6);assert.equal(state.archived_families.length,2);assert.equal(state.issues[0].target_available,false);assert.equal(state.issues[0].family_id,family.id);
 await a('members','POST',{family_id:family.id,email:'inactive@example.com'},400);await a('families/'+family.id,'PATCH',{name:'Inactive',manager_email:'archive@example.com'},404);await a('issues','POST',{family_id:family.id,title:'Inactive'},400);
 const p=await a('other-products','POST',{product:'Netflix',customer_name:'Buyer',contact:'https://facebook.com/example',joined_at:'2026-10-13',plan_months:3},201);assert.equal((await a('state')).other_products[0].expires_at,'2027-01-13');
 const target=await fixture();await target.login();await target.req('restore','POST',await a('backup'));await target.req('archived-families/'+family.id+'/restore','POST',{});state=await target.req('state');assert.equal(state.members.length,6);assert.equal(state.archives.length,0);assert.equal(state.archived_families.length,1);assert.equal(state.families[0].trial_date,'2026-10-02');assert.equal(state.families[0].note,'Keep Family note');assert.equal(state.members.find(m=>m.email==='buyer@example.com').renewal_status,'awaiting_payment');assert.equal(state.issues[0].target_available,true);assert.equal((await target.req('members/'+state.issues[0].target_id+'/renewal-history')).history.length,1);assert.equal(state.other_products[0].plan_months,3);
 await target.restart();assert.equal((await target.req('state')).members.length,6);
 await a('other-products/'+p.id,'PATCH',{product:'Netflix',customer_name:'Buyer',joined_at:'2026-10-13',plan_months:12,expires_at:'2028-01-01'});assert.equal((await a('state')).other_products[0].expires_at,'2028-01-01');
});

test('PHP v3 backup and schema upgrades preserve dates; Family archival failure rolls back all customers and journal',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Safe',manager_email:'safe@example.com'},201);await a('members','POST',{family_id:family.id,email:'one@example.com',joined_at:'2026-10-13',expires_at:'2027-02-01',plan_months:3},201);await a('members','POST',{family_id:family.id,email:'two@example.com'},201);
 const count=(await a('journal')).total;sql(`DELIMITER $$\nCREATE TRIGGER ${f.db}.reject_second BEFORE INSERT ON ${f.db}.archived_customers FOR EACH ROW BEGIN IF NEW.email='two@example.com' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected failure'; END IF; END$$\nDELIMITER ;`);await a('families/'+family.id,'DELETE',undefined,500);let state=await a('state');assert.equal(state.members.length,2);assert.equal(state.archives.length,0);assert.equal(state.families[0].archived_at,'');assert.equal((await a('journal')).total,count);sql(`DROP TRIGGER ${f.db}.reject_second`);
 const legacy=await a('backup');legacy.version=3;for(const r of legacy.tables.families)delete r.archived_at;for(const r of legacy.tables.archived_customers)delete r.family_archive_id;for(const r of legacy.tables.other_purchases)delete r.plan_months;const target=await fixture();await target.login();await target.req('restore','POST',legacy);assert.equal((await target.req('state')).members.find(m=>m.email==='one@example.com').expires_at,'2027-02-01');
 sql(`ALTER TABLE ${f.db}.families DROP COLUMN archived_at;ALTER TABLE ${f.db}.archived_customers DROP COLUMN family_archive_id;ALTER TABLE ${f.db}.other_purchases DROP COLUMN plan_months;UPDATE ${f.db}.app_meta SET value='3' WHERE name='schema_version'`);state=await a('state');assert.equal(state.members.length,2);assert.equal(state.members.find(m=>m.email==='one@example.com').expires_at,'2027-02-01');assert.equal(sql(`SELECT value FROM ${f.db}.app_meta WHERE name='schema_version'`),'8');
});

test('PHP monthly statistics assign a late completed renewal to its old expiry month and preserve it across restart',async()=>{
 const f=await fixture();await f.req('statistics','GET',undefined,401);await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Renewal review',manager_email:'recent@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'late@example.com',contact:'Zalo recent',joined_at:'2026-08-10',expires_at:'2026-09-10',plan_months:1},201);
 await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'awaiting_payment',amount:0});assert.equal((await a('statistics?month=2026-09')).selected.renewals,0);
 await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'paid',amount:150000,paid_at:'2026-10-21',plan_months:3,apply_now:true});
 let stats=await a('statistics?month=2026-09');assert.equal(stats.selected.renewals,1);assert.equal(stats.selected.customers,1);assert.equal(stats.selected.amount,150000);const entry=stats.rows[0];assert.equal(entry.new_purchase_at,'2026-09-10');assert.equal(entry.new_expires_at,'2026-12-10');assert.equal(entry.paid_at,'2026-10-21');assert.equal((await a('statistics?month=2026-10')).selected.renewals,0);
 await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'paid',amount:150000,paid_at:'2026-10-21',plan_months:3,apply_now:true},409);
 const count=(await a('journal')).total;await f.restart();assert.equal((await a('statistics?month=2026-09')).selected.amount,150000);
 sql(`UPDATE ${f.db}.renewal_history SET created_at='2026-10-20T00:00:00Z'`);stats=await a('statistics?month=2026-09');assert.equal(stats.selected.renewals,1);assert.equal((await a('statistics?month=2026-10')).selected.renewals,0);assert.equal((await a('statistics?month=all')).rows.length,1);assert.equal((await a('state')).members[0].expires_at,'2026-12-10');assert.equal((await a('journal')).total,count);await a('statistics?month=2026-13','GET',undefined,400);
});

test('PHP archive deletion keeps complete audit/history, rejects stale/restored profiles and rolls back a failed delete',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const family=await a('families','POST',{name:'Archive delete',manager_email:'manager@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'gone@example.com',contact:'Original contact',expires_at:'2026-01-05'},201);await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2026-01-15',plan_months:3,apply_now:true});await a('members/'+member.id,'DELETE');const row=(await a('state')).archives[0],guard={expected_archived_at:row.archived_at,expected_email:row.email};
 const live=await a('members','POST',{family_id:family.id,email:'live@example.com',contact:'Active contact'},201),count=(await a('journal')).total;await a('archives/'+row.id,'DELETE',{},400);await a('archives/'+row.id,'DELETE',{...guard,expected_archived_at:'wrong'},409);assert.equal((await a('journal')).total,count);
 sql(`CREATE TRIGGER ${f.db}.reject_archive_delete BEFORE DELETE ON ${f.db}.archived_customers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected failure'`);await a('archives/'+row.id,'DELETE',guard,500);assert.equal((await a('state')).archives.length,1);assert.equal((await a('backup')).tables.renewal_history[0].archive_id,row.id);assert.equal((await a('journal')).total,count);sql(`DROP TRIGGER ${f.db}.reject_archive_delete`);
 await a('archives/'+row.id,'DELETE',guard);let state=await a('state');assert.equal(state.archives.length,0);assert.equal(state.members[0].id,live.id);assert.equal(state.members[0].contact,'Active contact');assert.equal((await a('statistics?month=all')).rows[0].archive_id,null);const history=(await a('backup')).tables.renewal_history;assert.equal(history.length,1);assert.equal(history[0].archive_id,null);assert.equal(history[0].paid_at,'2026-01-15');
 const event=(await a('journal?search=gone@example.com')).entries.find(e=>e.action==='Xóa hồ sơ lưu trữ'),detail=await a('journal/audit/'+event.id),change=detail.changes.find(c=>c.table==='archived_customers');assert.equal(JSON.parse(change.before.snapshot).contact,'Original contact');assert.equal(change.after,null);await a('archives/'+row.id+'/restore','POST',{family_id:family.id},404);await a('archives/'+row.id,'DELETE',guard,404);
 await a('members/'+live.id,'DELETE');state=await a('state');const restored=state.archives[0];await a('archives/'+restored.id+'/restore','POST',{family_id:family.id});await a('archives/'+restored.id,'DELETE',{expected_archived_at:restored.archived_at,expected_email:restored.email},409);assert.equal((await a('state')).members[0].email,'live@example.com');
});

test('PHP product deletion archives/restores complete standalone sales, preserves same-ID Family history and survives backup roundtrip',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const p=await a('other-products','POST',{product:'Netflix',customer_name:'Standalone',email:'',contact:'https://zalo.me/example\nContact note',joined_at:'2026-10-13',expires_at:'2027-11-13',plan_months:13,payment_status:'partial',amount:50000,note:'Purchase note'},201);let row=(await a('state')).other_products[0];await a('other-products/'+p.id,'PATCH',{...row,expires_at:''});row=(await a('state')).other_products[0];const {expiry_status,days_left,...saved}=row;
 const count=(await a('journal')).total;sql(`CREATE TRIGGER ${f.db}.reject_product_archive BEFORE INSERT ON ${f.db}.archived_customers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected failure'`);await a('other-products/'+p.id,'DELETE',undefined,500);assert.equal((await a('state')).other_products.length,1);assert.equal((await a('journal')).total,count);sql(`DROP TRIGGER ${f.db}.reject_product_archive`);
 await a('other-products/'+p.id,'DELETE');let state=await a('state');assert.equal(state.families.length,0);assert.equal(state.other_products.length,0);const archive=state.archives[0];assert.equal(archive.record_type,'other_product');assert.deepEqual(archive.member,{...saved,record_type:'other_product'});
 const backup=await a('backup');assert.equal(backup.version,9);const target=await fixture();await target.login();await target.req('restore','POST',backup);const restored=await target.req('archives/'+archive.id+'/restore','POST',{});state=await target.req('state');assert.equal(state.families.length,0);const product=state.other_products[0];assert.deepEqual(Object.fromEntries(Object.keys(saved).map(k=>[k,product[k]])),{...saved,id:restored.product_id});assert.equal(state.archives.length,0);await target.req('archives/'+archive.id+'/restore','POST',{},409);
 const family=await a('families','POST',{name:'Family',manager_email:'family@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'member@example.com',expires_at:'2026-01-05'},201);await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2026-01-15',plan_months:3,apply_now:true});const collision=await a('other-products','POST',{product:'Spotify',customer_name:'Separate purchase'},201);sql(`UPDATE ${f.db}.other_purchases SET id=${member.id} WHERE id=${collision.id}`);await a('other-products/'+member.id,'DELETE');const latest=(await a('state')).archives.find(r=>r.member.product==='Spotify');const history=(await a('backup')).tables.renewal_history[0];assert.equal(history.member_id,member.id);assert.equal(history.archive_id,null);await a('archives/'+latest.id+'/restore','POST',{});assert.equal((await a('members/'+member.id+'/renewal-history')).history.length,1);
 await a('archives/'+archive.id,'DELETE',{expected_archived_at:archive.archived_at,expected_email:archive.email});assert.equal((await a('state')).archives.length,0);
});

test('PHP permits one open Family incident under concurrent requests and blocks conflicting Done reopening',async()=>{
 const f=await fixture();await f.login();const a=f.req;const loginResponse=await fetch(f.base+'/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:JSON.stringify({password})});assert.equal(loginResponse.status,200);const raceCookie=loginResponse.headers.get('set-cookie').split(';')[0];

  const family=await a('families','POST',{name:'One case Family',manager_email:'once@example.com'},201);
  const member=await a('members','POST',{family_id:family.id,email:'guest-once@example.com'},201);
  const other=await a('families','POST',{name:'Independent Family',manager_email:'other-once@example.com'},201);
  const journalBefore=(await a('journal')).total;
  const responses=await Promise.all(['First report','Concurrent report'].map(title=>fetch(f.base+'/api/issues',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1',Cookie:raceCookie},body:JSON.stringify({family_id:family.id,title})})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  const conflict=await responses.find(r=>r.status===409).json();assert.match(conflict.error,/once@example.com.*chờ fix/);
  let state=await a('state'),open=state.issues.find(i=>i.family_id===family.id);assert.equal(state.issues.length,1);assert.equal((await a('journal')).total,journalBefore+1);
  const blocked=await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'Different mail, same Family'},409);assert.match(blocked.error,/chờ fix/);
  await a('issues/'+open.id,'PATCH',{status:'doing',revision:0});
  assert.match((await a('issues','POST',{family_id:family.id,title:'While doing'},409)).error,/đang fix/);
  await a('issues','POST',{family_id:other.id,title:'Different Family allowed'},201);
  await a('issues/'+open.id,'PATCH',{status:'done',revision:1,resolution:'keep'});
  const next=await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'New incident after Done'},201);
  const beforeReopen=(await a('journal')).total;
  await a('issues/'+open.id,'PATCH',{status:'todo',revision:2},409);
  state=await a('state');assert.equal(state.issues.find(i=>i.id===open.id).status,'done');assert.equal((await a('journal')).total,beforeReopen);
  await a('issues/'+next.id,'PATCH',{status:'done',revision:0,resolution:'keep'});
  await a('issues/'+open.id,'PATCH',{status:'todo',revision:2});
  await f.restart();
  state=await a('state');assert.equal(state.issues.filter(i=>i.family_id===family.id&&i.status!=='done').length,1);assert.equal(state.families.find(i=>i.id===family.id).manager_email,'once@example.com');assert.equal(state.members.find(i=>i.id===member.id).email,'guest-once@example.com');
});

test('PHP retains preexisting duplicate cases while preventing additional reports',async()=>{
 const f=await fixture();await f.login();const a=f.req;

 const family=await a('families','POST',{name:'Legacy open cases',manager_email:'legacy-once@example.com'},201);
 const original=await a('issues','POST',{family_id:family.id,title:'Original case'},201);
 sql(`INSERT INTO ${f.db}.issues(family_id,family_name,target_type,target_id,subject_email,original_email,title,note,created_at,updated_at,trial_date,reported_on) SELECT family_id,family_name,target_type,target_id,subject_email,original_email,'Legacy duplicate',note,created_at,updated_at,trial_date,reported_on FROM ${f.db}.issues WHERE id=${original.id}`);
 let state=await a('state');assert.equal(state.issues.length,2);assert.equal(state.issues.filter(i=>i.status==='todo').length,2);
 await a('issues','POST',{family_id:family.id,title:'No third duplicate'},409);
 const legacy=state.issues.find(i=>i.id!==original.id);
 await a('issues/'+legacy.id,'PATCH',{status:'doing',revision:0,title:'Legacy case still editable'});
 await a('issues/'+original.id,'PATCH',{status:'done',revision:0,resolution:'keep'});
 await a('issues','POST',{family_id:family.id,title:'Still occupied'},409);
 await a('issues/'+legacy.id,'PATCH',{status:'done',revision:1,resolution:'keep'});
 state=await a('state');assert.equal(state.issues.length,2);assert.ok(state.issues.every(i=>i.status==='done'));
 await a('issues','POST',{family_id:family.id,title:'New problem'},201);assert.equal((await a('state')).issues.length,3);
});

const transferFamily=async(a,data)=>{const created=await a('families','POST',data,201);return (await a('state')).families.find(f=>f.id===created.id);};
const transferPayload=(m,f)=>({family_id:f.id,expected_manager_email:f.manager_email,expected_family_id:m.family_id,expected_email:m.email,revision:m.renewal_revision});

test('PHP transfers preserve the full member, historical periods and audit while deleting the customer cases with full audit',async()=>{
 const f=await fixture();await f.login();const a=f.req;

 const source=await transferFamily(a,{name:'Family A',manager_email:'owner-a@example.com',trial_date:'2026-10-08'}),target=await transferFamily(a,{name:'Family B',manager_email:'owner-b@example.com',trial_date:'2026-09-01'});
 const member=await a('members','POST',{family_id:source.id,email:'moving@example.com',customer_name:'Khách chuyển',contact:'https://www.facebook.com/example\nZalo preserved',joined_at:'2026-01-05',expires_at:'2026-04-05',plan_months:3,payment_status:'paid',amount:150000,note:'Keep original note',membership_status:'active'},201);
 await a('members','POST',{family_id:source.id,email:'stays@example.com'},201);const today=(await a('state')).today;
 await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:200000,paid_at:today,plan_months:3,apply_now:true});
 await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'partial',amount:50000,paid_at:today,note:'Pending next cycle'});
 const managerCase=await a('issues','POST',{family_id:source.id,title:'Manager past incident'},201);await a('issues/'+managerCase.id,'PATCH',{status:'done',revision:0,resolution:'keep'});
 const done=await a('issues','POST',{family_id:source.id,target_type:'member',target_id:member.id,title:'Previous member incident'},201);await a('issues/'+done.id,'PATCH',{status:'done',revision:0,resolution:'keep'});
 const open=await a('issues','POST',{family_id:source.id,target_type:'member',target_id:member.id,title:'Current member incident'},201);
 const before=await a('backup'),history=await a('members/'+member.id+'/renewal-history'),profile=before.tables.members.find(m=>m.id===member.id),guard=transferPayload(profile,target),count=(await a('journal')).total;
 const result=await a('members/'+member.id+'/transfer','POST',guard);assert.equal(result.family_id,target.id);
 const after=await a('backup'),moved=after.tables.members.find(m=>m.id===member.id);assert.deepEqual(moved,{...profile,family_id:target.id,renewal_revision:profile.renewal_revision+1});assert.deepEqual(await a('members/'+member.id+'/renewal-history'),history);
 let state=await a('state');assert.equal(state.members.filter(m=>m.family_id===source.id).length,1);assert.equal(state.members.filter(m=>m.family_id===target.id).length,1);assert.equal(state.members.find(m=>m.id===member.id).family_name,'Family B');assert.equal((await a('statistics?month=all')).rows[0].family_name,'Family A');assert.equal(state.archives.length,0);
 assert.equal(result.removed_cases,2);for(const id of [done.id,open.id])assert.equal(state.issues.some(i=>i.id===id),false);
 assert.equal(state.issues.find(i=>i.id===managerCase.id).family_id,source.id);
 const journal=await a('journal');assert.equal(journal.total,count+1);const event=journal.entries.find(e=>e.action==='Chuyển Family');assert.ok(event);assert.match(event.message,/Family A.*owner-a@example.com.*Family B.*owner-b@example.com/);const details=await a('journal/audit/'+event.id),change=details.changes.find(c=>c.table==='members');assert.equal(change.before.family_id,source.id);assert.equal(change.after.family_id,target.id);for(const id of [done.id,open.id]){const removed=details.changes.find(c=>c.table==='issues'&&c.id===id);assert.deepEqual(removed.before,before.tables.issues.find(i=>i.id===id));assert.equal(removed.after,null);}
 await a('members/'+member.id+'/transfer','POST',guard,409);await a('members/'+member.id+'/renewal','PATCH',{revision:profile.renewal_revision,status:'paid',apply_now:true},409);await a('issues/'+open.id,'PATCH',{revision:0,status:'done',resolution:'keep'},404);assert.equal((await a('journal')).total,count+1);
 await f.restart();
 state=await a('state');assert.equal(state.members.find(m=>m.id===member.id).family_id,target.id);assert.equal(state.issues.some(i=>i.id===open.id),false);
 const copy=await fixture();await copy.login();await copy.req('restore','POST',await a('backup'));const restored=await copy.req('state');assert.equal(restored.members.find(m=>m.id===member.id).family_id,target.id);assert.equal(restored.issues.some(i=>i.id===open.id),false);assert.deepEqual(await copy.req('members/'+member.id+'/renewal-history'),history);

});

test('PHP transfers reject stale/duplicate/archived/owner destinations and accept full or oversized Families',async()=>{
 const f=await fixture();await f.login();const a=f.req;

 const source=await transferFamily(a,{name:'Source',manager_email:'source@example.com'}),target=await transferFamily(a,{name:'Destination',manager_email:'dest@example.com'}),full=await transferFamily(a,{name:'Full',manager_email:'full@example.com'}),archived=await transferFamily(a,{name:'Archived',manager_email:'archived@example.com'});await a('families/'+archived.id,'DELETE');
 const member=await a('members','POST',{family_id:source.id,email:'move@example.com'},201);let profile=(await a('state')).members.find(m=>m.id===member.id),guard=transferPayload(profile,target);
 for(const n of [1,2,3,4,5])await a('members','POST',{family_id:full.id,email:'full'+n+'@example.com',membership_status:'active'},201);
 const duplicate=await a('members','POST',{family_id:target.id,email:profile.email},201),owner=await a('members','POST',{family_id:source.id,email:'dest@example.com'},201);const count=(await a('journal')).total;
 await a('members/'+member.id+'/transfer','POST',{},400);await a('members/'+member.id+'/transfer','POST',{...guard,revision:99},409);await a('members/'+member.id+'/transfer','POST',{...guard,expected_family_id:target.id},409);await a('members/'+member.id+'/transfer','POST',{...guard,expected_email:'other@example.com'},409);await a('members/'+member.id+'/transfer','POST',{...guard,expected_manager_email:'old-dest@example.com'},409);
 await a('members/'+member.id+'/transfer','POST',transferPayload(profile,source),400);await a('members/'+member.id+'/transfer','POST',transferPayload(profile,archived),400);await a('members/'+member.id+'/transfer','POST',{...guard,family_id:999999},400);await a('members/999999/transfer','POST',guard,404);
 await a('members/'+member.id+'/transfer','POST',guard,409);await a('members/'+owner.id+'/transfer','POST',transferPayload((await a('state')).members.find(m=>m.id===owner.id),target),400);
 assert.equal((await a('journal')).total,count);assert.equal((await a('state')).members.find(m=>m.id===member.id).family_id,source.id);
 const pending=await a('members','POST',{family_id:source.id,email:'pending@example.com',membership_status:'invited'},201),pendingProfile=(await a('state')).members.find(m=>m.id===pending.id);await a('members/'+pending.id+'/transfer','POST',transferPayload(pendingProfile,full));assert.equal((await a('state')).members.filter(m=>m.family_id===full.id).length,6);
 await a('members/'+member.id,'PATCH',{email:profile.email,contact:'Edited while modal open'});await a('members/'+member.id+'/transfer','POST',guard,409);profile=(await a('state')).members.find(m=>m.id===member.id);
 await a('families/'+target.id,'PATCH',{name:'Destination',manager_email:'dest-new@example.com'});await a('members/'+member.id+'/transfer','POST',transferPayload(profile,target),409);
 await a('members/'+member.id+'/transfer','POST',transferPayload(profile,full));let moved=(await a('state')).members.find(m=>m.id===member.id);assert.equal(moved.family_id,full.id);
 assert.equal((await a('state')).members.filter(m=>m.family_id===full.id&&m.membership_status!=='invited').length,6);
 await a('members/'+member.id,'PATCH',{...moved,note:'Editable above five'});assert.equal((await a('state')).members.find(m=>m.id===member.id).note,'Editable above five');
 const imported=await a('import/preview','POST',{csv:'Email,Manager,Note\n'+moved.email+',full@example.com,Import edit above five',mapping:{email:0,manager_email:1,note:2},duplicates:'update',create_groups:false});assert.equal(imported.summary.errors,0);assert.equal(imported.summary.update,1);

 const ownerProfile=(await a('state')).members.find(m=>m.id===owner.id);await a('members/'+owner.id+'/transfer','POST',transferPayload(ownerProfile,full));assert.equal((await a('state')).members.filter(m=>m.family_id===full.id&&m.membership_status!=='invited').length,7);


});

test('PHP transfers roll back member/case writes and serialize competing moves while accepting concurrent arrivals above five',async()=>{
 const f=await fixture();await f.login();const a=f.req;

 const source=await transferFamily(a,{name:'From',manager_email:'from@example.com'}),target=await transferFamily(a,{name:'To',manager_email:'to@example.com'}),alternative=await transferFamily(a,{name:'Alternative',manager_email:'alt@example.com'});
 const member=await a('members','POST',{family_id:source.id,email:'case-member@example.com',contact:'Keep me'},201),incident=await a('issues','POST',{family_id:source.id,target_type:'member',target_id:member.id,title:'Must follow'},201),destinationCase=await a('issues','POST',{family_id:target.id,title:'Destination already open'},201);
 let profile=(await a('state')).members.find(m=>m.id===member.id),guard=transferPayload(profile,target),count=(await a('journal')).total;

 sql(`INSERT INTO ${f.db}.issues(family_id,family_name,target_type,target_id,subject_email,original_email,title,note,created_at,updated_at,trial_date,reported_on) SELECT family_id,family_name,target_type,target_id,subject_email,original_email,'Legacy duplicate',note,created_at,updated_at,trial_date,reported_on FROM ${f.db}.issues WHERE id=${incident.id}`);
 let state=await a('state');const duplicate=state.issues.find(i=>i.family_id===source.id&&i.id!==incident.id);assert.ok(duplicate);
 count=(await a('journal')).total;
 sql(`CREATE TRIGGER ${f.db}.reject_transfer_case BEFORE DELETE ON ${f.db}.issues FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected transfer failure'`);
 await a('members/'+member.id+'/transfer','POST',guard,500);state=await a('state');assert.equal(state.members.find(m=>m.id===member.id).family_id,source.id);assert.equal(state.issues.find(i=>i.id===incident.id).family_id,source.id);assert.equal((await a('journal')).total,count);
 sql(`DROP TRIGGER ${f.db}.reject_transfer_case`);
 const loginResponse=await fetch(f.base+'/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:JSON.stringify({password})});assert.equal(loginResponse.status,200);const raceCookie=loginResponse.headers.get('set-cookie').split(';')[0];
 const race=async(id,payload)=>fetch(f.base+'/api/members/'+id+'/transfer',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1',Cookie:raceCookie},body:JSON.stringify(payload)});
 const results=await Promise.all([race(member.id,guard),race(member.id,transferPayload(profile,alternative))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);state=await a('state');const moved=state.members.find(m=>m.id===member.id);assert.ok([target.id,alternative.id].includes(moved.family_id));assert.equal(state.issues.some(i=>i.id===incident.id||i.id===duplicate.id),false);assert.equal(state.issues.find(i=>i.id===destinationCase.id).family_id,target.id);assert.equal(state.issues.find(i=>i.id===destinationCase.id).status,'todo');assert.equal((await a('journal')).total,count+1);
 const last=await transferFamily(a,{name:'Last slot',manager_email:'last@example.com'});for(const n of [1,2,3,4])await a('members','POST',{family_id:last.id,email:'existing'+n+'@example.com'},201);
 const first=await a('members','POST',{family_id:source.id,email:'first@example.com'},201),second=await a('members','POST',{family_id:source.id,email:'second@example.com'},201);state=await a('state');const firstProfile=state.members.find(m=>m.id===first.id),secondProfile=state.members.find(m=>m.id===second.id);count=(await a('journal')).total;
 const lastResults=await Promise.all([race(first.id,transferPayload(firstProfile,last)),race(second.id,transferPayload(secondProfile,last))]);assert.deepEqual(lastResults.map(r=>r.status).sort(),[200,200]);state=await a('state');assert.equal(state.members.filter(m=>m.family_id===last.id).length,6);assert.equal(state.members.filter(m=>[first.id,second.id].includes(m.id)&&m.family_id===source.id).length,0);assert.equal((await a('journal')).total,count+2);

});

async function vaultTestClient(baseGetter,websitePassword){
 const cookies=new Map();
 const request=async(endpoint,method='GET',data,status=200,extra={})=>{
  const response=await fetch(baseGetter()+'/api/'+endpoint,{method,headers:{'Content-Type':'application/json','X-Fam-Request':'1',Cookie:[...cookies].map(([k,v])=>k+'='+v).join('; '),...extra},body:data===undefined?undefined:JSON.stringify(data)});
  for(const header of response.headers.getSetCookie()){const [pair]=header.split(';'),split=pair.indexOf('='),name=pair.slice(0,split),value=pair.slice(split+1);if(value)cookies.set(name,value);else cookies.delete(name);}
  assert.equal(response.status,status,await response.clone().text());return response.json();
 };
 if(websitePassword!==undefined)await request('access','POST',{password:websitePassword});
 return {request,cookie:()=>[...cookies].map(([k,v])=>k+'='+v).join('; ')};
}

test('PHP vault enforces separate access, encrypts credentials and backups, revokes locks/expiry and restores keys',async()=>{
 const f=await fixture();await f.login();const a=f.req;

 const client=await vaultTestClient(()=>f.base,password),v=client.request,privatePassword='Vault-test-password',seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',secretPassword=' Account-Pass ! ';
 assert.deepEqual(await v('vault/status'),{configured:false,unlocked:false,session_expires:null});await v('vault/items','GET',undefined,423);
 await v('vault/setup','POST',{password:'1234',confirm_password:'1234'},400);await v('vault/setup','POST',{password:privatePassword,confirm_password:'different'},400);
 const opened=await v('vault/setup','POST',{password:privatePassword,confirm_password:privatePassword});assert.ok(opened.session_expires>Date.now()+29*60000&&opened.session_expires<=Date.now()+30*60000);assert.equal((await v('vault/status')).session_expires,opened.session_expires);assert.equal((await v('vault/status')).unlocked,true);await v('vault/setup','POST',{password:privatePassword,confirm_password:privatePassword},409);
 const fields={email:'private-only@example.com',label:'Private family label',note:'Private note that must stay encrypted',password:secretPassword,totp:seed.toLowerCase().match(/.{1,4}/g).join(' '),recovery_email:'private-recovery@example.com'},item=await v('vault/items','POST',fields);
 const listing=await v('vault/items');assert.equal(listing.items.length,1);assert.match(listing.items[0].code,/^\d{6}$/);assert.ok(listing.items[0].expires_at>listing.server_time&&listing.items[0].expires_at<=listing.server_time+30000);assert.equal(listing.items[0].totp_key,seed);assert.equal('password' in listing.items[0],false);
 const details=await v('vault/items/'+item.id);assert.equal(details.password,secretPassword);assert.equal(details.totp,seed);assert.equal(details.recovery_email,fields.recovery_email);assert.equal(details.note,fields.note);assert.equal(listing.items[0].note,fields.note);
 const backup=await a('backup');assert.equal(backup.version,9);assert.equal(backup.tables.vault_items.length,1);assert.equal('vault_sessions' in backup.tables,false);const strings=[secretPassword,seed,privatePassword,fields.email,fields.recovery_email,fields.label,fields.note];
 for(const endpoint of ['state','journal']){const publicData=JSON.stringify(await a(endpoint));for(const value of strings)assert.equal(publicData.includes(value),false,endpoint+' leaked a private field');}for(const value of strings)assert.equal(JSON.stringify(backup).includes(value),false,'Backup leaked a private field');
 const oldCookie=client.cookie();await v('vault/lock','POST',{});await v('vault/items','GET',undefined,423);await v('vault/items/'+item.id,'GET',undefined,423,{Cookie:oldCookie});
 await v('vault/unlock','POST',{password:'wrong'},403);await v('vault/unlock','POST',{password:privatePassword});assert.equal((await v('vault/items/'+item.id)).password,secretPassword);
 sql(`UPDATE ${f.db}.vault_sessions SET expires_at=0`);
 await v('vault/items','GET',undefined,423);await v('vault/unlock','POST',{password:privatePassword});await v('vault/lock','POST',{});
 await f.restart();
 await v('vault/unlock','POST',{password:privatePassword});assert.equal((await v('vault/items/'+item.id)).password,secretPassword);
 const target=await fixture();await target.login();await target.req('restore','POST',backup);const other=await vaultTestClient(()=>target.base,password);assert.equal((await other.request('vault/status')).unlocked,false);await other.request('vault/unlock','POST',{password:privatePassword});assert.equal((await other.request('vault/items/'+item.id)).password,secretPassword);assert.equal((await other.request('vault/items')).items[0].totp_key,seed);

});

test('PHP vault updates/rekeys atomically, rejects duplicate/stale/invalid entries and keeps secrets out of journal',async()=>{
 const f=await fixture();await f.login();const a=f.req;

 const client=await vaultTestClient(()=>f.base,password),v=client.request,p1='Original-vault-password',p2='New-vault-password';await v('vault/setup','POST',{password:p1,confirm_password:p1});
 const fields={email:'first-secret@example.com',password:'Credential preserved',totp:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',recovery_email:'',label:'Private'},item=await v('vault/items','POST',fields),detail=await v('vault/items/'+item.id);let count=(await a('journal')).total;
 await v('vault/items','POST',{...fields,email:'invalid-key@example.com',totp:'JBSWY3DPEHPK3PX8'},400);await v('vault/items','POST',fields,409);await v('vault/items/'+item.id,'PATCH',{...fields,revision:99,expected_created_at:detail.created_at},409);await v('vault/items/'+item.id,'DELETE',{revision:0,expected_created_at:'wrong'},409);assert.equal((await a('journal')).total,count);
 await v('vault/items/'+item.id,'PATCH',{...fields,recovery_email:'new-recovery@example.com',revision:detail.revision,expected_created_at:detail.created_at});assert.equal((await v('vault/items/'+item.id)).recovery_email,'new-recovery@example.com');
 sql(`CREATE TRIGGER ${f.db}.reject_vault_item BEFORE UPDATE ON ${f.db}.vault_items FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected vault failure'`);
 count=(await a('journal')).total;await v('vault/items','POST',{...fields,email:'failed-write@example.com'},500);assert.equal((await v('vault/items')).items.length,1);assert.equal((await a('journal')).total,count);
 sql(`DROP TRIGGER ${f.db}.reject_vault_item`);
 const before=await a('backup');
 sql(`CREATE TRIGGER ${f.db}.reject_vault_meta BEFORE UPDATE ON ${f.db}.vault_meta FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected rekey failure'`);
 count=(await a('journal')).total;await v('vault/password','POST',{current_password:p1,password:p2,confirm_password:p2},500);assert.equal((await a('journal')).total,count);assert.deepEqual((await a('backup')).tables.vault_meta,before.tables.vault_meta);
 sql(`DROP TRIGGER ${f.db}.reject_vault_meta`);
 const oldCookie=client.cookie();await v('vault/password','POST',{current_password:p1,password:p2,confirm_password:p2});assert.deepEqual((await a('backup')).tables.vault_items,before.tables.vault_items);assert.notDeepEqual((await a('backup')).tables.vault_meta,before.tables.vault_meta);await v('vault/items','GET',undefined,423,{Cookie:oldCookie});
 await v('vault/lock','POST',{});await v('vault/unlock','POST',{password:p1},403);await v('vault/unlock','POST',{password:p2});assert.equal((await v('vault/items/'+item.id)).password,fields.password);
 const current=await v('vault/items/'+item.id);await v('vault/items/'+item.id,'DELETE',{revision:current.revision,expected_created_at:current.created_at});assert.equal((await v('vault/items')).items.length,0);for(const secret of [p1,p2,fields.password,fields.totp,fields.email,'new-recovery@example.com'])assert.equal(JSON.stringify(await a('journal')).includes(secret),false);

});

test('PHP vault limits wrong-password guesses and rejects malformed encrypted backups without plaintext insertion',async()=>{
 const f=await fixture();await f.login();const a=f.req;

 const client=await vaultTestClient(()=>f.base,password),v=client.request,passwordForVault='Vault-throttle-test';await v('vault/setup','POST',{password:passwordForVault,confirm_password:passwordForVault});await v('vault/lock','POST',{});
 for(let i=0;i<10;i++)await v('vault/unlock','POST',{password:'incorrect-'+i},403);await v('vault/unlock','POST',{password:passwordForVault},429);assert.equal((await v('vault/status')).unlocked,false);await v('vault/items','GET',undefined,423);
 const target=await fixture();await target.login();const invalid=await a('backup');const config=JSON.parse(invalid.tables.vault_meta[0].value);config.iterations=2000000000;invalid.tables.vault_meta[0].value=JSON.stringify(config);await target.req('restore','POST',invalid,400);assert.equal((await target.req('state')).members.length,0);assert.equal((await target.req('backup')).tables.vault_meta.length,0);const lowered=await a('backup');lowered.version=5;await target.req('restore','POST',lowered,400);

});

test('PHP TOTP matches RFC6238 and encrypted vault backups/rekeys interoperate with Node without secret logs',async()=>{
 const {initDatabase}=await import('../../database.js'),{customerBackup,restoreCustomers}=await import('../../backup.js'),{normalizeTotp,wrapMaster,unwrapMaster,seal,open}=await import('../../vault-crypto.js');
 const db=initDatabase(dir+'/node-vault-source'),key=randomBytes(32),vaultPassword='Mật khẩu test 2026!',newPassword='Mật khẩu mới test 2026!',stamp=new Date().toISOString(),seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
 const item={email:'cross-vault@example.com',password:' Keep UTF8 mật khẩu ! ',label:'Kho riêng',recovery_email:'cross-recovery@example.com',totp:normalizeTotp(seed)};
 try{
  db.prepare("INSERT INTO vault_meta(name,value) VALUES('config',?)").run(JSON.stringify(wrapMaster(vaultPassword,key)));db.prepare('INSERT INTO vault_items(id,payload,revision,created_at,updated_at) VALUES(7,?,0,?,?)').run(JSON.stringify(seal(JSON.stringify(item),key,'family-vault-item-v1:7')),stamp,stamp);
  const original=customerBackup(db),f=await fixture();await f.login();await f.req('restore','POST',original);const client=await vaultTestClient(()=>f.base,password),v=client.request;await v('vault/unlock','POST',{password:vaultPassword});assert.equal((await v('vault/items/7')).password,item.password);assert.equal((await v('vault/items')).items[0].totp_key,seed);
  const times=[59,1111111109,1111111111,1234567890,2000000000,20000000000],expected={SHA1:['287082','081804','050471','005924','279037','353130'],SHA256:['119246','084774','062674','819424','698825','737706'],SHA512:['693936','091201','943326','441116','618901','863826']};
  const encode=b=>{const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,out='';for(const n of b){value=(value<<8)|n;bits+=8;while(bits>=5){bits-=5;out+=chars[(value>>bits)&31];value&=(1<<bits)-1;}}if(bits)out+=chars[(value<<(5-bits))&31];return out;},vectors=[];
  for(const algorithm of Object.keys(expected)){const n={SHA1:20,SHA256:32,SHA512:64}[algorithm],secret=encode(Buffer.from('1234567890'.repeat(7).slice(0,n)));times.forEach((t,i)=>vectors.push({input:`otpauth://totp/test?secret=${secret}&algorithm=${algorithm}&digits=6&period=30`,now:t*1000,expected:expected[algorithm][i]}));}
  writeFileSync(f.folder+'/family-private/vault-vectors.json',JSON.stringify(vectors));chmodSync(f.folder+'/family-private/vault-vectors.json',0o644);
  const output=JSON.parse(docker('exec',f.name,'php','-r',"require '/var/www/family-private/core.php';require '/var/www/family-private/vault.php';$v=json_decode(file_get_contents('/var/www/family-private/vault-vectors.json'),true);echo json_encode(array_map(fn($x)=>vaultTotp(vaultTotpConfig($x['input']),$x['now']),$v));"));for(let i=0;i<vectors.length;i++){assert.equal(output[i].code,vectors[i].expected);assert.equal(output[i].expires_at,(Math.floor(vectors[i].now/30000)+1)*30000);}
  await v('vault/password','POST',{current_password:vaultPassword,password:newPassword,confirm_password:newPassword});await v('vault/items','POST',{email:'php-created@example.com',password:' PHP password ! ',label:'Từ PHP',recovery_email:'',totp:seed.toLowerCase().match(/.{1,4}/g).join(' ')});
  const imported=await f.req('backup');assert.deepEqual(imported.tables.vault_items.find(i=>i.id===7),JSON.parse(JSON.stringify(original.tables.vault_items[0])));const dest=initDatabase(dir+'/node-vault-restored');try{restoreCustomers(dest,imported,(message,status=400)=>{throw Object.assign(Error(message),{status});});const master=unwrapMaster(newPassword,JSON.parse(dest.prepare("SELECT value FROM vault_meta WHERE name='config'").get().value));for(const row of dest.prepare('SELECT * FROM vault_items').all()){const plain=JSON.parse(open(JSON.parse(row.payload),master,'family-vault-item-v1:'+row.id));assert.equal(plain.password,row.id===7?item.password:' PHP password ! ');assert.equal(plain.totp.secret,seed);}}finally{dest.close();}
  for(const value of [vaultPassword,newPassword,seed,item.password,item.email,item.recovery_email])assert.equal(JSON.stringify(await f.req('journal')).includes(value),false);
 }finally{db.close();key.fill(0);}
});

test('PHP vault bulk preview is private/read-only and import is atomic including concurrent duplicates',async()=>{
 const f=await fixture();await f.login();const a=f.req,client=await vaultTestClient(()=>f.base,password),v=client.request;

 const privatePassword='Bulk-vault-password',seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';await v('vault/import/preview','POST',{items:[]},423);await v('vault/setup','POST',{password:privatePassword,confirm_password:privatePassword});
 const items=[{line:2,email:' BULK-FIRST@EXAMPLE.COM ',password:'  Keep spaces!  ',totp:seed.toLowerCase().match(/.{1,4}/g).join(' '),label:'Family bulk',note:'Private bulk note\nSecond line',recovery_email:'recovery-bulk@example.com'},{line:3,email:'bulk-second@example.com',password:'',totp:'',label:'',note:'',recovery_email:''}];
 let count=(await a('journal')).total;const before=await a('backup'),preview=await v('vault/import/preview','POST',{items});assert.equal(preview.count,2);assert.equal(preview.items[0].email,'bulk-first@example.com');assert.equal(preview.items[0].has_totp,true);assert.equal('password' in preview.items[0],false);assert.equal('totp' in preview.items[0],false);assert.deepEqual((await a('backup')).tables,before.tables);assert.equal((await a('journal')).total,count);
 for(const endpoint of ['vault/import/preview','vault/import']){assert.match((await v(endpoint,'POST',{items:[items[0],{...items[1],email:items[0].email}]},409)).error,/Dòng 3/);assert.match((await v(endpoint,'POST',{items:[items[0],{...items[1],totp:'JBSWY3DPEHPK3PX8'}]},400)).error,/Dòng 3/);await v(endpoint,'POST',{items:[items[0],null]},400);await v(endpoint,'POST',{items:Array(501).fill(items[0])},400);}
 assert.equal((await v('vault/items')).items.length,0);assert.equal((await a('journal')).total,count);
 const imported=await v('vault/import','POST',{items});assert.equal(imported.count,2);assert.equal(new Set(imported.ids).size,2);assert.equal((await v('vault/items/'+imported.ids[0])).password,items[0].password);assert.equal((await v('vault/items/'+imported.ids[0])).note,items[0].note);assert.equal((await v('vault/items')).items.find(i=>i.id===imported.ids[0]).totp_key,seed);assert.equal((await a('state')).families.length,0);assert.equal((await a('state')).members.length,0);assert.equal((await a('journal')).total,count+1);
 await v('vault/import','POST',{items},409);assert.equal((await v('vault/items')).items.length,2);assert.equal((await a('journal')).total,count+1);
 const raw=JSON.stringify({backup:await a('backup'),journal:await a('journal'),state:await a('state')});for(const value of [privatePassword,seed,items[0].email.trim().toLowerCase(),items[0].password,items[0].note,items[0].recovery_email])assert.equal(raw.includes(value),false);
 const more=[{...items[0],email:'bulk-third@example.com'},{...items[1],email:'bulk-fourth@example.com'}];

 sql(`CREATE TRIGGER ${f.db}.reject_second_bulk BEFORE UPDATE ON ${f.db}.vault_items FOR EACH ROW SET NEW.payload=IF(NEW.id>=4,NULL,NEW.payload)`);count=(await a('journal')).total;await v('vault/import','POST',{items:more},500);assert.equal((await v('vault/items')).items.length,2);assert.equal((await a('journal')).total,count);sql(`DROP TRIGGER ${f.db}.reject_second_bulk`);
 const race=()=>fetch(f.base+'/api/vault/import',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1',Cookie:client.cookie()},body:JSON.stringify({items:more})});const raced=await Promise.all([race(),race()]);assert.deepEqual(raced.map(r=>r.status).sort(),[200,409]);assert.equal((await v('vault/items')).items.length,4);assert.equal((await a('journal')).total,count+1);await v('vault/lock','POST',{});await v('vault/import','POST',{items:more},423);
});


test('PHP linked vault synchronizes owner mail in both directions with audit and atomic rollback',async()=>{const f=await fixture();await f.login();const a=f.req,client=await vaultTestClient(()=>f.base,password),v=client.request;

 const fa=await a('families','POST',{name:'Family 48',manager_email:'linked-a@example.com',trial_date:'2026-10-01'},201),fb=await a('families','POST',{name:'Family 47',manager_email:'linked-b@example.com',trial_date:'2026-10-02'},201);await a('members','POST',{family_id:fa.id,email:'linked-guest@example.com',contact:'Keep public contact'},201);await v('vault/setup','POST',{password:'1234',confirm_password:'1234'},400);await v('vault/setup','POST',{password:'12345',confirm_password:'12345'});
 const seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',fields={email:'linked-a@example.com',password:'Linked-private-password',totp:seed,label:'Private label',note:'Private linked Note',recovery_email:''},first=await v('vault/items','POST',{...fields,expected_family_id:fa.id,expected_manager_email:fields.email}),raw=(await a('backup')).tables.vault_items[0];assert.equal(raw.family_id,fa.id);await v('vault/lock','POST',{});await a('families/'+fa.id,'PATCH',{name:'Family renamed',manager_email:'linked-a2@example.com',trial_date:'2026-10-12'});await v('vault/unlock','POST',{password:'12345'});let detail=await v('vault/items/'+first.id);assert.equal(detail.email,'linked-a@example.com');assert.equal(detail.family_id,null);assert.equal((await a('backup')).tables.vault_items[0].payload,raw.payload);assert.equal((await v('vault/items')).items.some(item=>item.family_id===fa.id),false);await v('vault/items/'+first.id,'PATCH',{...fields,email:'linked-a2@example.com',revision:detail.revision,expected_created_at:detail.created_at,expected_family_id:fa.id,expected_manager_email:'linked-a2@example.com'});await v('vault/items');detail=await v('vault/items/'+first.id);assert.equal(detail.email,'linked-a2@example.com');assert.equal(detail.password,fields.password);assert.equal(detail.family_id,fa.id);assert.equal(detail.note,fields.note);assert.ok((await a('journal')).entries.some(e=>e.message.includes('linked-a@example.com')&&e.message.includes('linked-a2@example.com')));
 const edit={...fields,email:'linked-a3@example.com',revision:detail.revision,expected_created_at:detail.created_at,expected_family_id:fa.id,expected_manager_email:detail.email};const updated=await v('vault/items/'+first.id,'PATCH',edit);assert.equal(updated.owner_changed,true);assert.equal((await a('state')).families.find(f=>f.id===fa.id).manager_email,'linked-a3@example.com');detail=await v('vault/items/'+first.id);assert.equal(detail.email,'linked-a3@example.com');assert.equal(detail.password,fields.password);assert.equal(detail.totp,seed);assert.ok((await a('journal')).entries.some(e=>e.message.includes('linked-a2@example.com')&&e.message.includes('linked-a3@example.com')&&e.message.includes('Kho tài khoản')));
 let count=(await a('journal')).total;const stable={...edit,revision:detail.revision,expected_created_at:detail.created_at,expected_manager_email:detail.email};for(const address of ['linked-b@example.com','linked-guest@example.com'])await v('vault/items/'+first.id,'PATCH',{...stable,email:address},409);await v('vault/items/'+first.id,'PATCH',{...stable,expected_manager_email:'linked-a2@example.com'},409);assert.equal((await a('journal')).total,count);assert.equal((await v('vault/items/'+first.id)).email,'linked-a3@example.com');
 const batch={family_only:true,items:[{...fields,email:'linked-b@example.com',line:2,label:'Wrong sheet label'}]};const preview=await v('vault/import/preview','POST',batch);assert.equal(preview.items[0].trial_date,'2026-10-02');for(const endpoint of ['vault/import/preview','vault/import'])assert.match((await v(endpoint,'POST',{...batch,items:[...batch.items,{...fields,email:'unknown@example.com',line:3}]},400)).error,/Dòng 3/);assert.equal((await v('vault/items')).items.length,1);await v('vault/import','POST',batch);assert.equal((await v('vault/items')).items.length,2);
sql(`CREATE TRIGGER ${f.db}.fail_linked_vault BEFORE UPDATE ON ${f.db}.vault_items FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected write failure'`);

 const beforeFailure=await a('backup');count=(await a('journal')).total;await v('vault/items/'+first.id,'PATCH',{...stable,email:'failed-new@example.com'},500);assert.deepEqual((await a('backup')).tables,beforeFailure.tables);assert.equal((await a('journal')).total,count);
sql(`DROP TRIGGER ${f.db}.fail_linked_vault`);await v('vault/password','POST',{current_password:'12345',password:'54321',confirm_password:'54321'});await v('vault/lock','POST',{});await v('vault/unlock','POST',{password:'54321'});assert.equal((await v('vault/items')).items.length,2);assert.equal((await a('state')).members[0].contact,'Keep public contact');
});

test('PHP vault bulk update previews changes, keeps unselected/blank fields, rejects stale writes and rolls back mixed batches',async()=>{const f=await fixture();await f.login();const a=f.req,client=await vaultTestClient(()=>f.base,password),v=client.request;

 const fa=await a('families','POST',{name:'Family A',manager_email:'upsert-a@example.com'},201),fb=await a('families','POST',{name:'Family B',manager_email:'upsert-b@example.com'},201),fc=await a('families','POST',{name:'Family C',manager_email:'upsert-c@example.com'},201);await v('vault/setup','POST',{password:'12345',confirm_password:'12345'});const seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',newSeed='JBSWY3DPEHPK3PXP',first=await v('vault/items','POST',{email:'upsert-a@example.com',password:'Old private credential',totp:seed,recovery_email:'private-recovery@example.com',note:'Private Note preserved',label:'Private label'}),old=await v('vault/items/'+first.id);
 const options={family_only:true,update_existing:true,keep_empty:true,preserve_fields:['recovery_email','note','label']},rows=[{line:2,email:'upsert-a@example.com',password:'  New private credential  ',totp:newSeed,recovery_email:'',note:'',label:''},{line:3,email:'upsert-b@example.com',password:'New B private credential',totp:'',recovery_email:'',note:'',label:''}],request={...options,items:rows};
 const plan=async(payload)=>{const preview=await v('vault/import/preview','POST',payload);return {preview,commit:{...payload,items:payload.items.map((row,i)=>({...row,expected_id:preview.items[i].expected_id,expected_revision:preview.items[i].expected_revision,expected_created_at:preview.items[i].expected_created_at,expected_family_id:preview.items[i].expected_family_id}))}};};
 let before=await a('backup'),count=(await a('journal')).total,p=await plan(request);assert.equal(p.preview.updated,1);assert.equal(p.preview.created,1);assert.equal(p.preview.items[0].action,'update');assert.equal(p.preview.items[1].action,'create');assert.equal(p.preview.items[0].expected_id,first.id);assert.equal(p.preview.items[0].note,old.note);for(const value of [seed,newSeed,rows[0].password])assert.equal(JSON.stringify(p.preview).includes(value),false);assert.deepEqual((await a('backup')).tables,before.tables);assert.equal((await a('journal')).total,count);
 await v('vault/import','POST',request,409);await v('vault/import','POST',{...p.commit,items:p.commit.items.map((r,i)=>i===0?{...r,expected_revision:999}:r)},409);await v('vault/import/preview','POST',{...request,items:[rows[0],{...rows[1],email:rows[0].email}]},409);await v('vault/import/preview','POST',{...request,items:[rows[0],{...rows[1],totp:'JBSWY3DPEHPK3PX8'}]},400);assert.deepEqual((await a('backup')).tables,before.tables);
 await v('vault/items/'+first.id,'PATCH',{...old,totp:seed,note:'Concurrent private Note',revision:old.revision,expected_created_at:old.created_at});before=await a('backup');await v('vault/import','POST',p.commit,409);assert.deepEqual((await a('backup')).tables,before.tables);p=await plan(request);count=(await a('journal')).total;const committed=await v('vault/import','POST',p.commit);assert.deepEqual([committed.created,committed.updated],[1,1]);assert.equal(committed.ids[0],first.id);let current=await v('vault/items/'+first.id);assert.equal(current.password,rows[0].password);assert.equal(current.totp,newSeed);assert.equal(current.note,'Concurrent private Note');assert.equal(current.recovery_email,old.recovery_email);assert.equal(current.family_id,fa.id);assert.equal((await a('journal')).total,count+1);await v('vault/import','POST',p.commit,409);assert.equal((await a('journal')).total,count+1);
 const blanks={...options,items:[{...rows[0],password:'',totp:''}]};p=await plan(blanks);await v('vault/import','POST',p.commit);current=await v('vault/items/'+first.id);assert.equal(current.password,rows[0].password);assert.equal(current.totp,newSeed);p=await plan({...blanks,keep_empty:false});await v('vault/import','POST',p.commit);current=await v('vault/items/'+first.id);assert.equal(current.password,'');assert.equal(current.totp,'');assert.equal(current.note,'Concurrent private Note');
 const rollback={...options,items:[{...rows[0],password:'Rollback-only credential'},{...rows[1],email:'upsert-c@example.com'}]};p=await plan(rollback);before=await a('backup');
sql(`CREATE TRIGGER ${f.db}.fail_batch_insert BEFORE INSERT ON ${f.db}.vault_items FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected batch failure'`);

 await v('vault/import','POST',p.commit,500);assert.deepEqual((await a('backup')).tables,before.tables);
sql(`DROP TRIGGER ${f.db}.fail_batch_insert`);
});


test('PHP issue replacement clears only the owner vault while locked, rolls back failures and allows fresh Sheet credentials',async()=>{const f=await fixture();await f.login();const a=f.req,client=await vaultTestClient(()=>f.base,password),v=client.request;

 const fa=await a('families','POST',{name:'Reset Family',manager_email:'reset-owner@example.com',trial_date:'2026-08-10'},201),fb=await a('families','POST',{name:'Keep Family',manager_email:'keep-owner@example.com',trial_date:'2026-09-01'},201),member=await a('members','POST',{family_id:fa.id,email:'guest@example.com',contact:'Original customer contact'},201);
 await v('vault/setup','POST',{password:'12345',confirm_password:'12345'});const seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',oldFields={email:'reset-owner@example.com',password:' Old fake password ',totp:seed,recovery_email:'old-recovery@example.com',note:'Old private Note',label:'Old private label'},first=await v('vault/items','POST',oldFields),second=await v('vault/items','POST',{...oldFields,email:'keep-owner@example.com',password:'Other fake password',note:'Other private Note'}),old=await v('vault/items/'+first.id),initialRows=(await a('backup')).tables.vault_items;
 const options={family_only:true,update_existing:true,keep_empty:true,preserve_fields:['recovery_email','note','label']},sheetRow={email:'reset-owner@example.com',password:'New fake Sheet password',totp:'JBSWY3DPEHPK3PXP',recovery_email:'',note:'',label:''},preview=await v('vault/import/preview','POST',{...options,items:[sheetRow]}),proof=p=>({expected_id:p.expected_id,expected_revision:p.expected_revision,expected_created_at:p.expected_created_at,expected_family_id:p.expected_family_id});
 await v('vault/lock','POST',{});
 const keep=await a('issues','POST',{family_id:fa.id,title:'Keep original'},201);await a('issues/'+keep.id,'PATCH',{status:'done',revision:0,resolution:'keep'});assert.deepEqual((await a('backup')).tables.vault_items,initialRows);assert.equal((await a('state')).families.find(x=>x.id===fa.id).trial_date,'2026-08-10');
 await a('issues','POST',{family_id:fb.id,title:'Existing case prevents reusing this Family'},201);
 const incident=await a('issues','POST',{family_id:fa.id,title:'Replace owner and clear old secrets'},201),completion={status:'done',revision:0,resolution:'replace',replacement_email:'new-owner@example.com'},before=await a('backup');
 sql(`CREATE TRIGGER ${f.db}.reject_vault_reset BEFORE UPDATE ON ${f.db}.issues FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected completion failure'`);
 await a('issues/'+incident.id,'PATCH',completion,500);assert.deepEqual((await a('backup')).tables,before.tables);
 sql(`DROP TRIGGER ${f.db}.reject_vault_reset`);
 await a('issues/'+incident.id,'PATCH',{...completion,replacement_email:'keep-owner@example.com'},409);assert.deepEqual((await a('backup')).tables,before.tables);
 await a('issues/'+incident.id,'PATCH',completion);let state=await a('state'),remaining=(await a('backup')).tables.vault_items;assert.equal(state.families.find(x=>x.id===fa.id).manager_email,'new-owner@example.com');assert.equal(state.families.find(x=>x.id===fa.id).trial_date,state.today);assert.equal(remaining.some(r=>r.family_id===fa.id),false);assert.deepEqual(remaining,[initialRows.find(r=>r.id===second.id)]);assert.equal((await v('vault/status')).unlocked,false);assert.equal(state.members[0].contact,'Original customer contact');assert.ok(state.issues.find(i=>i.id===incident.id).resolution_note.includes('Đã để trống thông tin Kho'));
 const journal=JSON.stringify(await a('journal'));for(const value of [oldFields.password,seed,oldFields.recovery_email,oldFields.note,oldFields.label])assert.equal(journal.includes(value),false,'Journal leaked removed credential content');
 await v('vault/unlock','POST',{password:'12345'});await v('vault/items/'+first.id,'GET',undefined,404);assert.equal((await v('vault/items')).items.some(i=>i.family_id===fa.id),false);await v('vault/items/'+first.id,'PATCH',{...old,expected_family_id:fa.id,expected_manager_email:'new-owner@example.com'},404);
 await v('vault/import','POST',{...options,items:[{...sheetRow,email:'new-owner@example.com',...proof(preview.items[0])}]},409);assert.equal((await a('backup')).tables.vault_items.length,1);
 const request={...options,items:[{...sheetRow,email:'new-owner@example.com'}]},fresh=await v('vault/import/preview','POST',request);assert.equal(fresh.created,1);assert.equal(fresh.updated,0);const imported=await v('vault/import','POST',{...request,items:[{...request.items[0],...proof(fresh.items[0])}]}),detail=await v('vault/items/'+imported.ids[0]);assert.equal(detail.email,'new-owner@example.com');assert.equal(detail.password,sheetRow.password);assert.equal(detail.totp,sheetRow.totp);assert.equal(detail.recovery_email,'');assert.equal(detail.note,'');assert.equal(detail.label,'');assert.equal(detail.family_id,fa.id);
 const currentRows=(await a('backup')).tables.vault_items;await a('issues/'+incident.id,'PATCH',{status:'done',revision:1,note:'Edited completed case'});assert.deepEqual((await a('backup')).tables.vault_items,currentRows);
 const memberCase=await a('issues','POST',{family_id:fa.id,target_type:'member',target_id:member.id,title:'Member replacement'},201);await a('issues/'+memberCase.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'new-guest@example.com'});assert.deepEqual((await a('backup')).tables.vault_items,currentRows);assert.equal((await v('vault/items/'+second.id)).password,'Other fake password');

});

test('PHP permanent archived Family deletion keeps customers, vault ciphertext and renewal history for individual restore and rolls back failure',async()=>{
 const f=await fixture();await f.login();
  const a=f.req,family=await a('families','POST',{name:'Old Family',manager_email:'old@example.com',trial_date:'2026-10-01'},201),target=await a('families','POST',{name:'New Family',manager_email:'new@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'guest@example.com',contact:'Keep contact',expires_at:'2026-01-05'},201);
  await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:123000,paid_at:'2026-01-15',plan_months:3,apply_now:true});await a('issues','POST',{family_id:family.id,title:'Keep case snapshot'},201);
  await a('archived-families/'+family.id,'DELETE',{},409);await a('families/'+family.id,'DELETE');
  const archived=(await a('state')).archived_families[0],guard={expected_archived_at:archived.archived_at,expected_created_at:archived.created_at,expected_manager_email:archived.manager_email};
   sql(`INSERT INTO ${f.db}.vault_items(family_id,payload,created_at,updated_at) VALUES (${family.id},'opaque-encrypted-fixture','2026-10-01','2026-10-01')`);
   const history=(await a('backup')).tables.renewal_history,count=(await a('journal')).total;
   await a('archived-families/'+family.id,'DELETE',{},400);await a('archived-families/'+family.id,'DELETE',{...guard,expected_manager_email:'wrong@example.com'},409);
   sql(`CREATE TRIGGER ${f.db}.reject_family_delete BEFORE DELETE ON ${f.db}.families FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected failure'`);await a('archived-families/'+family.id,'DELETE',guard,500);
   assert.equal((await a('backup')).tables.archived_customers[0].family_archive_id,family.id);assert.equal((await a('backup')).tables.vault_items[0].family_id,family.id);assert.deepEqual((await a('backup')).tables.renewal_history,history);assert.equal((await a('journal')).total,count);sql(`DROP TRIGGER ${f.db}.reject_family_delete`);
   assert.equal((await a('archived-families/'+family.id,'DELETE',guard)).kept_customers,1);let state=await a('state');assert.equal(state.archived_families.length,0);assert.equal(state.archives.length,1);assert.equal(state.archives[0].member.contact,'Keep contact');assert.equal(state.issues[0].family_id,null);assert.equal((await a('backup')).tables.archived_customers[0].family_archive_id,null);assert.equal((await a('backup')).tables.vault_items[0].family_id,null);assert.equal((await a('backup')).tables.vault_items[0].payload,'opaque-encrypted-fixture');assert.deepEqual((await a('backup')).tables.renewal_history,history);
   assert.equal((await a('statistics?month=all')).selected.amount,123000);const event=(await a('journal')).entries.find(e=>e.action==='Xóa Family lưu trữ');assert.ok(event);assert.doesNotMatch(JSON.stringify(await a('journal/audit/'+event.id)),/opaque-encrypted-fixture/);
   const restored=await a('archives/'+state.archives[0].id+'/restore','POST',{family_id:target.id});assert.equal((await a('members/'+restored.member_id+'/renewal-history')).history.length,1);assert.equal((await a('state')).members[0].contact,'Keep contact');await a('archived-families/'+family.id,'DELETE',guard,404);
  const empty=await a('families','POST',{name:'Empty',manager_email:'empty@example.com'},201);await a('families/'+empty.id,'DELETE');const row=(await a('state')).archived_families[0],g={expected_archived_at:row.archived_at,expected_created_at:row.created_at,expected_manager_email:row.manager_email};await a('archived-families/'+empty.id+'/restore','POST',{});await a('archived-families/'+empty.id,'DELETE',g,409);
});


test('PHP and Node statistics agree on Vietnam month edges, leap years, pagination and literal Unicode search',async()=>{
 const f=await fixture();await f.login();await f.req('state');
 const stamps=['2026-09-30T16:59:59.999Z','2026-09-30T17:00:00.000Z','2026-10-31T16:59:59.999Z','2026-10-31T17:00:00.000Z','2024-02-29T16:59:59.999Z','2027-01-01T00:00:00.000Z','unknown'];
 // One INSERT: 65 separate docker exec calls outlast Apache's keep-alive on slow databases.
 sql(`INSERT INTO ${f.db}.renewal_history(email,customer_name,family_name,old_expires_at,new_expires_at,plan_months,amount,paid_at,note,created_at,created_by) VALUES `+Array.from({length:65},(_,i)=>`('${i<3?'same':i}@example.com','Nguyễn Ánh','Family 1','2025-01-01','2025-04-01',3,${i+1},'2025-01-05','Note %_[] literal','${stamps[i]||'2026-10-10T00:00:00.000Z'}','Fixture')`).join(','));
 const history=(await f.req('backup')).tables.renewal_history;
 for(const [options,time] of [[{month:'2026-10'},'2026-11-15T00:00:00Z'],[{month:'all',search:'%_[]',page:2},'2026-11-15T00:00:00Z'],[{month:'2024-02',search:'NGUYỄN ÁNH'},'2026-11-15T00:00:00Z'],[{month:'all',search:'absent'},'2026-11-15T00:00:00Z'],[{},'2025-12-31T17:00:00Z']]){
  const encoded=Buffer.from(JSON.stringify(options)).toString('base64'),actual=JSON.parse(docker('exec',f.name,'php','-r',`require '/var/www/family-private/core.php';require '/var/www/family-private/statistics.php';$db=db(config());echo json_encode(renewalStatistics($db,json_decode(base64_decode('${encoded}'),true),new DateTimeImmutable('${time}')));`));assert.deepEqual(actual,{...summarizeRenewals(history,options,new Date(time)),new_purchases:summarizeNewPurchases([],{...options,page:options.new_page},new Date(time))});
 }
});

test('PHP journal categories filter all existing actions and combine search/pagination without changing audit history',async()=>{
 const f=await fixture();await f.req('journal?category=delete','GET',undefined,401);await f.login();await f.req('state');const a=f.req;
 const cases=[['Xóa Family','delete'],['Xóa hồ sơ lưu trữ','delete'],['Lưu trữ sản phẩm','delete'],['Tự động lưu trữ dữ liệu','delete'],['Thêm khách','create'],['Tạo mật khẩu kho','create'],['Đổi mật khẩu kho','edit'],['Gia hạn khách','renewal'],['Chuyển Family','transfer'],['Khôi phục dữ liệu','restore'],['Nhập CSV','import'],['Nhập hàng loạt kho tài khoản','import'],['Xem trước CSV','import'],['Liên kết Kho với Family','other']];
 const values=[...cases.map(([action])=>[action,'guest@example.com · '+action]),...Array.from({length:55},(_,i)=>['Sửa khách',`guest@example.com · sửa ${i} · ghi chú nhắc Xóa Family %_`])].map(([action,message])=>`('${action}','Cá nhân','${message}','{"changes":[]}','2026-10-15T00:00:00Z')`).join(',');
 sql(`INSERT INTO ${f.db}.audit_events(action,actor,message,details,created_at) VALUES ${values};INSERT INTO ${f.db}.logs(message,created_at) VALUES ('Nhật ký cũ nhắc Xóa và Sửa khách','2025-01-01T00:00:00Z')`);
 const before=(await a('backup')).tables.audit_events;assert.equal((await a('journal')).total,70);
 for(const [action,category] of cases){const data=await a('journal?'+new URLSearchParams({category,search:action}));assert.ok(data.entries.some(e=>e.action===action&&e.category===category),action);}
 const edits=await a('journal?category=edit');assert.equal(edits.total,56);assert.equal(edits.entries.length,50);assert.ok(edits.entries.every(e=>e.category==='edit'));const second=await a('journal?category=edit&page=2');assert.equal(second.total,56);assert.equal(second.entries.length,6);assert.equal(new Set([...edits.entries,...second.entries].map(e=>e.id)).size,56);
 const deleted=await a('journal?category=delete');assert.equal(deleted.total,4);assert.ok(deleted.entries.every(e=>e.category==='delete'));assert.ok(deleted.entries.some(e=>e.action==='Xóa Family'));
 assert.equal((await a('journal?'+new URLSearchParams({category:'delete',search:'ghi chú nhắc Xóa Family'}))).total,0);assert.equal((await a('journal?'+new URLSearchParams({category:'edit',search:'%_'}))).total,55);assert.equal((await a('journal?'+new URLSearchParams({category:'other',search:'Nhật ký cũ'}))).entries[0].kind,'log');await a('journal?category=invalid','GET',undefined,400);
 // MariaDB can give native parameters a different collation than CASE/UNION
 // literals, even though every category key is ASCII. Exercise the real PDO path.
 const queries=[...['all','create','edit','delete','renewal','transfer','restore','import','other'].map(category=>({category})),{category:'edit',page:2},{category:'edit',search:'%_'},{category:'other',search:'Nhật ký cũ'},{category:'delete',search:'ghi chú nhắc Xóa Family'}],expected=[];
 for(const query of queries)expected.push(await a('journal?'+new URLSearchParams(query)));
 const encoded=Buffer.from(JSON.stringify(queries)).toString('base64'),results=JSON.parse(docker('exec',f.name,'php','-r',`require '/var/www/family-private/core.php';require '/var/www/family-private/audit.php';$db=db(config());$requests=json_decode(base64_decode('${encoded}'),true);$results=[];foreach(['utf8mb4_general_ci','utf8mb4_unicode_ci','utf8mb4_unicode_520_ci','utf8mb4_bin'] as $collation){$db->exec("SET collation_connection='$collation'");foreach($requests as $request){$_GET=$request;$results[$collation][]=journal($db);}}echo json_encode($results,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);`));
 for(const [collation,actual] of Object.entries(results))assert.deepEqual(actual,expected,collation);
 assert.deepEqual((await a('backup')).tables.audit_events,before);assert.equal((await a('backup')).tables.logs.length,1);
});

test('PHP purchase source survives edits, archives, backup restore and legacy schema upgrade',async()=>{
 const f=await fixture();await f.login();const a=f.req;
 const data={product:'Spotify',customer_name:'Khách nguồn mua',purchase_source:'Đại lý A',joined_at:'2026-10-23',expires_at:'2027-01-23',plan_months:3,amount:165000,payment_status:'paid'};
 const created=await a('other-products','POST',data,201);await a('other-products/'+created.id,'PATCH',{...data,purchase_source:'Đại lý B'});const omitted={...data};delete omitted.purchase_source;await a('other-products/'+created.id,'PATCH',omitted);assert.equal((await a('state')).other_products[0].purchase_source,'Đại lý B');
 await a('other-products/'+created.id,'DELETE');const archived=(await a('state')).archives[0];assert.equal(archived.member.purchase_source,'Đại lý B');const backup=await a('backup');assert.equal(backup.version,9);
 const target=await fixture();await target.login();await target.req('restore','POST',backup);await target.req('archives/'+archived.id+'/restore','POST',{});assert.equal((await target.req('state')).other_products[0].purchase_source,'Đại lý B');
 const legacy=await a('backup');legacy.version=8;for(const row of legacy.tables.other_purchases)delete row.purchase_source;for(const row of legacy.tables.archived_customers){const saved=JSON.parse(row.snapshot);delete saved.purchase_source;row.snapshot=JSON.stringify(saved);}const oldTarget=await fixture();await oldTarget.login();await oldTarget.req('restore','POST',legacy);assert.equal((await oldTarget.req('state')).archives[0].member.purchase_source,'');
 sql(`ALTER TABLE ${target.db}.other_purchases DROP COLUMN purchase_source;UPDATE ${target.db}.app_meta SET value='7' WHERE name='schema_version'`);const upgraded=await target.req('state');assert.equal(upgraded.other_products[0].purchase_source,'');assert.equal(upgraded.other_products[0].product,'Spotify');assert.equal(sql(`SELECT value FROM ${target.db}.app_meta WHERE name='schema_version'`),'8');
});

test('PHP Family email edits detach old credentials, keep unchanged emails and roll back failures',async()=>{
 const f=await fixture();await f.login();writeFileSync(f.folder+'/family-private/family-email-edit.php',readFileSync(root+'/test/family-email-edit.php'));chmodSync(f.folder+'/family-private/family-email-edit.php',0o644);assert.match(docker('exec',f.name,'php','/var/www/family-private/family-email-edit.php'),/Family email edit checks passed/);
});

test('PHP prepared replacement keeps encrypted credentials and customers atomically',async()=>{
 const f=await fixture();await f.login();writeFileSync(f.folder+'/family-private/issues-prepared.php',readFileSync(root+'/test/issues-prepared.php'));chmodSync(f.folder+'/family-private/issues-prepared.php',0o644);assert.match(docker('exec',f.name,'php','/var/www/family-private/issues-prepared.php'),/Prepared owner checks passed/);
});

test('PHP issue ordering persists priorities and rejects stale or invalid column snapshots',async()=>{
 const f=await fixture();await f.login();writeFileSync(f.folder+'/family-private/issues-order.php',readFileSync(root+'/test/issues-order.php'));chmodSync(f.folder+'/family-private/issues-order.php',0o644);
 const result=docker('exec',f.name,'php','/var/www/family-private/issues-order.php');assert.match(result,/Issue ordering checks passed/);
 const rows=(await f.req('state')).issues.filter(i=>i.status==='todo');
 if(rows.length){const payload={status:'todo',expected:rows.map(({id,created_at,revision})=>({id,created_at,revision})),order_token:rows[0].order_token,order:rows.map(i=>i.id).reverse()};await f.req('issues/order','POST',payload);assert.deepEqual((await f.req('state')).issues.filter(i=>i.status==='todo').map(i=>i.id),payload.order);await f.req('issues/order','POST',payload,409);}
});

test('PHP Sheet health and history record confirmed directions, conflicts and safe failures',async()=>{
 const f=await fixture();await f.req('sheets/history','GET',undefined,401);await f.login();writeFileSync(f.folder+'/family-private/sheets-history.php',readFileSync(root+'/test/sheets-history.php'));chmodSync(f.folder+'/family-private/sheets-history.php',0o644);
 const result=docker('exec',f.name,'php','/var/www/family-private/sheets-history.php');assert.match(result,/Sheet health\/history checks passed/);
 const health=await f.req('sheets/status'),history=await f.req('sheets/history?page=1');assert.equal(health.history_available,true);assert.ok(Array.isArray(history.entries));assert.ok(history.entries.length<=20);assert.equal(typeof history.total,'number');
});

test('PHP product Sheet import previews, validates and atomically deduplicates new products',async()=>{
 const f=await fixture();await f.login();writeFileSync(f.folder+'/family-private/products-import.php',readFileSync(root+'/test/products-import.php'));chmodSync(f.folder+'/family-private/products-import.php',0o644);
 const result=docker('exec',f.name,'php','/var/www/family-private/products-import.php');assert.match(result,/Product Sheet import checks passed/);
 const payload={items:[{line:2,product:'Spotify',customer_name:'Khách API',email:'api-import@example.com',plan_months:'3 tháng',joined_at:'23/10/2026',amount:'165.000 đ',payment_status:'Đã thanh toán'}]};
 const preview=await f.req('other-products/import/preview','POST',payload);assert.equal(preview.valid,true);assert.equal(preview.added,1);assert.equal(preview.rows[0].expires_at,'2027-01-23');await f.req('other-products/import/confirm','POST',{...payload,preview_token:preview.preview_token});const retry=await f.req('other-products/import/confirm','POST',{...payload,preview_token:preview.preview_token});assert.equal(retry.added,0);assert.equal(retry.skipped,1);
});

test('PHP Sheet errors distinguish token rejection from script failures without leaking response contents',()=>{
 const result=docker('run','--rm','-v',root+':/source:ro','family-php-test:8.3','php','/source/test/sheets-errors.php');
 assert.match(result,/29 checks passed/);
 assert.match(result,/Local Sheet error diagnostics: 9 checks passed/);
});

test('PHP Sheet sync validates/authenticates endpoints and merges real MySQL/vault data with conflicts, retries and encryption',async()=>{
 const f=await fixture();await f.req('sheets/status','GET',undefined,401);await f.login();assert.equal((await f.req('sheets/status')).configured,false);
 await f.req('sheets/config','POST',{url:'http://127.0.0.1/secret',token:'x'.repeat(64)},400);
 await f.req('vault/sheets-sync','POST',{},423);
 writeFileSync(f.folder+'/family-private/sheets-fixture.php',readFileSync(root+'/test/sheets-fixture.php'));chmodSync(f.folder+'/family-private/sheets-fixture.php',0o644);
 const result=docker('exec',f.name,'php','/var/www/family-private/sheets-fixture.php');assert.match(result,/integration checks passed/);
 const status=await f.req('sheets/status');assert.equal(status.configured,true);assert.ok(status.last_core);assert.ok(status.last_vault);assert.equal('token' in status,false);assert.equal(status.script_url,'https://script.google.com/macros/s/newest/exec');assert.equal(status.customer_layout,'grouped');assert.equal(status.script_version,'family-groups-ddmmyyyy-v2');
 await f.req('sheets/config','DELETE');assert.equal((await f.req('sheets/status')).configured,false);
});

test('PHP Sheet reconnects after MySQL idle/disconnect during Google I/O, retains current data and bounds retries',async()=>{
 const f=await fixture();await f.login();writeFileSync(f.folder+'/family-private/sheets-reconnect.php',readFileSync(root+'/test/sheets-reconnect.php'));chmodSync(f.folder+'/family-private/sheets-reconnect.php',0o644);
 const result=docker('exec',f.name,'php','/var/www/family-private/sheets-reconnect.php');assert.match(result,/Sheet reconnection checks passed/);
 assert.equal((await f.req('state')).members.length,1);
});

test('PHP new-purchase snapshots survive status changes, renewals, archive restore/deletion and backup roundtrip',async()=>{
 const f=await fixture();await f.login();const a=f.req,family=await a('families','POST',{name:'New customers',manager_email:'new-owner@example.com'},201);
  await a('members','POST',{family_id:family.id,email:'missing-date@example.com',membership_status:'new'},400);
  const created=await a('members','POST',{family_id:family.id,email:'new@example.com',customer_name:'Khách mua mới',contact:'Zalo',joined_at:'2026-08-10',expires_at:'2026-09-10',plan_months:1,payment_status:'paid',amount:100000,membership_status:'new'},201);
  let stats=await a('statistics?month=2026-08');assert.equal(stats.new_purchases.selected.customers,1);assert.equal(stats.new_purchases.selected.purchases,1);assert.equal(stats.new_purchases.selected.amount,100000);assert.equal(stats.selected.renewals,0);
  let m=(await a('state')).members.find(m=>m.id===created.id);await a('members/'+m.id,'PATCH',{...m,membership_status:'active'});
  m=(await a('state')).members.find(m=>m.id===created.id);await a('members/'+m.id+'/renewal','PATCH',{revision:m.renewal_revision,status:'paid',amount:150000,paid_at:'2026-10-21',plan_months:3,apply_now:true});
  assert.equal((await a('statistics?month=2026-09')).selected.amount,150000);stats=await a('statistics?month=2026-08');assert.equal(stats.new_purchases.selected.amount,100000);assert.equal(stats.new_purchases.rows[0].joined_at,'2026-08-10');assert.equal(stats.new_purchases.rows[0].expires_at,'2026-09-10');
  m=(await a('state')).members.find(m=>m.id===created.id);await a('members/'+m.id,'PATCH',{...m,membership_status:'new'});assert.equal((await a('statistics?month=all')).new_purchases.selected.purchases,1);
  let archived=await a('members/'+m.id,'DELETE');const restored=await a('archives/'+archived.archive_id+'/restore','POST',{family_id:family.id});m=(await a('state')).members.find(m=>m.id===restored.member_id);await a('members/'+m.id,'PATCH',{...m,membership_status:'new'});assert.equal((await a('statistics?month=all')).new_purchases.selected.purchases,1);
  archived=await a('members/'+m.id,'DELETE');const archive=(await a('state')).archives.find(r=>r.id===archived.archive_id);await a('archives/'+archive.id,'DELETE',{expected_archived_at:archive.archived_at,expected_email:archive.email});
  stats=await a('statistics?month=2026-08');assert.equal(stats.new_purchases.selected.purchases,1);const snapshot=(await a('backup')).tables.new_purchase_history[0];assert.equal(snapshot.member_id,null);assert.equal(snapshot.archive_id,null);assert.equal(snapshot.amount,100000);
 const backup=await a('backup'),target=await fixture();await target.login();await target.req('restore','POST',backup);assert.deepEqual((await target.req('statistics?month=2026-08')).new_purchases,stats.new_purchases);
});

test('PHP failed purchase snapshot rolls back the customer and audit together',async()=>{
 const f=await fixture();await f.login();const a=f.req,family=await a('families','POST',{name:'Rollback',manager_email:'rollback-owner@example.com'},201),before=(await a('journal')).total;
 sql(`CREATE TRIGGER ${f.db}.reject_new_purchase BEFORE INSERT ON ${f.db}.new_purchase_history FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Injected snapshot failure'`);
 await a('members','POST',{family_id:family.id,email:'reject@example.com',joined_at:'2026-10-01',membership_status:'new'},500);assert.equal((await a('state')).members.length,0);assert.equal((await a('statistics?month=all')).new_purchases.total,0);assert.equal((await a('journal')).total,before);
});


test('PHP updater authenticates its stable endpoint and does not expose the health probe or backups',async()=>{
 const f=await fixture(undefined,true);
 assert.equal((await fetch(f.base+'/update.php?action=status')).status,401);await f.login();
 const status=await fetch(f.base+'/update.php?action=status',{headers:{Cookie:await updateTestCookie(f)}});assert.equal(status.status,200);const data=await status.json();assert.equal(data.current,JSON.parse(readFileSync(root+'/package.json','utf8')).version);assert.equal(data.available,false);assert.equal((await f.req('state')).updates_supported,true);
 const cookie=await updateTestCookie(f);
 for(const action of ['health','backup'])assert.equal((await fetch(f.base+'/update.php?action='+action,{headers:{Cookie:cookie}})).status,404);
 assert.equal((await fetch(f.base+'/update.php?action=apply',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await fetch(f.base+'/update.php?action=apply',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Fam-Request':'1',Origin:'https://foreign.example'},body:'{}'})).status,403);
 assert.equal((await fetch(f.base+'/update.php?action=apply',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Fam-Request':'1'},body:'[]'})).status,400);
});
async function updateTestCookie(f){const response=await fetch(f.base+'/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:JSON.stringify({password})});assert.equal(response.status,200);return response.headers.get('set-cookie').split(';')[0];}

test('PHP updater installs official-shaped releases, keeps real MySQL data, rejects unsafe packages and recovers failed/interrupted activation',async()=>{
 const f=await fixture(undefined,true);await f.login();const family=await f.req('families','POST',{name:'Update preserve',manager_email:'updater-owner@example.com'},201);await f.req('members','POST',{family_id:family.id,email:'updater-guest@example.com',joined_at:'2026-08-10',expires_at:'2026-12-10'},201);
 const before=(await f.req('backup')).tables;
 writeFileSync(f.folder+'/family-private/updater-fixture.php',readFileSync(root+'/test/updater-fixture.php'));chmodSync(f.folder+'/family-private/updater-fixture.php',0o644);
 writeFileSync(f.folder+'/family-private/release-artifact.zip',readFileSync(root+'/downloads/family-php-release.zip'));chmodSync(f.folder+'/family-private/release-artifact.zip',0o644);
 execFileSync('python3',[root+'/test/updater-zip-fixture.py',root+'/downloads/family-php-release.zip',f.folder+'/family-private/traversal.zip']);chmodSync(f.folder+'/family-private/traversal.zip',0o644);
 const gate=randomBytes(24).toString('hex');writeFileSync(f.folder+'/public_html/updater-test.php',"<?php if(($_SERVER['HTTP_X_FAMILY_UPDATE_TEST']??'')!=="+JSON.stringify(gate)+"){http_response_code(404);exit;}header('Content-Type: text/plain');require '/var/www/family-private/updater-fixture.php';");chmodSync(f.folder+'/public_html/updater-test.php',0o644);
 const response=await fetch(f.base+'/updater-test.php',{headers:{'X-Family-Update-Test':gate}}),output=await response.text();assert.equal(response.status,200,output);assert.match(output,/Updater lifecycle checks passed: [1-9]\d*/);
 assert.deepEqual((await f.req('backup')).tables,before);assert.equal((await f.req('state')).members[0].email,'updater-guest@example.com');
});
