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
    assert.deepEqual(Object.keys(info.shop).sort(), ['contact_label', 'contact_url', 'facebook_url', 'help_text', 'shop_name', 'short_domain', 'zalo_url']);
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
    assert.deepEqual([result.items[0].view, result.items[0].status, result.items[0].move], ['incident', 'disabled', null], 'past expiry still sees the incident, not only a renewal reminder');
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
    assert.deepEqual((await f.customer()('info')).shop, { shop_name: 'Shop Family', contact_url: 'https://m.me/shop.family', contact_label: 'Nhắn Messenger', help_text: 'Phản hồi 8h–22h', short_domain: '', zalo_url: '', facebook_url: '' });
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
    assert.equal(s.status, 'scanned'); assert.match(s.note, /Nhóm Youtube của bạn bị Google quét/);
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
    assert.equal('customer_name' in anItem, false, 'the shop label for a customer is never sent to the lookup page');
    assert.deepEqual([anItem.view, anItem.move.kind, anItem.move.invite_url], ['move', 'join', inviteUrl(81)], 'oldest valid link first, the expired one skipped');
    assert.equal((await look('an@example.com')).move.invite_url, inviteUrl(81), 'same link again');
    assert.equal((await look('binh@example.com')).move.invite_url, inviteUrl(82), 'Mua mới gets the next link');
    assert.equal((await look('chi@example.com')).view, 'normal', 'a customer already in the group gets nothing');
    assert.equal((await look('dung@example.com')).view, 'waiting', 'past expiry still waits for a link');
    assert.equal((await look('em@example.com')).view, 'waiting', 'pool used up: wait for a link');
    let state = await a('state');
    const holder = id => state.invites.find(i => i.id === id);
    assert.deepEqual([holder(old.id).holder_state, holder(first.id).holder_state, holder(second.id).holder_state, holder(manual.id).holder_state], ['ready', 'assigned', 'assigned', 'sent']);
    assert.ok(holder(first.id).sent_at && holder(second.id).sent_at, 'shown links ticked Đã gửi');
    assert.ok((await a('journal')).entries.some(e => e.message.includes('Tự động: giao link mời haihoangrr+aaaaaa@gmail.com của Family 12 cho an@example.com')));
    // A new link in the pool goes to the waiting customer; joining marks the customer in the group.
    await a(`families/${fam.id}/invites`, 'POST', { label: 'moi', url: inviteUrl(84), sent_on: day(0) }, 201);
    assert.equal((await look('em@example.com')).move.invite_url, inviteUrl(84));
    await a(`families/${fam.id}/invites`, 'POST', { label: 'moi2', url: inviteUrl(86), sent_on: day(0) }, 201);
    assert.equal((await look('dung@example.com')).move.invite_url, inviteUrl(86), 'a customer past expiry gets a link too');
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

test('mail mời made by mistake can be deleted while it still waits for its link', async () => {
  const f = await server(); try {
    const a = f.admin, { oldFamily, newFamily } = await incident(a);
    const made = (await a(`families/${newFamily.id}/invite-mails`, 'POST', { count: 3 }, 201)).mails;
    const other = (await a(`families/${oldFamily.id}/invite-mails`, 'POST', { count: 1 }, 201)).mails;
    let state = await a('state');
    const id = address => state.invite_mails.find(m => m.email === address).id;
    await a(`families/${newFamily.id}/invites`, 'POST', { label: made[2], url: inviteUrl(90), sent_on: day(0) }, 201);
    for (const bad of [{}, { ids: [] }, { ids: ['1'] }]) await a(`families/${newFamily.id}/invite-mails`, 'DELETE', bad, 400);
    await a(`families/${newFamily.id}/invite-mails`, 'DELETE', { ids: [id(other[0])] }, 409);
    await a(`families/${newFamily.id}/invite-mails`, 'DELETE', { ids: [id(made[2])] }, 409);
    assert.deepEqual(await a(`families/${newFamily.id}/invite-mails`, 'DELETE', { ids: [id(made[0]), id(made[1])] }), { ok: true, deleted: 2 });
    state = await a('state');
    assert.deepEqual(state.invite_mails.map(m => m.email).sort(), [made[2], other[0]].sort());
    assert.ok((await a('journal')).entries.some(e => e.action === 'Xóa mail mời' && e.message.includes(made[0])));
  } finally { await f.close(); }
});

