import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';
import { expiry } from '../domain.js';

async function fixture(prepare) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fam-test-')); if (prepare) prepare(dir);
  let child, base;
  async function start() {
    let output = '';
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    let cookie = '', csrf = '';
    const request = async (endpoint, method = 'GET', data, status = 200, extra = {}) => {
      const response = await fetch(base + '/api/' + endpoint, { method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}), ...extra }, body: data ? JSON.stringify(data) : undefined });
      assert.equal(response.status, status, await response.clone().text());
      if (response.headers.has('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      const value = await response.json(); if (value.csrf) csrf = value.csrf; return value;
    };
    return request;
  };
  const admin = client();
  async function setup() { await admin('auth/setup', 'POST', { username: 'owner', password: 'Private-app-password-123' }, 201); await admin('auth/login', 'POST', { username: 'owner', password: 'Private-app-password-123' }); }
  try { await start(); } catch (error) { await stop(); rmSync(dir, { recursive: true, force: true }); throw error; }
  return { start, stop, dir, client, admin, setup, get base() { return base; }, async close() { await stop(); rmSync(dir, { recursive: true, force: true }); } };
}

test('CRUD, customer dates/payments, persistence, Google manual outcomes and capacity', async () => {
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
    for (const action of ['change_password', 'setup_2fa', 'check_trial', 'healthcheck']) {
      const result = await request('jobs', 'POST', { action, account_id: account.id }, 201); assert.equal(result.status, 'blocked'); assert.equal(result.guide.automated, false);
      if (action === 'check_trial') assert.equal(result.guide.url, 'https://www.youtube.com/paid_memberships');
    }
    for (const action of ['invite', 'remove_member', 'delete_family']) {
      const j = await request('jobs', 'POST', { action, family_id: family.id, email: 'guest@example.com' }, 201);
      assert.equal(j.status, 'blocked'); await request('jobs/' + j.id, 'PATCH', { status: 'manual_done', detail: 'Confirmed by owner on Google' });
      await request('jobs/' + j.id, 'PATCH', { status: 'cancelled', detail: 'Again' }, 409);
    }
    await request('jobs', 'POST', { action: 'invented', account_id: account.id }, 400);
    state = await request('state'); assert.equal(state.members.length, 5); assert.equal(state.families.length, 1); assert.equal(state.jobs.length, 7);
    assert.equal(state.members.find(m => m.id === member.id).payment_status, 'paid'); assert.ok(state.logs.length > 0); assert.equal(state.integration, false);
    await f.stop(); await f.start();
    state = await request('state'); assert.equal(state.accounts[0].email, 'newmanager@example.com'); assert.equal(state.jobs.length, 7);
    await request('accounts/' + account.id, 'DELETE', undefined, 400);
    await request('members/' + member.id, 'DELETE'); await request('families/' + family.id, 'DELETE'); assert.equal((await request('state')).members.length, 0);
    await request('accounts/' + account.id, 'DELETE'); assert.equal((await request('state')).accounts.length, 0);
    for (const asset of ['/', '/app.js', '/style.css']) assert.equal((await fetch(f.base + asset)).status, 200);
    assert.equal((await fetch(f.base + '/../../server.js')).status, 404);
  } finally { await f.close(); }
});

