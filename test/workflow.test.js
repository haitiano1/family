import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { expiry } from '../domain.js';

async function fixture(prepare, environment={}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fam-test-')); if (prepare) prepare(dir);
  let child, base;
  async function start() {
    let output = '';
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, HOST:'127.0.0.1', PUBLIC_ORIGIN:'', RENDER_EXTERNAL_URL:'', ACCESS_PASSWORD:'', PORT: '0', DATA_DIR: dir, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stderr.on('data', d => { output += d.toString(); });
      child.stdout.on('data', data => {
        output += data.toString();
        const match = output.match(/port (\d+)/); if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); }
      });
      child.once('exit', exit => { clearTimeout(timer); reject(new Error('Server exited: ' + exit + '\n' + output)); });
    });
  }
  async function stop() { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }
  const client = () => {
    const request = async (endpoint, method = 'GET', data, status = 200, extra = {}) => {
      const response = await fetch(base + '/api/' + endpoint, { method, headers: { 'Content-Type': 'application/json', 'X-Fam-Request':'1', ...extra }, body: data ? JSON.stringify(data) : undefined });
      assert.equal(response.status, status, await response.clone().text());
      return response.json();
    };
    return request;
  };
  const admin = client();
  async function setup() {}
  try { await start(); } catch (error) { await stop(); rmSync(dir, { recursive: true, force: true }); throw error; }
  return { start, stop, dir, client, admin, setup, get base() { return base; }, async close() { await stop(); rmSync(dir, { recursive: true, force: true }); } };
}

test('Customer CRUD, dates/payments, persistence and Family capacity', async () => {
  const f = await fixture(); const request = f.admin;
  try {
    await f.setup(); assert.equal((await request('state')).accounts.length, 0);
    await request('accounts', 'POST', { email: 'bad' }, 400);
    const account = await request('accounts', 'POST', { email: 'Manager@example.com', note: 'Customer' }, 201);
    await request('accounts', 'POST', { email: 'manager@example.com' }, 409);
    const family = await request('families', 'POST', { name: 'Family', manager_id: account.id, service: 'youtube' }, 201);
    await request('families', 'POST', { name: 'Duplicate', manager_id: account.id }, 409);
    await request('families/' + family.id, 'PATCH', { name: 'Updated Family', manager_id: account.id, service: 'youtube', note: 'Group note' });
    await request('members', 'POST', { family_id: family.id, email: 'manager@example.com' }, 400);
    const member = await request('members', 'POST', { family_id: family.id, email: 'guest@example.com', customer_name: 'Customer Name', joined_at: '2025-01-01', expires_at: '2025-02-01', payment_status: 'partial', amount: 100000 }, 201);
    await request('members', 'POST', { family_id: family.id, email: 'guest@example.com' }, 409);
    for (const data of [{ expires_at: '2026-02-30' }, { joined_at: '2026-02-01', expires_at: '2026-01-01' }, { amount: -1 }, { amount: 'abc' }, { payment_status: 'wrong' }]) {
      await request('members/' + member.id, 'PATCH', { email: 'guest@example.com', ...data }, 400);
    }
    let state = await request('state'); assert.equal(state.members[0].expiry_status, 'expired'); assert.equal(state.reminders.unpaid, 1);
    await request('members/' + member.id, 'PATCH', { email: 'guest@example.com', customer_name: 'Renewed Customer', contact: 'phone', joined_at: '2025-01-01', expires_at: '2099-01-01', payment_status: 'paid', amount: 200000, note: 'Renewed' });
    await request('accounts/' + account.id, 'PATCH', { email: 'newmanager@example.com', note: 'Updated' });
    for (let n = 0; n < 4; n++) await request('members', 'POST', { family_id: family.id, email: `guest${n}@example.com` }, 201);
    await request('members', 'POST', { family_id: family.id, email: 'overflow@example.com' }, 400);
    state = await request('state'); assert.equal(state.members.length, 5); assert.equal(state.families.length, 1); assert.equal('jobs' in state,false);
    assert.equal(state.members.find(m => m.id === member.id).payment_status, 'paid'); assert.ok(state.logs.length > 0); assert.equal('user' in state,false);
    await f.stop(); await f.start();
    state = await request('state'); assert.equal(state.accounts[0].email, 'newmanager@example.com'); assert.equal('jobs' in state,false);
    await request('accounts/' + account.id, 'DELETE', undefined, 400);
    await request('members/' + member.id, 'DELETE'); await request('families/' + family.id, 'DELETE'); assert.equal((await request('state')).members.length, 0);
    await request('accounts/' + account.id, 'DELETE', undefined, 400);state=await request('state');assert.equal(state.archives.length,5);assert.equal(state.archived_families[0].manager_email,'newmanager@example.com');
    for (const asset of ['/', '/app.js', '/statistics.js', '/sheets.js', '/style.css', '/contacts.js', '/domain.js']) assert.equal((await fetch(f.base + asset)).status, 200);
    assert.equal((await fetch(f.base + '/../../server.js')).status, 404);
  } finally { await f.close(); }
});

test('existing v1 database is backed up and migrated without losing customer records', async () => {
  const f = await fixture(dir => {
    const db = new DatabaseSync(path.join(dir, 'family.sqlite'));
    db.exec(`CREATE TABLE accounts (id INTEGER PRIMARY KEY,email TEXT UNIQUE NOT NULL,note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
    CREATE TABLE families (id INTEGER PRIMARY KEY,name TEXT NOT NULL,manager_id INTEGER UNIQUE NOT NULL REFERENCES accounts(id),created_at TEXT NOT NULL);
    CREATE TABLE members (id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,email TEXT NOT NULL,UNIQUE(family_id,email));
    CREATE TABLE jobs (id INTEGER PRIMARY KEY,action TEXT NOT NULL,target TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE logs (id INTEGER PRIMARY KEY,message TEXT NOT NULL,created_at TEXT NOT NULL);
    INSERT INTO accounts VALUES (1,'legacy@example.com','Existing note','2026-01-01');
    INSERT INTO families VALUES (1,'Legacy Family',1,'2026-01-01');
    INSERT INTO members VALUES (1,1,'legacyguest@example.com');
    INSERT INTO jobs VALUES (1,'invite','Legacy Family · legacyguest@example.com','blocked','Pending','2026-01-01');`);
    db.close();
  });
  try {
    await f.setup(); let state = await f.admin('state'); assert.equal(state.accounts[0].note, 'Existing note'); assert.equal(state.members[0].email, 'legacyguest@example.com'); assert.equal(state.members[0].expiry_status, 'unknown'); assert.equal(state.families[0].service, 'youtube'); assert.equal('jobs' in state,false);
    const backups = readdirSync(f.dir).filter(n => n.startsWith('before-v16-')); assert.equal(backups.length, 1);
    const backup = new DatabaseSync(path.join(f.dir, backups[0])); assert.equal(backup.prepare('SELECT email FROM members').get().email, 'legacyguest@example.com'); assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 0); backup.close();
    await f.stop(); await f.start(); state = await f.admin('state'); assert.equal(state.members.length, 1); assert.equal(readdirSync(f.dir).filter(n => n.startsWith('before-v16-')).length, 1);
  } finally { await f.close(); }
});

test('expiry rules use inclusive end date and the next two calendar days', () => {
  assert.deepEqual(expiry('', '2026-10-12'), { expiry_status: 'unknown', days_left: null });
  assert.deepEqual(expiry('2026-10-11', '2026-10-12'), { expiry_status: 'expired', days_left: -1 });
  assert.deepEqual(expiry('2026-10-12', '2026-10-12'), { expiry_status: 'due_soon', days_left: 0 });
  assert.deepEqual(expiry('2026-10-14', '2026-10-12'), { expiry_status: 'due_soon', days_left: 2 });
  assert.deepEqual(expiry('2026-10-15', '2026-10-12'), { expiry_status: 'active', days_left: 3 });
});

test('CSV preview is read-only; confirmation creates groups and customers atomically with deduplication', async () => {
  const f = await fixture();
  try {
    await f.setup(); const a = f.admin;
    const payload = { csv: 'Tên khách,Email khách,Gói mua,Ngày mua,Ngày đến hạn,Contact\n"Nguyễn, An",an@example.com,6 tháng,12/06/2026,12/12/2026,"FB link\nGhi chú"\nBình,binh@example.com,12 tháng,19/03/2026,19/03/2027,Zalo\nBình,binh@example.com,12 tháng,19/03/2026,19/03/2027,Zalo',
      delimiter: ',', mapping: { customer_name:0,email:1,plan_months:2,joined_at:3,expires_at:4,contact:5 }, default_manager:'owner@example.com',default_family:'Sheet Family',create_groups:true,duplicates:'skip' };
    const p = await a('import/preview','POST',payload); assert.equal(p.summary.create,2); assert.equal(p.summary.skip,1); assert.equal(p.summary.new_families,1); assert.equal(p.summary.errors,0);
    assert.equal((await a('state')).accounts.length,0);
    await a('import/commit','POST',{...payload,preview_token:'invalid'},409);
    await a('import/commit','POST',{...payload,preview_token:p.preview_token});
    let state = await a('state'); assert.equal(state.members.length,2); assert.equal(state.families.length,1); assert.equal(state.accounts.length,1);
    const an = state.members.find(m=>m.email==='an@example.com'); assert.equal(an.customer_name,'Nguyễn, An'); assert.equal(an.plan_months,6); assert.equal(an.expires_at,'2026-12-12'); assert.equal(an.payment_status,'unknown'); assert.equal(state.reminders.unpaid,0); assert.equal(an.contact,'FB link\nGhi chú');
    await a('import/commit','POST',{...payload,preview_token:p.preview_token},409);
    const again = await a('import/preview','POST',payload); assert.equal(again.summary.skip,3); assert.equal(again.summary.create,0);
    const update = {...payload,csv:'Email khách,Ngày đến hạn,Contact\nan@example.com,01/01/2027,', mapping:{email:0,expires_at:1,contact:2},duplicates:'update'};
    const q = await a('import/preview','POST',update); assert.equal(q.summary.update,1); await a('import/commit','POST',{...update,preview_token:q.preview_token});
    state = await a('state'); const changed = state.members.find(m=>m.email==='an@example.com'); assert.equal(changed.expires_at,'2027-01-01'); assert.equal(changed.plan_months,6); assert.equal(changed.contact,'FB link\nGhi chú'); assert.equal(changed.customer_name,'Nguyễn, An');
    await f.stop(); await f.start(); assert.equal((await a('state')).members.length,2);
  } finally { await f.close(); }
});

test('CSV errors and stale preview cannot partially import', async () => {
  const f = await fixture();
  try {
    await f.setup(); const a=f.admin;
    const acc=await a('accounts','POST',{email:'mgr@example.com'},201); const fam=await a('families','POST',{name:'Family',manager_id:acc.id},201);
    const payload={csv:'Email,Ngày đến hạn\nvalid@example.com,12/12/2026\ninvalid@example.com,31/02/2026',mapping:{email:0,expires_at:1},family_id:fam.id,duplicates:'skip'};
    let p=await a('import/preview','POST',payload); assert.equal(p.summary.errors,1); await a('import/commit','POST',{...payload,preview_token:p.preview_token},400); assert.equal((await a('state')).members.length,0);
    const six={...payload,csv:'Email\n'+Array.from({length:6},(_,i)=>`guest${i}@example.com`).join('\n'),mapping:{email:0}};
    p=await a('import/preview','POST',six); assert.equal(p.summary.errors,1); await a('import/commit','POST',{...six,preview_token:p.preview_token},400); assert.equal((await a('state')).members.length,0);
    const valid={...payload,csv:'Email\nvalid@example.com',mapping:{email:0}};
    p=await a('import/preview','POST',valid); await a('members','POST',{family_id:fam.id,email:'other@example.com'},201); await a('import/commit','POST',{...valid,preview_token:p.preview_token},409); assert.equal((await a('state')).members.length,1);
  } finally { await f.close(); }
});

test('upgrading v2 retains customer records while adding current fields', async () => {
  const f=await fixture();
  try {
    await f.setup(); const a=f.admin;
    const acc=await a('accounts','POST',{email:'manager@example.com'},201); const family=await a('families','POST',{name:'Old Family',manager_id:acc.id},201);
    await a('members','POST',{email:'guest@example.com',family_id:family.id,expires_at:'2026-12-12',contact:'Existing contact',payment_status:'paid'},201);
    await f.stop();
    const old=new DatabaseSync(path.join(f.dir,'family.sqlite')); old.exec('ALTER TABLE members DROP COLUMN plan_months; PRAGMA user_version=2'); old.close();
    await f.start(); const state=await a('state'); assert.equal('user' in state,false); assert.equal(state.members[0].email,'guest@example.com'); assert.equal(state.members[0].contact,'Existing contact'); assert.equal(state.members[0].payment_status,'paid'); assert.equal(state.members[0].plan_months,0);
    const backups=readdirSync(f.dir).filter(n=>n.startsWith('before-v16-')); assert.equal(backups.length,1);
    const saved=new DatabaseSync(path.join(f.dir,backups[0])); assert.equal(saved.prepare('PRAGMA user_version').get().user_version,2); assert.equal(saved.prepare('SELECT email FROM members').get().email,'guest@example.com'); saved.close();
  } finally { await f.close(); }
});