test('Đã fix · Cho khách vào moves every customer with their details and keeps the old Family Bị quét', async () => {
  const f = await server(); try {
    const a = f.admin, { oldFamily, newFamily, calm, minh, huy, bao } = await incident(a);
    const created = await a('issues', 'POST', { family_id: oldFamily.id, target_type: 'manager', title: 'Bị quét' }, 201);
    const stale = await a('members', 'POST', { family_id: newFamily.id, email: 'minhanh@example.com', customer_name: 'Bản cũ', expires_at: day(1) }, 201);
    await a(`families/${newFamily.id}/invites`, 'POST', { label: 'slot', url: inviteUrl(70), sent_on: day(0) }, 201);
    await a(`families/${oldFamily.id}/hand-over`, 'POST', { to_family_id: oldFamily.id, expected_manager_email: 'owner04@example.com' }, 400);
    await a(`families/${oldFamily.id}/hand-over`, 'POST', { to_family_id: newFamily.id, expected_manager_email: 'changed@example.com' }, 409);
    assert.deepEqual(await a(`families/${oldFamily.id}/hand-over`, 'POST', { to_family_id: newFamily.id, expected_manager_email: 'owner09@example.com' }), { ok: true, moved: 3, replaced: 1, family_id: newFamily.id, family_name: 'Family 09' });
    let state = await a('state');
    const moved = state.members.filter(m => m.family_id === newFamily.id).sort((x, y) => x.id - y.id);
    assert.deepEqual(moved.map(m => [m.id, m.email, m.customer_name, m.membership_status]), [[minh.id, 'minhanh@example.com', 'Minh Anh', 'active'], [huy.id, 'giahuy@example.com', 'Gia Huy', 'active'], [bao.id, 'quocbao@example.com', 'Quốc Bảo', 'active']], 'old records win, all details and member status kept');
    assert.deepEqual(state.moves.filter(m => m.to_family_id === newFamily.id && m.effective_state === 'assigned').map(m => [m.member_id, m.invite_id, m.from_family_name]).sort(), [[bao.id, null, 'Family 04'], [huy.id, null, 'Family 04'], [minh.id, null, 'Family 04']].sort(), 'each customer waits for a link');
    assert.equal(state.members.some(m => m.id === stale.id), false, 'duplicate in the new Family replaced');
    assert.equal(state.members.some(m => m.family_id === oldFamily.id), false);
    assert.equal(member(state, minh.id).expires_at, day(38), 'dates kept');
    // Customers now get the new Family's links on lookup.
    const item = (await f.customer()('verify', 'POST', { email: 'minhanh@example.com', code: state.lookup_codes['minhanh@example.com'] })).items[0];
    assert.deepEqual([item.family_name, item.view, item.move.kind, item.move.from_family_name, item.move.from_status, item.move.invite_url], ['Family 09', 'move', 'move', 'Family 04', 'scanned', inviteUrl(70)]);
    const late = (await f.customer()('verify', 'POST', { email: 'giahuy@example.com', code: state.lookup_codes['giahuy@example.com'] })).items[0];
    assert.deepEqual([late.view, late.move.state, late.move.invite_url], ['move', 'assigned', ''], 'no link left: the page says one is coming');
    await a(`families/${newFamily.id}/invites`, 'POST', { label: 'slot2', url: inviteUrl(71), sent_on: day(0) }, 201);
    assert.equal((await f.customer()('verify', 'POST', { email: 'quocbao@example.com', code: state.lookup_codes['quocbao@example.com'] })).items[0].move.invite_url, inviteUrl(71), 'past expiry gets one as well');
    let issue = state.issues.find(i => i.id === created.id);
    await a(`issues/${created.id}`, 'PATCH', { revision: issue.revision, status: 'done', resolution: 'move', move_family_id: oldFamily.id }, 400);
    await a(`issues/${created.id}`, 'PATCH', { revision: issue.revision, status: 'done', resolution: 'move', move_family_id: newFamily.id });
    state = await a('state'); issue = state.issues.find(i => i.id === created.id);
    assert.equal(issue.resolution_note, 'Đã chuyển khách sang Family 09.');
    assert.equal(state.family_statuses.find(x => x.family_id === oldFamily.id).status, 'scanned', 'old Family stays Bị quét');
    await a(`families/${oldFamily.id}/hand-over`, 'POST', { to_family_id: newFamily.id, expected_manager_email: 'owner09@example.com' }, 409);
    assert.ok((await a('journal')).entries.some(e => e.action === 'Cho khách vào Family mới'));
    // A customer whose Gmail is the new owner's blocks the hand-over.
    const ownerClash = await a('families', 'POST', { name: 'Family 20', manager_email: 'hoangnam@example.com' }, 201);
    await a(`families/${calm.id}/hand-over`, 'POST', { to_family_id: ownerClash.id, expected_manager_email: 'hoangnam@example.com' }, 409);
  } finally { await f.close(); }
});

