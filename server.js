import http from 'node:http';
import { initDatabase } from './database.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validators } from './validation.js';
import { initArchive } from './archive.js';
import { initRenewals } from './renewal.js';
import { initImporter } from './importer.js';
import { initAuth } from './auth.js';
import { today, expiry, services, googleActions, googleGuide } from './domain.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dir = process.env.DATA_DIR || path.join(root, 'data');
const db = initDatabase(dir);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
const now = () => new Date().toISOString();
const log = message => run('INSERT INTO logs(message,created_at) VALUES (?,?)', message, now());
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const auth = initAuth(db, fail, log);
const { email,text,label,service,calendarDate,memberData } = validators(fail);
const archive = initArchive(db, { fail,log, mode:'declined' });
archive.sweep();
const housekeeper = setInterval(() => { try { archive.sweep(); } catch { console.error('Archive sweep failed. Retry on the next interval.'); } },60000); housekeeper.unref();
const renewMember = initRenewals(db, { fail, text, calendarDate, log });
const importCustomers = initImporter(db, { fail, email, text, memberData, log });
async function body(req, limit = 16384) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail('Yêu cầu cần Content-Type application/json.', 415);
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > limit) fail('Dữ liệu quá lớn.', 413); chunks.push(chunk); }
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
    if (req.method === 'POST' && ['/api/import/preview','/api/import/commit'].includes(url.pathname)) {
      const data = await body(req, 2000000);
      return send(res, 200, importCustomers(data, user, url.pathname.endsWith('/commit')));
    }
    if (req.method === 'POST' && /^\/api\/archives\/\d+\/restore$/.test(url.pathname)) {
      const data = await body(req); return send(res,200,archive.restore(Number(url.pathname.split('/')[3]),data.family_id,user));
    }
    if (req.method === 'GET' && /^\/api\/archives\/\d+\/history$/.test(url.pathname)) return send(res,200,{ history:all('SELECT * FROM renewal_history WHERE archive_id=? ORDER BY id DESC',Number(url.pathname.split('/')[3])) });
    if (req.method === 'GET' && /^\/api\/members\/\d+\/renewal-history$/.test(url.pathname)) {
      const id = Number(url.pathname.split('/')[3]);
      if (!one('SELECT id FROM members WHERE id=?', id)) fail('Không tìm thấy khách.', 404);
      return send(res, 200, { history: all('SELECT * FROM renewal_history WHERE member_id=? ORDER BY id DESC', id) });
    }
    if (['PATCH','POST'].includes(req.method) && /^\/api\/members\/\d+\/renewal(?:\/apply)?$/.test(url.pathname)) {
      const apply = url.pathname.endsWith('/apply');
      if (req.method !== (apply ? 'POST' : 'PATCH')) fail('Không tìm thấy.', 404);
      return send(res, 200, renewMember(Number(url.pathname.split('/')[3]), await body(req), user, apply));
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      archive.sweep();
      const members = all('SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id ORDER BY m.id DESC').map(m => ({ ...m, ...expiry(m.expires_at) }));
      return send(res, 200, {
        accounts: all('SELECT a.*, f.id AS family_id, f.name AS family_name, f.service FROM accounts a LEFT JOIN families f ON f.manager_id=a.id ORDER BY a.id DESC'),
        families: all('SELECT f.*, a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id ORDER BY f.id DESC'),
        members, archives:archive.list(), archive_mode:archive.mode, jobs: all('SELECT * FROM jobs ORDER BY id DESC LIMIT 100').map(j => ({ ...j, guide: googleGuide(j.action, j.service) })),
        logs: all('SELECT * FROM logs ORDER BY id DESC LIMIT 100'), integration: false, google_mode: 'manual', today: today(),
        reminders: { expired: members.filter(m => m.expiry_status === 'expired').length, due_soon: members.filter(m => m.expiry_status === 'due_soon').length, unpaid: members.filter(m => ['unpaid','partial'].includes(m.payment_status)).length, renewal_waiting: members.filter(m => ['awaiting_payment','partial'].includes(m.renewal_status)).length, renewal_paid_pending: members.filter(m => m.renewal_status === 'paid').length },
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
        if (values[9] !== 'invited' && one("SELECT COUNT(*) AS n FROM members WHERE family_id=? AND membership_status!='invited'", family.id).n >= 5) fail('Hồ sơ đã đủ 6 người gồm tài khoản quản lý.');
        const result = run('INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note,plan_months,membership_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)', family.id, ...values);
        log(`${user.username}: ghi nhận khách ${values[0]} trong ${family.name}`); return send(res, 201, { id: Number(result.lastInsertRowid) });
      }
      if (req.method === 'PATCH') {
        if (values[9] !== 'invited' && one("SELECT COUNT(*) AS n FROM members WHERE family_id=? AND id!=? AND membership_status!='invited'", family.id,id).n >= 5) fail('Family đã đủ 5 thành viên ghi nhận.');
        run('UPDATE members SET email=?,customer_name=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=?,plan_months=?,membership_status=?,renewal_revision=renewal_revision+1 WHERE id=?', ...values, id);
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
      const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'], '/csv.js': ['csv.js','text/javascript'], '/domain.js': ['../domain.js','text/javascript'] };
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
