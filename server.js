import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.DATA_DIR || path.join(root, 'data');
mkdirSync(dir, { recursive: true });
const db = new DatabaseSync(path.join(dir, 'family.sqlite'));
db.exec(`PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS families (id INTEGER PRIMARY KEY, name TEXT NOT NULL, manager_id INTEGER UNIQUE NOT NULL REFERENCES accounts(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE, email TEXT NOT NULL, UNIQUE(family_id,email));
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, action TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, message TEXT NOT NULL, created_at TEXT NOT NULL);`);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
const now = () => new Date().toISOString();
const log = message => run('INSERT INTO logs(message,created_at) VALUES (?,?)', message, now());
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const email = value => {
  const result = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) || result.length > 254) fail('Email không hợp lệ.');
  return result;
};
const label = value => {
  const result = String(value || '').trim();
  if (!result || result.length > 200) fail('Tên phải có từ 1 đến 200 ký tự.');
  return result;
};
const actions = new Set(['invite', 'remove_member', 'delete_family', 'change_password', 'setup_2fa', 'check_trial', 'healthcheck']);
async function body(req) {
  let data = '';
  for await (const chunk of req) { data += chunk; if (data.length > 16384) fail('Dữ liệu quá lớn.', 413); }
  try { return JSON.parse(data || '{}'); } catch { fail('JSON không hợp lệ.'); }
}
function send(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, {
      accounts: all('SELECT a.*, f.id AS family_id, f.name AS family_name FROM accounts a LEFT JOIN families f ON f.manager_id=a.id ORDER BY a.id DESC'),
      families: all('SELECT f.*, a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id ORDER BY f.id DESC'),
      members: all('SELECT * FROM members ORDER BY id DESC'), jobs: all('SELECT * FROM jobs ORDER BY id DESC LIMIT 100'),
      logs: all('SELECT * FROM logs ORDER BY id DESC LIMIT 100'), integration: false
    });
    if (req.method === 'POST' && url.pathname === '/api/accounts') {
      const data = await body(req); const address = email(data.email);
      const note = String(data.note || '').trim(); if (note.length > 1000) fail('Ghi chú quá dài.');
      const result = run('INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)', address, note, now());
      log(`Thêm tài khoản vào hệ thống: ${address}`);
      return send(res, 201, { id: Number(result.lastInsertRowid) });
    }
    if (req.method === 'POST' && url.pathname === '/api/families') {
      const data = await body(req); const name = label(data.name); const manager = one('SELECT * FROM accounts WHERE id=?', Number(data.manager_id));
      if (!manager) fail('Không tìm thấy tài khoản quản lý.');
      const result = run('INSERT INTO families(name,manager_id,created_at) VALUES (?,?,?)', name, manager.id, now());
      log(`Tạo hồ sơ Family nội bộ: ${name}`);
      return send(res, 201, { id: Number(result.lastInsertRowid) });
    }
    if (req.method === 'POST' && url.pathname === '/api/members') {
      const data = await body(req); const address = email(data.email);
      const family = one('SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?', Number(data.family_id));
      if (!family) fail('Không tìm thấy Family.');
      if (address === family.email) fail('Tài khoản quản lý đã thuộc hồ sơ này.');
      if (one('SELECT COUNT(*) AS n FROM members WHERE family_id=?', family.id).n >= 5) fail('Hồ sơ đã đủ 6 người gồm tài khoản quản lý.');
      const result = run('INSERT INTO members(family_id,email) VALUES (?,?)', family.id, address);
      log(`Ghi nhận thành viên nội bộ ${address} trong ${family.name}`);
      return send(res, 201, { id: Number(result.lastInsertRowid) });
    }
    if (req.method === 'POST' && url.pathname === '/api/jobs') {
      const data = await body(req);
      if (!actions.has(data.action)) fail('Tác vụ không được hỗ trợ.');
      let target;
      if (['invite', 'remove_member', 'delete_family'].includes(data.action)) {
        const family = one('SELECT * FROM families WHERE id=?', Number(data.family_id));
        if (!family) fail('Không tìm thấy Family.');
        target = family.name + (data.action === 'delete_family' ? '' : ' · ' + email(data.email));
      } else {
        const account = one('SELECT * FROM accounts WHERE id=?', Number(data.account_id));
        if (!account) fail('Không tìm thấy tài khoản.');
        target = account.email;
      }
      const detail = 'Chưa thực hiện trên Google. Cần tích hợp công cụ được cấp quyền.';
      const result = run('INSERT INTO jobs(action,target,status,detail,created_at) VALUES (?,?,?,?,?)', data.action, target, 'blocked', detail, now());
      log(`Ghi nhận yêu cầu ${data.action}: ${target}; chờ tích hợp.`);
      return send(res, 201, { id: Number(result.lastInsertRowid), status: 'blocked', detail });
    }
    if (req.method === 'DELETE' && /^\/api\/(accounts|families|members)\/\d+$/.test(url.pathname)) {
      const [, , table, rawId] = url.pathname.split('/'); const id = Number(rawId);
      const row = one(`SELECT * FROM ${table} WHERE id=?`, id); if (!row) fail('Không tìm thấy hồ sơ.', 404);
      if (table === 'accounts' && one('SELECT id FROM families WHERE manager_id=?', id)) fail('Hãy xóa hồ sơ Family liên quan trước.');
      run(`DELETE FROM ${table} WHERE id=?`, id); log(`Xóa hồ sơ nội bộ ${table} #${id}`);
      return send(res, 200, { ok: true });
    }
    if (req.method === 'GET') {
      const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'] };
      const asset = assets[url.pathname]; if (!asset) return send(res, 404, { error: 'Không tìm thấy.' });
      res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
      return res.end(readFileSync(path.join(root, 'public', asset[0])));
    }
    send(res, 404, { error: 'Không tìm thấy.' });
  } catch (error) {
    const constraint = /UNIQUE constraint/.test(error.message);
    send(res, constraint ? 409 : error.status || 500, { error: constraint ? 'Hồ sơ đã tồn tại hoặc tài khoản đã quản lý một Family.' : error.status ? error.message : 'Lỗi hệ thống.' });
  }
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`Fam Manager started on port ${server.address().port}`));