test('Đã fix · Đổi sang mail mới keeps customers in the Family: statuses kept, old links retired, everyone waits for a new link', async () => {
  const f = await server(); try {
    const a = f.admin;
    const fam = await a('families', 'POST', { name: 'Family 30', manager_email: 'owner30@example.com' }, 201);
    const add = (email, extra) => a('members', 'POST', { family_id: fam.id, email, customer_name: email.split('@')[0], expires_at: day(60), ...extra }, 201);
    const ann = await add('ann@example.com', { membership_status: 'invited' });
    const lan = await add('lan@example.com', { membership_status: 'new', joined_at: day(0) });
    const tuan = await add('tuan@example.com', { membership_status: 'active', expires_at: day(-5) });
    // Before the scan: one link used by ann, one still ready, one Gen mail without a link yet.
    const used = await a(`families/${fam.id}/invites`, 'POST', { label: 'haihoangrr+old111@gmail.com', url: inviteUrl(90), sent_on: day(-3) }, 201);
    const spare = await a(`families/${fam.id}/invites`, 'POST', { label: 'haihoangrr+old222@gmail.com', url: inviteUrl(91), sent_on: day(-2) }, 201);
    const codes = (await a('state')).lookup_codes, look = async address => (await f.customer()('verify', 'POST', { email: address, code: codes[address] })).items[0];
    const c = f.customer(); const signed = await c('verify', 'POST', { email: 'ann@example.com', code: codes['ann@example.com'] });
    assert.equal(signed.items[0].move.invite_url, inviteUrl(90));
    await c('joined', 'POST', { move_id: signed.items[0].move.id });
    await a(`families/${fam.id}/invite-mails`, 'POST', { count: 1 }, 201);
    await new Promise(resolve => setTimeout(resolve, 5));
    const created = await a('issues', 'POST', { family_id: fam.id, target_type: 'manager' }, 201);
    assert.equal((await a('state')).issues.find(i => i.id === created.id).title, 'Bị quét', 'an empty title means Bị quét');
    await new Promise(resolve => setTimeout(resolve, 5));
    // After the report: a link of the new owner already came in.
    const fresh = await a(`families/${fam.id}/invites`, 'POST', { label: 'haihoangrr+new333@gmail.com', url: inviteUrl(92), sent_on: day(0) }, 201);
    let state = await a('state'), issue = state.issues.find(i => i.id === created.id);
    const before = Object.fromEntries(state.members.filter(m => m.family_id === fam.id).map(m => [m.id, m.membership_status]));
    assert.equal(before[ann.id], 'active');
    const done = { revision: issue.revision, expected_created_at: issue.created_at, status: 'done', resolution: 'replace', replacement_email: 'owner30b@example.com' };
    await a(`issues/${created.id}`, 'PATCH', { ...done, invite_count: 6 }, 400);
    const result = await a(`issues/${created.id}`, 'PATCH', { ...done, invite_count: 2 });
    assert.deepEqual([result.ok, result.waiting_customers, result.retired_links, result.invite_mails.mails.length, result.invite_mails.family_id], [true, 3, 2, 2, fam.id]);
    state = await a('state');
    assert.equal(state.families.find(x => x.id === fam.id).manager_email, 'owner30b@example.com');
    assert.equal(state.families.find(x => x.id === fam.id).trial_date, state.today, 'trial date is the change date');
    assert.deepEqual(Object.fromEntries(state.members.filter(m => m.family_id === fam.id).map(m => [m.id, m.membership_status])), before, 'member statuses untouched');
    assert.equal(state.family_statuses.find(x => x.family_id === fam.id).status, 'active');
    const holder = id => state.invites.find(i => i.id === id).holder_state;
    assert.deepEqual([holder(used.id), holder(spare.id), holder(fresh.id)], ['retired', 'retired', 'ready'], 'links from before the report are retired');
    assert.deepEqual(state.invite_mails.filter(x => x.family_id === fam.id).map(x => x.email).sort(), [...result.invite_mails.mails].sort(), 'old Gen mail removed, new ones kept');
    const waiting = state.moves.filter(m => m.to_family_id === fam.id && m.effective_state === 'assigned');
    assert.deepEqual(waiting.map(m => [m.member_id, m.invite_id, m.from_family_name, m.from_status]).sort(), [[ann.id, null, 'Family 30', 'scanned'], [lan.id, null, 'Family 30', 'scanned'], [tuan.id, null, 'Family 30', 'scanned']].sort());
    assert.equal(state.moves.some(m => m.to_family_id === fam.id && m.state === 'joined'), false, 'the old join is hidden');
    assert.ok((await a('journal')).entries.some(e => e.message.includes('Tự động: Family 30 đổi chủ sang owner30b@example.com: 3 khách chờ link vào nhóm mới, bỏ 2 link của chủ cũ')));
    // Lookups hand out the new owner's links only, to every customer including the expired one.
    const first = await look('tuan@example.com');
    assert.deepEqual([first.view, first.move.kind, first.move.from_family_name, first.move.invite_url], ['move', 'move', 'Family 30', inviteUrl(92)], 'expired customer gets the link');
    const second = await look('ann@example.com');
    assert.deepEqual([second.view, second.move.state, second.move.invite_url], ['move', 'assigned', ''], 'no ready link: the page says one is coming');
    await a(`families/${fam.id}/invites`, 'POST', { label: result.invite_mails.mails[0], url: inviteUrl(93), sent_on: day(0) }, 201);
    assert.equal((await look('ann@example.com')).move.invite_url, inviteUrl(93));
    state = await a('state');
    assert.equal(state.invites.find(i => i.url === inviteUrl(93)).holder_state, 'assigned');
    // Đổi link works on a customer who is still waiting.
    const lanMove = state.moves.find(m => m.member_id === lan.id && m.effective_state === 'assigned');
    const extra = await a(`families/${fam.id}/invites`, 'POST', { label: 'tay', url: inviteUrl(94), sent_on: day(0) }, 201);
    await a(`moves/${lanMove.id}`, 'PATCH', { action: 'reassign', revision: lanMove.revision, invite_id: extra.id, invite_revision: 0 });
    assert.equal((await look('lan@example.com')).move.invite_url, inviteUrl(94));
    // Retired links stay out of every pool.
    await a(`invites/${spare.id}/sent`, 'PATCH', { sent: true, revision: state.invites.find(i => i.id === spare.id).revision }, 409);
  } finally { await f.close(); }
});

