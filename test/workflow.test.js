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
    await request('accounts/' + account.id, 'DELETE'); assert.equal((await request('state')).accounts.length, 0);
    for (const asset of ['/', '/app.js', '/style.css']) assert.equal((await fetch(f.base + asset)).status, 200);
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
    const backups = readdirSync(f.dir).filter(n => n.startsWith('before-v9-')); assert.equal(backups.length, 1);
    const backup = new DatabaseSync(path.join(f.dir, backups[0])); assert.equal(backup.prepare('SELECT email FROM members').get().email, 'legacyguest@example.com'); assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 0); backup.close();
    await f.stop(); await f.start(); state = await f.admin('state'); assert.equal(state.members.length, 1); assert.equal(readdirSync(f.dir).filter(n => n.startsWith('before-v9-')).length, 1);
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
    const backups=readdirSync(f.dir).filter(n=>n.startsWith('before-v9-')); assert.equal(backups.length,1);
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

test('declined customers archive after seven days from selection, keep their history, and can be restored', async () => {
  const f=await fixture();
  try {
    await f.setup(); const a=f.admin; const account=await a('accounts','POST',{email:'manager@example.com'},201); const family=await a('families','POST',{name:'Family',manager_id:account.id},201);
    const member=await a('members','POST',{family_id:family.id,email:'guest@example.com',customer_name:'Customer',contact:'Zalo note',joined_at:'2025-01-01',expires_at:'2025-02-01',plan_months:1},201);
    await a('members/'+member.id+'/renewal','PATCH',{revision:0,status:'paid',amount:100000,paid_at:'2026-01-01',plan_months:1,apply_now:true});
    let m=(await a('state')).members[0]; await a('members/'+member.id+'/renewal','PATCH',{revision:m.renewal_revision,status:'declined',amount:0,paid_at:'',note:'Khách dừng'});
    let state=await a('state'); assert.equal(state.members.length,1); assert.equal(state.archives.length,0); assert.equal(state.archive_mode,'declined');
    const db=new DatabaseSync(path.join(f.dir,'family.sqlite')); db.prepare('UPDATE members SET declined_at=? WHERE id=?').run('2026-01-01T00:00:00Z',member.id); db.close();
    state=await a('state'); assert.equal(state.members.length,0); assert.equal(state.archives.length,1); const record=state.archives[0]; assert.equal(record.member.contact,'Zalo note'); assert.equal(record.member.renewal_note,'Khách dừng');
    assert.equal((await a('archives/'+record.id+'/history')).history.length,1);
    await f.stop(); await f.start(); assert.equal((await a('state')).archives.length,1);
    const restored=await a('archives/'+record.id+'/restore','POST',{family_id:family.id}); state=await a('state'); assert.equal(state.archives.length,0); assert.equal(state.members.length,1); assert.equal(state.members[0].renewal_status,'not_contacted'); assert.equal(state.members[0].declined_at,''); assert.equal(state.members[0].contact,'Zalo note');
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
  const db=new DatabaseSync(path.join(source.dir,'family.sqlite'));db.prepare('UPDATE members SET declined_at=? WHERE id=?').run('2020-01-01T00:00:00.000Z',archived.id);db.close();await a('state');
  await a('other-products','POST',{product:'ChatGPT',customer_name:'Buyer',contact:'Other contact',note:'Side product'},201);
  const backup=await a('backup');assert.equal('users' in backup.tables,false);assert.equal('jobs' in backup.tables,false);
  const invalid=structuredClone(backup);invalid.tables.members[0].family_id=9999;
  await b('restore','POST',invalid,400);assert.equal((await b('state')).accounts.length,0);
  const restored=await b('restore','POST',backup);assert.equal(restored.customers,1);assert.equal(restored.families,1);assert.equal(restored.other_products,1);
  const after=await b('backup');assert.deepEqual(after.tables,backup.tables);
  await b('restore','POST',backup,409);assert.equal((await b('state')).members.length,1);
  await target.stop();await target.start();assert.equal((await b('state')).members[0].contact,'https://facebook.com/example');assert.equal((await b('state')).archives.length,1);
 }finally{await source.close();await target.close();}
});