test('renewal payments are distinct from the current period; applying a paid renewal records history once', async () => {
  const f=await fixture();
  try {
    await f.setup(); const a=f.admin;
    const account=await a('accounts','POST',{email:'manager@example.com'},201); const family=await a('families','POST',{name:'Family',manager_id:account.id},201);
    const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',payment_status:'paid',amount:100000,plan_months:1,expires_at:'2026-11-01'},201);
    const endpoint='members/'+member.id+'/renewal';
    await a(endpoint,'PATCH',{revision:0,status:'awaiting_payment',amount:0,paid_at:'',note:'Nhắc qua Zalo'});
    let m=(await a('state')).members[0]; assert.equal(m.payment_status,'paid'); assert.equal(m.expires_at,'2026-11-01'); assert.equal(m.renewal_status,'awaiting_payment'); assert.equal((await a('state')).reminders.renewal_waiting,1);
    await a(endpoint+'/apply','POST',{revision:m.renewal_revision,expires_at:'2026-12-01',plan_months:1},400);
    await a(endpoint,'PATCH',{revision:m.renewal_revision,status:'paid',amount:0,paid_at:'2026-01-01'},400);
    await a(endpoint,'PATCH',{revision:m.renewal_revision,status:'paid',amount:150000,paid_at:'2099-01-01'},400);
    await a(endpoint,'PATCH',{revision:m.renewal_revision,status:'partial',amount:50000,paid_at:'2026-01-01',note:'Trả một phần'});
    m=(await a('state')).members[0]; assert.equal(m.renewal_status,'partial'); assert.equal(m.expires_at,'2026-11-01');
    await a(endpoint,'PATCH',{revision:m.renewal_revision,status:'paid',amount:150000,paid_at:'2026-01-02',note:'Đã nhận đủ'});
    const stale=m.renewal_revision; m=(await a('state')).members[0]; assert.equal((await a('state')).reminders.renewal_paid_pending,1);
    await a(endpoint,'PATCH',{revision:stale,status:'declined',amount:0,paid_at:''},409);
    await a(endpoint+'/apply','POST',{revision:m.renewal_revision,expires_at:'2026-11-01',plan_months:1},400);
    const payload={revision:m.renewal_revision,expires_at:'2027-02-01',plan_months:3};
    await a(endpoint+'/apply','POST',payload); await a(endpoint+'/apply','POST',payload,409);
    const history=(await a('members/'+member.id+'/renewal-history')).history; assert.equal(history.length,1); assert.equal(history[0].old_expires_at,'2026-11-01'); assert.equal(history[0].new_expires_at,'2027-02-01'); assert.equal(history[0].amount,150000); assert.equal(history[0].created_by,'Cục bộ');
    m=(await a('state')).members[0]; assert.equal(m.expires_at,'2027-02-01'); assert.equal(m.plan_months,3); assert.equal(m.payment_status,'paid'); assert.equal(m.amount,150000); assert.equal(m.renewal_status,'not_contacted'); assert.equal(m.renewal_amount,0);
    await f.stop(); await f.start(); assert.equal((await a('members/'+member.id+'/renewal-history')).history.length,1);
    await a('members/'+member.id,'DELETE'); const db=new DatabaseSync(path.join(f.dir,'family.sqlite')); const saved=db.prepare('SELECT * FROM renewal_history').get(); assert.equal(saved.member_id,null); assert.equal(saved.email,'guest@example.com'); db.close();
  } finally { await f.close(); }
});

test('Node receipt dates are blank while waiting, default to actual payment day and retain the expiry-month statistics',async()=>{
const f=await fixture();try{await f.setup();const a=f.admin;
 const family=await a('families','POST',{name:'Receipt date test',manager_email:'receipt-owner@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'receipt-guest@example.com',joined_at:'2026-08-10',expires_at:'2026-09-10'},201),current=(await a('state')).today;
 await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'awaiting_payment',amount:165000,paid_at:'2026-10-15'});let row=(await a('state')).members.find(m=>m.id===member.id);assert.equal(row.renewal_paid_at,'');assert.equal(row.expires_at,'2026-09-10');assert.equal((await a('members/'+member.id+'/renewal-history')).history.length,0);
 await a('members/'+member.id+'/renewal','PATCH',{revision:row.renewal_revision,status:'paid',amount:165000,plan_months:3,apply_now:true});const history=(await a('members/'+member.id+'/renewal-history')).history[0];assert.equal(history.paid_at,current);assert.equal(history.old_expires_at,'2026-09-10');assert.equal(history.new_expires_at,'2026-12-10');assert.equal((await a('statistics?month=2026-09')).selected.amount,165000);
 const second=await a('members','POST',{family_id:family.id,email:'receipt-partial@example.com',expires_at:'2026-09-12'},201);await a('members/'+second.id+'/renewal','PATCH',{revision:0,status:'partial',amount:10000,paid_at:'2026-10-15'});row=(await a('state')).members.find(m=>m.id===second.id);assert.equal(row.renewal_paid_at,'2026-10-15');await a('members/'+second.id+'/renewal','PATCH',{revision:row.renewal_revision,status:'paid',amount:100000,plan_months:1,apply_now:true});assert.equal((await a('members/'+second.id+'/renewal-history')).history[0].paid_at,current);
 const third=await a('members','POST',{family_id:family.id,email:'receipt-manual@example.com',expires_at:'2026-09-14'},201);await a('members/'+third.id+'/renewal','PATCH',{revision:0,status:'paid',amount:50000,paid_at:'2026-10-20',plan_months:1,apply_now:true});assert.equal((await a('members/'+third.id+'/renewal-history')).history[0].paid_at,'2026-10-20');
}finally{await f.close();}
});

test('one renewal save updates cycle dates automatically and preserves the separate receipt date', async () => {
  const f=await fixture();
  try {
    await f.setup(); const a=f.admin; const account=await a('accounts','POST',{email:'manager@example.com'},201); const family=await a('families','POST',{name:'Family',manager_id:account.id},201);
    const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',joined_at:'2026-10-05',expires_at:'2027-01-05',plan_months:3,payment_status:'paid'},201);
    const applied=await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:150000,paid_at:'2026-10-10',plan_months:3,apply_now:true});
    assert.equal(applied.applied,true); assert.equal(applied.purchase_date,'2027-01-05'); assert.equal(applied.expires_at,'2027-04-05');
    const m=(await a('state')).members[0]; assert.equal(m.joined_at,'2027-01-05'); assert.equal(m.expires_at,'2027-04-05');
    const history=(await a('members/'+member.id+'/renewal-history')).history; assert.equal(history[0].old_purchase_at,'2026-10-05'); assert.equal(history[0].new_purchase_at,'2027-01-05'); assert.equal(history[0].paid_at,'2026-10-10');
    await a('members/'+member.id+'/renewal','PATCH',{revision:m.renewal_revision,status:'partial',amount:10000,paid_at:'2026-10-11',plan_months:1,apply_now:true},400);
    assert.equal((await a('state')).members[0].joined_at,'2027-01-05');
  } finally { await f.close(); }
});

test('declined customers archive in the same renewal request, keep their history, and can be restored', async () => {
  const f=await fixture();
  try {
    await f.setup(); const a=f.admin; const account=await a('accounts','POST',{email:'manager@example.com'},201); const family=await a('families','POST',{name:'Family',manager_id:account.id},201);
    const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',customer_name:'Customer',contact:'Zalo note',joined_at:'2025-01-01',expires_at:'2025-02-01',plan_months:1},201);
    const issue=await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'Before cancellation'},201);
    await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2026-01-01',plan_months:1,apply_now:true});
    let m=(await a('state')).members[0]; const result=await a('members/'+member.id+'/renewal','PATCH',{revision:m.renewal_revision,status:'declined',amount:0,paid_at:'',note:'Khách dừng'});assert.equal(result.archived,true);
    const db=new DatabaseSync(path.join(f.dir,'family.sqlite'),{readOnly:true});assert.equal(db.prepare('SELECT COUNT(*) AS n FROM members').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM archived_customers').get().n,1);db.close();
    let state=await a('state'); assert.equal(state.members.length,0); assert.equal(state.archives.length,1);assert.equal(state.archive_mode,'immediate');const record=state.archives[0];assert.equal(record.id,result.archive_id);assert.equal(record.member.contact,'Zalo note'); assert.equal(record.member.renewal_note,'Khách dừng');
    assert.equal((await a('archives/'+record.id+'/history')).history.length,1);
    const replacement=await a('members','POST',{family_id:family.id,email:'different@example.com',expires_at:'2027-01-01'},201);assert.equal(replacement.id,member.id);assert.equal((await a('state')).issues[0].target_available,false);
    await a('issues/'+issue.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'wrong@example.com'},409);assert.equal((await a('state')).members[0].email,'different@example.com');
    await f.stop(); await f.start(); assert.equal((await a('state')).archives.length,1);
    const restored=await a('archives/'+record.id+'/restore','POST',{family_id:family.id}); state=await a('state'); assert.equal(state.archives.length,0); assert.equal(state.members.length,2); assert.equal(state.members[0].renewal_status,'not_contacted'); assert.equal(state.members[0].declined_at,''); assert.equal(state.members[0].contact,'Zalo note');
    assert.equal((await a('members/'+restored.member_id+'/renewal-history')).history.length,1);
    await a('archives/'+record.id+'/restore','POST',{family_id:family.id},409);
  } finally { await f.close(); }
});

test('invitation-pending sixth customer imports with a custom plan and does not consume an occupied slot', async () => {
  const f=await fixture();
  try {
    await f.setup();const a=f.admin;
    const payload={csv:'Email,Manager,Gói,Status\n'+Array.from({length:6},(_,i)=>`guest${i}@example.com,manager@example.com,${i===0?'13 tháng':'1 năm'},${i===0?'invited':'unknown'}`).join('\n'),mapping:{email:0,manager_email:1,plan_months:2,membership_status:3},create_groups:true,duplicates:'skip'};
    const preview=await a('import/preview','POST',payload);assert.equal(preview.summary.create,6);assert.equal(preview.summary.errors,0);await a('import/commit','POST',{...payload,preview_token:preview.preview_token});
    const state=await a('state');assert.equal(state.members.length,6);assert.equal(state.members.filter(m=>m.membership_status!=='invited').length,5);assert.equal(state.members.find(m=>m.email==='guest0@example.com').plan_months,13);
    const m=state.members.find(m=>m.membership_status==='invited');await a('members/'+m.id,'PATCH',{email:m.email,membership_status:'active',plan_months:13},400);
  } finally {await f.close();}
});

test('offline CSV importer preserves customer data and skips duplicate imports', async () => {
  const f=await fixture();
  try {
    await f.setup();await f.stop();
    const csv=path.join(f.dir,'source.csv');writeFileSync(csv,'Family 1,,,,,,\nmanager@example.com,SECRET-HEADER,Gói mua,Ngày mua,Ngày đến hạn,Ngày pay,Contact\nCustomer,guest@example.com,13 tháng,01/01/2026,01/02/2027,0,Zalo');
    async function runImport() {
      const process=spawn(globalThis.process.execPath,['import-cli.js',csv],{env:{...globalThis.process.env,DATA_DIR:f.dir},stdio:['ignore','pipe','pipe']});let output='';process.stdout.on('data',d=>output+=d);process.stderr.on('data',d=>output+=d);const [code]=await once(process,'exit');assert.equal(code,0,output);return output;
    }
    assert.match(await runImport(),/1 new customers/);assert.match(await runImport(),/Already imported/);
    assert.ok(readdirSync(f.dir).some(n=>n.startsWith('before-csv-')));
    await f.start();const state=await f.admin('state');assert.equal('user' in state,false);assert.equal(state.members.length,1);assert.equal(state.members[0].plan_months,13);
  } finally {await f.close();}
});