test('a customer tells the shop Premium stopped: report on the page, in Fix lỗi, on Telegram; closed when the Family is reported', async () => {
  const { createServer } = await import('node:http');
  const calls = []; let updates = [];
  const stub = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const [, token, method] = req.url.match(/^\/bot([^/]+)\/(\w+)$/) || [];
    const params = raw ? JSON.parse(raw) : {}; calls.push({ token, method, params });
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (token !== '123456789:AAEgoodtokengoodtokengoodtoken12') return reply(401, { ok: false, description: 'Unauthorized' });
    if (method === 'getMe') return reply(200, { ok: true, result: { username: 'haishop_bot' } });
    if (method === 'getUpdates') return reply(200, { ok: true, result: updates });
    return reply(200, { ok: true, result: {} });
  });
  stub.listen(0, '127.0.0.1'); await once(stub, 'listening');
  const f = await server({ FAMILY_TELEGRAM_API: `http://127.0.0.1:${stub.address().port}` }); try {
    const a = f.admin, sent = () => calls.filter(c => c.method === 'sendMessage');
    const settle = () => new Promise(resolve => setTimeout(resolve, 150));
    // Telegram setup: wrong token, no /start yet, then connected with a test message.
    await a('telegram', 'POST', { token: 'not a token' }, 400);
    await a('telegram', 'POST', { token: '123456789:AAEwrongtokenwrongtokenwrongtok' }, 502);
    await a('telegram', 'POST', { token: '123456789:AAEgoodtokengoodtokengoodtoken12' }, 409);
    updates = [{ update_id: 1, message: { chat: { id: 777, type: 'private', first_name: 'Hải' }, text: '/start' } }];
    assert.deepEqual((await a('telegram', 'POST', { token: '123456789:AAEgoodtokengoodtokengoodtoken12' })).telegram, { enabled: true, bot: 'haishop_bot', chat: 'Hải' });
    assert.equal(sent().length, 1); assert.equal(sent()[0].params.chat_id, 777);
    let state = await a('state');
    assert.deepEqual(state.telegram, { enabled: true, bot: 'haishop_bot', chat: 'Hải' });
    assert.equal(JSON.stringify(state).includes('AAEgoodtoken'), false, 'the token never reaches the admin page');
    assert.equal(JSON.stringify(await f.customer()('info')).includes('AAEgoodtoken'), false);
    await a('telegram/test', 'POST', {}); assert.equal(sent().length, 2);
    // A customer of a working Family reports.
    const fam = await a('families', 'POST', { name: 'Family 40', manager_email: 'owner40@example.com' }, 201);
    await a('members', 'POST', { family_id: fam.id, email: 'lan@example.com', expires_at: day(30), membership_status: 'active' }, 201);
    await a('members', 'POST', { family_id: fam.id, email: 'minh@example.com', expires_at: day(-2), membership_status: 'active' }, 201);
    const codes = (await a('state')).lookup_codes, lan = f.customer(), minh = f.customer();
    let item = (await lan('verify', 'POST', { email: 'lan@example.com', code: codes['lan@example.com'] })).items[0];
    assert.deepEqual([item.view, item.problem, typeof item.member_ref], ['normal', null, 'number']);
    await lan('problem', 'POST', { member: item.member_ref + 999, reason: 'lost_premium' }, 404);
    await lan('problem', 'POST', { member: item.member_ref, reason: 'nope' }, 400);
    item = (await lan('problem', 'POST', { member: item.member_ref, reason: 'lost_premium', note: 'Mất từ sáng' })).items[0];
    assert.deepEqual([item.view, item.problem.state, item.problem.reason], ['reported', 'open', 'lost_premium']);
    await lan('problem', 'POST', { member: item.member_ref, reason: 'other' }, 409);
    await settle();
    assert.match(sent().at(-1).params.text, /Khách báo mất Premium\nGmail: lan@example.com\nFamily: Family 40 \(owner40@example.com\)\nLỗi: Mất Premium hoặc hiện quảng cáo\nGhi chú: Mất từ sáng/);
    const minhItem = (await minh('verify', 'POST', { email: 'minh@example.com', code: codes['minh@example.com'] })).items[0];
    assert.equal(minhItem.view, 'expired');
    assert.equal((await minh('problem', 'POST', { member: minhItem.member_ref, reason: 'left_family' })).items[0].view, 'reported', 'past expiry can report too');
    await settle();
    assert.match(sent().at(-1).params.text, /Family này đang có 2 khách báo lỗi\./);
    state = await a('state');
    assert.deepEqual(state.customer_reports.map(r => [r.email, r.reason, r.handled_at]), [['minh@example.com', 'left_family', ''], ['lan@example.com', 'lost_premium', '']]);
    assert.ok((await a('journal')).entries.some(e => e.action === 'Khách báo mất Premium' && e.actor === 'Khách tra cứu'));
    // The shop reports the owner mail: reports close and the customers see the incident.
    await a('issues', 'POST', { family_id: fam.id, target_type: 'manager' }, 201);
    state = await a('state');
    assert.ok(state.customer_reports.every(r => r.handled_at), 'reports closed by the incident');
    item = (await lan('me')).items[0];
    assert.deepEqual([item.view, item.problem.state], ['incident', 'handled']);
    await lan('problem', 'POST', { member: item.member_ref, reason: 'other' }, 409);
    // The shop marks a single report as handled with a message to the customer.
    const calm = await a('families', 'POST', { name: 'Family 41', manager_email: 'owner41@example.com' }, 201);
    await a('members', 'POST', { family_id: calm.id, email: 'hoa@example.com', expires_at: day(30), membership_status: 'active' }, 201);
    const hoa = f.customer(), hoaItem = (await hoa('verify', 'POST', { email: 'hoa@example.com', code: (await a('state')).lookup_codes['hoa@example.com'] })).items[0];
    await hoa('problem', 'POST', { member: hoaItem.member_ref, reason: 'left_family' });
    const report = (await a('state')).customer_reports.find(r => r.email === 'hoa@example.com');
    await a(`customer-reports/${report.id}`, 'PATCH', { revision: report.revision + 1 }, 409);
    await a(`customer-reports/${report.id}`, 'PATCH', { revision: report.revision, note: 'Shop đã mời lại bạn, kiểm tra Gmail.' });
    await a(`customer-reports/${report.id}`, 'PATCH', { revision: report.revision + 1 }, 409);
    item = (await hoa('me')).items[0];
    assert.deepEqual([item.view, item.problem.state, item.problem.handled_note], ['normal', 'handled', 'Shop đã mời lại bạn, kiểm tra Gmail.']);
    assert.ok((await a('journal')).entries.some(e => e.action === 'Xử lý khách báo lỗi'));
    // Turning Telegram off stops the messages.
    assert.deepEqual((await a('telegram', 'DELETE')).telegram, { enabled: false, bot: '', chat: '' });
    const before = sent().length;
    await hoa('problem', 'POST', { member: hoaItem.member_ref, reason: 'other' });
    await settle(); assert.equal(sent().length, before);
    await a('telegram/test', 'POST', {}, 409);
    const backup = await a('backup'); assert.equal(backup.tables.customer_reports.length, 4);
  } finally { await f.close(); stub.close(); }
});

