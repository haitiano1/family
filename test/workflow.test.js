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
    const backups = readdirSync(f.dir).filter(n => n.startsWith('before-v2-')); assert.equal(backups.length, 1);
    const backup = new DatabaseSync(path.join(f.dir, backups[0])); assert.equal(backup.prepare('SELECT email FROM members').get().email, 'legacyguest@example.com'); assert.equal(backup.prepare('PRAGMA user_version').get().user_version, 0); backup.close();
    await f.stop(); await f.start(); state = await f.admin('state'); assert.equal(state.members.length, 1); assert.equal(readdirSync(f.dir).filter(n => n.startsWith('before-v2-')).length, 1);
  } finally { await f.close(); }
});

test('expiry rules use inclusive end date and the next seven calendar days', () => {
  assert.deepEqual(expiry('', '2026-10-12'), { expiry_status: 'unknown', days_left: null });
  assert.deepEqual(expiry('2026-10-11', '2026-10-12'), { expiry_status: 'expired', days_left: -1 });
  assert.deepEqual(expiry('2026-10-12', '2026-10-12'), { expiry_status: 'due_soon', days_left: 0 });
  assert.deepEqual(expiry('2026-10-19', '2026-10-12'), { expiry_status: 'due_soon', days_left: 7 });
  assert.deepEqual(expiry('2026-10-20', '2026-10-12'), { expiry_status: 'active', days_left: 8 });
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