test('late payment renews from the old expiry, not the receipt or confirmation day', async () => {
  const f=await fixture();
  try {
    await f.setup();const a=f.admin;
    const account=await a('accounts','POST',{email:'manager@example.com'},201);const family=await a('families','POST',{name:'Family',manager_id:account.id},201);
    const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',joined_at:'2025-10-05',expires_at:'2026-01-05',plan_months:3},201);
    const result=await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:150000,paid_at:'2026-01-15',plan_months:3,apply_now:true});
    assert.equal(result.purchase_date,'2026-01-05');assert.equal(result.expires_at,'2026-04-05');
    const m=(await a('state')).members[0];assert.equal(m.joined_at,'2026-01-05');assert.equal(m.expires_at,'2026-04-05');
    const history=(await a('members/'+member.id+'/renewal-history')).history[0];assert.equal(history.paid_at,'2026-01-15');assert.equal(history.new_purchase_at,'2026-01-05');assert.equal(history.new_expires_at,'2026-04-05');
    const second=await a('members','POST',{family_id:family.id,email:'unknown@example.com'},201);
    await a('members/'+second.id+'/renewal','PATCH',{revision:0,status:'paid',amount:150000,paid_at:'2026-01-15',plan_months:3,apply_now:true},400);
    const unchanged=(await a('state')).members.find(m=>m.id===second.id);assert.equal(unchanged.expires_at,'');assert.equal(unchanged.renewal_status,'not_contacted');
  }finally{await f.close();}
});

test('local app opens without login, retires auth/Google endpoints and rejects foreign-origin mutations', async () => {
  const f=await fixture();
  try {
    const state=await f.admin('state');assert.equal(state.members.length,0);assert.equal('user' in state,false);assert.equal('jobs' in state,false);
    for(const endpoint of ['auth/status','users','jobs']) await f.admin(endpoint,'GET',undefined,404);
    await f.admin('auth/login','POST',{username:'x',password:'x'},404);
    await f.admin('accounts','POST',{email:'test@example.com'},403,{'X-Fam-Request':''});
    await f.admin('accounts','POST',{email:'test@example.com'},403,{Origin:'https://foreign.example'});
    const status=await new Promise((resolve,reject)=>{const req=http.get(f.base+'/api/state',{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});assert.equal(status,403);
    const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('users','sessions','jobs')").get().n,0);db.close();
  }finally{await f.close();}
});

test('Family email can be added/edited directly with transactional conflict handling',async()=>{
 const f=await fixture();try{
  const a=f.admin;const first=await a('families','POST',{name:'First',manager_email:'first@example.com'},201);const second=await a('families','POST',{name:'Second',manager_email:'second@example.com'},201);
  await a('families/'+first.id,'PATCH',{name:'Edited',manager_email:'edited@example.com',note:'Group note'});
  await a('families/'+second.id,'PATCH',{name:'Conflict',manager_email:'edited@example.com'},409);
  const state=await a('state');assert.equal(state.families.find(f=>f.id===first.id).manager_email,'edited@example.com');assert.equal(state.families.find(f=>f.id===second.id).manager_email,'second@example.com');
 }finally{await f.close();}
});

test('other digital products accept standalone customers and appear in two-day expiry counts',async()=>{
 const f=await fixture();try{
  const a=f.admin;const current=(await a('state')).today;
  const plus=days=>new Date(Date.parse(current)+days*86400000).toISOString().slice(0,10);
  const purchase=await a('other-products','POST',{product:'Netflix',customer_name:'Side customer',contact:'Zalo note',joined_at:current,expires_at:plus(2),note:'Gói phụ',payment_status:'paid',amount:100000},201);
  let state=await a('state');assert.equal(state.families.length,0);assert.equal(state.other_products.length,1);assert.equal(state.other_reminders.due_soon,1);assert.equal(state.other_products[0].note,'Gói phụ');
  await a('other-products','POST',{product:'Spotify'},400);await a('other-products','POST',{product:'ChatGPT',customer_name:'Test',joined_at:current,expires_at:plus(-1)},400);
  await a('other-products/'+purchase.id,'PATCH',{product:'Custom plan',email:'buyer@example.com',contact:'Facebook link',joined_at:'',expires_at:plus(-1),payment_status:'partial',amount:50000,note:'Custom note'});
  state=await a('state');assert.equal(state.other_reminders.due_soon,0);assert.equal(state.other_reminders.expired,1);assert.equal(state.other_products[0].product,'Custom plan');
  await f.stop();await f.start();assert.equal((await a('state')).other_products[0].note,'Custom note');
  await a('other-products/'+purchase.id,'DELETE');assert.equal((await a('state')).other_products.length,0);
 }finally{await f.close();}
});

test('old admin and job data is preserved on disk but not exposed or required by the new app',async()=>{
 const f=await fixture(dir=>{const db=new DatabaseSync(path.join(dir,'family.sqlite'));db.exec("CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password_hash TEXT);INSERT INTO users VALUES(1,'oldadmin','old-hash');CREATE TABLE jobs(id INTEGER PRIMARY KEY,action TEXT);INSERT INTO jobs VALUES(1,'old-action');PRAGMA user_version=7;");db.close();});
 try{const state=await f.admin('state');assert.equal('user' in state,false);assert.equal('jobs' in state,false);assert.equal(state.other_products.length,0);const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));assert.equal(db.prepare('SELECT password_hash FROM users').get().password_hash,'old-hash');assert.equal(db.prepare('SELECT action FROM jobs').get().action,'old-action');db.close();}finally{await f.close();}
});

test('hosted API and backups require access while health and iPhone assets remain public',async()=>{
 const f=await fixture(undefined,{PUBLIC_ORIGIN:'https://family.example.com',ACCESS_PASSWORD:'test-private-access'});
 try{
  const a=f.admin;
  await a('state','GET',undefined,401);await a('backup','GET',undefined,401);
  assert.equal((await fetch(f.base+'/healthz')).status,200);
  const first=await fetch(f.base+'/',{redirect:'manual'});assert.equal(first.status,302);assert.equal(first.headers.get('location'),'/access');
  assert.equal((await fetch(f.base+'/access')).status,200);
  const manifest=await (await fetch(f.base+'/manifest.webmanifest')).json();assert.equal(manifest.display,'standalone');
  for(const icon of manifest.icons){const response=await fetch(f.base+icon.src);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/image\/png/);assert.ok((await response.arrayBuffer()).byteLength>100);}
  await a('access','POST',{password:'wrong'},401);
  const login=await fetch(f.base+'/api/access',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1',Origin:'https://family.example.com'},body:JSON.stringify({password:'test-private-access'})});assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0];const headers={Cookie:cookie,Origin:'https://family.example.com',Host:'family.example.com'};
  const family=await a('families','POST',{name:'Hosted',manager_email:'hosted@example.com'},201,headers);assert.ok(family.id);
  assert.equal((await a('state','GET',undefined,200,headers)).hosted,true);
  await a('families','POST',{name:'Foreign',manager_email:'foreign@example.com'},403,{...headers,Origin:'https://foreign.example'});
  assert.equal((await a('backup','GET',undefined,200,headers)).tables.families.length,1);
  const locked=await fetch(f.base+'/api/access/close',{method:'POST',headers:{...headers,'Content-Type':'application/json','X-Fam-Request':'1'},body:'{}'});assert.equal(locked.status,200);assert.match(locked.headers.get('set-cookie'),/Max-Age=0/);
 }finally{await f.close();}
});

test('portable backup restores all customer data transactionally without overwriting existing records',async()=>{
 const source=await fixture(),target=await fixture();
 try{
  const a=source.admin,b=target.admin;
  const family=await a('families','POST',{name:'Family',manager_email:'manager@example.com'},201);
  const member=await a('members','POST',{family_id:family.id,email:'buyer@example.com',customer_name:'Buyer',contact:'https://facebook.com/example',note:'Original note',plan_months:3,joined_at:'2025-10-05',expires_at:'2026-01-05'},201);
  await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:150000,paid_at:'2026-01-15',plan_months:3,apply_now:true});
  const archived=await a('members','POST',{family_id:family.id,email:'archived@example.com',contact:'Zalo archive'},201);
  await a('members/'+archived.id+'/renewal','PATCH',{revision:0,status:'declined'});
  await a('other-products','POST',{product:'ChatGPT',customer_name:'Buyer',contact:'Other contact',note:'Side product'},201);
  const issue=await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'Backup the fixed mail'},201);
  await a('issues/'+issue.id,'PATCH',{status:'done',revision:0,resolution:'keep'});
  const backup=await a('backup');assert.equal('users' in backup.tables,false);assert.equal('jobs' in backup.tables,false);
  assert.equal(backup.tables.issues[0].resolution_email,'buyer@example.com');assert.ok(backup.tables.audit_events.length);
  const invalid=structuredClone(backup);invalid.tables.members[0].family_id=9999;
  await b('restore','POST',invalid,400);assert.equal((await b('state')).accounts.length,0);
  const restored=await b('restore','POST',backup);assert.equal(restored.customers,1);assert.equal(restored.families,1);assert.equal(restored.other_products,1);
  const after=await b('backup');for(const name of Object.keys(backup.tables))if(name!=='audit_events')assert.deepEqual(after.tables[name],backup.tables[name]);assert.deepEqual(after.tables.audit_events.slice(0,-1),backup.tables.audit_events);assert.equal(after.tables.audit_events.at(-1).action,'Khôi phục dữ liệu');
  await b('restore','POST',backup,409);assert.equal((await b('state')).members.length,1);
  await target.stop();await target.start();assert.equal((await b('state')).members[0].contact,'https://facebook.com/example');assert.equal((await b('state')).archives.length,1);
 }finally{await source.close();await target.close();}
});

test('Family issues keep or replace the linked manager/member mail atomically and retain fix notes',async()=>{
 const f=await fixture();try{
  const a=f.admin;const family=await a('families','POST',{name:'Trouble Family',manager_email:'manager-a@example.com',trial_date:'2026-08-10'},201);const member=await a('members','POST',{family_id:family.id,email:'customer-a@example.com',contact:'Zalo',note:'Keep note'},201);
  const issue=await a('issues','POST',{family_id:family.id,target_type:'manager',title:'Manager error',note:'Needs fix'},201);
  await a('issues/'+issue.id,'PATCH',{status:'done',revision:0},400);
  await a('issues/'+issue.id,'PATCH',{status:'doing',revision:0});
  // Fail the issue update after the linked email UPDATE to verify the outer transaction.
  const fault=new DatabaseSync(path.join(f.dir,'family.sqlite'));fault.exec("CREATE TRIGGER reject_issue_completion BEFORE UPDATE ON issues BEGIN SELECT RAISE(ABORT, 'Injected issue write failure'); END");
  const before=(await a('backup')).tables,reported=(await a('state')).issues[0];const journalBefore=(await a('journal')).total;
  await a('issues/'+issue.id,'PATCH',{status:'done',revision:1,resolution:'replace',replacement_email:'manager-b@example.com'},500);
  assert.equal((await a('state')).families[0].manager_email,'manager-a@example.com');assert.equal((await a('state')).issues[0].status,'doing');assert.equal((await a('journal')).total,journalBefore);assert.deepEqual((await a('backup')).tables,before);
  fault.exec('DROP TRIGGER reject_issue_completion');fault.close();
  await a('issues/'+issue.id,'PATCH',{status:'done',revision:1,resolution:'replace',replacement_email:'manager-b@example.com'});
  let state=await a('state');assert.equal(state.families[0].manager_email,'manager-b@example.com');let fixed=state.issues[0];assert.equal(fixed.status,'done');assert.equal(fixed.original_email,'manager-a@example.com');assert.equal(fixed.subject_email,'manager-b@example.com');assert.match(fixed.resolution_note,/manager-a@example.com.*manager-b@example.com/);
  const expected=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(fixed.done_at));assert.equal(state.families[0].trial_date,expected);assert.equal(fixed.trial_date,reported.trial_date);assert.equal(fixed.reported_on,reported.reported_on);assert.equal(fixed.days_used,reported.days_used);assert.ok(fixed.resolution_note.includes(expected.split('-').reverse().join('/')));
  const audit=(await a('journal')).entries.find(e=>e.action==='Sửa lỗi'),detail=await a('journal/audit/'+audit.id),change=detail.changes.find(c=>c.table==='families');assert.equal(change.before.trial_date,'2026-08-10');assert.equal(change.after.trial_date,expected);assert.ok(detail.changes.some(c=>c.table==='accounts'&&c.after.email==='manager-b@example.com'));
  await a('families/'+family.id,'PATCH',{name:'Trouble Family',manager_email:'manager-b@example.com',trial_date:'2026-09-01'});await a('issues/'+issue.id,'PATCH',{status:'done',revision:fixed.revision,note:'Edited completed note'});assert.equal((await a('state')).families[0].trial_date,'2026-09-01');

  await a('issues/'+issue.id,'PATCH',{status:'doing',revision:1},409);
  const customerIssue=await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'Customer error'},201);
  await a('issues/'+customerIssue.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'manager-b@example.com'},409);state=await a('state');assert.equal(state.issues.find(i=>i.id===customerIssue.id).status,'todo');assert.equal(state.members[0].email,'customer-a@example.com');
  await a('issues/'+customerIssue.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'customer-b@example.com'});state=await a('state');assert.equal(state.members[0].email,'customer-b@example.com');assert.equal(state.families[0].trial_date,'2026-09-01');assert.equal(state.members[0].contact,'Zalo');assert.equal(state.members[0].note,'Keep note');
  const keep=await a('issues','POST',{family_id:family.id,target_type:'manager',title:'Keep mail'},201);await a('issues/'+keep.id,'PATCH',{status:'done',revision:0,resolution:'keep'});assert.equal((await a('state')).families[0].manager_email,'manager-b@example.com');assert.equal((await a('state')).families[0].trial_date,'2026-09-01');
  await f.stop();await f.start();assert.equal((await a('state')).issues.filter(i=>i.status==='done').length,3);
 }finally{await f.close();}
});

