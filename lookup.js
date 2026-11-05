// Tra cứu & chuyển nhóm: Family status for customers, invite link pools, bulk moves
// with one invite per customer, and the public lookup page (Gmail + personal code).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { today, expiry, familyStatusLabels, inviteExpiry } from './domain.js';

export const familyStatuses = ['active', 'checking', 'scanned', 'disabled'];
export const problemStatuses = ['checking', 'scanned', 'disabled'];
export const openMoveStates = ['assigned', 'opened', 'failed'];
export const reportReasons = ['twelve_months', 'invite_used', 'other_family', 'other'];
// What a customer can tell the shop from the lookup page while their group still looks fine.
export const problemReasons = { lost_premium: 'Mất Premium hoặc hiện quảng cáo', left_family: 'Bị đưa ra khỏi nhóm gia đình', other: 'Lỗi khác' };
export const lookupBackupTables = ['family_statuses', 'family_invites', 'member_moves', 'lookup_codes', 'lookup_settings', 'invite_mails', 'customer_reports'];
// invite_mails (0.23.0) and customer_reports (0.28.0) joined backup version 10 later; earlier version-10 files simply have none.
export const optionalBackupTables = ['invite_mails', 'customer_reports'];
// Gen mail mời: random tag after "+" on the shop's Gmail, e.g. haihoangrr+k7p2qx@gmail.com.
export const inviteMailAlphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
export const inviteMailMax = 5;
// The shop Gmail that receives every invitation (the Apps Script mailbox).
export const inviteMailInbox = 'haihoangrr@gmail.com';
export const autoScannedNote = name => 'Nhóm Youtube của bạn bị Google quét nên có thể mất Premium. Shop đang xử lý và sẽ cập nhật tại đây.';
export function inviteMailBase(address) {
  const at = address.lastIndexOf('@'), local = address.slice(0, at).split('+')[0];
  return local && at > 0 ? local + address.slice(at) : '';
}
export const codeAlphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const lookupLimits = { window: 15 * 60000, email: 8, ip: 40, session: 60 * 60000, moves: 50 };
const settingNames = ['shop_name', 'contact_url', 'contact_label', 'help_text'];

// An invite is "used" once a customer joined with it, "assigned" while an open move still
// holds it for a customer who is in the target Family, otherwise it is ready to give out.
export function inviteHolder(refs) {
  const joined = refs.filter(r => r.state === 'joined').at(-1);
  if (joined) return { state: 'used', move: joined };
  const open = refs.filter(r => openMoveStates.includes(r.state) && r.member_family_id != null && r.member_family_id === r.to_family_id).at(-1);
  return open ? { state: 'assigned', move: open } : { state: 'ready', move: null };
}
export function normalizeCode(value) {
  const code = String(value ?? '').toUpperCase().replace(/[\s-]/g, '');
  return code.length === 6 && [...code].every(c => codeAlphabet.includes(c)) ? code : '';
}
// Personal codes are derived from the Gmail with a secret per-installation salt (kept in backups),
// so every customer has a stable code without storing one row per customer. A rotated code is an override row.
export function derivedCode(salt, address) {
  const mac = createHmac('sha256', salt).update('family-lookup-code\0' + address).digest();
  let code = ''; for (let i = 0; i < 6; i++) code += codeAlphabet[mac[i] % codeAlphabet.length];
  return code;
}
export function isGoogleInviteUrl(value) {
  let url; try { url = new URL(value); } catch { return false; }
  const host = url.hostname.toLowerCase();
  return url.protocol === 'https:' && !url.username && !url.password && (host === 'google.com' || host.endsWith('.google.com') || host.endsWith('.googleapis.com') || host === 'g.co');
}