test('short customer link /?CODE opens the lookup page without the access password', async () => {
  const f = await server({ PUBLIC_ORIGIN: 'https://family.example.com', ACCESS_PASSWORD: 'test-private-access' }); try {
    const page = await fetch(f.base + '/?K7P2QX', { redirect: 'manual' });
    assert.equal(page.status, 200); assert.match(await page.text(), /tra-cuu\.js/);
    assert.equal((await fetch(f.base + '/', { redirect: 'manual' })).status, 302, 'the admin app still asks for the password');
    assert.equal((await fetch(f.base + '/?K7P2QX&x=1', { redirect: 'manual' })).status, 302);
  } finally { await f.close(); }
});

test('a spare short domain can be saved for customer links', async () => {
  const f = await server(); try {
    const a = f.admin;
    assert.equal((await a('lookup-settings', 'PATCH', { shop_name: 'Hải', short_domain: 'HaiPre.vn/' })).settings.short_domain, 'https://haipre.vn');
    await a('lookup-settings', 'PATCH', { short_domain: 'beeflix.vn/haiytb/x' }, 400);
    assert.equal((await a('lookup-settings', 'PATCH', { short_domain: 'Beeflix.vn/haiytb/' })).settings.short_domain, 'https://beeflix.vn/haiytb');
    await a('lookup-settings', 'PATCH', { short_domain: 'not a domain' }, 400);
    assert.equal((await a('lookup-settings', 'PATCH', { short_domain: '' })).settings.short_domain, '');
  } finally { await f.close(); }
});

test('Zalo and Facebook links are saved and shown to customers', async () => {
  const f = await server(); try {
    await f.admin('lookup-settings', 'PATCH', { zalo_url: 'https://zalo.me/0901234567', facebook_url: 'https://m.me/hai.premium' });
    const shop = (await f.customer()('info')).shop;
    assert.deepEqual([shop.zalo_url, shop.facebook_url], ['https://zalo.me/0901234567', 'https://m.me/hai.premium']);
    await f.admin('lookup-settings', 'PATCH', { zalo_url: 'javascript:alert(1)' }, 400);
  } finally { await f.close(); }
});

test('a checked link a customer never used goes back to the pool and the customer waits for a new one', async () => {
  const f = await server(); try {
    const a = f.admin;
    const fam = await a('families', 'POST', { name: 'Family 70', manager_email: 'owner70@example.com' }, 201);
    await a('members', 'POST', { family_id: fam.id, email: 'an70@example.com', expires_at: day(30), membership_status: 'invited' }, 201);
    await a('members', 'POST', { family_id: fam.id, email: 'binh70@example.com', expires_at: day(30), membership_status: 'invited' }, 201);
    const link = await a(`families/${fam.id}/invites`, 'POST', { label: 'slot70', url: inviteUrl(700), sent_on: day(0) }, 201);
    const codes = (await a('state')).lookup_codes, look = async m => (await f.customer()('verify', 'POST', { email: m, code: codes[m] })).items[0];
    assert.equal((await look('an70@example.com')).move.invite_url, inviteUrl(700));
    assert.equal((await look('binh70@example.com')).view, 'waiting');
    let state = await a('state'); const move = state.moves.find(m => m.email === 'an70@example.com');
    await a(`moves/${move.id}`, 'PATCH', { action: 'unassign', revision: move.revision });
    state = await a('state'); assert.equal(state.invites.find(i => i.id === link.id).holder_state, 'ready');
    assert.equal((await look('binh70@example.com')).move.invite_url, inviteUrl(700), 'the next customer gets it');
    assert.deepEqual([(await look('an70@example.com')).view, (await look('an70@example.com')).move.invite_url], ['move', ''], 'the first customer waits');
    await a(`moves/${move.id}`, 'PATCH', { action: 'unassign', revision: move.revision + 1 }, 409);
  } finally { await f.close(); }
});

test('Việc cần làm: add for a day, tick, edit, delete, and it travels in the backup', async () => {
  const f = await server(), target = await server(); try {
    const a = f.admin;
    await a('todos', 'POST', { text: '   ', due_on: day(1) }, 400);
    await a('todos', 'POST', { text: 'x'.repeat(301) }, 400);
    await a('todos', 'POST', { text: 'Nhắc', due_on: '2026-02-30' }, 400);
    const tomorrow = await a('todos', 'POST', { text: '  Gọi   khách  Minh Anh ', due_on: day(1) }, 201);
    assert.equal(tomorrow.text, 'Gọi khách Minh Anh'); assert.equal(tomorrow.due_on, day(1)); assert.equal(tomorrow.done_at, '');
    const loose = await a('todos', 'POST', { text: 'Không đặt ngày' }, 201);
    assert.equal(loose.due_on, '');
    let todos = (await a('state')).todos;
    assert.deepEqual(todos.map(t => t.id), [tomorrow.id, loose.id], 'dated items first, undated last');
    const ticked = await a(`todos/${tomorrow.id}`, 'PATCH', { done: true });
    assert.ok(ticked.done_at); assert.equal(ticked.text, 'Gọi khách Minh Anh');
    assert.equal((await a(`todos/${tomorrow.id}`, 'PATCH', { done: true })).done_at, ticked.done_at, 'ticking again keeps the time');
    await a(`todos/${tomorrow.id}`, 'PATCH', { done: 'yes' }, 400);
    const edited = await a(`todos/${tomorrow.id}`, 'PATCH', { text: 'Gọi khách', due_on: '', done: false });
    assert.deepEqual([edited.text, edited.due_on, edited.done_at], ['Gọi khách', '', '']);
    await a('todos/9999', 'PATCH', { done: true }, 404);
    const backup = await a('backup');
    assert.equal(backup.tables.todos.length, 2);
    await a(`todos/${loose.id}`, 'DELETE');
    await a(`todos/${loose.id}`, 'DELETE', undefined, 404);
    assert.deepEqual((await a('state')).todos.map(t => t.id), [tomorrow.id]);
    assert.equal((await a('journal')).entries.some(e => /việc cần làm/i.test(e.message)), false, 'personal notes stay out of the journal');
    await target.admin('restore', 'POST', backup);
    assert.equal((await target.admin('state')).todos.length, 2);
    const older = structuredClone(backup); delete older.tables.todos;
    const empty = await server(); try { await empty.admin('restore', 'POST', older); assert.equal((await empty.admin('state')).todos.length, 0); } finally { await empty.close(); }
  } finally { await f.close(); await target.close(); }
});