test('journal snapshots preserve edited fields and deleted Family/customer data; failed changes create no audit',async()=>{
 const f=await fixture();try{
  const a=f.admin;const family=await a('families','POST',{name:'Audit Family',manager_email:'manager@example.com'},201);const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',contact:'Original contact',note:'Original note',expires_at:'2026-12-01'},201);
  await a('members/'+member.id,'PATCH',{email:'guest@example.com',contact:'Edited contact',note:'Edited note',expires_at:'2026-12-15'});
  let journal=await a('journal?search=guest@example.com');const edit=journal.entries.find(e=>e.action==='Sửa khách');const detail=await a('journal/audit/'+edit.id);const change=detail.changes.find(c=>c.table==='members');assert.equal(change.before.contact,'Original contact');assert.equal(change.after.contact,'Edited contact');assert.equal(change.before.expires_at,'2026-12-01');assert.equal(change.after.expires_at,'2026-12-15');
  const total=(await a('journal')).total;await a('members/'+member.id,'PATCH',{email:'bad'},400);assert.equal((await a('journal')).total,total);
  await a('families/'+family.id,'DELETE');journal=await a('journal?search=manager@example.com');const deleted=journal.entries.find(e=>e.action==='Xóa Family');assert.ok(deleted);const deletedDetail=await a('journal/audit/'+deleted.id);assert.equal(deletedDetail.changes.find(c=>c.table==='families').before.name,'Audit Family');assert.equal(deletedDetail.changes.find(c=>c.table==='members').before.contact,'Edited contact');assert.equal(deletedDetail.changes.find(c=>c.table==='members').after,null);
  assert.equal((await a('state')).members.length,0);await f.stop();await f.start();assert.ok((await a('journal?search=guest@example.com')).total>0);
 }finally{await f.close();}
});

test('Family trial date snapshots stay fixed at report time; only done cases can be deleted and journal retains them',async()=>{
 const f=await fixture();try{
  const a=f.admin,current=(await a('state')).today,trial=new Date(Date.parse(current)-5*86400000).toISOString().slice(0,10);
  const family=await a('families','POST',{name:'Trial Family',manager_email:'trial@example.com',trial_date:trial},201);
  await a('families/'+family.id,'PATCH',{name:'Trial Family',manager_email:'trial@example.com',trial_date:'2026-02-30'},400);assert.equal((await a('state')).families[0].trial_date,trial);
  const issue=await a('issues','POST',{family_id:family.id,title:'Trial error',reported_on:'1990-01-01',trial_date:'1990-01-01'},201);
  let state=await a('state'),row=state.issues[0];assert.equal(row.reported_on,current);assert.equal(row.trial_date,trial);assert.equal(row.days_used,5);
  await a('issues/'+issue.id,'DELETE',{revision:0,expected_created_at:row.created_at},400);
  await a('issues/'+issue.id,'PATCH',{status:'doing',revision:0});
  await a('families/'+family.id,'PATCH',{name:'Trial Family',manager_email:'trial@example.com',trial_date:current});
  row=(await a('state')).issues[0];assert.equal(row.days_used,5);assert.equal(row.trial_date,trial);
  await f.stop();await f.start();assert.equal((await a('state')).issues[0].days_used,5);
  await a('issues/'+issue.id,'PATCH',{status:'done',revision:1,resolution:'keep'});
  await a('issues/'+issue.id,'DELETE',{revision:1,expected_created_at:row.created_at},409);await a('issues/'+issue.id,'DELETE',{revision:2,expected_created_at:row.created_at});
  state=await a('state');assert.equal(state.issues.length,0);assert.equal(state.families[0].manager_email,'trial@example.com');assert.equal(state.families[0].trial_date,current);
  const deletion=(await a('journal?search=trial@example.com')).entries.find(e=>e.action==='Xóa lỗi');const detail=await a('journal/audit/'+deletion.id);const change=detail.changes.find(c=>c.table==='issues');assert.equal(change.before.trial_date,trial);assert.equal(change.before.reported_on,current);assert.equal(change.after,null);
  // SQLite can reuse a deleted id; an old device must not delete the replacement case.
  const replacement=await a('issues','POST',{family_id:family.id,title:'New case'},201);assert.equal(replacement.id,issue.id);await a('issues/'+replacement.id,'PATCH',{status:'doing',revision:0});await a('issues/'+replacement.id,'PATCH',{status:'done',revision:1,resolution:'keep'});
  await a('issues/'+replacement.id,'DELETE',{revision:2,expected_created_at:row.created_at},409);assert.equal((await a('state')).issues[0].title,'New case');
  await a('issues/'+replacement.id,'PATCH',{title:'Stale title',revision:2,expected_created_at:row.created_at},409);
 }finally{await f.close();}
});

test('v10 SQLite migration and legacy v1/v2 backups preserve customers and old issue report dates without guessing trial dates',async()=>{
 const f=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Old Family',manager_email:'old@example.com'},201);await a('members','POST',{family_id:family.id,email:'guest@example.com',contact:'Original Zalo'},201);await a('issues','POST',{family_id:family.id,title:'Old case'},201);
  const backup=await a('backup');assert.equal(backup.version,9);
  for(const version of [1,2]){const legacy=structuredClone(backup);legacy.version=version;for(const row of legacy.tables.families)delete row.trial_date;for(const row of legacy.tables.issues){delete row.trial_date;delete row.reported_on;row.created_at='2026-08-14T23:30:00.000Z';}if(version===1){delete legacy.tables.issues;delete legacy.tables.audit_events;}
   const destination=await fixture();try{await destination.admin('restore','POST',legacy);const state=await destination.admin('state');assert.equal(state.members[0].contact,'Original Zalo');assert.equal(state.families[0].trial_date,'');if(version===2){assert.equal(state.issues[0].reported_on,'2026-08-15');assert.equal(state.issues[0].days_used,null);}}finally{await destination.close();}
  }
  await f.stop();const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));db.exec("ALTER TABLE families DROP COLUMN trial_date;ALTER TABLE issues DROP COLUMN trial_date;ALTER TABLE issues DROP COLUMN reported_on;UPDATE issues SET created_at='2026-08-14T23:30:00.000Z';PRAGMA user_version=10");db.close();await f.start();const state=await a('state');assert.equal(state.members[0].contact,'Original Zalo');assert.equal(state.issues[0].reported_on,'2026-08-15');assert.equal(state.issues[0].days_used,null);assert.equal(state.families[0].trial_date,'');assert.equal(readdirSync(f.dir).filter(n=>n.startsWith('before-v16-')).length,1);
 }finally{await f.close();}
});

test('customer API sorts deadlines and counts overdue/confirmed/partial renewals once, excluding paid renewal money',async()=>{
 const f=await fixture();try{
  const a=f.admin,current=(await a('state')).today,date=n=>new Date(Date.parse(current)+n*86400000).toISOString().slice(0,10),family=await a('families','POST',{name:'Queue',manager_email:'queue@example.com'},201),second=await a('families','POST',{name:'Queue2',manager_email:'queue2@example.com'},201);
  async function member(email,expires_at,family_id=family.id){return a('members','POST',{family_id,email,expires_at},201);}
  const unknown=await member('unknown@example.com',''),future=await member('confirmed@example.com',date(20)),due=await member('due@example.com',date(1)),overdue=await member('overdue@example.com',date(-1)),paid=await member('received@example.com',date(-2)),partial=await member('partial@example.com',date(10),second.id);
  await a('members/'+future.id+'/renewal','PATCH',{revision:0,status:'awaiting_payment'});await a('members/'+paid.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:current,apply_now:false});await a('members/'+partial.id+'/renewal','PATCH',{revision:0,status:'partial',amount:10000,paid_at:current});
  const state=await a('state');assert.deepEqual(state.members.map(m=>m.id),[paid.id,overdue.id,due.id,partial.id,future.id,unknown.id]);assert.equal(state.reminders.confirmed_pending,3);assert.equal(state.reminders.due_soon,1);assert.equal(state.reminders.renewal_paid_pending,1);
 }finally{await f.close();}
});

test('immediate archival rolls back the renewal and audit when saving the archive fails; legacy cancellations archive without affecting overdue customers',async()=>{
 const f=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Safe archive',manager_email:'safe@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'archive@example.com',contact:'FB preserved',expires_at:'2027-01-01'},201),overdue=await a('members','POST',{family_id:family.id,email:'overdue@example.com',expires_at:'2020-01-01'},201);
  await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'awaiting_payment'});const count=(await a('journal')).total;
  const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));const before=db.prepare('SELECT * FROM members WHERE id=?').get(member.id);db.exec("CREATE TRIGGER reject_archive BEFORE INSERT ON archived_customers BEGIN SELECT RAISE(ABORT,'Injected archive write failure'); END");
  await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'declined',note:'Customer cancelled'},500);assert.deepEqual(db.prepare('SELECT * FROM members WHERE id=?').get(member.id),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM archived_customers').get().n,0);assert.equal((await a('journal')).total,count);
  db.exec('DROP TRIGGER reject_archive');db.prepare("UPDATE members SET renewal_status='declined',declined_at='' WHERE id=?").run(member.id);db.close();await f.stop();await f.start();const state=await a('state');assert.equal(state.archives[0].member.contact,'FB preserved');assert.equal(state.members.length,1);assert.equal(state.members[0].id,overdue.id);assert.equal(state.reminders.confirmed_pending,1);
 }finally{await f.close();}
});

test('new purchases calculate expiry, archived customers and whole Families restore with history, issues and payment intact',async()=>{
 const f=await fixture(),target=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Family 48',manager_email:'manager@example.com',trial_date:'2026-10-02',note:'Family preserved'},201);
  const member=await a('members','POST',{family_id:family.id,email:'buyer@example.com',customer_name:'Khách',contact:'https://zalo.me/123',joined_at:'2024-01-31',plan_months:1,note:'Member note'},201);
  let state=await a('state');assert.equal(state.members[0].expires_at,'2024-02-29');
  await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',paid_at:'2024-03-10',amount:100000,plan_months:3,apply_now:true});
  const issue=await a('issues','POST',{family_id:family.id,target_type:'member',target_id:member.id,title:'Keep relationship'},201);
  await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'awaiting_payment',note:'Payment confirmed'});
  const deleted=await a('members/'+member.id,'DELETE');state=await a('state');assert.equal(state.members.length,0);assert.equal(state.archives[0].member.renewal_status,'awaiting_payment');assert.equal((await a('archives/'+deleted.archive_id+'/history')).history.length,1);
  const restored=await a('archives/'+deleted.archive_id+'/restore','POST',{family_id:family.id});state=await a('state');assert.equal(state.members[0].contact,'https://zalo.me/123');assert.equal(state.members[0].renewal_status,'awaiting_payment');assert.equal(state.issues[0].target_id,restored.member_id);assert.equal(state.issues[0].target_available,true);
  for(let i=0;i<5;i++)await a('members','POST',{family_id:family.id,email:`invite${i}@example.com`,membership_status:'invited'},201);
  const empty=await a('families','POST',{name:'Empty Family',manager_email:'empty@example.com'},201);await a('families/'+empty.id,'DELETE');
  await a('families/'+family.id,'DELETE');state=await a('state');assert.equal(state.families.length,0);assert.equal(state.archives.length,6);assert.equal(state.archived_families.length,2);assert.equal(state.issues[0].family_id,family.id);assert.equal(state.issues[0].target_available,false);
  await a('members','POST',{family_id:family.id,email:'inactive@example.com'},400);await a('families/'+family.id,'PATCH',{name:'Should not edit',manager_email:'manager@example.com'},404);await a('issues','POST',{family_id:family.id,title:'Inactive'},400);
  const product=await a('other-products','POST',{product:'Spotify',customer_name:'Khách phụ',contact:'https://facebook.com/example',joined_at:'2026-10-13',plan_months:3},201);state=await a('state');assert.equal(state.other_products[0].expires_at,'2027-01-13');assert.equal(state.other_products[0].plan_months,3);
  const backup=await a('backup');await target.admin('restore','POST',backup);await target.admin('archived-families/'+family.id+'/restore','POST',{});state=await target.admin('state');assert.equal(state.members.length,6);assert.equal(state.archives.length,0);assert.equal(state.archived_families.length,1);assert.equal(state.families[0].trial_date,'2026-10-02');assert.equal(state.members.find(m=>m.email==='buyer@example.com').renewal_status,'awaiting_payment');assert.equal(state.issues[0].id,issue.id);assert.equal(state.issues[0].target_available,true);assert.equal((await target.admin('members/'+state.issues[0].target_id+'/renewal-history')).history.length,1);
  await target.stop();await target.start();assert.equal((await target.admin('state')).members.length,6);
  await a('other-products/'+product.id,'PATCH',{product:'Spotify',customer_name:'Khách phụ',joined_at:'2026-10-13',plan_months:12,expires_at:'2028-01-01'});assert.equal((await a('state')).other_products[0].expires_at,'2028-01-01');
 }finally{await f.close();await target.close();}
});

