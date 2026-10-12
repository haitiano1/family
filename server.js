import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initAuth } from './auth.js';
import { today, expiry, services, googleActions, googleGuide } from './domain.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.DATA_DIR || path.join(root, 'data');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'family.sqlite');
const existing = existsSync(file);
const db = new DatabaseSync(file);
const currentVersion = db.prepare('PRAGMA user_version').get().user_version;
if (currentVersion > 2) throw new Error('Database is newer than this application. Use the latest application version.');
if (existing && currentVersion < 2) {
  const backup = path.join(dir, `before-v2-${Date.now()}.sqlite`);
  db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
  console.log('Saved pre-upgrade database backup in the data directory.');
}
db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS families (id INTEGER PRIMARY KEY, name TEXT NOT NULL, manager_id INTEGER UNIQUE NOT NULL REFERENCES accounts(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE, email TEXT NOT NULL, UNIQUE(family_id,email));
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, action TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, message TEXT NOT NULL, created_at TEXT NOT NULL);`);
const additions = {
  families: { service: "TEXT NOT NULL DEFAULT 'youtube'", note: "TEXT NOT NULL DEFAULT ''" },
  members: { customer_name: "TEXT NOT NULL DEFAULT ''", contact: "TEXT NOT NULL DEFAULT ''", joined_at: "TEXT NOT NULL DEFAULT ''", expires_at: "TEXT NOT NULL DEFAULT ''", payment_status: "TEXT NOT NULL DEFAULT 'unpaid'", amount: 'INTEGER NOT NULL DEFAULT 0', note: "TEXT NOT NULL DEFAULT ''" },
  jobs: { account_id: 'INTEGER', family_id: 'INTEGER', email: "TEXT NOT NULL DEFAULT ''", service: "TEXT NOT NULL DEFAULT 'youtube'", manager_email: "TEXT NOT NULL DEFAULT ''", completed_at: 'TEXT', completed_by: 'TEXT' }
};
db.exec('BEGIN');
try {
  for (const [table, columns] of Object.entries(additions)) {
    const known = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    for (const [name, type] of Object.entries(columns)) if (!known.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
  db.exec('PRAGMA user_version=2; COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }
const all = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
const now = () => new Date().toISOString();
const log = message => run('INSERT INTO logs(message,created_at) VALUES (?,?)', message, now());
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const auth = initAuth(db, fail, log);
const email = value => {
  const result = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) || result.length > 254) fail('Email không hợp lệ.');
  return result;
};
const text = (value, max = 1000) => { if (value != null && typeof value !== 'string') fail('Dữ liệu văn bản không hợp lệ.'); const result = (value || '').trim(); if (result.length > max) fail(`Nội dung không được quá ${max} ký tự.`); return result; };
const label = value => { const result = text(value, 200); if (!result) fail('Tên không được để trống.'); return result; };
const service = value => { if (!services.includes(value)) fail('Dịch vụ không hợp lệ.'); return value; };
const calendarDate = value => {
  if (!value) return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) fail('Ngày không hợp lệ.');
  return value;
};
function memberData(data) {
  const joined = calendarDate(data.joined_at), expires = calendarDate(data.expires_at);
  if (joined && expires && expires < joined) fail('Ngày hết hạn phải từ ngày vào trở đi.');
  const payment = data.payment_status || 'unpaid'; if (!['unpaid', 'paid', 'partial'].includes(payment)) fail('Trạng thái thanh toán không hợp lệ.');
  const amount = Number(data.amount || 0); if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) fail('Số tiền phải là số nguyên từ 0 đến 1 tỷ đồng.');
  return [email(data.email), text(data.customer_name, 200), text(data.contact, 200), joined, expires, payment, amount, text(data.note)];
}
async function body(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail('Yêu cầu cần Content-Type application/json.', 415);
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > 16384) fail('Dữ liệu quá lớn.', 413); chunks.push(chunk); }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('Dữ liệu cần là một đối tượng.'); return parsed; }
  catch { fail('JSON không hợp lệ.'); }
}
function send(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
const server = http.createServer(async (req, res) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const host = req.headers.host;
    const url = new URL(req.url, `http://${host}`);
    // The supported deployment is local; reject untrusted Host headers to prevent DNS rebinding.
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(`http://${host}`).hostname)) fail('Chỉ hỗ trợ truy cập trên máy cục bộ.', 403);
    const writing = !['GET', 'HEAD'].includes(req.method);
    if (writing && req.headers.origin && req.headers.origin !== `http://${host}` && !(process.env.COOKIE_SECURE === '1' && req.headers.origin === `https://${host}`)) fail('Nguồn yêu cầu không hợp lệ.', 403);
    if (url.pathname.startsWith('/api/auth/') || /^\/api\/users(?:\/\d+)?$/.test(url.pathname)) {
      const data = writing ? await body(req) : {};
      return await auth.handle(req, res, url.pathname, data, send);
    }
    let user;
    if (url.pathname.startsWith('/api/')) {
      user = auth.loggedIn(req);
      if (writing) { auth.csrf(req, user); auth.role(user, ['admin', 'operator']); }
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const members = all('SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id ORDER BY m.id DESC').map(m => ({ ...m, ...expiry(m.expires_at) }));
      return send(res, 200, {
        accounts: all('SELECT a.*, f.id AS family_id, f.name AS family_name, f.service FROM accounts a LEFT JOIN families f ON f.manager_id=a.id ORDER BY a.id DESC'),
        families: all('SELECT f.*, a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id ORDER BY f.id DESC'),
        members, jobs: all('SELECT * FROM jobs ORDER BY id DESC LIMIT 100').map(j => ({ ...j, guide: googleGuide(j.action, j.service) })),
        logs: all('SELECT * FROM logs ORDER BY id DESC LIMIT 100'), integration: false, google_mode: 'manual', today: today(),
        reminders: { expired: members.filter(m => m.expiry_status === 'expired').length, due_soon: members.filter(m => m.expiry_status === 'due_soon').length, unpaid: members.filter(m => m.payment_status !== 'paid').length },
        user: { id: user.id, username: user.username, role: user.role }
      });
    }
    if (['POST', 'PATCH'].includes(req.method) && /^\/api\/accounts(?:\/\d+)?$/.test(url.pathname)) {
      const data = await body(req); const address = email(data.email), note = text(data.note);
      if (req.method === 'POST' && url.pathname === '/api/accounts') {
        const result = run('INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)', address, note, now());
        log(`${user.username}: thêm tài khoản ${address}`); return send(res, 201, { id: Number(result.lastInsertRowid) });
      }
      if (req.method === 'PATCH') {
        const id = Number(url.pathname.split('/').pop()); if (!one('SELECT id FROM accounts WHERE id=?', id)) fail('Không tìm thấy tài khoản.', 404);
        if (one('SELECT m.id FROM members m JOIN families f ON f.id=m.family_id WHERE f.manager_id=? AND m.email=?', id, address)) fail('Email trùng thành viên của Family.');
        run('UPDATE accounts SET email=?,note=? WHERE id=?', address, note, id); log(`${user.username}: sửa tài khoản #${id}`); return send(res, 200, { ok: true });
      }
    }
    if (['POST', 'PATCH'].includes(req.method) && /^\/api\/families(?:\/\d+)?$/.test(url.pathname)) {
      const data = await body(req); const name = label(data.name), product = service(data.service || 'youtube'), note = text(data.note);
      const manager = one('SELECT * FROM accounts WHERE id=?', Number(data.manager_id)); if (!manager) fail('Không tìm thấy tài khoản quản lý.');
      if (req.method === 'POST' && url.pathname === '/api/families') {
        const result = run('INSERT INTO families(name,manager_id,service,note,created_at) VALUES (?,?,?,?,?)', name, manager.id, product, note, now());
        log(`${user.username}: tạo hồ sơ Family nội bộ ${name}`); return send(res, 201, { id: Number(result.lastInsertRowid) });
      }
      if (req.method === 'PATCH') {
        const id = Number(url.pathname.split('/').pop()); if (!one('SELECT id FROM families WHERE id=?', id)) fail('Không tìm thấy Family.', 404);
        if (one('SELECT id FROM members WHERE family_id=? AND email=?', id, manager.email)) fail('Tài khoản quản lý đang nằm trong danh sách thành viên; cần điều chỉnh hồ sơ trước.');
        run('UPDATE families SET name=?,manager_id=?,service=?,note=? WHERE id=?', name, manager.id, product, note, id); log(`${user.username}: sửa Family #${id}`); return send(res, 200, { ok: true });
      }
    }
    if (['POST', 'PATCH'].includes(req.method) && /^\/api\/members(?:\/\d+)?$/.test(url.pathname)) {
      const data = await body(req); const values = memberData(data); const id = Number(url.pathname.split('/').pop());
      const prior = req.method === 'PATCH' ? one('SELECT * FROM members WHERE id=?', id) : null;
      if (req.method === 'PATCH' && !prior) fail('Không tìm thấy khách.', 404);
      const family = one('SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?', prior?.family_id || Number(data.family_id));
      if (!family) fail('Không tìm thấy Family.'); if (values[0] === family.email) fail('Tài khoản quản lý đã thuộc hồ sơ này.');
      if (req.method === 'POST' && url.pathname === '/api/members') {
        if (one('SELECT COUNT(*) AS n FROM members WHERE family_id=?', family.id).n >= 5) fail('Hồ sơ đã đủ 6 người gồm tài khoản quản lý.');
        const result = run('INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note) VALUES (?,?,?,?,?,?,?,?,?)', family.id, ...values);
        log(`${user.username}: ghi nhận khách ${values[0]} trong ${family.name}`); return send(res, 201, { id: Number(result.lastInsertRowid) });
      }
      if (req.method === 'PATCH') {
        run('UPDATE members SET email=?,customer_name=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=? WHERE id=?', ...values, id);
        log(`${user.username}: cập nhật khách #${id}, hạn ${values[4] || 'chưa đặt'}, thanh toán ${values[5]}`); return send(res, 200, { ok: true });
      }
    }
    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      const data = await body(req); if (!googleActions.includes(data.action)) fail('Tác vụ không được hỗ trợ.');
      if (data.action === 'delete_family') auth.role(user, ['admin']);
      let target, manager, product = 'youtube', familyId = null, accountId = null, address = '';
      if (['invite', 'remove_member', 'delete_family'].includes(data.action)) {
        const f = one('SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?', Number(data.family_id)); if (!f) fail('Không tìm thấy Family.');
        familyId = f.id; accountId = f.manager_id; manager = f.email; product = f.service;
        if (data.action !== 'delete_family') { address = email(data.email); if (address === manager) fail('Không thể mời hoặc kick tài khoản quản lý.'); }
        target = f.name + (address ? ' · ' + address : '');
      } else {
        const a = one('SELECT a.*,f.service FROM accounts a LEFT JOIN families f ON f.manager_id=a.id WHERE a.id=?', Number(data.account_id)); if (!a) fail('Không tìm thấy tài khoản.');
        accountId = a.id; target = manager = a.email; product = a.service || 'youtube';
      }
      const detail = 'Chưa thực hiện. Mở trang Google, thao tác trực tiếp rồi ghi nhận kết quả thủ công.';
      const result = run('INSERT INTO jobs(action,target,status,detail,created_at,account_id,family_id,email,service,manager_email) VALUES (?,?,?,?,?,?,?,?,?,?)', data.action, target, 'blocked', detail, now(), accountId, familyId, address, product, manager);
      log(`${user.username}: ghi nhận yêu cầu ${data.action}: ${target}`);
      return send(res, 201, { id: Number(result.lastInsertRowid), status: 'blocked', detail, guide: googleGuide(data.action, product) });
    }
    if (req.method === 'PATCH' && /^\/api\/jobs\/\d+$/.test(url.pathname)) {
      const data = await body(req), id = Number(url.pathname.split('/').pop()); const job = one('SELECT * FROM jobs WHERE id=?', id);
      if (!job) fail('Không tìm thấy tác vụ.', 404); if (job.action === 'delete_family') auth.role(user, ['admin']);
      if (job.status !== 'blocked') fail('Tác vụ đã được đóng.', 409);
      if (!['manual_done', 'manual_failed', 'cancelled'].includes(data.status)) fail('Trạng thái không hợp lệ.');
      const detail = text(data.detail); if (!detail) fail('Cần ghi chú kết quả.');
      run('UPDATE jobs SET status=?,detail=?,completed_at=?,completed_by=? WHERE id=?', data.status, detail, now(), user.username, id);
      log(`${user.username}: ghi nhận kết quả thủ công tác vụ #${id}: ${data.status}`);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'DELETE' && /^\/api\/(accounts|families|members)\/\d+$/.test(url.pathname)) {
      const [, , table, rawId] = url.pathname.split('/'); const id = Number(rawId);
      if (table !== 'members') auth.role(user, ['admin']);
      const row = one(`SELECT * FROM ${table} WHERE id=?`, id); if (!row) fail('Không tìm thấy hồ sơ.', 404);
      if (table === 'accounts' && one('SELECT id FROM families WHERE manager_id=?', id)) fail('Hãy xóa hồ sơ Family liên quan trước.');
      run(`DELETE FROM ${table} WHERE id=?`, id); log(`${user.username}: xóa hồ sơ nội bộ ${table} #${id}`); return send(res, 200, { ok: true });
    }
    if (req.method === 'GET') {
      const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'] };
      const asset = assets[url.pathname]; if (!asset) return send(res, 404, { error: 'Không tìm thấy.' });
      res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
      return res.end(readFileSync(path.join(root, 'public', asset[0])));
    }
    send(res, 404, { error: 'Không tìm thấy.' });
  } catch (error) {
    const constraint = /UNIQUE constraint/.test(error.message);
    send(res, constraint ? 409 : error.status || 500, { error: constraint ? 'Hồ sơ hoặc tên đăng nhập đã tồn tại; một tài khoản chỉ quản lý một Family.' : error.status ? error.message : 'Lỗi hệ thống.' });
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`Fam Manager started on port ${server.address().port}`));