test('an open owner case can be deleted (reported by mistake) and the Family goes back to Hoạt động', async () => {
  const f = await server(); try {
    const a = f.admin;
    const fam = await a('families', 'POST', { name: 'Family 21', manager_email: 'owner21@example.com' }, 201);
    const created = await a('issues', 'POST', { family_id: fam.id, target_type: 'manager', title: 'Bị quét' }, 201);
    let state = await a('state');
    assert.equal(state.family_statuses.find(s => s.family_id === fam.id).status, 'scanned');
    const issue = state.issues.find(i => i.id === created.id);
    await a(`issues/${created.id}`, 'DELETE', { revision: issue.revision, expected_created_at: issue.created_at });
    state = await a('state');
    assert.equal(state.issues.length, 0);
    assert.equal(state.family_statuses.find(s => s.family_id === fam.id).status, 'active');
  } finally { await f.close(); }
});

test('Gán mail: note up to 5 customer mails on a link, optionally ticking it Đã gửi', async () => {
  const f = await server(), target = await server(); try {
    const a = f.admin;
    const fam = await a('families', 'POST', { name: 'Family 31', manager_email: 'owner31@example.com' }, 201);
    const inv = await a(`families/${fam.id}/invites`, 'POST', { label: 'shop+31@gmail.com', url: inviteUrl(31), sent_on: day(0) }, 201);
    const rev = async () => (await a('state')).invites.find(i => i.id === inv.id);
    await a(`invites/${inv.id}/recipients`, 'PATCH', { recipients: [{ email: 'not-a-mail' }], revision: 0 }, 400);
    await a(`invites/${inv.id}/recipients`, 'PATCH', { recipients: Array.from({ length: 6 }, (_, k) => ({ email: `k${k}@example.com` })), revision: 0 }, 400);
    await a(`invites/${inv.id}/recipients`, 'PATCH', { recipients: [{ email: 'a@example.com' }, { email: 'A@example.com' }], revision: 0 }, 400);
    await a(`invites/${inv.id}/recipients`, 'PATCH', { recipients: [], revision: 5 }, 409);
    let saved = await a(`invites/${inv.id}/recipients`, 'PATCH', { recipients: [{ email: ' Minh@Example.com ', name: ' Minh Anh ' }, { email: 'huy@example.com' }], revision: 0, mark_sent: false });
    assert.deepEqual(saved.recipients, [{ email: 'minh@example.com', name: 'Minh Anh' }, { email: 'huy@example.com', name: '' }]);
    let row = await rev();
    assert.deepEqual(JSON.parse(row.recipients), saved.recipients); assert.equal(row.holder_state, 'ready', 'without the tick the link stays in the pool');
    saved = await a(`invites/${inv.id}/recipients`, 'PATCH', { recipients: [{ email: 'minh@example.com', name: 'Minh Anh' }], revision: row.revision, mark_sent: true });
    assert.equal(saved.marked_sent, true); row = await rev(); assert.equal(row.holder_state, 'sent');
    assert.ok((await a('journal')).entries.some(e => e.action === 'Gán mail cho link mời'));
    const backup = await a('backup'); await target.admin('restore', 'POST', backup);
    assert.equal((await target.admin('state')).invites[0].recipients, row.recipients);
    const older = structuredClone(backup); for (const r of older.tables.family_invites) delete r.recipients;
    const empty = await server(); try { await empty.admin('restore', 'POST', older); assert.equal((await empty.admin('state')).invites[0].recipients, ''); } finally { await empty.close(); }
    await a(`invites/${inv.id}/recipients`, 'PATCH', { recipients: [], revision: row.revision });
    row = await rev(); assert.equal(row.recipients, ''); assert.equal(row.holder_state, 'sent', 'clearing the mails keeps Đã gửi');
  } finally { await f.close(); await target.close(); }
});