test('authentication, role enforcement, CSRF, session invalidation and admin protection', async () => {
  const f = await fixture(); const admin = f.admin, guest = f.client(), viewer = f.client(), operator = f.client();
  try {
    await guest('state', 'GET', undefined, 401);
    await guest('auth/setup', 'POST', { username: 'owner', password: 'short' }, 400);
    await guest('auth/setup', 'POST', { username: 'owner', password: 'Private-app-password-123' }, 403, { Origin: 'https://foreign.example' });
    await f.setup();
    await guest('auth/setup', 'POST', { username: 'other', password: 'Private-app-password-123' }, 409);
    await guest('auth/login', 'POST', { username: 'owner', password: 'wrong' }, 401);
    await admin('accounts', 'POST', { email: 'mgr@example.com' }, 403, { 'X-CSRF-Token': 'bad' });
    await admin('accounts', 'POST', { email: 'mgr@example.com' }, 403, { Origin: 'https://foreign.example' });
    const hostStatus = await new Promise((resolve, reject) => { const req = http.get(f.base + '/api/state', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
    assert.equal(hostStatus, 403);
    const a = await admin('accounts', 'POST', { email: 'mgr@example.com' }, 201);
    const family = await admin('families', 'POST', { name: 'Group', manager_id: a.id }, 201);
    const v = await admin('users', 'POST', { username: 'readonly', password: 'Viewer-password-123', role: 'viewer' }, 201);
    const o = await admin('users', 'POST', { username: 'staff', password: 'Staff-password-123', role: 'operator' }, 201);
    await viewer('auth/login', 'POST', { username: 'readonly', password: 'Viewer-password-123' });
    await operator('auth/login', 'POST', { username: 'staff', password: 'Staff-password-123' });
    await viewer('state'); await viewer('accounts', 'POST', { email: 'no@example.com' }, 403); await viewer('users', 'GET', undefined, 403);
    await operator('members', 'POST', { family_id: family.id, email: 'guest@example.com' }, 201);
    await operator('families/' + family.id, 'DELETE', undefined, 403); await operator('users', 'GET', undefined, 403);
    await operator('jobs', 'POST', { action: 'delete_family', family_id: family.id }, 403);
    const blocked = await admin('jobs', 'POST', { action: 'delete_family', family_id: family.id }, 201);
    await operator('jobs/' + blocked.id, 'PATCH', { status: 'manual_done', detail: 'Not allowed' }, 403);
    await admin('users/' + v.id, 'PATCH', { role: 'viewer', disabled: true }); await viewer('state', 'GET', undefined, 401);
    await admin('users/' + o.id, 'PATCH', { role: 'viewer', disabled: false }); await operator('state', 'GET', undefined, 401);
    await admin('users/1', 'PATCH', { role: 'viewer', disabled: false }, 400);
    const listed = (await admin('users')).users; assert.equal('password_hash' in listed[0], false);
    const db = new DatabaseSync(path.join(f.dir, 'family.sqlite')); const hash = db.prepare('SELECT password_hash FROM users WHERE id=1').get().password_hash; assert.ok(!hash.includes('Private-app-password-123')); db.close();
    const another = f.client(); await another('auth/login', 'POST', { username: 'owner', password: 'Private-app-password-123' });
    await admin('auth/password', 'POST', { current_password: 'Private-app-password-123', password: 'New-private-password-123' });
    await another('state', 'GET', undefined, 401); await admin('state', 'GET', undefined, 401);
    await admin('auth/login', 'POST', { username: 'owner', password: 'New-private-password-123' }); await admin('auth/logout', 'POST', {}); await admin('state', 'GET', undefined, 401);
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
    await f.setup(); let state = await f.admin('state'); assert.equal(state.accounts[0].note, 'Existing note'); assert.equal(state.members[0].email, 'legacyguest@example.com'); assert.equal(state.members[0].expiry_status, 'unknown'); assert.equal(state.families[0].service, 'youtube'); assert.equal(state.jobs.length, 1);
    const backups = readdirSync(f.dir).filter(n => n.startsWith('before-v6-')); assert.equal(backups.length, 1);
    const backup = new DatabaseSync(path.join(f.dir, backups[0])); assert.equal(backup.prepare('SELECT email FROM members').get().email, 'legacyguest@example.com'); assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 0); backup.close();
    await f.stop(); await f.start(); state = await f.admin('state'); assert.equal(state.members.length, 1); assert.equal(readdirSync(f.dir).filter(n => n.startsWith('before-v6-')).length, 1);
  } finally { await f.close(); }
});

test('expiry rules use inclusive end date and the next two calendar days', () => {
  assert.deepEqual(expiry('', '2026-10-12'), { expiry_status: 'unknown', days_left: null });
  assert.deepEqual(expiry('2026-10-11', '2026-10-12'), { expiry_status: 'expired', days_left: -1 });
  assert.deepEqual(expiry('2026-10-12', '2026-10-12'), { expiry_status: 'due_soon', days_left: 0 });
  assert.deepEqual(expiry('2026-10-14', '2026-10-12'), { expiry_status: 'due_soon', days_left: 2 });
  assert.deepEqual(expiry('2026-10-15', '2026-10-12'), { expiry_status: 'active', days_left: 3 });
});

test('login attempts are rate limited and cannot create unbounded sessions', async () => {
  const f = await fixture();
  try {
    await f.setup(); const bad = f.client();
    for (let n = 0; n < 15; n++) await bad('auth/login', 'POST', { username: 'owner', password: 'wrong' }, 401);
    await bad('auth/login', 'POST', { username: 'owner', password: 'wrong' }, 429);
  } finally { await f.close(); }
});

test('first local admin needs no code and only one competing setup can succeed', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.client()('auth/status')).setup_required, true);
    const results = await Promise.all(['first', 'second'].map(username => fetch(f.base + '/api/auth/setup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'abcdefg', role: 'viewer' })
    })));
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
    const db = new DatabaseSync(path.join(f.dir, 'family.sqlite'));
    const records = db.prepare('SELECT username,role FROM users').all(); db.close();
    assert.equal(records.length, 1); assert.equal(records[0].role, 'admin');
    const user = f.client(); await user('auth/login', 'POST', { username: records[0].username, password: 'abcdefg' });
    assert.equal((await user('state')).user.role, 'admin');
    assert.equal((await user('auth/status')).setup_required, false);
    await f.stop(); await f.start();
    assert.equal((await f.client()('auth/status')).setup_required, false);
    await f.client()('auth/setup', 'POST', { username: 'third', password: 'abcdefg' }, 409);
  } finally { await f.close(); }
});