test('Family archival is atomic when one customer cannot be archived; v11 migration and v3 backups keep existing manual dates',async()=>{
 const f=await fixture(),target=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Safe Family',manager_email:'safe@example.com'},201);await a('members','POST',{family_id:family.id,email:'one@example.com',joined_at:'2026-10-13',expires_at:'2027-02-01',plan_months:3},201);await a('members','POST',{family_id:family.id,email:'two@example.com'},201);
  const journalCount=(await a('journal')).total,db=new DatabaseSync(path.join(f.dir,'family.sqlite'));db.exec("CREATE TRIGGER reject_second BEFORE INSERT ON archived_customers WHEN NEW.email='two@example.com' BEGIN SELECT RAISE(ABORT,'Injected failure'); END");await a('families/'+family.id,'DELETE',undefined,500);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM members').get().n,2);assert.equal(db.prepare('SELECT archived_at FROM families').get().archived_at,'');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM archived_customers').get().n,0);assert.equal((await a('journal')).total,journalCount);db.exec('DROP TRIGGER reject_second');db.close();
  const old=await a('backup');old.version=3;for(const row of old.tables.families)delete row.archived_at;for(const row of old.tables.archived_customers)delete row.family_archive_id;for(const row of old.tables.other_purchases)delete row.plan_months;await target.admin('restore','POST',old);assert.equal((await target.admin('state')).members.find(m=>m.email==='one@example.com').expires_at,'2027-02-01');
  await f.stop();const oldDb=new DatabaseSync(path.join(f.dir,'family.sqlite'));oldDb.exec('ALTER TABLE families DROP COLUMN archived_at;ALTER TABLE archived_customers DROP COLUMN family_archive_id;ALTER TABLE other_purchases DROP COLUMN plan_months;PRAGMA user_version=11');oldDb.close();await f.start();const state=await a('state');assert.equal(state.members.length,2);assert.equal(state.members.find(m=>m.email==='one@example.com').expires_at,'2027-02-01');assert.equal(state.families[0].archived_at,'');assert.equal(readdirSync(f.dir).filter(n=>n.startsWith('before-v16-')).length,1);
 }finally{await f.close();await target.close();}
});

test('monthly statistics assign a late completed renewal to its old expiry month and preserve it across restart',async()=>{
 const f=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Renewal review',manager_email:'recent@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'late@example.com',contact:'Zalo recent',joined_at:'2026-08-10',expires_at:'2026-09-10',plan_months:1},201);
  await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'awaiting_payment',amount:0});assert.equal((await a('statistics?month=2026-09')).selected.renewals,0);
  await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'paid',amount:150000,paid_at:'2026-10-21',plan_months:3,apply_now:true});
  let stats=await a('statistics?month=2026-09');assert.equal(stats.selected.renewals,1);assert.equal(stats.selected.customers,1);assert.equal(stats.selected.amount,150000);const review=stats.rows[0];assert.equal(review.new_purchase_at,'2026-09-10');assert.equal(review.new_expires_at,'2026-12-10');assert.equal(review.paid_at,'2026-10-21');assert.equal((await a('statistics?month=2026-10')).selected.renewals,0);
  await a('members/'+member.id+'/renewal','PATCH',{revision:1,status:'paid',amount:150000,paid_at:'2026-10-21',plan_months:3,apply_now:true},409);
  const journal=(await a('journal')).total;await f.stop();await f.start();assert.equal((await a('statistics?month=2026-09')).selected.amount,150000);
  const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));db.prepare('UPDATE renewal_history SET created_at=?').run('2026-10-20T00:00:00Z');db.close();stats=await a('statistics?month=2026-09');assert.equal(stats.selected.renewals,1);assert.equal((await a('statistics?month=2026-10')).selected.renewals,0);assert.equal((await a('statistics?month=all')).rows.length,1);assert.equal((await a('state')).members[0].expires_at,'2026-12-10');assert.equal((await a('journal')).total,journal);
  await a('statistics?month=2026-13','GET',undefined,400);
 }finally{await f.close();}
});

test('archive deletion retains audit/history, protects active or restored customers and rejects stale reused archive IDs',async()=>{
 const f=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Archive delete',manager_email:'manager@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'gone@example.com',contact:'Original contact',expires_at:'2026-01-05'},201);
  await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2026-01-15',plan_months:3,apply_now:true});await a('members/'+member.id,'DELETE');let state=await a('state');const archived=state.archives[0],guard={expected_archived_at:archived.archived_at,expected_email:archived.email};
  const live=await a('members','POST',{family_id:family.id,email:'live@example.com',contact:'Active contact'},201);assert.equal(live.id,member.id);const count=(await a('journal')).total;
  await a('archives/'+archived.id,'DELETE',{},400);await a('archives/'+archived.id,'DELETE',{...guard,expected_email:'wrong@example.com'},409);assert.equal((await a('journal')).total,count);
  await a('archives/'+archived.id,'DELETE',guard);state=await a('state');assert.equal(state.archives.length,0);assert.equal(state.members[0].email,'live@example.com');assert.equal(state.members[0].contact,'Active contact');assert.equal((await a('statistics?month=all')).rows[0].archive_id,null);assert.equal((await a('statistics?month=all')).rows[0].member_id,null);
  const backup=await a('backup');assert.equal(backup.tables.renewal_history.length,1);assert.equal(backup.tables.renewal_history[0].archive_id,null);assert.equal(backup.tables.renewal_history[0].paid_at,'2026-01-15');
  const event=(await a('journal?search=gone@example.com')).entries.find(e=>e.action==='Xóa hồ sơ lưu trữ'),detail=await a('journal/audit/'+event.id),change=detail.changes.find(c=>c.table==='archived_customers');assert.equal(JSON.parse(change.before.snapshot).contact,'Original contact');assert.equal(change.after,null);
  await a('archives/'+archived.id,'DELETE',guard,404);await a('archives/'+archived.id+'/restore','POST',{family_id:family.id},404);
  await a('members/'+live.id,'DELETE');state=await a('state');const next=state.archives[0];assert.equal(next.id,archived.id);await a('archives/'+next.id,'DELETE',guard,409);await a('archives/'+next.id+'/restore','POST',{family_id:family.id});await a('archives/'+next.id,'DELETE',{expected_archived_at:next.archived_at,expected_email:next.email},409);assert.equal((await a('state')).members[0].contact,'Active contact');
  const second=await a('families','POST',{name:'Family archived',manager_email:'second@example.com'},201);await a('members','POST',{family_id:second.id,email:'remove@example.com'},201);await a('members','POST',{family_id:second.id,email:'keep@example.com'},201);await a('families/'+second.id,'DELETE');state=await a('state');const removed=state.archives.find(r=>r.email==='remove@example.com');await a('archives/'+removed.id,'DELETE',{expected_archived_at:removed.archived_at,expected_email:removed.email});assert.equal((await a('state')).archived_families[0].customers,1);await a('archived-families/'+second.id+'/restore','POST',{});state=await a('state');assert.ok(state.members.some(m=>m.email==='keep@example.com'));assert.ok(!state.members.some(m=>m.email==='remove@example.com'));
 }finally{await f.close();}
});

test('archive deletion is atomic when profile deletion fails after unlinking history',async()=>{
 const f=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Safe',manager_email:'safe@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'safe@example.com.test',expires_at:'2026-01-05'},201);await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2026-01-15',plan_months:3,apply_now:true});await a('members/'+member.id,'DELETE');const row=(await a('state')).archives[0],count=(await a('journal')).total,db=new DatabaseSync(path.join(f.dir,'family.sqlite')),before=db.prepare('SELECT * FROM renewal_history').get();
  db.exec("CREATE TRIGGER reject_archive_delete BEFORE DELETE ON archived_customers BEGIN SELECT RAISE(ABORT,'Injected delete failure'); END");await a('archives/'+row.id,'DELETE',{expected_archived_at:row.archived_at,expected_email:row.email},500);assert.deepEqual(db.prepare('SELECT * FROM renewal_history').get(),before);assert.equal((await a('state')).archives.length,1);assert.equal((await a('journal')).total,count);db.exec('DROP TRIGGER reject_archive_delete');db.close();
 }finally{await f.close();}
});

test('other-product deletion archives the full purchase, restores exact data after backup and never touches a same-ID Family customer/history',async()=>{
 const f=await fixture(),target=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Family',manager_email:'family@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'member@example.com',contact:'Family contact',expires_at:'2026-01-05'},201);await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2026-01-15',plan_months:3,apply_now:true});
  const p=await a('other-products','POST',{product:'Netflix',customer_name:'Standalone buyer',email:'',contact:'https://zalo.me/example\nContact note',joined_at:'2026-10-13',expires_at:'2027-11-13',plan_months:13,payment_status:'partial',amount:50000,note:'Purchase note'},201);assert.equal(p.id,member.id);let row=(await a('state')).other_products[0];await a('other-products/'+p.id,'PATCH',{...row,expires_at:''});row=(await a('state')).other_products[0];const {expiry_status,days_left,...saved}=row;
  const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));db.exec("CREATE TRIGGER reject_product_archive BEFORE INSERT ON archived_customers BEGIN SELECT RAISE(ABORT,'Injected archive failure'); END");const count=(await a('journal')).total;await a('other-products/'+p.id,'DELETE',undefined,500);assert.equal((await a('state')).other_products.length,1);assert.equal((await a('journal')).total,count);db.exec('DROP TRIGGER reject_product_archive');db.close();
  await a('other-products/'+p.id,'DELETE');let state=await a('state');assert.equal(state.other_products.length,0);assert.equal(state.members[0].contact,'Family contact');const archive=state.archives[0];assert.equal(archive.record_type,'other_product');assert.deepEqual(archive.member,{...saved,record_type:'other_product'});const backup=await a('backup');assert.equal(backup.version,9);assert.equal(backup.tables.renewal_history[0].member_id,member.id);assert.equal(backup.tables.renewal_history[0].archive_id,null);
  await target.admin('restore','POST',backup);const active=await target.admin('other-products','POST',{product:'Spotify',customer_name:'Active purchase'},201);const restored=await target.admin('archives/'+archive.id+'/restore','POST',{});state=await target.admin('state');const product=state.other_products.find(r=>r.id===restored.product_id);assert.deepEqual(Object.fromEntries(Object.keys(saved).map(k=>[k,product[k]])),{...saved,id:restored.product_id});assert.equal(product.expires_at,'');assert.equal(state.other_products.find(r=>r.id===active.id).product,'Spotify');assert.equal(state.members[0].email,'member@example.com');assert.equal(state.archives.length,0);await target.admin('archives/'+archive.id+'/restore','POST',{},409);
  const legacy=structuredClone(backup);legacy.version=4;legacy.tables.archived_customers=[];const empty=await fixture();try{await empty.admin('restore','POST',legacy);assert.equal((await empty.admin('state')).members[0].email,'member@example.com');}finally{await empty.close();}
  await a('archives/'+archive.id,'DELETE',{expected_archived_at:archive.archived_at,expected_email:archive.email});assert.equal((await a('state')).archives.length,0);assert.equal((await a('members/'+member.id+'/renewal-history')).history.length,1);
 }finally{await f.close();await target.close();}
});

