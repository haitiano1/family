import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

test('CRUD persists and Google requests stay blocked without changing membership', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fam-test-'));
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: '0', DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Startup timed out')), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.stdout.on('data', data => {
        const match = data.toString().match(/port (\d+)/);
        if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); }
      });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
    });
  }
  async function stop() { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } }
  try {
    let base = await start();
    const request = async (endpoint, method = 'GET', data, status = 200) => {
      const response = await fetch(base + '/api/' + endpoint, { method, headers: { 'Content-Type': 'application/json' }, body: data ? JSON.stringify(data) : undefined });
      assert.equal(response.status, status, await response.clone().text()); return response.json();
    };
    assert.equal((await request('state')).accounts.length, 0);
    await request('accounts', 'POST', { email: 'bad' }, 400);
    const account = await request('accounts', 'POST', { email: 'Manager@example.com', note: 'Test customer' }, 201);
    await request('accounts', 'POST', { email: 'manager@example.com' }, 409);
    const family = await request('families', 'POST', { name: 'Test Family', manager_id: account.id }, 201);
    await request('families', 'POST', { name: 'Duplicate', manager_id: account.id }, 409);
    await request('members', 'POST', { family_id: family.id, email: 'manager@example.com' }, 400);
    const member = await request('members', 'POST', { family_id: family.id, email: 'guest@example.com' }, 201);
    await request('members', 'POST', { family_id: family.id, email: 'guest@example.com' }, 409);
    for (let n = 0; n < 4; n++) await request('members', 'POST', { family_id: family.id, email: `guest${n}@example.com` }, 201);
    await request('members', 'POST', { family_id: family.id, email: 'overflow@example.com' }, 400);
    for (const action of ['change_password', 'setup_2fa', 'check_trial', 'healthcheck']) {
      assert.equal((await request('jobs', 'POST', { action, account_id: account.id }, 201)).status, 'blocked');
    }
    for (const action of ['invite', 'remove_member', 'delete_family']) {
      assert.equal((await request('jobs', 'POST', { action, family_id: family.id, email: 'guest@example.com' }, 201)).status, 'blocked');
    }
    await request('jobs', 'POST', { action: 'invented', account_id: account.id }, 400);
    let state = await request('state');
    assert.equal(state.members.length, 5); assert.equal(state.families.length, 1); assert.equal(state.jobs.length, 7);
    assert.ok(state.logs.length > 0); assert.equal(state.integration, false);
    await stop(); base = await start();
    state = await request('state'); assert.equal(state.accounts[0].email, 'manager@example.com'); assert.equal(state.jobs.length, 7);
    await request('accounts/' + account.id, 'DELETE', undefined, 400);
    await request('members/' + member.id, 'DELETE');
    await request('families/' + family.id, 'DELETE');
    assert.equal((await request('state')).members.length, 0);
    await request('accounts/' + account.id, 'DELETE');
    assert.equal((await request('state')).accounts.length, 0);
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/app.js')).status, 200);
    assert.equal((await fetch(base + '/style.css')).status, 200);
    assert.equal((await fetch(base + '/../../server.js')).status, 404);
  } finally { await stop(); rmSync(dir, { recursive: true, force: true }); }
});