test('Gen mail links go only to customers who need one (Mua mới, waiting); the shop can change or remove who holds a link', async () => {
  const f = await server(); try {
    const a = f.admin;
    const add = (family, email, membership_status = 'active') => a('members', 'POST', { family_id: family.id, email, customer_name: email.split('@')[0], expires_at: day(90), membership_status, ...(membership_status === 'new' ? { joined_at: day(0), plan_months: 1 } : {}) }, 201);
    const look = async address => (await f.customer()('verify', 'POST', { email: address, code: (await a('state')).lookup_codes[address] })).items[0];
    // A running Family with 4 customers in its group and no link recorded: a new customer is coming.
    const fam = await a('families', 'POST', { name: 'Family 50', manager_email: 'owner50@example.com' }, 201);
    for (const m of ['a1@example.com', 'a2@example.com', 'a3@example.com', 'a4@example.com']) await add(fam, m);
    const gen = await a(`families/${fam.id}/invite-mails`, 'POST', { count: 1 }, 201);
    assert.equal(gen.auto_assign, true); assert.deepEqual(gen.targets, [], 'customers already in the group are never pre-assigned');
    assert.deepEqual((await a(`families/${fam.id}/invites`, 'POST', { label: gen.mails[0], url: inviteUrl(500), sent_on: day(0) }, 201)).assigned, []);
    assert.deepEqual((await add(fam, 'khachmoi@example.com', 'new')).assigned.map(x => x.label), [gen.mails[0]], 'the new customer (Mua mới) gets the waiting link');
    assert.equal((await look('khachmoi@example.com')).move.invite_url, inviteUrl(500));
    assert.equal((await look('a1@example.com')).view === 'move', false, 'old customers see nothing new');

    // A Family with no customers yet: links wait in the pool; Mua mới customers take them as they are added.
    const empty = await a('families', 'POST', { name: 'Family 51', manager_email: 'owner51@example.com' }, 201);
    const gen2 = await a(`families/${empty.id}/invite-mails`, 'POST', { count: 4 }, 201);
    assert.deepEqual(gen2.targets, []);
    for (const [k, mail] of gen2.mails.entries()) assert.deepEqual((await a(`families/${empty.id}/invites`, 'POST', { label: mail, url: inviteUrl(520 + k), sent_on: day(0) }, 201)).assigned, []);
    assert.deepEqual((await add(empty, 'b1@example.com', 'new')).assigned.map(x => x.label), [gen2.mails[0]]);
    assert.deepEqual((await add(empty, 'b2@example.com')).assigned, [], 'Chưa xác minh / Đã vào is not pre-assigned');
    assert.deepEqual((await add(empty, 'moi@example.com', 'new')).assigned.map(x => x.label), [gen2.mails[1]]);
    // Chuyển Family of a Mua mới customer takes the next one.
    const side = await a('families', 'POST', { name: 'Family 52b', manager_email: 'owner52b@example.com' }, 201);
    await add(side, 'chuyen@example.com', 'new');
    const mover = (await a('state')).members.find(m => m.email === 'chuyen@example.com');
    await a(`members/${mover.id}/transfer`, 'POST', { family_id: empty.id, expected_manager_email: 'owner51@example.com', revision: mover.renewal_revision, expected_family_id: side.id, expected_email: mover.email });
    assert.equal((await look('chuyen@example.com')).move.invite_url, inviteUrl(522));
    // Gán N link cho khách (by hand) also covers customers already in the group.
    assert.deepEqual((await a(`families/${empty.id}/assign-links`, 'POST', {})).assigned.map(x => [x.label, x.email]), [[gen2.mails[3], 'b2@example.com']]);

    // Khách nhận link: remove the customer the web gave a link to, then give it to someone else.
    let state = await a('state');
    let link = state.invites.find(i => i.label === gen2.mails[3]);
    assert.equal(link.holder_email, 'b2@example.com');
    await a(`invites/${link.id}/holder`, 'PATCH', { member_id: null, revision: link.revision - 1 }, 409);
    const removed = await a(`invites/${link.id}/holder`, 'PATCH', { member_id: null, revision: link.revision });
    state = await a('state'); link = state.invites.find(i => i.id === link.id);
    assert.equal(link.holder_state, 'ready'); assert.equal(removed.revision, link.revision);
    assert.notEqual((await look('b2@example.com')).view, 'move', 'the removed customer no longer sees the link');
    const b9 = (await add(empty, 'b9@example.com')).id;
    const other = state.moves.find(mv => mv.invite_id && mv.email === 'b1@example.com');
    await a(`invites/${link.id}/holder`, 'PATCH', { member_id: other.member_id, revision: link.revision }, 409);
    await a(`invites/${link.id}/holder`, 'PATCH', { member_id: b9, revision: link.revision });
    assert.equal((await look('b9@example.com')).move.invite_url, inviteUrl(523));
    assert.ok((await a('journal')).entries.some(e => e.action === 'Đổi khách nhận link'));

    // A link taken back (Thu hồi link) stays in the pool: the next Mua mới customer does not get it by itself.
    state = await a('state');
    const held = state.moves.find(m => m.email === 'b1@example.com' && m.invite_id);
    await a(`moves/${held.id}`, 'PATCH', { action: 'release', revision: held.revision });
    await a(`members/${b9}`, 'DELETE');
    assert.deepEqual((await add(empty, 'b10@example.com', 'new')).assigned, []);
    const backup = await a('backup');
    assert.ok(backup.tables.invite_mails.every(r => [0, 1, 2].includes(r.auto_assign)));
    const older = structuredClone(backup); for (const r of older.tables.invite_mails) delete r.auto_assign;
    const target = await server(); try { await target.admin('restore', 'POST', older); assert.ok((await target.admin('state')).invite_mails.every(r => r.auto_assign === 0)); } finally { await target.close(); }
  } finally { await f.close(); }
});

test('after Đổi Gmail chủ, links of the generated mails go to the waiting customers on their moves', async () => {
  const f = await server(); try {
    const a = f.admin;
    const fam = await a('families', 'POST', { name: 'Family 52', manager_email: 'owner52@example.com' }, 201);
    for (const m of ['c1@example.com', 'c2@example.com']) await a('members', 'POST', { family_id: fam.id, email: m, customer_name: m.split('@')[0], expires_at: day(90), membership_status: 'active' }, 201);
    await a(`families/${fam.id}/invites`, 'POST', { label: 'old@example.com', url: inviteUrl(530), sent_on: day(-1) }, 201);
    await new Promise(r => setTimeout(r, 20));
    const issue = await a('issues', 'POST', { family_id: fam.id, target_type: 'manager', title: 'Bị quét' }, 201);
    await new Promise(r => setTimeout(r, 20));
    const fixed = await a(`issues/${issue.id}`, 'PATCH', { revision: 0, status: 'done', resolution: 'replace', replacement_email: 'owner52b@example.com', expected_email: 'owner52@example.com', invite_count: 2 });
    const mails = fixed.invite_mails.mails;
    let state = await a('state');
    const waiting = state.moves.filter(m => m.to_family_id === fam.id && m.state === 'assigned' && m.invite_id == null).map(m => m.id).sort();
    assert.equal(waiting.length, 2);
    for (const [k, mail] of mails.entries()) await a(`families/${fam.id}/invites`, 'POST', { label: mail, url: inviteUrl(540 + k), sent_on: day(0) }, 201);
    state = await a('state');
    const moves = state.moves.filter(m => m.to_family_id === fam.id && m.state === 'assigned');
    assert.deepEqual(moves.map(m => m.id).sort(), waiting, 'the same waiting moves now hold the links');
    assert.ok(moves.every(m => m.invite_id != null));
  } finally { await f.close(); }
});