test('Family permits one open incident across all mails, concurrent reports and Done reopening',async()=>{
 const f=await fixture();try{const a=f.admin,raceCookie='';

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
  await f.stop();await f.start();
  state=await a('state');assert.equal(state.issues.filter(i=>i.family_id===family.id&&i.status!=='done').length,1);assert.equal(state.families.find(i=>i.id===family.id).manager_email,'once@example.com');assert.equal(state.members.find(i=>i.id===member.id).email,'guest-once@example.com');
 }finally{await f.close();}
});

test('Previously duplicated open cases remain visible and fixable without deleting legacy data',async()=>{
 const f=await fixture();try{const a=f.admin;

 const family=await a('families','POST',{name:'Legacy open cases',manager_email:'legacy-once@example.com'},201);
 const original=await a('issues','POST',{family_id:family.id,title:'Original case'},201);
 const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));try{db.exec("INSERT INTO issues(family_id,family_name,target_type,target_id,subject_email,original_email,title,note,created_at,updated_at,trial_date,reported_on) SELECT family_id,family_name,target_type,target_id,subject_email,original_email,'Legacy duplicate',note,created_at,updated_at,trial_date,reported_on FROM issues WHERE id="+original.id);}finally{db.close();}
 let state=await a('state');assert.equal(state.issues.length,2);assert.equal(state.issues.filter(i=>i.status==='todo').length,2);
 await a('issues','POST',{family_id:family.id,title:'No third duplicate'},409);
 const legacy=state.issues.find(i=>i.id!==original.id);
 await a('issues/'+legacy.id,'PATCH',{status:'doing',revision:0,title:'Legacy case still editable'});
 await a('issues/'+original.id,'PATCH',{status:'done',revision:0,resolution:'keep'});
 await a('issues','POST',{family_id:family.id,title:'Still occupied'},409);
 await a('issues/'+legacy.id,'PATCH',{status:'done',revision:1,resolution:'keep'});
 state=await a('state');assert.equal(state.issues.length,2);assert.ok(state.issues.every(i=>i.status==='done'));
 await a('issues','POST',{family_id:family.id,title:'New problem'},201);assert.equal((await a('state')).issues.length,3);
 }finally{await f.close();}
});

const transferFamily=async(a,data)=>{const created=await a('families','POST',data,201);return (await a('state')).families.find(f=>f.id===created.id);};
const transferPayload=(m,f)=>({family_id:f.id,expected_manager_email:f.manager_email,expected_family_id:m.family_id,expected_email:m.email,revision:m.renewal_revision});

test('Node transfers preserve the full member, historical periods and audit while deleting the customer cases with full audit',async()=>{
 const f=await fixture();try{const a=f.admin;

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
 await f.stop();await f.start();
 state=await a('state');assert.equal(state.members.find(m=>m.id===member.id).family_id,target.id);assert.equal(state.issues.some(i=>i.id===open.id),false);
 const copy=await fixture();try{await copy.admin('restore','POST',await a('backup'));const restored=await copy.admin('state');assert.equal(restored.members.find(m=>m.id===member.id).family_id,target.id);assert.equal(restored.issues.some(i=>i.id===open.id),false);assert.deepEqual(await copy.admin('members/'+member.id+'/renewal-history'),history);}finally{await copy.close();}

 }finally{await f.close();}
});

test('Node transfers reject stale/duplicate/archived/owner destinations and accept full or oversized Families',async()=>{
 const f=await fixture();try{const a=f.admin;

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


 }finally{await f.close();}
});

