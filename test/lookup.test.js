import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { today } from '../domain.js';
import { derivedCode, inviteHolder, normalizeCode, isGoogleInviteUrl } from '../lookup.js';

const day = offset => { const d = new Date(today() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); };
const inviteUrl = n => `https://myaccount.google.com/family/join/test-token-${n}?utm_source=googleaccount`;

async function server(environment = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'fam-lookup-'));
  const child = spawn(process.execPath, ['server.js'], { env: { ...process.env, HOST: '127.0.0.1', PUBLIC_ORIGIN: '', RENDER_EXTERNAL_URL: '', ACCESS_PASSWORD: '', PORT: '0', DATA_DIR: dir, ...environment }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Startup timed out')), 10000);
    child.stderr.on('data', d => { output += d; });
    child.stdout.on('data', d => { output += d; const match = output.match(/port (\d+)/); if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); } });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited ' + code + '\n' + output)); });
  });
  const call = async (endpoint, method = 'GET', data, status = 200, headers = {}) => {
    const response = await fetch(base + '/api/' + endpoint, { method, headers: { 'Content-Type': 'application/json', 'X-Fam-Request': '1', ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
    assert.equal(response.status, status, `${method} ${endpoint}: ${await response.clone().text()}`);
    return { body: await response.json(), response };
  };
  const admin = async (...args) => (await call(...args)).body;
  // A customer browser: keeps the HttpOnly lookup cookie between calls.
  const customer = () => {
    let cookie = '';
    const request = async (endpoint, method = 'GET', data, status = 200, headers = {}) => {
      const { body, response } = await call('lookup/' + endpoint, method, data, status, { ...(cookie ? { Cookie: cookie } : {}), ...headers });
      const set = response.headers.get('set-cookie'); if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
      return body;
    };
    request.cookie = () => cookie; request.setCookie = value => { cookie = value; };
    return request;
  };
  return { base, dir, admin, call, customer, async close() { if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; } rmSync(dir, { recursive: true, force: true }); } };
}

async function incident(a) {
  const oldFamily = await a('families', 'POST', { name: 'Family 04', manager_email: 'owner04@example.com' }, 201);
  const newFamily = await a('families', 'POST', { name: 'Family 09', manager_email: 'owner09@example.com' }, 201);
  const calm = await a('families', 'POST', { name: 'Family 06', manager_email: 'owner06@example.com' }, 201);
  const minh = await a('members', 'POST', { family_id: oldFamily.id, email: 'minhanh@example.com', customer_name: 'Minh Anh', plan_months: 6, joined_at: day(-140), expires_at: day(38), membership_status: 'active' }, 201);
  const huy = await a('members', 'POST', { family_id: oldFamily.id, email: 'giahuy@example.com', customer_name: 'Gia Huy', expires_at: day(62), membership_status: 'active' }, 201);
  const bao = await a('members', 'POST', { family_id: oldFamily.id, email: 'quocbao@example.com', customer_name: 'Quốc Bảo', expires_at: day(-53), membership_status: 'active' }, 201);
  const nam = await a('members', 'POST', { family_id: calm.id, email: 'hoangnam@example.com', customer_name: 'Hoàng Nam', expires_at: day(197), membership_status: 'active' }, 201);
  return { oldFamily, newFamily, calm, minh, huy, bao, nam };
}
const member = (state, id) => state.members.find(m => m.id === id);
const assignment = (state, memberId, inviteId) => { const m = member(state, memberId), i = state.invites.find(x => x.id === inviteId); return { member_id: m.id, revision: m.renewal_revision, expected_email: m.email, invite_id: i.id, invite_revision: i.revision }; };

test('code helpers normalize input, derive stable codes and only accept Google invite links', () => {
  assert.equal(normalizeCode(' k7p-2qx '), 'K7P2QX');
  assert.equal(normalizeCode('K7P2Q0'), '', 'ambiguous 0 is not in the alphabet');
  assert.equal(normalizeCode('K7P2Q'), '');
  const salt = 'a'.repeat(64);
  assert.equal(derivedCode(salt, 'x@example.com'), derivedCode(salt, 'x@example.com'));
  assert.notEqual(derivedCode(salt, 'x@example.com'), derivedCode('b'.repeat(64), 'x@example.com'));
  assert.match(derivedCode(salt, 'x@example.com'), /^[A-HJ-KM-NP-Z2-9]{6}$/);
  for (const ok of ['https://myaccount.google.com/family/join/abc', 'https://notifications.googleapis.com/email/redirect?t=1', 'https://families.google.com/join/promo/x']) assert.ok(isGoogleInviteUrl(ok), ok);
  for (const bad of ['http://myaccount.google.com/x', 'https://google.com.evil.example/x', 'javascript:alert(1)', 'https://user:pw@myaccount.google.com/', 'https://example.com/?google.com']) assert.equal(isGoogleInviteUrl(bad), false, bad);
  assert.equal(inviteHolder([{ state: 'assigned', member_family_id: 2, to_family_id: 2 }]).state, 'assigned');
  assert.equal(inviteHolder([{ state: 'assigned', member_family_id: 3, to_family_id: 2 }]).state, 'ready', 'customer left the target Family');
  assert.equal(inviteHolder([{ state: 'assigned', member_family_id: null, to_family_id: 2 }]).state, 'ready', 'customer archived');
  assert.equal(inviteHolder([{ state: 'joined', member_family_id: null, to_family_id: 2 }]).state, 'used');
});

test('incident flow: status, invite pool, bulk move with one link per customer, customer lookup and joining', async () => {
  const f = await server(); try {
    const a = f.admin, { oldFamily, newFamily, calm: calmFamily, minh, huy, bao } = await incident(a);
    await a('issues', 'POST', { family_id: oldFamily.id, target_type: 'member', target_id: minh.id, title: 'Không vào được YouTube' }, 201);
    let state = await a('state');
    assert.equal(state.lookup_supported, true);
    assert.deepEqual(state.family_statuses, []);
    for (const m of state.members) assert.match(state.lookup_codes[m.email], /^[A-HJ-KM-NP-Z2-9]{6}$/);

    await a(`families/${oldFamily.id}/status`, 'PATCH', { status: 'broken', note: '', revision: 0 }, 400);
    await a(`families/${oldFamily.id}/status`, 'PATCH', { status: 'disabled', note: 'Tài khoản chủ bị khoá. Shop đã chuẩn bị nhóm mới.', revision: 0 });
    await a(`families/${oldFamily.id}/status`, 'PATCH', { status: 'scanned', note: '', revision: 0 }, 409);
    state = await a('state');
    assert.deepEqual(state.family_statuses.map(s => [s.family_id, s.status, s.revision]), [[oldFamily.id, 'disabled', 1]]);

    await a(`families/${newFamily.id}/invites`, 'POST', { label: 'slot 1', url: 'https://example.com/family/join/x' }, 400);
    await a(`families/${newFamily.id}/invites`, 'POST', { label: 'slot 1', url: 'http://myaccount.google.com/family/join/x' }, 400);
    const inv1 = await a(`families/${newFamily.id}/invites`, 'POST', { label: 'shop+1@gmail.com', url: inviteUrl(1), sent_on: day(-3) }, 201);
    const inv2 = await a(`families/${newFamily.id}/invites`, 'POST', { label: 'shop+2@gmail.com', url: inviteUrl(2), sent_on: day(-3) }, 201);
    const inv3 = await a(`families/${newFamily.id}/invites`, 'POST', { label: 'shop+3@gmail.com', url: inviteUrl(3) }, 201);
    await a(`families/${oldFamily.id}/invites`, 'POST', { url: inviteUrl(1) }, 409);
    state = await a('state');
    assert.deepEqual(state.invites.map(i => i.holder_state), ['ready', 'ready', 'ready']);
    assert.equal(state.invites[0].expires_on, day(11));

    const base = { from_family_id: oldFamily.id, to_family_id: newFamily.id, expected_manager_email: 'owner09@example.com' };
    await a('moves', 'POST', { ...base, assignments: [assignment(state, minh.id, inv1.id), assignment(state, huy.id, inv1.id)] }, 400);
    await a('moves', 'POST', { ...base, expected_manager_email: 'changed@example.com', assignments: [assignment(state, minh.id, inv1.id)] }, 409);
    await a('moves', 'POST', { ...base, assignments: [{ ...assignment(state, minh.id, inv1.id), revision: 99 }] }, 409);
    const journalBefore = (await a('journal')).total;
    const moved = await a('moves', 'POST', { ...base, assignments: [assignment(state, minh.id, inv1.id), assignment(state, huy.id, inv2.id)] });
    assert.equal(moved.moved, 2);
    state = await a('state');
    assert.deepEqual([member(state, minh.id).family_id, member(state, minh.id).membership_status], [newFamily.id, 'invited']);
    assert.equal(member(state, bao.id).family_id, oldFamily.id, 'expired customer stays');
    assert.equal(state.issues.length, 0, 'customer case removed like a single transfer');
    assert.deepEqual(state.invites.map(i => [i.holder_state, i.holder_email]), [['assigned', 'minhanh@example.com'], ['assigned', 'giahuy@example.com'], ['ready', '']]);
    assert.equal((await a('journal')).entries.find(e => e.action === 'Chuyển Family').actor, 'Cá nhân');
    assert.ok((await a('journal')).total > journalBefore);
    await a('moves', 'POST', { ...base, assignments: [assignment(state, bao.id, inv1.id)] }, 409);

    // Customer side: no access password, Gmail + code.
    const info = await f.customer()('info');
    assert.deepEqual(Object.keys(info.shop).sort(), ['contact_label', 'contact_url', 'help_text', 'shop_name']);
    const c = f.customer();
    assert.deepEqual(await c('me'), { signed_in: false });
    await c('verify', 'POST', { email: 'minhanh@example.com', code: 'AAAAAA' }, 401);
    await c('verify', 'POST', { email: 'minhanh@example.com', code: '12' }, 400);
    await f.call('lookup/verify', 'POST', { email: 'minhanh@example.com', code: state.lookup_codes['minhanh@example.com'] }, 403, { 'X-Fam-Request': '' });
    let result = await c('verify', 'POST', { email: ' MinhAnh@Example.com ', code: state.lookup_codes['minhanh@example.com'].toLowerCase() });
    assert.match(c.cookie(), /^fam_lookup=[a-f0-9]{64}$/);
    assert.equal(result.items.length, 1);
    let item = result.items[0];
    assert.equal(item.view, 'move');
    assert.equal(item.family_name, 'Family 09');
    assert.equal(item.move.from_family_name, 'Family 04');
    assert.equal(item.move.from_status, 'disabled');
    assert.match(item.move.from_note, /Shop đã chuẩn bị/);
    assert.equal(item.move.invite_url, inviteUrl(1));
    assert.equal(item.move.invite_expires_on, day(11));
    for (const hidden of ['owner04@example.com', 'owner09@example.com', 'giahuy@example.com', inviteUrl(2)]) assert.equal(JSON.stringify(result).includes(hidden), false, hidden);
    assert.deepEqual(await c('me'), result);

    await c('open', 'POST', { move_id: item.move.id });
    await c('open', 'POST', { move_id: 9999 }, 404);
    state = await a('state');
    assert.equal(state.moves.find(m => m.id === item.move.id).state, 'opened');
    await c('report', 'POST', { move_id: item.move.id, reason: 'nonsense' }, 400);
    result = await c('report', 'POST', { move_id: item.move.id, reason: 'twelve_months', note: 'Google báo 12 tháng' });
    assert.equal(result.items[0].move.state, 'failed');
    assert.equal(result.items[0].view, 'move', 'still shows the link after a report');
    state = await a('state');
    const failed = state.moves.find(m => m.id === item.move.id);
    assert.deepEqual([failed.state, failed.report_reason, failed.report_note], ['failed', 'twelve_months', 'Google báo 12 tháng']);
    const report = (await a('journal')).entries.find(e => e.action === 'Khách báo lỗi vào nhóm');
    assert.equal(report.actor, 'Khách tra cứu');

    result = await c('joined', 'POST', { move_id: item.move.id });
    item = result.items[0];
    assert.deepEqual([item.view, item.move.state, item.move.invite_url], ['normal', 'joined', '']);
    state = await a('state');
    assert.equal(member(state, minh.id).membership_status, 'active');
    assert.equal(state.invites.find(i => i.id === inv1.id).holder_state, 'used');
    await c('report', 'POST', { move_id: item.move.id, reason: 'other' }, 409);

    // Other customers: expired in the broken Family, and a calm Family.
    const expired = f.customer(), calm = f.customer();
    result = await expired('verify', 'POST', { email: 'quocbao@example.com', code: state.lookup_codes['quocbao@example.com'] });
    assert.deepEqual([result.items[0].view, result.items[0].status, result.items[0].move], ['expired', 'disabled', null]);
    result = await calm('verify', 'POST', { email: 'hoangnam@example.com', code: state.lookup_codes['hoangnam@example.com'] });
    assert.deepEqual([result.items[0].view, result.items[0].status], ['normal', 'active']);
    await a(`families/${calmFamily.id}/status`, 'PATCH', { status: 'checking', note: 'Đang kiểm tra', revision: 0 });
    assert.equal((await calm('me')).items[0].view, 'incident');

    // Admin actions on Gia Huy: reassign, release, dismiss.
    state = await a('state');
    let huyMove = state.moves.find(m => m.email === 'giahuy@example.com');
    await a('moves/' + huyMove.id, 'PATCH', { action: 'reassign', invite_id: inv1.id, invite_revision: state.invites.find(i => i.id === inv1.id).revision, revision: huyMove.revision }, 409);
    await a('moves/' + huyMove.id, 'PATCH', { action: 'dismiss', revision: huyMove.revision }, 409);
    await a('moves/' + huyMove.id, 'PATCH', { action: 'reassign', invite_id: inv3.id, invite_revision: state.invites.find(i => i.id === inv3.id).revision, revision: huyMove.revision });
    state = await a('state'); huyMove = state.moves.find(m => m.id === huyMove.id);
    assert.equal(huyMove.invite_id, inv3.id);
    assert.deepEqual(state.invites.map(i => i.holder_state), ['used', 'ready', 'assigned']);
    await a(`invites/${inv3.id}`, 'DELETE', { revision: state.invites.find(i => i.id === inv3.id).revision }, 409);
    await a('moves/' + huyMove.id, 'PATCH', { action: 'release', revision: huyMove.revision });
    state = await a('state'); huyMove = state.moves.find(m => m.id === huyMove.id);
    assert.equal(huyMove.state, 'cancelled');
    assert.deepEqual(state.invites.map(i => i.holder_state), ['used', 'ready', 'ready']);
    await a('moves/' + huyMove.id, 'PATCH', { action: 'dismiss', revision: huyMove.revision });
    assert.equal((await a('state')).moves.some(m => m.id === huyMove.id), false);
    const huyCustomer = f.customer();
    result = await huyCustomer('verify', 'POST', { email: 'giahuy@example.com', code: state.lookup_codes['giahuy@example.com'] });
    // Still "Đã mời, chưa vào" in Family 09, so the lookup hands Huy another ready link of that pool and ticks it.
    assert.deepEqual([result.items[0].view, result.items[0].family_name, result.items[0].move.kind, result.items[0].move.state], ['move', 'Family 09', 'join', 'assigned']);
    state = await a('state');
    const handed = state.invites.find(i => i.url === result.items[0].move.invite_url);
    assert.equal(handed.holder_state, 'assigned'); assert.ok(handed.sent_at, 'shown link is ticked Đã gửi');
    assert.equal((await huyCustomer('me')).items[0].move.invite_url, handed.url, 'the same link on every lookup');

    // Editing an invite with a newer Google link keeps the same slot.
    state = await a('state');
    const second = state.invites.find(i => i.id === inv2.id);
    await a(`invites/${inv2.id}`, 'PATCH', { label: second.label, url: inviteUrl(22), sent_on: day(0), revision: second.revision });
    await a(`invites/${inv2.id}`, 'PATCH', { label: second.label, url: inviteUrl(23), sent_on: day(0), revision: second.revision }, 409);
    state = await a('state');
    assert.equal(state.invites.find(i => i.id === inv2.id).url, inviteUrl(22));

    await c('logout', 'POST', {});
    assert.deepEqual(await c('me'), { signed_in: false });
    await c('joined', 'POST', { move_id: item.move.id }, 401);
  } finally { await f.close(); }
});

test('wrong codes are rate limited per Gmail, codes can be rotated and archived customers lose access', async () => {
  const f = await server(); try {
    const a = f.admin, { oldFamily, newFamily, minh, huy } = await incident(a);
    let state = await a('state');
    const code = state.lookup_codes['minhanh@example.com'], c = f.customer();
    for (let i = 0; i < 8; i++) await c('verify', 'POST', { email: 'minhanh@example.com', code: code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA' }, 401);
    await c('verify', 'POST', { email: 'minhanh@example.com', code }, 429);
    // Another Gmail from the same address still works.
    await c('verify', 'POST', { email: 'giahuy@example.com', code: state.lookup_codes['giahuy@example.com'] });

    const rotated = await a('lookup-codes', 'POST', { email: 'giahuy@example.com' });
    assert.notEqual(rotated.code, state.lookup_codes['giahuy@example.com']);
    assert.deepEqual(await c('me'), { signed_in: false }, 'sessions of the rotated Gmail are revoked');
    await c('verify', 'POST', { email: 'giahuy@example.com', code: state.lookup_codes['giahuy@example.com'] }, 401);
    await c('verify', 'POST', { email: 'giahuy@example.com', code: rotated.code });
    assert.equal((await a('state')).lookup_codes['giahuy@example.com'], rotated.code);
    await a('lookup-codes', 'POST', { email: 'nobody@example.com' }, 404);

    // A customer archived after the move: invite returns to the pool, lookup is refused.
    const inv = await a(`families/${newFamily.id}/invites`, 'POST', { url: inviteUrl(5) }, 201);
    state = await a('state');
    await a('moves', 'POST', { from_family_id: oldFamily.id, to_family_id: newFamily.id, expected_manager_email: 'owner09@example.com', assignments: [assignment(state, huy.id, inv.id)] });
    assert.equal((await a('state')).invites[0].holder_state, 'assigned');
    await a('members/' + huy.id, 'DELETE');
    state = await a('state');
    assert.equal(state.invites[0].holder_state, 'ready');
    assert.equal(state.moves[0].effective_state, 'stale');
    await f.customer()('verify', 'POST', { email: 'giahuy@example.com', code: rotated.code }, 401);
    await a('moves/' + state.moves[0].id, 'PATCH', { action: 'joined', revision: state.moves[0].revision }, 409);
    await a('moves/' + state.moves[0].id, 'PATCH', { action: 'dismiss', revision: state.moves[0].revision });
    assert.ok(minh.id);
  } finally { await f.close(); }
});

test('lookup settings validate the contact link and backups v10 keep statuses, invites, moves and codes', async () => {
  const f = await server(), target = await server(); try {
    const a = f.admin, { oldFamily, newFamily, minh } = await incident(a);
    await a('lookup-settings', 'PATCH', { shop_name: 'Shop', contact_url: 'javascript:alert(1)' }, 400);
    await a('lookup-settings', 'PATCH', { shop_name: 'Shop Family', contact_url: 'https://m.me/shop.family', contact_label: 'Nhắn Messenger', help_text: 'Phản hồi 8h–22h' });
    assert.deepEqual((await f.customer()('info')).shop, { shop_name: 'Shop Family', contact_url: 'https://m.me/shop.family', contact_label: 'Nhắn Messenger', help_text: 'Phản hồi 8h–22h' });
    await a(`families/${oldFamily.id}/status`, 'PATCH', { status: 'scanned', note: 'Google quét', revision: 0 });
    const inv = await a(`families/${newFamily.id}/invites`, 'POST', { label: 'slot', url: inviteUrl(7), sent_on: day(-1) }, 201);
    let state = await a('state');
    await a('moves', 'POST', { from_family_id: oldFamily.id, to_family_id: newFamily.id, expected_manager_email: 'owner09@example.com', assignments: [assignment(state, minh.id, inv.id)] });
    const backup = await a('backup');
    assert.equal(backup.version, 10);
    assert.equal(backup.tables.family_statuses.length, 1);
    assert.equal(backup.tables.family_invites.length, 1);
    assert.equal(backup.tables.member_moves.length, 1);
    assert.ok(backup.tables.lookup_settings.some(r => r.name === 'code_salt'));
    for (const table of ['lookup_sessions', 'lookup_attempts']) assert.equal(table in backup.tables, false);
    const codes = (await a('state')).lookup_codes;

    await target.admin('restore', 'POST', backup);
    const restored = await target.admin('state');
    assert.deepEqual(restored.lookup_codes, codes, 'customers keep the codes they were sent');
    assert.equal(restored.moves[0].state, 'assigned');
    assert.equal(restored.invites[0].holder_state, 'assigned');
    const result = await target.customer()('verify', 'POST', { email: 'minhanh@example.com', code: codes['minhanh@example.com'] });
    assert.equal(result.items[0].move.invite_url, inviteUrl(7));
    assert.equal(result.items[0].move.from_status, 'scanned');

    const legacy = structuredClone(backup); legacy.version = 9;
    for (const table of ['family_statuses', 'family_invites', 'member_moves', 'lookup_codes', 'lookup_settings']) delete legacy.tables[table];
    const empty = await server(); try { await empty.admin('restore', 'POST', legacy); const s = await empty.admin('state'); assert.equal(s.members.length, 4); assert.equal(s.moves.length, 0); assert.match(s.lookup_codes['minhanh@example.com'], /^[A-HJ-KM-NP-Z2-9]{6}$/); } finally { await empty.close(); }
  } finally { await f.close(); await target.close(); }
});

test('hosted mode keeps admin APIs behind the access password while the lookup page and API stay public', async () => {
  const f = await server({ PUBLIC_ORIGIN: 'https://family.example.com', ACCESS_PASSWORD: 'test-private-access' }); try {
    await f.admin('state', 'GET', undefined, 401);
    await f.admin('moves', 'POST', {}, 401);
    const page = await fetch(f.base + '/tra-cuu.html');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await page.text(), /tra-cuu\.js/);
    assert.equal((await fetch(f.base + '/tra-cuu.js')).status, 200);
    assert.equal((await fetch(f.base + '/tra-cuu.css')).status, 200);
    const c = f.customer();
    assert.ok((await c('info')).shop);
    const response = await f.call('lookup/verify', 'POST', { email: 'nobody@example.com', code: 'AAAAAA' }, 401);
    assert.equal(response.response.headers.get('set-cookie'), null);
    await f.call('lookup/verify', 'POST', { email: 'nobody@example.com', code: 'AAAAAA' }, 403, { Origin: 'https://foreign.example' });
  } finally { await f.close(); }
});

test('Gen mail mời makes unique + addresses, and a link ticked Đã gửi is never handed out again', async () => {
  const f = await server(), target = await server(); try {
    const a = f.admin, { oldFamily, newFamily, minh, huy } = await incident(a);
    const made = await a(`families/${newFamily.id}/invite-mails`, 'POST', { count: 4, base_email: ' HaiHoangrr+old@Gmail.com ' }, 201);
    assert.equal(made.base_email, 'haihoangrr@gmail.com', 'existing + tag dropped, lower case');
    assert.equal(made.mails.length, 4);
    for (const address of made.mails) assert.match(address, /^haihoangrr\+[a-hj-km-np-z2-9]{6}@gmail\.com$/);
    let state = await a('state');
    assert.deepEqual(state.invite_mails.map(m => [m.family_id, m.email]), made.mails.map(m => [newFamily.id, m]));
    assert.equal(state.invite_base_email, 'haihoangrr@gmail.com');
    for (const bad of [{ count: 0 }, { count: 6 }, { count: '3' }, { count: 2, base_email: 'not-an-email' }]) await a(`families/${newFamily.id}/invite-mails`, 'POST', { base_email: 'haihoangrr@gmail.com', ...bad }, 400);
    await a(`families/${newFamily.id}/invite-mails`, 'POST', { count: 1, base_email: 'owner09+x@example.com' }, 400);
    await a('families/999/invite-mails', 'POST', { count: 1, base_email: 'haihoangrr@gmail.com' }, 404);
    const fixed = await a(`families/${newFamily.id}/invite-mails`, 'POST', { count: 1 }, 201);
    assert.match(fixed.mails[0], /^haihoangrr\+[a-hj-km-np-z2-9]{6}@gmail\.com$/, 'the shop inbox is fixed');
    const seen = new Set(made.mails);
    for (let i = 0; i < 12; i++) for (const address of (await a(`families/${oldFamily.id}/invite-mails`, 'POST', { count: 5, base_email: 'haihoangrr@gmail.com' }, 201)).mails) { assert.equal(seen.has(address), false, 'never generated twice'); seen.add(address); }
    assert.equal((await a('state')).invite_mails.length, 65);
    const journal = await a('journal');
    assert.ok(journal.entries.some(e => e.action === 'Tạo mail mời' && e.message.includes(made.mails[0])));

    // Đã gửi: a ready link sent by hand is excluded from moves until unticked.
    const sent = await a(`families/${newFamily.id}/invites`, 'POST', { label: made.mails[0], url: inviteUrl(41), sent_on: day(0) }, 201);
    const spare = await a(`families/${newFamily.id}/invites`, 'POST', { label: made.mails[1], url: inviteUrl(42), sent_on: day(0) }, 201);
    state = await a('state');
    await a(`invites/${sent.id}/sent`, 'PATCH', { sent: true, revision: 99 }, 409);
    await a(`invites/${sent.id}/sent`, 'PATCH', { sent: 'yes', revision: 0 }, 400);
    await a(`invites/${sent.id}/sent`, 'PATCH', { sent: true, revision: 0 });
    state = await a('state');
    const ticked = state.invites.find(i => i.id === sent.id);
    assert.equal(ticked.holder_state, 'sent'); assert.ok(ticked.sent_at);
    const move = (memberId, inviteId) => ({ from_family_id: oldFamily.id, to_family_id: newFamily.id, expected_manager_email: 'owner09@example.com', assignments: [assignment(state, memberId, inviteId)] });
    await a('moves', 'POST', move(minh.id, sent.id), 409);
    await a('moves', 'POST', move(minh.id, spare.id));
    state = await a('state');
    await a(`invites/${spare.id}/sent`, 'PATCH', { sent: true, revision: state.invites.find(i => i.id === spare.id).revision }, 409);
    await a(`invites/${sent.id}/sent`, 'PATCH', { sent: false, revision: ticked.revision });
    state = await a('state');
    assert.equal(state.invites.find(i => i.id === sent.id).holder_state, 'ready');
    await a('moves', 'POST', move(huy.id, sent.id));

    // Backups carry both; a version-10 file from 0.21 (no invite_mails, no sent_at) still restores.
    state = await a('state');
    await a(`invites/${spare.id}/sent`, 'PATCH', { sent: false, revision: state.invites.find(i => i.id === spare.id).revision });
    const backup = await a('backup');
    assert.equal(backup.version, 10); assert.equal(backup.tables.invite_mails.length, 65); assert.ok(backup.tables.family_invites.every(i => 'sent_at' in i));
    await target.admin('restore', 'POST', backup);
    assert.equal((await target.admin('state')).invite_mails.length, 65);
    const old = structuredClone(backup); delete old.tables.invite_mails; for (const row of old.tables.family_invites) delete row.sent_at;
    const empty = await server(); try { await empty.admin('restore', 'POST', old); const s = await empty.admin('state'); assert.equal(s.invite_mails.length, 0); assert.ok(s.invites.every(i => i.sent_at === '')); } finally { await empty.close(); }
  } finally { await f.close(); await target.close(); }
});

test('Fix lỗi sets the Family status: owner mail reported → Bị quét, case done → Đang hoạt động', async () => {
  const f = await server(); try {
    const a = f.admin, { oldFamily, calm, minh } = await incident(a);
    const status = async id => (await a('state')).family_statuses.find(s => s.family_id === id) || { status: 'active', note: '' };
    const created = await a('issues', 'POST', { family_id: oldFamily.id, target_type: 'manager', title: 'Mail chủ bị quét' }, 201);
    let s = await status(oldFamily.id);
    assert.equal(s.status, 'scanned'); assert.match(s.note, /Family 04 bị Google quét/);
    assert.equal((await f.customer()('verify', 'POST', { email: 'minhanh@example.com', code: (await a('state')).lookup_codes['minhanh@example.com'] })).items[0].view, 'incident', 'customers see the incident at once');
    let issue = (await a('state')).issues.find(i => i.id === created.id);
    await a(`issues/${created.id}`, 'PATCH', { revision: issue.revision, status: 'done', resolution: 'replace', replacement_email: 'owner04-new@example.com', expected_email: 'owner04@example.com' });
    s = await status(oldFamily.id); assert.equal(s.status, 'active'); assert.equal(s.note, '');
    const journal = await a('journal');
    assert.ok(journal.entries.some(e => e.message.includes('Tự động: đặt trạng thái Family 04 là Bị quét')));
    assert.ok(journal.entries.some(e => e.message.includes('Tự động: đặt trạng thái Family 04 là Đang hoạt động')));
    // Reopening the case marks it again; a customer mail case never touches the Family status.
    issue = (await a('state')).issues.find(i => i.id === created.id);
    await a(`issues/${created.id}`, 'PATCH', { revision: issue.revision, status: 'todo' });
    assert.equal((await status(oldFamily.id)).status, 'scanned');
    const nam = (await a('state')).members.find(m => m.family_id === calm.id);
    await a('issues', 'POST', { family_id: calm.id, target_type: 'member', target_id: nam.id, title: 'Mail khách lỗi' }, 201);
    assert.equal((await status(calm.id)).status, 'active');
    // A status set by hand (e.g. Bị vô hiệu hoá) is not overwritten by a new report.
    const other = await a('families', 'POST', { name: 'Family 11', manager_email: 'owner11@example.com' }, 201);
    await a(`families/${other.id}/status`, 'PATCH', { status: 'disabled', note: 'Tự đặt', revision: 0 });
    await a('issues', 'POST', { family_id: other.id, target_type: 'manager', title: 'Lỗi' }, 201);
    assert.deepEqual([(await status(other.id)).status, (await status(other.id)).note], ['disabled', 'Tự đặt']);
    assert.ok(minh);
  } finally { await f.close(); }
});

test('new customers get one link of their own Family on lookup, never shared, and it is ticked Đã gửi', async () => {
  const f = await server(); try {
    const a = f.admin;
    const fam = await a('families', 'POST', { name: 'Family 12', manager_email: 'vicakarl2@example.com' }, 201);
    const add = (email, extra) => a('members', 'POST', { family_id: fam.id, email, customer_name: email.split('@')[0], expires_at: day(90), ...extra }, 201);
    const an = await add('an@example.com', { membership_status: 'invited' });
    await add('binh@example.com', { membership_status: 'new', joined_at: day(0) });
    await add('chi@example.com', { membership_status: 'active' });
    await add('dung@example.com', { membership_status: 'invited', expires_at: day(-3) });
    await add('em@example.com', { membership_status: 'invited' });
    const old = await a(`families/${fam.id}/invites`, 'POST', { label: 'cu', url: inviteUrl(80), sent_on: day(-20) }, 201);
    const first = await a(`families/${fam.id}/invites`, 'POST', { label: 'haihoangrr+aaaaaa@gmail.com', url: inviteUrl(81), sent_on: day(-2) }, 201);
    const second = await a(`families/${fam.id}/invites`, 'POST', { label: 'haihoangrr+bbbbbb@gmail.com', url: inviteUrl(82), sent_on: day(-1) }, 201);
    const manual = await a(`families/${fam.id}/invites`, 'POST', { label: 'tay', url: inviteUrl(83), sent_on: day(0) }, 201);
    await a(`invites/${manual.id}/sent`, 'PATCH', { sent: true, revision: 0 });
    const codes = (await a('state')).lookup_codes, look = async address => (await f.customer()('verify', 'POST', { email: address, code: codes[address] })).items[0];
    const anItem = await look('an@example.com');
    assert.deepEqual([anItem.view, anItem.move.kind, anItem.move.invite_url], ['move', 'join', inviteUrl(81)], 'oldest valid link first, the expired one skipped');
    assert.equal((await look('an@example.com')).move.invite_url, inviteUrl(81), 'same link again');
    assert.equal((await look('binh@example.com')).move.invite_url, inviteUrl(82), 'Mua mới gets the next link');
    assert.equal((await look('chi@example.com')).view, 'normal', 'a customer already in the group gets nothing');
    assert.equal((await look('dung@example.com')).view, 'expired');
    assert.equal((await look('em@example.com')).view, 'waiting', 'pool used up: wait for a link');
    let state = await a('state');
    const holder = id => state.invites.find(i => i.id === id);
    assert.deepEqual([holder(old.id).holder_state, holder(first.id).holder_state, holder(second.id).holder_state, holder(manual.id).holder_state], ['ready', 'assigned', 'assigned', 'sent']);
    assert.ok(holder(first.id).sent_at && holder(second.id).sent_at, 'shown links ticked Đã gửi');
    assert.ok((await a('journal')).entries.some(e => e.message.includes('Tự động: giao link mời haihoangrr+aaaaaa@gmail.com của Family 12 cho an@example.com')));
    // A new link in the pool goes to the waiting customer; joining marks the customer in the group.
    await a(`families/${fam.id}/invites`, 'POST', { label: 'moi', url: inviteUrl(84), sent_on: day(0) }, 201);
    assert.equal((await look('em@example.com')).move.invite_url, inviteUrl(84));
    const c = f.customer(); const signed = await c('verify', 'POST', { email: 'an@example.com', code: codes['an@example.com'] });
    const joined = await c('joined', 'POST', { move_id: signed.items[0].move.id });
    assert.equal(joined.items[0].view, 'normal');
    state = await a('state');
    assert.equal(state.members.find(m => m.id === an.id).membership_status, 'active');
    assert.equal(holder(first.id).holder_state, 'used');
    // An incident Family hands out nothing on lookup; the owner moves customers instead.
    const other = await a('families', 'POST', { name: 'Family 13', manager_email: 'owner13@example.com' }, 201);
    await a('members', 'POST', { family_id: other.id, email: 'gia@example.com', expires_at: day(30), membership_status: 'invited' }, 201);
    await a(`families/${other.id}/invites`, 'POST', { url: inviteUrl(85), sent_on: day(0) }, 201);
    await a(`families/${other.id}/status`, 'PATCH', { status: 'scanned', note: 'Quét', revision: 0 });
    const gia = (await a('state')).lookup_codes['gia@example.com'];
    assert.equal((await f.customer()('verify', 'POST', { email: 'gia@example.com', code: gia })).items[0].view, 'incident');
  } finally { await f.close(); }
});