test('Đã fix · Đổi Gmail chủ: Gen mail then Lấy link hands a link to every waiting customer except Đã mời, chưa vào, also in a second batch', async () => {
  const f = await server(); try {
    const a = f.admin;
    const fam = await a('families', 'POST', { name: 'Family 53', manager_email: 'owner53@example.com' }, 201);
    const add = (email, membership_status) => a('members', 'POST', { family_id: fam.id, email, customer_name: email.split('@')[0], expires_at: day(90), membership_status, ...(membership_status === 'new' ? { joined_at: day(0), plan_months: 1 } : {}) }, 201);
    await add('m1@example.com', 'active'); await add('m2@example.com', 'invited'); await add('m3@example.com', 'new'); await add('m4@example.com', 'active');
    await new Promise(r => setTimeout(r, 20));
    const issue = await a('issues', 'POST', { family_id: fam.id, target_type: 'manager', title: 'Bị quét' }, 201);
    await new Promise(r => setTimeout(r, 20));
    await a(`issues/${issue.id}`, 'PATCH', { revision: 0, status: 'done', resolution: 'replace', replacement_email: 'owner53b@example.com', expected_email: 'owner53@example.com', invite_count: 0 });
    const gen = await a(`families/${fam.id}/invite-mails`, 'POST', { count: 2 }, 201);
    assert.equal(gen.auto_mode, 2); assert.deepEqual(gen.targets.map(t => t.email), ['m1@example.com', 'm3@example.com']);
    for (const [k, mail] of gen.mails.entries()) await a(`families/${fam.id}/invites`, 'POST', { label: mail, url: inviteUrl(600 + k), sent_on: day(0) }, 201);
    // Second batch: the Family has links now, but a customer still waits, so these links go to waiting customers only.
    const gen2 = await a(`families/${fam.id}/invite-mails`, 'POST', { count: 2 }, 201);
    assert.equal(gen2.auto_mode, 2); assert.deepEqual(gen2.targets.map(t => t.email), ['m4@example.com']);
    const second = [];
    for (const [k, mail] of gen2.mails.entries()) second.push((await a(`families/${fam.id}/invites`, 'POST', { label: mail, url: inviteUrl(610 + k), sent_on: day(0) }, 201)).assigned.map(x => x.email));
    assert.deepEqual(second, [['m4@example.com'], []], 'the Đã mời, chưa vào customer is left out');
    const look = async address => (await f.customer()('verify', 'POST', { email: address, code: (await a('state')).lookup_codes[address] })).items[0];
    for (const [address, url] of [['m1@example.com', inviteUrl(600)], ['m3@example.com', inviteUrl(601)], ['m4@example.com', inviteUrl(610)]]) {
      const item = await look(address); assert.equal(item.view, 'move'); assert.equal(item.move.invite_url, url, address + ' sees the link assigned to them');
    }
    assert.equal((await look('m2@example.com')).move.invite_url, inviteUrl(611), 'Đã mời, chưa vào takes the leftover link on lookup');
    const state = await a('state');
    assert.deepEqual(state.invites.filter(i => i.family_id === fam.id && i.holder_state !== 'retired').map(i => [i.url, i.holder_email]), [[inviteUrl(600), 'm1@example.com'], [inviteUrl(601), 'm3@example.com'], [inviteUrl(610), 'm4@example.com'], [inviteUrl(611), 'm2@example.com']]);
  } finally { await f.close(); }
});

test('Cho khách vào a prepared Family: its ready Gen mail links go to the customers moved in', async () => {
  const f = await server(); try {
    const a = f.admin;
    const prepared = await a('families', 'POST', { name: 'Family 54', manager_email: 'owner54@example.com' }, 201);
    const gen = await a(`families/${prepared.id}/invite-mails`, 'POST', { count: 2 }, 201);
    for (const [k, mail] of gen.mails.entries()) await a(`families/${prepared.id}/invites`, 'POST', { label: mail, url: inviteUrl(700 + k), sent_on: day(0) }, 201);
    const old = await a('families', 'POST', { name: 'Family 55', manager_email: 'owner55@example.com' }, 201);
    for (const m of ['s1@example.com', 's2@example.com']) await a('members', 'POST', { family_id: old.id, email: m, customer_name: m.split('@')[0], expires_at: day(90), membership_status: 'active' }, 201);
    await a(`families/${old.id}/hand-over`, 'POST', { to_family_id: prepared.id, expected_manager_email: 'owner54@example.com' });
    const state = await a('state');
    assert.deepEqual(state.invites.filter(i => i.family_id === prepared.id).map(i => [i.holder_state, i.holder_email]), [['assigned', 's1@example.com'], ['assigned', 's2@example.com']]);
    const item = (await f.customer()('verify', 'POST', { email: 's2@example.com', code: state.lookup_codes['s2@example.com'] })).items[0];
    assert.equal(item.move.invite_url, inviteUrl(701));
  } finally { await f.close(); }
});