test('Node transfers roll back member/case writes and serialize competing moves while accepting concurrent arrivals above five',async()=>{
 const f=await fixture();try{const a=f.admin;

 const source=await transferFamily(a,{name:'From',manager_email:'from@example.com'}),target=await transferFamily(a,{name:'To',manager_email:'to@example.com'}),alternative=await transferFamily(a,{name:'Alternative',manager_email:'alt@example.com'});
 const member=await a('members','POST',{family_id:source.id,email:'case-member@example.com',contact:'Keep me'},201),incident=await a('issues','POST',{family_id:source.id,target_type:'member',target_id:member.id,title:'Must follow'},201),destinationCase=await a('issues','POST',{family_id:target.id,title:'Destination already open'},201);
 let profile=(await a('state')).members.find(m=>m.id===member.id),guard=transferPayload(profile,target),count=(await a('journal')).total;

 const raw=new DatabaseSync(path.join(f.dir,'family.sqlite'));try{raw.exec("INSERT INTO issues(family_id,family_name,target_type,target_id,subject_email,original_email,title,note,created_at,updated_at,trial_date,reported_on) SELECT family_id,family_name,target_type,target_id,subject_email,original_email,'Legacy duplicate',note,created_at,updated_at,trial_date,reported_on FROM issues WHERE id="+incident.id);}finally{raw.close();}
 let state=await a('state');const duplicate=state.issues.find(i=>i.family_id===source.id&&i.id!==incident.id);assert.ok(duplicate);
 count=(await a('journal')).total;
 const fault=new DatabaseSync(path.join(f.dir,'family.sqlite'));try{fault.exec("CREATE TRIGGER reject_transfer_case BEFORE DELETE ON issues BEGIN SELECT RAISE(ABORT, 'Injected transfer failure'); END");}finally{fault.close();}
 await a('members/'+member.id+'/transfer','POST',guard,500);state=await a('state');assert.equal(state.members.find(m=>m.id===member.id).family_id,source.id);assert.equal(state.issues.find(i=>i.id===incident.id).family_id,source.id);assert.equal((await a('journal')).total,count);
 const clear=new DatabaseSync(path.join(f.dir,'family.sqlite'));try{clear.exec('DROP TRIGGER reject_transfer_case');}finally{clear.close();}
 const raceCookie='';
 const race=async(id,payload)=>fetch(f.base+'/api/members/'+id+'/transfer',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1',Cookie:raceCookie},body:JSON.stringify(payload)});
 const results=await Promise.all([race(member.id,guard),race(member.id,transferPayload(profile,alternative))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);state=await a('state');const moved=state.members.find(m=>m.id===member.id);assert.ok([target.id,alternative.id].includes(moved.family_id));assert.equal(state.issues.some(i=>i.id===incident.id||i.id===duplicate.id),false);assert.equal(state.issues.find(i=>i.id===destinationCase.id).family_id,target.id);assert.equal(state.issues.find(i=>i.id===destinationCase.id).status,'todo');assert.equal((await a('journal')).total,count+1);
 const last=await transferFamily(a,{name:'Last slot',manager_email:'last@example.com'});for(const n of [1,2,3,4])await a('members','POST',{family_id:last.id,email:'existing'+n+'@example.com'},201);
 const first=await a('members','POST',{family_id:source.id,email:'first@example.com'},201),second=await a('members','POST',{family_id:source.id,email:'second@example.com'},201);state=await a('state');const firstProfile=state.members.find(m=>m.id===first.id),secondProfile=state.members.find(m=>m.id===second.id);count=(await a('journal')).total;
 const lastResults=await Promise.all([race(first.id,transferPayload(firstProfile,last)),race(second.id,transferPayload(secondProfile,last))]);assert.deepEqual(lastResults.map(r=>r.status).sort(),[200,200]);state=await a('state');assert.equal(state.members.filter(m=>m.family_id===last.id).length,6);assert.equal(state.members.filter(m=>[first.id,second.id].includes(m.id)&&m.family_id===source.id).length,0);assert.equal((await a('journal')).total,count+2);

 }finally{await f.close();}
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

test('Node vault enforces separate access, encrypts credentials and backups, revokes locks/expiry and restores keys',async()=>{
 const f=await fixture();try{const a=f.admin;

 const client=await vaultTestClient(()=>f.base,undefined),v=client.request,privatePassword='Vault-test-password',seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',secretPassword=' Account-Pass ! ';
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
 {const changed=new DatabaseSync(path.join(f.dir,'family.sqlite'));try{changed.exec("UPDATE vault_sessions SET expires_at=0");}finally{changed.close();}}
 await v('vault/items','GET',undefined,423);await v('vault/unlock','POST',{password:privatePassword});await v('vault/lock','POST',{});
 await f.stop();await f.start();
 await v('vault/unlock','POST',{password:privatePassword});assert.equal((await v('vault/items/'+item.id)).password,secretPassword);
 const target=await fixture();try{await target.admin('restore','POST',backup);const other=await vaultTestClient(()=>target.base);assert.equal((await other.request('vault/status')).unlocked,false);await other.request('vault/unlock','POST',{password:privatePassword});assert.equal((await other.request('vault/items/'+item.id)).password,secretPassword);assert.equal((await other.request('vault/items')).items[0].totp_key,seed);}finally{await target.close();}

 }finally{await f.close();}
});

test('Node vault updates/rekeys atomically, rejects duplicate/stale/invalid entries and keeps secrets out of journal',async()=>{
 const f=await fixture();try{const a=f.admin;

 const client=await vaultTestClient(()=>f.base,undefined),v=client.request,p1='Original-vault-password',p2='New-vault-password';await v('vault/setup','POST',{password:p1,confirm_password:p1});
 const fields={email:'first-secret@example.com',password:'Credential preserved',totp:'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',recovery_email:'',label:'Private'},item=await v('vault/items','POST',fields),detail=await v('vault/items/'+item.id);let count=(await a('journal')).total;
 await v('vault/items','POST',{...fields,email:'invalid-key@example.com',totp:'JBSWY3DPEHPK3PX8'},400);await v('vault/items','POST',fields,409);await v('vault/items/'+item.id,'PATCH',{...fields,revision:99,expected_created_at:detail.created_at},409);await v('vault/items/'+item.id,'DELETE',{revision:0,expected_created_at:'wrong'},409);assert.equal((await a('journal')).total,count);
 await v('vault/items/'+item.id,'PATCH',{...fields,recovery_email:'new-recovery@example.com',revision:detail.revision,expected_created_at:detail.created_at});assert.equal((await v('vault/items/'+item.id)).recovery_email,'new-recovery@example.com');
 {const changed=new DatabaseSync(path.join(f.dir,'family.sqlite'));try{changed.exec("CREATE TRIGGER reject_vault_item BEFORE UPDATE ON vault_items BEGIN SELECT RAISE(ABORT, 'Injected vault failure'); END");}finally{changed.close();}}
 count=(await a('journal')).total;await v('vault/items','POST',{...fields,email:'failed-write@example.com'},500);assert.equal((await v('vault/items')).items.length,1);assert.equal((await a('journal')).total,count);
 {const changed=new DatabaseSync(path.join(f.dir,'family.sqlite'));try{changed.exec("DROP TRIGGER reject_vault_item");}finally{changed.close();}}
 const before=await a('backup');
 {const changed=new DatabaseSync(path.join(f.dir,'family.sqlite'));try{changed.exec("CREATE TRIGGER reject_vault_meta BEFORE UPDATE ON vault_meta BEGIN SELECT RAISE(ABORT, 'Injected rekey failure'); END");}finally{changed.close();}}
 count=(await a('journal')).total;await v('vault/password','POST',{current_password:p1,password:p2,confirm_password:p2},500);assert.equal((await a('journal')).total,count);assert.deepEqual((await a('backup')).tables.vault_meta,before.tables.vault_meta);
 {const changed=new DatabaseSync(path.join(f.dir,'family.sqlite'));try{changed.exec("DROP TRIGGER reject_vault_meta");}finally{changed.close();}}
 const oldCookie=client.cookie();await v('vault/password','POST',{current_password:p1,password:p2,confirm_password:p2});assert.deepEqual((await a('backup')).tables.vault_items,before.tables.vault_items);assert.notDeepEqual((await a('backup')).tables.vault_meta,before.tables.vault_meta);await v('vault/items','GET',undefined,423,{Cookie:oldCookie});
 await v('vault/lock','POST',{});await v('vault/unlock','POST',{password:p1},403);await v('vault/unlock','POST',{password:p2});assert.equal((await v('vault/items/'+item.id)).password,fields.password);
 const current=await v('vault/items/'+item.id);await v('vault/items/'+item.id,'DELETE',{revision:current.revision,expected_created_at:current.created_at});assert.equal((await v('vault/items')).items.length,0);for(const secret of [p1,p2,fields.password,fields.totp,fields.email,'new-recovery@example.com'])assert.equal(JSON.stringify(await a('journal')).includes(secret),false);

 }finally{await f.close();}
});

test('Node vault limits wrong-password guesses and rejects malformed encrypted backups without plaintext insertion',async()=>{
 const f=await fixture();try{const a=f.admin;

 const client=await vaultTestClient(()=>f.base,undefined),v=client.request,passwordForVault='Vault-throttle-test';await v('vault/setup','POST',{password:passwordForVault,confirm_password:passwordForVault});await v('vault/lock','POST',{});
 for(let i=0;i<10;i++)await v('vault/unlock','POST',{password:'incorrect-'+i},403);await v('vault/unlock','POST',{password:passwordForVault},429);assert.equal((await v('vault/status')).unlocked,false);await v('vault/items','GET',undefined,423);
 const target=await fixture();try{const invalid=await a('backup');const config=JSON.parse(invalid.tables.vault_meta[0].value);config.iterations=2000000000;invalid.tables.vault_meta[0].value=JSON.stringify(config);await target.admin('restore','POST',invalid,400);assert.equal((await target.admin('state')).members.length,0);assert.equal((await target.admin('backup')).tables.vault_meta.length,0);const lowered=await a('backup');lowered.version=5;await target.admin('restore','POST',lowered,400);}finally{await target.close();}

 }finally{await f.close();}
});

test('Node vault bulk preview is private/read-only and import is atomic with duplicate/invalid/stale rejection',async()=>{
 const f=await fixture();try{const a=f.admin,client=await vaultTestClient(()=>f.base),v=client.request;

 const privatePassword='Bulk-vault-password',seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';await v('vault/import/preview','POST',{items:[]},423);await v('vault/setup','POST',{password:privatePassword,confirm_password:privatePassword});
 const items=[{line:2,email:' BULK-FIRST@EXAMPLE.COM ',password:'  Keep spaces!  ',totp:seed.toLowerCase().match(/.{1,4}/g).join(' '),label:'Family bulk',note:'Private bulk note\nSecond line',recovery_email:'recovery-bulk@example.com'},{line:3,email:'bulk-second@example.com',password:'',totp:'',label:'',note:'',recovery_email:''}];
 let count=(await a('journal')).total;const before=await a('backup'),preview=await v('vault/import/preview','POST',{items});assert.equal(preview.count,2);assert.equal(preview.items[0].email,'bulk-first@example.com');assert.equal(preview.items[0].has_totp,true);assert.equal('password' in preview.items[0],false);assert.equal('totp' in preview.items[0],false);assert.deepEqual((await a('backup')).tables,before.tables);assert.equal((await a('journal')).total,count);
 for(const endpoint of ['vault/import/preview','vault/import']){assert.match((await v(endpoint,'POST',{items:[items[0],{...items[1],email:items[0].email}]},409)).error,/Dòng 3/);assert.match((await v(endpoint,'POST',{items:[items[0],{...items[1],totp:'JBSWY3DPEHPK3PX8'}]},400)).error,/Dòng 3/);await v(endpoint,'POST',{items:[items[0],null]},400);await v(endpoint,'POST',{items:Array(501).fill(items[0])},400);}
 assert.equal((await v('vault/items')).items.length,0);assert.equal((await a('journal')).total,count);
 const imported=await v('vault/import','POST',{items});assert.equal(imported.count,2);assert.equal(new Set(imported.ids).size,2);assert.equal((await v('vault/items/'+imported.ids[0])).password,items[0].password);assert.equal((await v('vault/items/'+imported.ids[0])).note,items[0].note);assert.equal((await v('vault/items')).items.find(i=>i.id===imported.ids[0]).totp_key,seed);assert.equal((await a('state')).families.length,0);assert.equal((await a('state')).members.length,0);assert.equal((await a('journal')).total,count+1);
 await v('vault/import','POST',{items},409);assert.equal((await v('vault/items')).items.length,2);assert.equal((await a('journal')).total,count+1);
 const raw=JSON.stringify({backup:await a('backup'),journal:await a('journal'),state:await a('state')});for(const value of [privatePassword,seed,items[0].email.trim().toLowerCase(),items[0].password,items[0].note,items[0].recovery_email])assert.equal(raw.includes(value),false);
 const more=[{...items[0],email:'bulk-third@example.com'},{...items[1],email:'bulk-fourth@example.com'}];

 const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));db.exec("CREATE TRIGGER reject_second_bulk BEFORE UPDATE ON vault_items WHEN NEW.id=(SELECT MAX(id) FROM vault_items) AND (SELECT COUNT(*) FROM vault_items)>=4 BEGIN SELECT RAISE(ABORT,'Injected second bulk failure'); END;");count=(await a('journal')).total;await v('vault/import','POST',{items:more},500);assert.equal((await v('vault/items')).items.length,2);assert.equal((await a('journal')).total,count);db.exec('DROP TRIGGER reject_second_bulk');db.close();assert.equal((await v('vault/import','POST',{items:more})).count,2);await v('vault/lock','POST',{});await v('vault/import','POST',{items:more},423);
 }finally{await f.close();}
});


test('Node linked vault synchronizes owner mail in both directions with audit and atomic rollback',async()=>{const f=await fixture();try{const a=f.admin,client=await vaultTestClient(()=>f.base),v=client.request;

 const fa=await a('families','POST',{name:'Family 48',manager_email:'linked-a@example.com',trial_date:'2026-10-01'},201),fb=await a('families','POST',{name:'Family 47',manager_email:'linked-b@example.com',trial_date:'2026-10-02'},201);await a('members','POST',{family_id:fa.id,email:'linked-guest@example.com',contact:'Keep public contact'},201);await v('vault/setup','POST',{password:'1234',confirm_password:'1234'},400);await v('vault/setup','POST',{password:'12345',confirm_password:'12345'});
 const seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',fields={email:'linked-a@example.com',password:'Linked-private-password',totp:seed,label:'Private label',note:'Private linked Note',recovery_email:''},first=await v('vault/items','POST',{...fields,expected_family_id:fa.id,expected_manager_email:fields.email}),raw=(await a('backup')).tables.vault_items[0];assert.equal(raw.family_id,fa.id);await v('vault/lock','POST',{});await a('families/'+fa.id,'PATCH',{name:'Family renamed',manager_email:'linked-a2@example.com',trial_date:'2026-10-12'});await v('vault/unlock','POST',{password:'12345'});let detail=await v('vault/items/'+first.id);assert.equal(detail.email,'linked-a@example.com');assert.equal(detail.family_id,null);assert.equal((await a('backup')).tables.vault_items[0].payload,raw.payload);assert.equal((await v('vault/items')).items.some(item=>item.family_id===fa.id),false);await v('vault/items/'+first.id,'PATCH',{...fields,email:'linked-a2@example.com',revision:detail.revision,expected_created_at:detail.created_at,expected_family_id:fa.id,expected_manager_email:'linked-a2@example.com'});await v('vault/items');detail=await v('vault/items/'+first.id);assert.equal(detail.email,'linked-a2@example.com');assert.equal(detail.password,fields.password);assert.equal(detail.family_id,fa.id);assert.equal(detail.note,fields.note);assert.ok((await a('journal')).entries.some(e=>e.message.includes('linked-a@example.com')&&e.message.includes('linked-a2@example.com')));
 const edit={...fields,email:'linked-a3@example.com',revision:detail.revision,expected_created_at:detail.created_at,expected_family_id:fa.id,expected_manager_email:detail.email};const updated=await v('vault/items/'+first.id,'PATCH',edit);assert.equal(updated.owner_changed,true);assert.equal((await a('state')).families.find(f=>f.id===fa.id).manager_email,'linked-a3@example.com');detail=await v('vault/items/'+first.id);assert.equal(detail.email,'linked-a3@example.com');assert.equal(detail.password,fields.password);assert.equal(detail.totp,seed);assert.ok((await a('journal')).entries.some(e=>e.message.includes('linked-a2@example.com')&&e.message.includes('linked-a3@example.com')&&e.message.includes('Kho tài khoản')));
 let count=(await a('journal')).total;const stable={...edit,revision:detail.revision,expected_created_at:detail.created_at,expected_manager_email:detail.email};for(const address of ['linked-b@example.com','linked-guest@example.com'])await v('vault/items/'+first.id,'PATCH',{...stable,email:address},409);await v('vault/items/'+first.id,'PATCH',{...stable,expected_manager_email:'linked-a2@example.com'},409);assert.equal((await a('journal')).total,count);assert.equal((await v('vault/items/'+first.id)).email,'linked-a3@example.com');
 const batch={family_only:true,items:[{...fields,email:'linked-b@example.com',line:2,label:'Wrong sheet label'}]};const preview=await v('vault/import/preview','POST',batch);assert.equal(preview.items[0].trial_date,'2026-10-02');for(const endpoint of ['vault/import/preview','vault/import'])assert.match((await v(endpoint,'POST',{...batch,items:[...batch.items,{...fields,email:'unknown@example.com',line:3}]},400)).error,/Dòng 3/);assert.equal((await v('vault/items')).items.length,1);await v('vault/import','POST',batch);assert.equal((await v('vault/items')).items.length,2);
const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));db.exec("CREATE TRIGGER fail_linked_vault BEFORE UPDATE ON vault_items BEGIN SELECT RAISE(ABORT,'Injected write failure'); END;");

 const beforeFailure=await a('backup');count=(await a('journal')).total;await v('vault/items/'+first.id,'PATCH',{...stable,email:'failed-new@example.com'},500);assert.deepEqual((await a('backup')).tables,beforeFailure.tables);assert.equal((await a('journal')).total,count);
db.exec('DROP TRIGGER fail_linked_vault');db.close();await v('vault/password','POST',{current_password:'12345',password:'54321',confirm_password:'54321'});await v('vault/lock','POST',{});await v('vault/unlock','POST',{password:'54321'});assert.equal((await v('vault/items')).items.length,2);assert.equal((await a('state')).members[0].contact,'Keep public contact');
}finally{await f.close();}});

test('Node vault bulk update previews changes, keeps unselected/blank fields, rejects stale writes and rolls back mixed batches',async()=>{const f=await fixture();try{const a=f.admin,client=await vaultTestClient(()=>f.base),v=client.request;

 const fa=await a('families','POST',{name:'Family A',manager_email:'upsert-a@example.com'},201),fb=await a('families','POST',{name:'Family B',manager_email:'upsert-b@example.com'},201),fc=await a('families','POST',{name:'Family C',manager_email:'upsert-c@example.com'},201);await v('vault/setup','POST',{password:'12345',confirm_password:'12345'});const seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',newSeed='JBSWY3DPEHPK3PXP',first=await v('vault/items','POST',{email:'upsert-a@example.com',password:'Old private credential',totp:seed,recovery_email:'private-recovery@example.com',note:'Private Note preserved',label:'Private label'}),old=await v('vault/items/'+first.id);
 const options={family_only:true,update_existing:true,keep_empty:true,preserve_fields:['recovery_email','note','label']},rows=[{line:2,email:'upsert-a@example.com',password:'  New private credential  ',totp:newSeed,recovery_email:'',note:'',label:''},{line:3,email:'upsert-b@example.com',password:'New B private credential',totp:'',recovery_email:'',note:'',label:''}],request={...options,items:rows};
 const plan=async(payload)=>{const preview=await v('vault/import/preview','POST',payload);return {preview,commit:{...payload,items:payload.items.map((row,i)=>({...row,expected_id:preview.items[i].expected_id,expected_revision:preview.items[i].expected_revision,expected_created_at:preview.items[i].expected_created_at,expected_family_id:preview.items[i].expected_family_id}))}};};
 let before=await a('backup'),count=(await a('journal')).total,p=await plan(request);assert.equal(p.preview.updated,1);assert.equal(p.preview.created,1);assert.equal(p.preview.items[0].action,'update');assert.equal(p.preview.items[1].action,'create');assert.equal(p.preview.items[0].expected_id,first.id);assert.equal(p.preview.items[0].note,old.note);for(const value of [seed,newSeed,rows[0].password])assert.equal(JSON.stringify(p.preview).includes(value),false);assert.deepEqual((await a('backup')).tables,before.tables);assert.equal((await a('journal')).total,count);
 await v('vault/import','POST',request,409);await v('vault/import','POST',{...p.commit,items:p.commit.items.map((r,i)=>i===0?{...r,expected_revision:999}:r)},409);await v('vault/import/preview','POST',{...request,items:[rows[0],{...rows[1],email:rows[0].email}]},409);await v('vault/import/preview','POST',{...request,items:[rows[0],{...rows[1],totp:'JBSWY3DPEHPK3PX8'}]},400);assert.deepEqual((await a('backup')).tables,before.tables);
 await v('vault/items/'+first.id,'PATCH',{...old,totp:seed,note:'Concurrent private Note',revision:old.revision,expected_created_at:old.created_at});before=await a('backup');await v('vault/import','POST',p.commit,409);assert.deepEqual((await a('backup')).tables,before.tables);p=await plan(request);count=(await a('journal')).total;const committed=await v('vault/import','POST',p.commit);assert.deepEqual([committed.created,committed.updated],[1,1]);assert.equal(committed.ids[0],first.id);let current=await v('vault/items/'+first.id);assert.equal(current.password,rows[0].password);assert.equal(current.totp,newSeed);assert.equal(current.note,'Concurrent private Note');assert.equal(current.recovery_email,old.recovery_email);assert.equal(current.family_id,fa.id);assert.equal((await a('journal')).total,count+1);await v('vault/import','POST',p.commit,409);assert.equal((await a('journal')).total,count+1);
 const blanks={...options,items:[{...rows[0],password:'',totp:''}]};p=await plan(blanks);await v('vault/import','POST',p.commit);current=await v('vault/items/'+first.id);assert.equal(current.password,rows[0].password);assert.equal(current.totp,newSeed);p=await plan({...blanks,keep_empty:false});await v('vault/import','POST',p.commit);current=await v('vault/items/'+first.id);assert.equal(current.password,'');assert.equal(current.totp,'');assert.equal(current.note,'Concurrent private Note');
 const rollback={...options,items:[{...rows[0],password:'Rollback-only credential'},{...rows[1],email:'upsert-c@example.com'}]};p=await plan(rollback);before=await a('backup');
const db=new DatabaseSync(path.join(f.dir,'family.sqlite'));db.exec("CREATE TRIGGER fail_batch_insert BEFORE INSERT ON vault_items BEGIN SELECT RAISE(ABORT,'Injected batch failure'); END;");

 await v('vault/import','POST',p.commit,500);assert.deepEqual((await a('backup')).tables,before.tables);
db.exec('DROP TRIGGER fail_batch_insert');db.close();}finally{await f.close();}
});