test('7 character passwords work for creating users and changing passwords; 6 is rejected', async () => {
  const f = await fixture();
  try {
    const a = f.admin;
    await a('auth/setup', 'POST', { username: 'owner', password: 'abcdef' }, 400);
    await a('auth/setup', 'POST', { username: 'owner', password: 'abcdefg' }, 201);
    await a('auth/login', 'POST', { username: 'owner', password: 'abcdefg' });
    await a('users', 'POST', { username: 'staff', password: 'abcdef', role: 'operator' }, 400);
    const u = await a('users', 'POST', { username: 'staff', password: '1234567', role: 'operator' }, 201);
    await a('users/' + u.id, 'PATCH', { role: 'operator', disabled: false, password: 'abcdef' }, 400);
    await a('users/' + u.id, 'PATCH', { role: 'operator', disabled: false, password: '7654321' });
    const staff = f.client(); await staff('auth/login', 'POST', { username: 'staff', password: '7654321' });
    await staff('auth/password', 'POST', { current_password: '7654321', password: 'abcdef' }, 400);
    await staff('auth/password', 'POST', { current_password: '7654321', password: 'gfedcba' });
    await staff('auth/login', 'POST', { username: 'staff', password: 'gfedcba' });
    assert.equal((await staff('state')).user.role, 'operator');
  } finally { await f.close(); }
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

test('CSV errors and stale preview cannot partially import; viewer cannot import and operator cannot create groups', async () => {
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
    await a('users','POST',{username:'view',role:'viewer',password:'abcdefg'},201); await a('users','POST',{username:'staff',role:'operator',password:'abcdefg'},201);
    const v=f.client(); await v('auth/login','POST',{username:'view',password:'abcdefg'}); await v('import/preview','POST',valid,403);
    const o=f.client(); await o('auth/login','POST',{username:'staff',password:'abcdefg'}); await o('import/preview','POST',{...valid,create_groups:true},403); await o('import/preview','POST',valid);
  } finally { await f.close(); }
});

test('upgrading v2 retains users, active sessions and old customer records while adding the plan field', async () => {
  const f=await fixture();
  try {
    await f.setup(); const a=f.admin;
    const acc=await a('accounts','POST',{email:'manager@example.com'},201); const family=await a('families','POST',{name:'Old Family',manager_id:acc.id},201);
    await a('members','POST',{email:'guest@example.com',family_id:family.id,expires_at:'2026-12-12',contact:'Existing contact',payment_status:'paid'},201);
    await f.stop();
    const old=new DatabaseSync(path.join(f.dir,'family.sqlite')); old.exec('ALTER TABLE members DROP COLUMN plan_months; PRAGMA user_version=2'); old.close();
    await f.start(); const state=await a('state'); assert.equal(state.user.username,'owner'); assert.equal(state.members[0].email,'guest@example.com'); assert.equal(state.members[0].contact,'Existing contact'); assert.equal(state.members[0].payment_status,'paid'); assert.equal(state.members[0].plan_months,0);
    const backups=readdirSync(f.dir).filter(n=>n.startsWith('before-v6-')); assert.equal(backups.length,1);
    const saved=new DatabaseSync(path.join(f.dir,backups[0])); assert.equal(saved.prepare('PRAGMA user_version').get().user_version,2); assert.equal(saved.prepare('SELECT username FROM users').get().username,'owner'); saved.close();
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
    const history=(await a('members/'+member.id+'/renewal-history')).history; assert.equal(history.length,1); assert.equal(history[0].old_expires_at,'2026-11-01'); assert.equal(history[0].new_expires_at,'2027-02-01'); assert.equal(history[0].amount,150000); assert.equal(history[0].created_by,'owner');
    m=(await a('state')).members[0]; assert.equal(m.expires_at,'2027-02-01'); assert.equal(m.plan_months,3); assert.equal(m.payment_status,'paid'); assert.equal(m.amount,150000); assert.equal(m.renewal_status,'not_contacted'); assert.equal(m.renewal_amount,0);
    await f.stop(); await f.start(); assert.equal((await a('members/'+member.id+'/renewal-history')).history.length,1);
    await a('users','POST',{username:'viewer',role:'viewer',password:'abcdefg'},201); const viewer=f.client(); await viewer('auth/login','POST',{username:'viewer',password:'abcdefg'}); await viewer('members/'+member.id+'/renewal-history'); await viewer(endpoint,'PATCH',{revision:m.renewal_revision,status:'reminded',amount:0,paid_at:''},403);
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