export function initLookup(db, { fail, email, text, calendarDate, log }) {
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  const now = () => new Date().toISOString();
  const digest = value => createHash('sha256').update(value).digest('hex');
  const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
  const label = status => familyStatusLabels[status] || status;
  function atomic(name, operation) {
    db.exec(`SAVEPOINT ${name}`);
    try { const result = operation(); db.exec(`RELEASE ${name}`); return result; }
    catch (error) { db.exec(`ROLLBACK TO ${name}; RELEASE ${name}`); throw error; }
  }
  const revision = (value, message = 'Dữ liệu đã thay đổi. Tải lại trang rồi thử lại.') => { if (!Number.isInteger(value)) fail(message); return value; };
  const activeFamily = id => Number.isSafeInteger(id) && id > 0 ? one("SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=? AND f.archived_at=''", id) : undefined;
  const statusRow = familyId => one('SELECT * FROM family_statuses WHERE family_id=?', familyId) || { family_id: familyId, status: 'active', note: '', updated_at: '', revision: 0 };
  // A link already shown to a customer (Đã gửi) is not handed out again; a link of a replaced
  // owner (retired) is never handed out.
  const inviteState = invite => { if (invite.retired_at) return 'retired'; const state = inviteHolder(inviteRefs(invite.id)).state; return state === 'ready' && invite.sent_at ? 'sent' : state; };
  const inviteRefs = inviteId => all("SELECT mv.id,mv.state,mv.email,mv.customer_name,mv.to_family_id,mv.member_id,m.family_id AS member_family_id FROM member_moves mv LEFT JOIN members m ON m.id=mv.member_id WHERE mv.invite_id=? AND mv.state!='cancelled' ORDER BY mv.id", inviteId);

  function settings() {
    const saved = Object.fromEntries(all('SELECT name,value FROM lookup_settings').map(row => [row.name, row.value]));
    return Object.fromEntries(settingNames.map(name => [name, saved[name] || '']));
  }
  function contactUrl(value) {
    const result = text(value, 500); if (!result) return '';
    let url; try { url = new URL(result); } catch { fail('Link liên hệ cần bắt đầu bằng https:// hoặc http://'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) fail('Link liên hệ cần bắt đầu bằng https:// hoặc http://');
    return result;
  }
  function saveSettings(data) {
    const values = { shop_name: text(data.shop_name, 100), contact_url: contactUrl(data.contact_url), contact_label: text(data.contact_label, 60), help_text: text(data.help_text, 500) };
    return atomic('lookup_settings_save', () => {
      for (const [name, value] of Object.entries(values)) {
        if (one('SELECT id FROM lookup_settings WHERE name=?', name)) run('UPDATE lookup_settings SET value=? WHERE name=?', value, name);
        else run('INSERT INTO lookup_settings(name,value) VALUES (?,?)', name, value);
      }
      log('Cá nhân: sửa thông tin trang tra cứu');
      return { ok: true, settings: settings() };
    });
  }

  function salt() {
    const row = one("SELECT value FROM lookup_settings WHERE name='code_salt'");
    if (row && /^[a-f0-9]{64}$/.test(row.value)) return row.value;
    // Normally created with the database; recreate rather than lock the admin out if it went missing.
    const value = randomBytes(32).toString('hex');
    if (row) run("UPDATE lookup_settings SET value=? WHERE name='code_salt'", value); else run("INSERT INTO lookup_settings(name,value) VALUES ('code_salt',?)", value);
    return value;
  }
  function codeFor(address, key = salt()) { return one('SELECT code FROM lookup_codes WHERE email=?', address)?.code || derivedCode(key, address); }
  function newCode() { let code = ''; for (let i = 0; i < 6; i++) code += codeAlphabet[randomInt(codeAlphabet.length)]; return code; }
  function rotateCode(data) {
    const address = email(data.email);
    if (!one("SELECT m.id FROM members m JOIN families f ON f.id=m.family_id WHERE m.email=? AND f.archived_at=''", address)) fail('Không tìm thấy khách đang hoạt động với Gmail này.', 404);
    return atomic('lookup_code_rotate', () => {
      let code = newCode(); while (code === codeFor(address)) code = newCode();
      if (one('SELECT id FROM lookup_codes WHERE email=?', address)) run('UPDATE lookup_codes SET code=?,created_at=? WHERE email=?', code, now(), address);
      else run('INSERT INTO lookup_codes(email,code,created_at) VALUES (?,?,?)', address, code, now());
      run('DELETE FROM lookup_sessions WHERE email=?', address);
      log(`Cá nhân: đổi mã tra cứu của ${address}`);
      return { ok: true, email: address, code };
    });
  }

  // Every generated address is remembered, so a tag is never handed out twice, and no
  // address collides with a label already in an invite pool.
  function generateInviteMails(familyId, data) {
    const family = activeFamily(familyId); if (!family) fail('Không tìm thấy Family đang hoạt động.', 404);
    const count = data.count; if (!Number.isInteger(count) || count < 1 || count > inviteMailMax) fail('Chọn từ 1 đến 5 mail mời.');
    const base = data.base_email ? inviteMailBase(email(data.base_email)) : inviteMailInbox; if (!base) fail('Gmail nhận lời mời không hợp lệ.');
    if (base === inviteMailBase(family.manager_email)) fail('Gmail nhận lời mời phải khác mail chủ của Family này.');
    return atomic('invite_mails_generate', () => {
      const taken = new Set([...all('SELECT email FROM invite_mails').map(r => r.email), ...all('SELECT label FROM family_invites').map(r => String(r.label).toLowerCase())]);
      const at = base.lastIndexOf('@'), mails = [];
      while (mails.length < count) {
        let tag = ''; for (let i = 0; i < 6; i++) tag += inviteMailAlphabet[randomInt(inviteMailAlphabet.length)];
        const address = base.slice(0, at) + '+' + tag + base.slice(at);
        if (!taken.has(address)) { taken.add(address); mails.push(address); }
      }
      const time = now();
      for (const address of mails) run('INSERT INTO invite_mails(family_id,email,created_at) VALUES (?,?,?)', family.id, address, time);
      log(`Cá nhân: tạo ${count} mail mời cho ${family.name}: ${mails.join(', ')}`);
      return { ok: true, family_id: family.id, family_name: family.name, base_email: base, mails };
    });
  }

  // Remove addresses made by mistake. Only addresses still waiting for their link can go;
  // one that already has a link is managed in the invite table.
  function deleteInviteMails(familyId, data) {
    const family = activeFamily(familyId); if (!family) fail('Không tìm thấy Family đang hoạt động.', 404);
    const ids = data.ids; if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => !Number.isSafeInteger(id))) fail('Chọn mail mời cần xóa.');
    const rows = ids.map(id => one('SELECT * FROM invite_mails WHERE id=? AND family_id=?', id, family.id));
    if (rows.some(row => !row)) fail('Mail mời đã thay đổi. Tải lại trang rồi thử lại.', 409);
    const linked = rows.find(row => one('SELECT id FROM family_invites WHERE lower(label)=?', row.email));
    if (linked) fail(`${linked.email} đã có link mời. Xóa link đó trong bảng link mời nếu không dùng.`, 409);
    return atomic('invite_mails_delete', () => {
      for (const row of rows) run('DELETE FROM invite_mails WHERE id=?', row.id);
      log(`Cá nhân: xóa ${rows.length} mail mời của ${family.name}: ${rows.map(row => row.email).join(', ')}`);
      return { ok: true, deleted: rows.length };
    });
  }
  // A customer who must (re)join a group without a link yet: the move is open with no invite,
  // and the first ready link of the Family is attached when the customer looks up their Gmail.
  function awaitLink(member, to, from) {
    const time = now();
    run("INSERT INTO member_moves(member_id,email,customer_name,from_family_id,from_family_name,from_status,from_note,to_family_id,to_family_name,invite_id,invite_label,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,NULL,'','assigned',?,?)", member.id, member.email, member.customer_name, from.id, from.name, from.status, from.note, to.id, to.name, time, time);
  }
  // Cho khách vào: every customer of the old Family, with all their details and member status,
  // moves into the new Family and waits for their own link, handed out on lookup. A record of the
  // same Gmail already in the new Family is replaced by the old Family's record.
  function handOver(fromId, data) {
    const from = activeFamily(fromId); if (!from) fail('Không tìm thấy Family cũ đang hoạt động.', 404);
    const to = activeFamily(data.to_family_id); if (!to || to.id === from.id) fail('Chọn Family mới đang hoạt động.');
    if (to.manager_email !== email(data.expected_manager_email)) fail('Mail chủ Family mới đã thay đổi. Tải lại rồi chọn lại.', 409);
    const members = all('SELECT * FROM members WHERE family_id=? ORDER BY id', from.id);
    if (!members.length) fail(`${from.name} không còn khách để chuyển.`, 409);
    const owner = members.find(m => m.email === to.manager_email); if (owner) fail(`Email ${owner.email} trùng mail chủ ${to.name}.`, 409);
    const source = statusRow(from.id);
    return atomic('lookup_hand_over', () => {
      const time = now(); let replaced = 0;
      for (const member of members) {
        const duplicate = one('SELECT id FROM members WHERE family_id=? AND email=?', to.id, member.email);
        if (duplicate) { run('UPDATE member_moves SET member_id=NULL WHERE member_id=?', duplicate.id); run("DELETE FROM issues WHERE family_id=? AND target_type='member' AND target_id=?", to.id, duplicate.id); run('DELETE FROM members WHERE id=?', duplicate.id); replaced++; }
        run("UPDATE member_moves SET state='cancelled',updated_at=?,revision=revision+1 WHERE member_id=? AND state IN ('assigned','opened','failed')", time, member.id);
        run('UPDATE members SET family_id=?,renewal_revision=renewal_revision+1 WHERE id=?', to.id, member.id);
        run("DELETE FROM issues WHERE family_id=? AND target_type='member' AND target_id=?", from.id, member.id);
        awaitLink(member, to, { id: from.id, name: from.name, status: source.status, note: source.note });
      }
      log(`Cá nhân: cho ${members.length} khách của ${from.name} (${from.manager_email}) vào ${to.name} (${to.manager_email})${replaced ? `, ghi đè ${replaced} hồ sơ trùng Gmail` : ''}: ${members.map(m => m.email).join(', ')}`);
      return { ok: true, moved: members.length, replaced, family_id: to.id, family_name: to.name };
    });
  }
  function markInviteSent(id, data) {
    const invite = one('SELECT * FROM family_invites WHERE id=?', id); if (!invite) fail('Không tìm thấy link mời.', 404);
    const family = activeFamily(invite.family_id); if (!family) fail('Không tìm thấy Family đang hoạt động.', 404);
    if (revision(data.revision) !== invite.revision) fail('Link mời vừa được sửa ở nơi khác. Tải lại rồi thử lại.', 409);
    if (typeof data.sent !== 'boolean') fail('Thiếu trạng thái đã gửi.');
    if (invite.retired_at) fail('Link của chủ cũ không dùng được nữa.', 409);
    const state = inviteHolder(inviteRefs(invite.id)).state;
    if (data.sent && state !== 'ready') fail(state === 'used' ? 'Link này đã có khách dùng.' : 'Link đang giao cho khách trong lượt chuyển nhóm.', 409);
    run('UPDATE family_invites SET sent_at=?,revision=revision+1,updated_at=? WHERE id=?', data.sent ? now() : '', now(), invite.id);
    log(`Cá nhân: ${data.sent ? 'đánh dấu đã gửi' : 'bỏ đánh dấu đã gửi'} link mời ${invite.label || '#' + invite.id} của ${family.name}`);
    return { ok: true };
  }

  // Fix lỗi drives the status customers see: reporting the owner Gmail marks an active Family
  // "Bị quét"; completing the case (or keeping the mail) puts it back to "Đang hoạt động".
  function issueStatus(familyId, event) {
    const family = activeFamily(familyId); if (!family) return;
    if (event === 'reported') closeReports(family);
    const old = one('SELECT * FROM family_statuses WHERE family_id=?', family.id), current = old?.status || 'active';
    if (event === 'reported' ? current !== 'active' : current === 'active') return;
    const next = event === 'reported' ? 'scanned' : 'active', note = event === 'reported' ? autoScannedNote(family.name) : '';
    if (old) run('UPDATE family_statuses SET status=?,note=?,updated_at=?,revision=revision+1 WHERE family_id=?', next, note, now(), family.id);
    else run('INSERT INTO family_statuses(family_id,status,note,updated_at,revision) VALUES (?,?,?,?,1)', family.id, next, note, now());
    log(`Tự động: đặt trạng thái ${family.name} là ${label(next)} ${event === 'reported' ? 'khi báo lỗi mail quản lý' : 'khi hoàn tất Fix lỗi'}`);
  }

  // Đã fix · Đổi sang mail mới on the owner keeps the same Family record: every customer has to
  // accept the new owner's invitation, so they become "Đã mời, chưa vào" and get a fresh link on
  // lookup. Links and Gen mail made before the case was reported belong to the old owner's group:
  // the links are retired (kept, so Lấy link mời never imports them again) and the addresses go.
  // A prepared Family of the new owner (donor) hands over its links and addresses.
  function ownerReplaced(familyId, { since, donorId = null, count = 0 }) {
    const family = activeFamily(familyId); if (!family) return null;
    const time = now();
    const retired = Number(run("UPDATE family_invites SET retired_at=?,revision=revision+1,updated_at=? WHERE family_id=? AND retired_at='' AND created_at<?", time, time, family.id, since).changes);
    run('DELETE FROM invite_mails WHERE family_id=? AND created_at<?', family.id, since);
    if (donorId) { run('UPDATE family_invites SET family_id=?,revision=revision+1,updated_at=? WHERE family_id=?', family.id, time, donorId); run('UPDATE invite_mails SET family_id=? WHERE family_id=?', family.id, donorId); }
    for (const move of all("SELECT mv.id,mv.state FROM member_moves mv JOIN members m ON m.id=mv.member_id WHERE mv.to_family_id=? AND m.family_id=? AND mv.state!='cancelled' AND mv.dismissed_at=''", family.id, family.id)) {
      if (openMoveStates.includes(move.state)) run("UPDATE member_moves SET state='cancelled',updated_at=?,revision=revision+1 WHERE id=?", time, move.id);
      else run('UPDATE member_moves SET dismissed_at=?,updated_at=?,revision=revision+1 WHERE id=?', time, time, move.id);
    }
    // Customers keep their member status; each one waits for a link of the new owner's group.
    const status = statusRow(family.id), problem = problemStatuses.includes(status.status);
    const old = { id: null, name: family.name, status: problem ? status.status : 'scanned', note: problem && status.note ? status.note : autoScannedNote(family.name) };
    const members = all('SELECT * FROM members WHERE family_id=? ORDER BY id', family.id);
    for (const member of members) awaitLink(member, family, old);
    log(`Tự động: ${family.name} đổi chủ sang ${family.manager_email}: ${members.length} khách chờ link vào nhóm mới${retired ? `, bỏ ${retired} link của chủ cũ` : ''}`);
    return { waiting: members.length, retired, invite_mails: count ? generateInviteMails(family.id, { count }) : null };
  }

  function saveStatus(familyId, data) {
    const family = activeFamily(familyId); if (!family) fail('Không tìm thấy Family đang hoạt động.', 404);
    if (!familyStatuses.includes(data.status)) fail('Trạng thái nhóm không hợp lệ.');
    const note = text(data.note, 1000), expected = revision(data.revision, 'Thiếu phiên bản trạng thái. Tải lại trang.');
    const old = one('SELECT * FROM family_statuses WHERE family_id=?', family.id);
    if ((old?.revision ?? 0) !== expected) fail('Trạng thái nhóm vừa được sửa ở nơi khác. Tải lại rồi thử lại.', 409);
    if (old) run('UPDATE family_statuses SET status=?,note=?,updated_at=?,revision=revision+1 WHERE family_id=?', data.status, note, now(), family.id);
    else run('INSERT INTO family_statuses(family_id,status,note,updated_at,revision) VALUES (?,?,?,?,1)', family.id, data.status, note, now());
    log(`Cá nhân: đặt trạng thái ${family.name} là ${label(data.status)}`);
    if (problemStatuses.includes(data.status)) closeReports(family);
    return { ok: true };
  }

  // ---- Khách báo mất Premium ----
  // A customer whose group still shows as working can tell the shop; the report shows on the
  // customer page as received, in Fix lỗi for the shop, and on Telegram when it is set up.
  // Once the shop marks the Family as having an incident, its open reports are closed.
  const reportVisibleMs = 3 * 86400000;
  function latestReport(memberId) {
    const row = one('SELECT * FROM customer_reports WHERE member_id=? ORDER BY id DESC LIMIT 1', memberId);
    if (!row || (row.handled_at && Date.now() - Date.parse(row.handled_at) > reportVisibleMs)) return null;
    return { id: row.id, state: row.handled_at ? 'handled' : 'open', reason: row.reason, created_at: row.created_at, handled_at: row.handled_at, handled_note: row.handled_note };
  }
  function closeReports(family) {
    const changed = Number(run("UPDATE customer_reports SET handled_at=?,handled_note='',revision=revision+1 WHERE family_id=? AND handled_at=''", now(), family.id).changes);
    if (changed) log(`Tự động: ghi nhận ${changed} báo lỗi của khách ở ${family.name} khi Family có sự cố`);
  }
  function customerProblem(address, data, origin = '') {
    const member = Number.isSafeInteger(data.member) ? one("SELECT m.*,f.name AS family_name FROM members m JOIN families f ON f.id=m.family_id WHERE m.id=? AND m.email=? AND f.archived_at=''", data.member, address) : null;
    if (!member) fail('Không tìm thấy nhóm này của bạn. Tải lại trang.', 404);
    if (!Object.hasOwn(problemReasons, data.reason)) fail('Chọn lỗi bạn đang gặp.');
    if (problemStatuses.includes(statusRow(member.family_id).status)) fail('Shop đã biết nhóm đang gặp sự cố và đang xử lý. Tải lại trang để xem tiến trình.', 409);
    if (one("SELECT id FROM customer_reports WHERE member_id=? AND handled_at=''", member.id)) fail('Shop đã nhận báo lỗi của bạn và đang kiểm tra.', 409);
    const note = text(data.note, 500);
    run('INSERT INTO customer_reports(member_id,email,family_id,family_name,reason,note,created_at) VALUES (?,?,?,?,?,?,?)', member.id, address, member.family_id, member.family_name, data.reason, note, now());
    const open = one("SELECT COUNT(*) AS n FROM customer_reports WHERE family_id=? AND handled_at=''", member.family_id).n, family = activeFamily(member.family_id);
    log(`Khách ${address} báo ${problemReasons[data.reason]} ở ${member.family_name}${note ? ' · ' + note : ''}`);
    telegramNotify(['🔔 Khách báo mất Premium', `Gmail: ${address}`, `Family: ${member.family_name} (${family.manager_email})`, `Lỗi: ${problemReasons[data.reason]}`, note ? `Ghi chú: ${note}` : '', open > 1 ? `Family này đang có ${open} khách báo lỗi.` : '', origin ? `Mở Fix lỗi: ${origin}/#issues` : ''].filter(Boolean).join('\n'));
    return result(address);
  }
  function handleReport(id, data) {
    const row = one('SELECT * FROM customer_reports WHERE id=?', id); if (!row) fail('Không tìm thấy báo lỗi của khách.', 404);
    if (revision(data.revision) !== row.revision) fail('Báo lỗi vừa được cập nhật. Tải lại rồi thử lại.', 409);
    if (row.handled_at) fail('Báo lỗi này đã được xử lý.', 409);
    const note = text(data.note, 500);
    run('UPDATE customer_reports SET handled_at=?,handled_note=?,revision=revision+1 WHERE id=?', now(), note, row.id);
    log(`Cá nhân: đã xử lý báo lỗi của ${row.email} ở ${row.family_name}${note ? ' · ' + note : ''}`);
    return { ok: true };
  }

  // ---- Thông báo Telegram ----
  // The bot token stays on the server: the admin page only sees whether it is set and where it sends.
  const telegramApi = (process.env.FAMILY_TELEGRAM_API || 'https://api.telegram.org').replace(/\/$/, '');
  const stored = name => one('SELECT value FROM lookup_settings WHERE name=?', name)?.value || '';
  function storeSetting(name, value) {
    if (one('SELECT id FROM lookup_settings WHERE name=?', name)) run('UPDATE lookup_settings SET value=? WHERE name=?', value, name);
    else run('INSERT INTO lookup_settings(name,value) VALUES (?,?)', name, value);
  }
  async function telegramCall(token, method, params = {}) {
    let response;
    try { response = await fetch(`${telegramApi}/bot${token}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params), signal: AbortSignal.timeout(8000) }); }
    catch { fail('Không kết nối được Telegram. Kiểm tra mạng rồi thử lại.', 502); }
    let value = {}; try { value = await response.json(); } catch {}
    if (!value.ok) fail([401, 404].includes(response.status) ? 'Mã bot không đúng. Copy lại mã @BotFather gửi bạn.' : 'Telegram báo lỗi: ' + (value.description || response.status), 502);
    return value.result;
  }
  function telegramState() {
    const enabled = !!(stored('telegram_token') && stored('telegram_chat'));
    return { enabled, bot: enabled ? stored('telegram_bot') : '', chat: enabled ? stored('telegram_chat_title') : '' };
  }
  function telegramNotify(message) {
    const token = stored('telegram_token'), chat = stored('telegram_chat'); if (!token || !chat) return;
    telegramCall(token, 'sendMessage', { chat_id: chat, text: message, disable_web_page_preview: true }).catch(() => console.error('Telegram notification failed.'));
  }
  // Connect: check the token, take the chat of the latest message sent to the bot (/start), send a test.
  async function connectTelegram(data) {
    const token = typeof data.token === 'string' && data.token.trim() ? data.token.trim() : stored('telegram_token');
    if (!/^\d{5,15}:[A-Za-z0-9_-]{30,80}$/.test(token)) fail('Dán mã bot @BotFather gửi bạn, dạng 123456789:AAE…');
    const bot = await telegramCall(token, 'getMe');
    const updates = await telegramCall(token, 'getUpdates', { limit: 100 });
    const chat = [...(Array.isArray(updates) ? updates : [])].reverse().map(u => u.message?.chat || u.my_chat_member?.chat).find(c => c && c.id);
    if (!chat) fail(`Mở Telegram, tìm @${bot.username}, bấm Bắt đầu (Start), rồi bấm lại nút này.`, 409);
    const title = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || String(chat.id);
    await telegramCall(token, 'sendMessage', { chat_id: chat.id, text: `✅ Đã bật thông báo cho ${settings().shop_name || 'trang tra cứu'}. Khi khách báo mất Premium, tin sẽ gửi về đây.` });
    return atomic('telegram_connect', () => {
      storeSetting('telegram_token', token); storeSetting('telegram_chat', String(chat.id)); storeSetting('telegram_bot', String(bot.username || '')); storeSetting('telegram_chat_title', text(title, 100));
      log(`Cá nhân: bật thông báo Telegram qua @${bot.username} tới ${title}`);
      return { ok: true, telegram: telegramState() };
    });
  }
  async function testTelegram() {
    const token = stored('telegram_token'), chat = stored('telegram_chat'); if (!token || !chat) fail('Chưa bật thông báo Telegram.', 409);
    await telegramCall(token, 'sendMessage', { chat_id: chat, text: '🔔 Tin thử: thông báo khách báo lỗi đang hoạt động.' });
    return { ok: true };
  }
  function disconnectTelegram() {
    run("DELETE FROM lookup_settings WHERE name IN ('telegram_token','telegram_chat','telegram_bot','telegram_chat_title')");
    log('Cá nhân: tắt thông báo Telegram');
    return { ok: true, telegram: telegramState() };
  }

  function inviteUrl(value) {
    const url = text(value, 2000); if (!url) fail('Dán link mời vào nhóm.');
    if (!isGoogleInviteUrl(url)) fail('Link mời cần là link https của Google, ví dụ myaccount.google.com hoặc notifications.googleapis.com.');
    return url;
  }
  function saveInvite(familyId, id, data) {
    let old = null;
    if (id) {
      old = one('SELECT * FROM family_invites WHERE id=?', id); if (!old) fail('Không tìm thấy link mời.', 404);
      if (revision(data.revision) !== old.revision) fail('Link mời vừa được sửa ở nơi khác. Tải lại rồi thử lại.', 409);
      familyId = old.family_id;
    }
    const family = activeFamily(familyId); if (!family) fail('Không tìm thấy Family đang hoạt động.', 404);
    const inviteLabel = text(data.label, 200), url = inviteUrl(data.url), sentOn = calendarDate(data.sent_on || '');
    const duplicate = one('SELECT i.id,f.name FROM family_invites i JOIN families f ON f.id=i.family_id WHERE i.url=? AND i.id!=?', url, id || 0);
    if (duplicate) fail(`Link này đã có trong kho của ${duplicate.name}.`, 409);
    if (old) {
      run('UPDATE family_invites SET label=?,url=?,sent_on=?,revision=revision+1,updated_at=? WHERE id=?', inviteLabel, url, sentOn, now(), id);
      log(`Cá nhân: sửa link mời ${inviteLabel || '#' + id} của ${family.name}${old.url !== url ? ' (đổi link mới)' : ''}`);
      return { ok: true, id };
    }
    const result = run('INSERT INTO family_invites(family_id,label,url,sent_on,revision,created_at,updated_at) VALUES (?,?,?,?,0,?,?)', family.id, inviteLabel, url, sentOn, now(), now());
    log(`Cá nhân: thêm link mời ${inviteLabel || '#' + result.lastInsertRowid} cho ${family.name}`);
    return { ok: true, id: Number(result.lastInsertRowid) };
  }
  function deleteInvite(id, data) {
    const old = one('SELECT i.*,f.name AS family_name FROM family_invites i JOIN families f ON f.id=i.family_id WHERE i.id=?', id); if (!old) fail('Không tìm thấy link mời.', 404);
    if (revision(data.revision) !== old.revision) fail('Link mời vừa được sửa ở nơi khác. Tải lại rồi thử lại.', 409);
    if (inviteHolder(inviteRefs(id)).state === 'assigned') fail('Link đang giao cho khách. Thu hồi link trước khi xóa.', 409);
    run('DELETE FROM family_invites WHERE id=?', id);
    log(`Cá nhân: xóa link mời ${old.label || '#' + id} của ${old.family_name}`);
    return { ok: true };
  }

  function bulkMove(data) {
    const from = activeFamily(data.from_family_id); if (!from) fail('Không tìm thấy Family cũ đang hoạt động.', 404);
    const to = activeFamily(data.to_family_id); if (!to) fail('Chọn Family mới đang hoạt động.');
    if (to.id === from.id) fail('Chọn Family mới khác Family cũ.');
    if (to.manager_email !== email(data.expected_manager_email)) fail('Mail chủ Family mới đã thay đổi. Tải lại rồi chọn lại.', 409);
    const assignments = data.assignments;
    if (!Array.isArray(assignments) || !assignments.length) fail('Chọn ít nhất một khách và một link mời.');
    if (assignments.length > lookupLimits.moves) fail(`Mỗi lần chuyển tối đa ${lookupLimits.moves} khách.`);
    const members = new Set(), invites = new Set(), checked = [];
    for (const item of assignments) {
      if (!item || typeof item !== 'object' || !Number.isSafeInteger(item.member_id) || !Number.isSafeInteger(item.invite_id) || !Number.isInteger(item.revision) || !Number.isInteger(item.invite_revision) || typeof item.expected_email !== 'string') fail('Thông tin chuyển nhóm không hợp lệ. Tải lại rồi thử lại.');
      if (members.has(item.member_id)) fail('Mỗi khách chỉ chọn một lần.');
      if (invites.has(item.invite_id)) fail('Mỗi link mời chỉ giao cho một khách.');
      members.add(item.member_id); invites.add(item.invite_id);
      const member = one('SELECT * FROM members WHERE id=?', item.member_id);
      if (!member || member.family_id !== from.id || member.renewal_revision !== item.revision || member.email !== item.expected_email) fail('Hồ sơ khách đã thay đổi. Đóng hộp thoại, tải lại rồi thử lại.', 409);
      if (member.email === to.manager_email) fail(`Email ${member.email} trùng mail chủ Family mới.`);
      if (one('SELECT id FROM members WHERE family_id=? AND email=?', to.id, member.email)) fail(`Email ${member.email} đã có trong Family mới.`, 409);
      const invite = one('SELECT * FROM family_invites WHERE id=?', item.invite_id);
      if (!invite || invite.family_id !== to.id || invite.revision !== item.invite_revision) fail('Link mời đã thay đổi. Tải lại rồi chọn lại.', 409);
      if (inviteState(invite) !== 'ready') fail(`Link ${invite.label || '#' + invite.id} đã được giao, đã gửi hoặc đã dùng. Chọn link khác.`, 409);
      checked.push({ member, invite });
    }
    const source = statusRow(from.id);
    return atomic('lookup_bulk_move', () => {
      const moved = [];
      for (const { member, invite } of checked) {
        const stamp = now();
        // A customer moved again keeps only the newest move open.
        run("UPDATE member_moves SET state='cancelled',updated_at=?,revision=revision+1 WHERE member_id=? AND state IN ('assigned','opened','failed')", stamp, member.id);
        run("UPDATE members SET family_id=?,membership_status='invited',renewal_revision=renewal_revision+1 WHERE id=?", to.id, member.id);
        const removed = Number(run("DELETE FROM issues WHERE family_id=? AND target_type='member' AND target_id=? AND (subject_email=? OR original_email=?)", from.id, member.id, member.email, member.email).changes);
        run('UPDATE family_invites SET revision=revision+1,updated_at=? WHERE id=?', stamp, invite.id);
        const result = run("INSERT INTO member_moves(member_id,email,customer_name,from_family_id,from_family_name,from_status,from_note,to_family_id,to_family_name,invite_id,invite_label,state,created_at,updated_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,'assigned',?,?,0)", member.id, member.email, member.customer_name, from.id, from.name, source.status, source.note, to.id, to.name, invite.id, invite.label, stamp, stamp);
        moved.push({ member_id: member.id, move_id: Number(result.lastInsertRowid) });
        log(`Cá nhân: chuyển khách ${member.email} từ ${from.name} (${from.manager_email}) sang ${to.name} (${to.manager_email}), giao link ${invite.label || '#' + invite.id}${removed ? ` · xóa ${removed} case lỗi của khách` : ''}`);
      }
      return { ok: true, moved: moved.length, moves: moved, family_id: to.id, family_name: to.name };
    });
  }

  function updateMove(id, data) {
    const move = one('SELECT * FROM member_moves WHERE id=?', id); if (!move) fail('Không tìm thấy lượt chuyển nhóm.', 404);
    if (revision(data.revision) !== move.revision) fail('Lượt chuyển nhóm vừa thay đổi. Tải lại rồi thử lại.', 409);
    const member = move.member_id ? one('SELECT * FROM members WHERE id=?', move.member_id) : null;
    const live = !!member && member.family_id === move.to_family_id, open = openMoveStates.includes(move.state), stamp = now();
    return atomic('lookup_move_update', () => {
      if (data.action === 'joined') {
        if (!live) fail('Khách không còn ở Family mới. Tải lại trang.', 409);
        if (!open) fail('Lượt chuyển này đã xong hoặc đã hủy.', 409);
        run("UPDATE member_moves SET state='joined',joined_at=?,updated_at=?,revision=revision+1 WHERE id=?", stamp, stamp, id);
        run("UPDATE members SET membership_status='active',renewal_revision=renewal_revision+1 WHERE id=?", member.id);
        log(`Cá nhân: ghi nhận ${move.email} đã vào ${move.to_family_name}`);
      } else if (data.action === 'release') {
        if (!open) fail('Chỉ thu hồi được link chưa dùng.', 409);
        run("UPDATE member_moves SET state='cancelled',updated_at=?,revision=revision+1 WHERE id=?", stamp, id);
        if (move.invite_id) run("UPDATE family_invites SET sent_at='',revision=revision+1,updated_at=? WHERE id=?", stamp, move.invite_id);
        log(`Cá nhân: thu hồi link ${move.invite_label || ''} của ${move.email}, trả về kho ${move.to_family_name}`);
      } else if (data.action === 'reassign') {
        if (!open || !live) fail('Chỉ đổi link cho khách đang chờ vào Family mới.', 409);
        const invite = Number.isSafeInteger(data.invite_id) ? one('SELECT * FROM family_invites WHERE id=?', data.invite_id) : null;
        if (!invite || invite.family_id !== move.to_family_id || !Number.isInteger(data.invite_revision) || invite.revision !== data.invite_revision) fail('Link mời đã thay đổi. Tải lại rồi chọn lại.', 409);
        if (invite.id === move.invite_id) fail('Chọn link khác link hiện tại.');
        if (inviteState(invite) !== 'ready') fail('Link mời đã được giao, đã gửi hoặc đã dùng. Chọn link khác.', 409);
        if (move.invite_id) run('UPDATE family_invites SET revision=revision+1,updated_at=? WHERE id=?', stamp, move.invite_id);
        run('UPDATE family_invites SET revision=revision+1,updated_at=? WHERE id=?', stamp, invite.id);
        run("UPDATE member_moves SET invite_id=?,invite_label=?,state='assigned',report_reason='',report_note='',reported_at='',opened_at='',updated_at=?,revision=revision+1 WHERE id=?", invite.id, invite.label, stamp, id);
        log(`Cá nhân: đổi link của ${move.email} sang ${invite.label || '#' + invite.id}`);
      } else if (data.action === 'dismiss') {
        if (open && live) fail('Khách đang chờ vào nhóm. Ghi nhận đã vào hoặc thu hồi link trước khi ẩn.', 409);
        run('UPDATE member_moves SET dismissed_at=?,updated_at=?,revision=revision+1 WHERE id=?', stamp, stamp, id);
      } else fail('Thao tác chuyển nhóm không hợp lệ.');
      return { ok: true };
    });
  }

  function adminState() {
    const key = salt();
    const refs = all("SELECT mv.id,mv.invite_id,mv.state,mv.email,mv.customer_name,mv.to_family_id,mv.member_id,m.family_id AS member_family_id FROM member_moves mv LEFT JOIN members m ON m.id=mv.member_id WHERE mv.invite_id IS NOT NULL AND mv.state!='cancelled' ORDER BY mv.id");
    const invites = all('SELECT * FROM family_invites ORDER BY family_id,id').map(invite => {
      const holder = inviteHolder(refs.filter(r => r.invite_id === invite.id));
      return { ...invite, expires_on: inviteExpiry(invite.sent_on), holder_state: invite.retired_at ? 'retired' : holder.state === 'ready' && invite.sent_at ? 'sent' : holder.state, holder_move_id: holder.move?.id ?? null, holder_email: holder.move?.email ?? '', holder_name: holder.move?.customer_name ?? '' };
    });
    const moves = all("SELECT mv.*,m.family_id AS member_family_id FROM member_moves mv LEFT JOIN members m ON m.id=mv.member_id WHERE mv.dismissed_at='' ORDER BY mv.id DESC LIMIT 500").map(move => {
      const live = move.member_family_id != null && move.member_family_id === move.to_family_id;
      return { ...move, live, effective_state: openMoveStates.includes(move.state) && !live ? 'stale' : move.state };
    });
    return {
      lookup_supported: true, lookup_settings: settings(),
      family_statuses: all('SELECT family_id,status,note,updated_at,revision FROM family_statuses'),
      invites, moves, lookup_codes: Object.fromEntries(all('SELECT DISTINCT email FROM members').map(r => [r.email, codeFor(r.email, key)])),
      invite_mails: all('SELECT id,family_id,email,created_at FROM invite_mails ORDER BY id'), invite_base_email: inviteMailInbox,
      // Open reports, and the ones handled in the last week for context.
      customer_reports: all("SELECT * FROM customer_reports WHERE handled_at='' OR handled_at>? ORDER BY id DESC LIMIT 300", new Date(Date.now() - 7 * 86400000).toISOString()),
      problem_reasons: problemReasons, telegram: telegramState()
    };
  }

  // ---- Public lookup (customer) ----
  // A customer of this Family who has not joined yet ("Đã mời, chưa vào" or "Mua mới") gets one
  // ready link of the Family's own pool the first time they look up their Gmail. The link is
  // held for them (never handed to anyone else) and ticked Đã gửi.
  const joinable = member => ['invited', 'new'].includes(member.membership_status);
  function allocateJoin(member, status, period, current) {
    // Customers past their expiry date still get a link: they renew, they just have not paid yet.
    if (status.status !== 'active') return false;
    const pending = one("SELECT * FROM member_moves WHERE member_id=? AND to_family_id=? AND state!='cancelled' AND dismissed_at='' ORDER BY id DESC LIMIT 1", member.id, member.family_id);
    if (pending ? !(openMoveStates.includes(pending.state) && pending.invite_id == null) : !joinable(member)) return false;
    const family = activeFamily(member.family_id); if (!family) return false;
    const invite = all("SELECT * FROM family_invites WHERE family_id=? AND sent_at='' AND retired_at='' ORDER BY CASE WHEN sent_on='' THEN 1 ELSE 0 END,sent_on,id", family.id)
      .find(i => inviteHolder(inviteRefs(i.id)).state === 'ready' && (!i.sent_on || inviteExpiry(i.sent_on) >= current));
    if (!invite) return false;
    const time = now();
    if (pending) run('UPDATE member_moves SET invite_id=?,invite_label=?,updated_at=?,revision=revision+1 WHERE id=?', invite.id, invite.label, time, pending.id);
    else run("INSERT INTO member_moves(member_id,email,customer_name,from_family_id,from_family_name,from_status,from_note,to_family_id,to_family_name,invite_id,invite_label,state,created_at,updated_at) VALUES (?,?,?,NULL,'','active','',?,?,?,?,'assigned',?,?)", member.id, member.email, member.customer_name, family.id, family.name, invite.id, invite.label, time, time);
    run('UPDATE family_invites SET sent_at=?,revision=revision+1,updated_at=? WHERE id=?', time, time, invite.id);
    log(`Tự động: giao link mời ${invite.label || '#' + invite.id} của ${family.name} cho ${member.email} khi khách tra cứu`);
    return true;
  }
  function result(address) {
    const current = today();
    const items = all("SELECT m.*,f.name AS family_name FROM members m JOIN families f ON f.id=m.family_id WHERE m.email=? AND f.archived_at='' ORDER BY m.id", address).map(member => {
      const status = statusRow(member.family_id), period = expiry(member.expires_at, current);
      const allocated = allocateJoin(member, status, period, current);
      const latest = one("SELECT * FROM member_moves WHERE member_id=? AND state!='cancelled' AND dismissed_at='' ORDER BY id DESC LIMIT 1", member.id);
      let move = null;
      if (latest && latest.to_family_id === member.family_id) {
        const open = openMoveStates.includes(latest.state);
        const invite = open && latest.invite_id ? one('SELECT * FROM family_invites WHERE id=?', latest.invite_id) : null;
        // A link shown to its customer is ticked Đã gửi, so it is never handed to someone else.
        if (invite && !invite.sent_at) run('UPDATE family_invites SET sent_at=?,revision=revision+1,updated_at=? WHERE id=?', now(), now(), invite.id);
        const source = latest.from_family_id && activeFamily(latest.from_family_id) ? statusRow(latest.from_family_id) : null;
        move = { id: latest.id, kind: latest.from_family_id == null && latest.from_family_name === '' ? 'join' : 'move', state: latest.state, from_family_name: latest.from_family_name, from_status: source ? source.status : latest.from_status, from_note: source ? source.note : latest.from_note, invite_url: invite ? invite.url : '', invite_expires_on: invite ? inviteExpiry(invite.sent_on) : '', report_reason: latest.report_reason, reported_at: latest.reported_at, opened_at: latest.opened_at, joined_at: latest.joined_at };
      }
      const waiting = !allocated && !move && joinable(member) && status.status === 'active', problem = latestReport(member.id);
      const view = move && openMoveStates.includes(move.state) ? 'move' : problemStatuses.includes(status.status) ? 'incident' : problem?.state === 'open' ? 'reported' : waiting ? 'waiting' : period.expiry_status === 'expired' ? 'expired' : 'normal';
      return { member_ref: member.id, problem, family_name: member.family_name, plan_months: member.plan_months, expires_at: member.expires_at, ...period, membership_status: member.membership_status, status: status.status, status_note: status.note, status_updated_at: status.updated_at, view, move };
    });
    return { email: address, today: current, shop: settings(), items };
  }
  function attempt(name) { return one('SELECT * FROM lookup_attempts WHERE name=?', name); }
  function blocked(name, limit) { const row = attempt(name); return !!row && row.window_end > Date.now() && row.count >= limit; }
  function bump(name) {
    const row = attempt(name), time = Date.now();
    if (!row) run('INSERT INTO lookup_attempts(name,window_end,count) VALUES (?,?,1)', name, time + lookupLimits.window);
    else if (row.window_end <= time) run('UPDATE lookup_attempts SET window_end=?,count=1 WHERE name=?', time + lookupLimits.window, name);
    else run('UPDATE lookup_attempts SET count=count+1 WHERE name=?', name);
  }
  function verify(data, ip = '') {
    const time = Date.now();
    run('DELETE FROM lookup_sessions WHERE expires_at<=?', time); run('DELETE FROM lookup_attempts WHERE window_end<=?', time);
    const address = email(data.email), code = normalizeCode(data.code);
    if (!code) fail('Mã tra cứu gồm 6 ký tự chữ và số trong tin nhắn shop gửi bạn.');
    const keys = [['ip:' + String(ip || 'unknown').slice(0, 100), lookupLimits.ip], ['email:' + address, lookupLimits.email]];
    if (keys.some(([name, limit]) => blocked(name, limit))) fail('Bạn đã thử quá nhiều lần. Đợi 15 phút rồi thử lại.', 429);
    const active = one("SELECT m.id FROM members m JOIN families f ON f.id=m.family_id WHERE m.email=? AND f.archived_at='' LIMIT 1", address);
    if (!active || !same(codeFor(address), code)) { for (const [name] of keys) bump(name); fail('Gmail hoặc mã tra cứu không đúng. Kiểm tra lại tin nhắn shop gửi bạn.', 401); }
    run('DELETE FROM lookup_attempts WHERE name=?', 'email:' + address);
    const token = randomBytes(32).toString('hex');
    run('INSERT INTO lookup_sessions(token_hash,email,expires_at) VALUES (?,?,?)', digest(token), address, time + lookupLimits.session);
    return { token, result: result(address) };
  }
  function sessionEmail(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
    const row = one('SELECT * FROM lookup_sessions WHERE token_hash=?', digest(token));
    return row && row.expires_at > Date.now() ? row.email : null;
  }
  function logout(token) { if (typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)) run('DELETE FROM lookup_sessions WHERE token_hash=?', digest(token)); return { ok: true }; }
  function customerMove(address, data) {
    if (!Number.isSafeInteger(data.move_id)) fail('Thiếu thông tin lượt chuyển nhóm.');
    const move = one('SELECT mv.* FROM member_moves mv JOIN members m ON m.id=mv.member_id WHERE mv.id=? AND m.email=? AND m.family_id=mv.to_family_id', data.move_id, address);
    if (!move) fail('Không tìm thấy lượt chuyển nhóm của bạn. Tải lại trang.', 404);
    return move;
  }
  function customerOpen(address, data) {
    const move = customerMove(address, data);
    if (move.state === 'assigned') {
      run("UPDATE member_moves SET state='opened',opened_at=?,updated_at=?,revision=revision+1 WHERE id=?", now(), now(), move.id);
      log(`Khách ${address} mở link vào ${move.to_family_name}`);
    }
    return { ok: true };
  }
  function customerJoined(address, data) {
    const move = customerMove(address, data);
    if (openMoveStates.includes(move.state)) atomic('lookup_customer_joined', () => {
      run("UPDATE member_moves SET state='joined',joined_at=?,updated_at=?,revision=revision+1 WHERE id=?", now(), now(), move.id);
      run("UPDATE members SET membership_status='active',renewal_revision=renewal_revision+1 WHERE id=?", move.member_id);
      log(`Khách ${address} xác nhận đã vào ${move.to_family_name}`);
    });
    return result(address);
  }
  function customerReport(address, data) {
    const move = customerMove(address, data);
    if (!openMoveStates.includes(move.state)) fail('Lượt chuyển nhóm này đã xong. Tải lại trang.', 409);
    if (!reportReasons.includes(data.reason)) fail('Chọn lỗi Google báo.');
    const note = text(data.note, 500);
    run("UPDATE member_moves SET state='failed',report_reason=?,report_note=?,reported_at=?,updated_at=?,revision=revision+1 WHERE id=?", data.reason, note, now(), now(), move.id);
    log(`Khách ${address} báo không vào được ${move.to_family_name}: ${data.reason}${note ? ' · ' + note : ''}`);
    return result(address);
  }

  return { adminState, settings, saveSettings, rotateCode, generateInviteMails, deleteInviteMails, markInviteSent, handOver, issueStatus, ownerReplaced, saveStatus, customerProblem, handleReport, connectTelegram, testTelegram, disconnectTelegram, saveInvite, deleteInvite, bulkMove, updateMove, result, verify, sessionEmail, logout, customerOpen, customerJoined, customerReport };
}