test('Node issue replacement clears only the owner vault while locked, rolls back failures and allows fresh Sheet credentials',async()=>{const f=await fixture();try{const a=f.admin,client=await vaultTestClient(()=>f.base),v=client.request;

 const fa=await a('families','POST',{name:'Reset Family',manager_email:'reset-owner@example.com',trial_date:'2026-08-10'},201),fb=await a('families','POST',{name:'Keep Family',manager_email:'keep-owner@example.com',trial_date:'2026-09-01'},201),member=await a('members','POST',{family_id:fa.id,email:'guest@example.com',contact:'Original customer contact'},201);
 await v('vault/setup','POST',{password:'12345',confirm_password:'12345'});const seed='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',oldFields={email:'reset-owner@example.com',password:' Old fake password ',totp:seed,recovery_email:'old-recovery@example.com',note:'Old private Note',label:'Old private label'},first=await v('vault/items','POST',oldFields),second=await v('vault/items','POST',{...oldFields,email:'keep-owner@example.com',password:'Other fake password',note:'Other private Note'}),old=await v('vault/items/'+first.id),initialRows=(await a('backup')).tables.vault_items;
 const options={family_only:true,update_existing:true,keep_empty:true,preserve_fields:['recovery_email','note','label']},sheetRow={email:'reset-owner@example.com',password:'New fake Sheet password',totp:'JBSWY3DPEHPK3PXP',recovery_email:'',note:'',label:''},preview=await v('vault/import/preview','POST',{...options,items:[sheetRow]}),proof=p=>({expected_id:p.expected_id,expected_revision:p.expected_revision,expected_created_at:p.expected_created_at,expected_family_id:p.expected_family_id});
 await v('vault/lock','POST',{});
 const keep=await a('issues','POST',{family_id:fa.id,title:'Keep original'},201);await a('issues/'+keep.id,'PATCH',{status:'done',revision:0,resolution:'keep'});assert.deepEqual((await a('backup')).tables.vault_items,initialRows);assert.equal((await a('state')).families.find(x=>x.id===fa.id).trial_date,'2026-08-10');
 await a('issues','POST',{family_id:fb.id,title:'Existing case prevents reusing this Family'},201);
 const incident=await a('issues','POST',{family_id:fa.id,title:'Replace owner and clear old secrets'},201),completion={status:'done',revision:0,resolution:'replace',replacement_email:'new-owner@example.com'},before=await a('backup');
 const fault=new DatabaseSync(path.join(f.dir,'family.sqlite'));fault.exec("CREATE TRIGGER reject_vault_reset BEFORE UPDATE ON issues BEGIN SELECT RAISE(ABORT, 'Injected completion failure'); END");
 await a('issues/'+incident.id,'PATCH',completion,500);assert.deepEqual((await a('backup')).tables,before.tables);
 fault.exec('DROP TRIGGER reject_vault_reset');fault.close();
 await a('issues/'+incident.id,'PATCH',{...completion,replacement_email:'keep-owner@example.com'},409);assert.deepEqual((await a('backup')).tables,before.tables);
 await a('issues/'+incident.id,'PATCH',completion);let state=await a('state'),remaining=(await a('backup')).tables.vault_items;assert.equal(state.families.find(x=>x.id===fa.id).manager_email,'new-owner@example.com');assert.equal(state.families.find(x=>x.id===fa.id).trial_date,state.today);assert.equal(remaining.some(r=>r.family_id===fa.id),false);assert.deepEqual(remaining,[initialRows.find(r=>r.id===second.id)]);assert.equal((await v('vault/status')).unlocked,false);assert.equal(state.members[0].contact,'Original customer contact');assert.ok(state.issues.find(i=>i.id===incident.id).resolution_note.includes('Đã để trống thông tin Kho'));
 const journal=JSON.stringify(await a('journal'));for(const value of [oldFields.password,seed,oldFields.recovery_email,oldFields.note,oldFields.label])assert.equal(journal.includes(value),false,'Journal leaked removed credential content');
 await v('vault/unlock','POST',{password:'12345'});await v('vault/items/'+first.id,'GET',undefined,404);assert.equal((await v('vault/items')).items.some(i=>i.family_id===fa.id),false);await v('vault/items/'+first.id,'PATCH',{...old,expected_family_id:fa.id,expected_manager_email:'new-owner@example.com'},404);
 await v('vault/import','POST',{...options,items:[{...sheetRow,email:'new-owner@example.com',...proof(preview.items[0])}]},409);assert.equal((await a('backup')).tables.vault_items.length,1);
 const request={...options,items:[{...sheetRow,email:'new-owner@example.com'}]},fresh=await v('vault/import/preview','POST',request);assert.equal(fresh.created,1);assert.equal(fresh.updated,0);const imported=await v('vault/import','POST',{...request,items:[{...request.items[0],...proof(fresh.items[0])}]}),detail=await v('vault/items/'+imported.ids[0]);assert.equal(detail.email,'new-owner@example.com');assert.equal(detail.password,sheetRow.password);assert.equal(detail.totp,sheetRow.totp);assert.equal(detail.recovery_email,'');assert.equal(detail.note,'');assert.equal(detail.label,'');assert.equal(detail.family_id,fa.id);
 const currentRows=(await a('backup')).tables.vault_items;await a('issues/'+incident.id,'PATCH',{status:'done',revision:1,note:'Edited completed case'});assert.deepEqual((await a('backup')).tables.vault_items,currentRows);
 const memberCase=await a('issues','POST',{family_id:fa.id,target_type:'member',target_id:member.id,title:'Member replacement'},201);await a('issues/'+memberCase.id,'PATCH',{status:'done',revision:0,resolution:'replace',replacement_email:'new-guest@example.com'});assert.deepEqual((await a('backup')).tables.vault_items,currentRows);assert.equal((await v('vault/items/'+second.id)).password,'Other fake password');

}finally{await f.close();}
});
test('permanent archived Family deletion keeps customers, vault ciphertext and renewal history for individual restore and rolls back failure',async()=>{
 const f=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Old Family',manager_email:'old@example.com',trial_date:'2026-10-01'},201),target=await a('families','POST',{name:'New Family',manager_email:'new@example.com'},201),member=await a('members','POST',{family_id:family.id,email:'guest@example.com',contact:'Keep contact',expires_at:'2026-01-05'},201);
  await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:123000,paid_at:'2026-01-15',plan_months:3,apply_now:true});await a('issues','POST',{family_id:family.id,title:'Keep case snapshot'},201);
  await a('archived-families/'+family.id,'DELETE',{},409);await a('families/'+family.id,'DELETE');
  const archived=(await a('state')).archived_families[0],guard={expected_archived_at:archived.archived_at,expected_created_at:archived.created_at,expected_manager_email:archived.manager_email},db=new DatabaseSync(path.join(f.dir,'family.sqlite'));
  try{
   db.prepare('INSERT INTO vault_items(family_id,payload,created_at,updated_at) VALUES (?,?,?,?)').run(family.id,'opaque-encrypted-fixture','2026-10-01','2026-10-01');
   const history=db.prepare('SELECT * FROM renewal_history').all(),count=(await a('journal')).total;
   await a('archived-families/'+family.id,'DELETE',{},400);await a('archived-families/'+family.id,'DELETE',{...guard,expected_manager_email:'wrong@example.com'},409);
   db.exec("CREATE TRIGGER reject_family_delete BEFORE DELETE ON families BEGIN SELECT RAISE(ABORT,'Injected failure'); END");await a('archived-families/'+family.id,'DELETE',guard,500);
   assert.equal(db.prepare('SELECT family_archive_id FROM archived_customers').get().family_archive_id,family.id);assert.equal(db.prepare('SELECT family_id FROM vault_items').get().family_id,family.id);assert.deepEqual(db.prepare('SELECT * FROM renewal_history').all(),history);assert.equal((await a('journal')).total,count);db.exec('DROP TRIGGER reject_family_delete');
   assert.equal((await a('archived-families/'+family.id,'DELETE',guard)).kept_customers,1);let state=await a('state');assert.equal(state.archived_families.length,0);assert.equal(state.archives.length,1);assert.equal(state.archives[0].member.contact,'Keep contact');assert.equal(state.issues[0].family_id,null);assert.equal(db.prepare('SELECT family_archive_id FROM archived_customers').get().family_archive_id,null);assert.equal(db.prepare('SELECT family_id FROM vault_items').get().family_id,null);assert.equal(db.prepare('SELECT payload FROM vault_items').get().payload,'opaque-encrypted-fixture');assert.deepEqual(db.prepare('SELECT * FROM renewal_history').all(),history);
   assert.equal((await a('statistics?month=all')).selected.amount,123000);const event=(await a('journal')).entries.find(e=>e.action==='Xóa Family lưu trữ');assert.ok(event);assert.doesNotMatch(JSON.stringify(await a('journal/audit/'+event.id)),/opaque-encrypted-fixture/);
   const restored=await a('archives/'+state.archives[0].id+'/restore','POST',{family_id:target.id});assert.equal((await a('members/'+restored.member_id+'/renewal-history')).history.length,1);assert.equal((await a('state')).members[0].contact,'Keep contact');await a('archived-families/'+family.id,'DELETE',guard,404);
  }finally{db.close();}
  const empty=await a('families','POST',{name:'Empty',manager_email:'empty@example.com'},201);await a('families/'+empty.id,'DELETE');const row=(await a('state')).archived_families[0],g={expected_archived_at:row.archived_at,expected_created_at:row.created_at,expected_manager_email:row.manager_email};await a('archived-families/'+empty.id+'/restore','POST',{});await a('archived-families/'+empty.id,'DELETE',g,409);
 }finally{await f.close();}
});

test('new-purchase snapshots survive status changes, renewals, archive restore/deletion and backup roundtrip',async()=>{
 const f=await fixture(),target=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'New customers',manager_email:'new-owner@example.com'},201);
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
  const backup=await a('backup');await target.admin('restore','POST',backup);assert.deepEqual((await target.admin('statistics?month=2026-08')).new_purchases,stats.new_purchases);
 }finally{await f.close();await target.close();}
});

test('a failed purchase snapshot rolls back the customer and audit together',async()=>{
 const f=await fixture();try{
  const a=f.admin,family=await a('families','POST',{name:'Rollback',manager_email:'rollback-owner@example.com'},201),before=(await a('journal')).total,db=new DatabaseSync(path.join(f.dir,'family.sqlite'));
  try{db.exec("CREATE TRIGGER reject_new_purchase BEFORE INSERT ON new_purchase_history BEGIN SELECT RAISE(ABORT,'Injected snapshot failure'); END");await a('members','POST',{family_id:family.id,email:'reject@example.com',joined_at:'2026-10-01',membership_status:'new'},500);assert.equal((await a('state')).members.length,0);assert.equal((await a('statistics?month=all')).new_purchases.total,0);assert.equal((await a('journal')).total,before);}finally{db.exec('DROP TRIGGER reject_new_purchase');db.close();}
 }finally{await f.close();}
});
