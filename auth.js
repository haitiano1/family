import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const digest = value => createHash('sha256').update(value).digest('hex');
export function initAuth(db, fail, log) {
  db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin','operator','viewer')), disabled INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);`);
  let setupCode = db.prepare('SELECT COUNT(*) AS n FROM users').get().n ? null : randomBytes(6).toString('hex');
  let settingUp = false;
  if (setupCode) console.log(`First admin setup code: ${setupCode}`);
  const attempts = new Map();
  const publicUser = row => row && { id: row.id, username: row.username, role: row.role, disabled: Boolean(row.disabled) };
  const cleanUsername = value => {
    const name = String(value || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,50}$/.test(name)) fail('Tên đăng nhập gồm 3–50 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.');
    return name;
  };
  const checkPassword = value => { if (typeof value !== 'string' || value.length < 12 || value.length > 128) fail('Mật khẩu ứng dụng cần 12–128 ký tự.'); return value; };
  async function hashPassword(value) {
    checkPassword(value); const salt = randomBytes(16).toString('hex');
    const hash = await scrypt(value, salt, 64);
    return salt + ':' + hash.toString('hex');
  }
  const dummyHash = randomBytes(16).toString('hex') + ':' + randomBytes(64).toString('hex');
  async function matches(value, stored = dummyHash) {
    if (typeof value !== 'string' || value.length > 128) return false;
    const [salt, hex] = stored.split(':'); const expected = Buffer.from(hex, 'hex');
    const actual = await scrypt(value, salt, 64); return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
  function session(req) {
    const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('fm_session='))?.slice(11);
    if (!token || token.length !== 64) return null;
    return db.prepare('SELECT u.*,s.csrf,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0').get(digest(token), Date.now());
  }
  function cookie(res, token, age) { res.setHeader('Set-Cookie', `fm_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`); }
  function loggedIn(req) { const s = session(req); if (!s) fail('Vui lòng đăng nhập.', 401); return s; }
  function csrf(req, s) { if (req.headers['x-csrf-token'] !== s.csrf) fail('Phiên không hợp lệ. Hãy tải lại trang.', 403); }
  function role(s, roles) { if (!roles.includes(s.role)) fail('Bạn không có quyền thực hiện thao tác này.', 403); }
  function throttle(req) {
    const key = req.socket.remoteAddress;
    let a = attempts.get(key); if (!a || a.until < Date.now()) { a = { n: 0, until: Date.now() + 600000 }; attempts.set(key, a); }
    if (++a.n > 15) fail('Quá nhiều lần thử. Vui lòng thử lại sau 10 phút.', 429);
  }
  async function createUser(data, first = false) {
    const username = cleanUsername(data.username); const roleName = first ? 'admin' : data.role;
    if (!['admin', 'operator', 'viewer'].includes(roleName)) fail('Vai trò không hợp lệ.');
    const hash = await hashPassword(data.password);
    const result = db.prepare('INSERT INTO users(username,password_hash,role,created_at) VALUES (?,?,?,?)').run(username, hash, roleName, new Date().toISOString());
    log(`Tạo người dùng ứng dụng ${username} (${roleName})`); return Number(result.lastInsertRowid);
  }
  async function handle(req, res, pathname, data, send) {
    if (req.method === 'GET' && pathname === '/api/auth/status') {
      const s = session(req); return send(res, 200, { setup_required: Boolean(setupCode), user: publicUser(s) || null, csrf: s?.csrf || null });
    }
    if (req.method === 'POST' && pathname === '/api/auth/setup') {
      throttle(req);
      if (!setupCode || settingUp) fail('Quản trị viên đã được tạo hoặc đang khởi tạo.', 409);
      const supplied = String(data.code || '');
      if (Buffer.byteLength(supplied) !== Buffer.byteLength(setupCode) || !timingSafeEqual(Buffer.from(supplied), Buffer.from(setupCode))) fail('Mã khởi tạo không đúng.', 403);
      settingUp = true;
      try { const id = await createUser(data, true); setupCode = null; return send(res, 201, { id }); }
      finally { settingUp = false; }
    }
    if (req.method === 'POST' && pathname === '/api/auth/login') {
      throttle(req);
      const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(data.username || '').trim().toLowerCase());
      const valid = await matches(data.password, u?.password_hash);
      if (!valid || !u || u.disabled) fail('Tên đăng nhập hoặc mật khẩu không đúng.', 401);
      const token = randomBytes(32).toString('hex'), csrfToken = randomBytes(32).toString('hex');
      db.prepare('DELETE FROM sessions WHERE expires_at<?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(digest(token), u.id, csrfToken, Date.now() + 8 * 3600000);
      cookie(res, token, 8 * 3600); attempts.delete(req.socket.remoteAddress); log(`Đăng nhập ứng dụng: ${u.username}`);
      return send(res, 200, { user: publicUser(u), csrf: csrfToken });
    }
    const s = loggedIn(req); if (req.method !== 'GET') csrf(req, s);
    if (req.method === 'POST' && pathname === '/api/auth/logout') {
      db.prepare('DELETE FROM sessions WHERE token_hash=?').run(s.token_hash); cookie(res, '', 0); return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && pathname === '/api/auth/password') {
      if (!await matches(data.current_password, s.password_hash)) fail('Mật khẩu hiện tại không đúng.', 403);
      const hash = await hashPassword(data.password);
      db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash, s.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(s.id); cookie(res, '', 0); log(`Đổi mật khẩu ứng dụng: ${s.username}`);
      return send(res, 200, { ok: true });
    }
    role(s, ['admin']);
    if (req.method === 'GET' && pathname === '/api/users') return send(res, 200, { users: db.prepare('SELECT id,username,role,disabled,created_at FROM users ORDER BY id').all() });
    if (req.method === 'POST' && pathname === '/api/users') return send(res, 201, { id: await createUser(data) });
    if (req.method === 'PATCH' && /^\/api\/users\/\d+$/.test(pathname)) {
      const id = Number(pathname.split('/').pop()); const u = db.prepare('SELECT * FROM users WHERE id=?').get(id); if (!u) fail('Không tìm thấy người dùng.', 404);
      if (!['admin', 'operator', 'viewer'].includes(data.role) || typeof data.disabled !== 'boolean') fail('Vai trò hoặc trạng thái không hợp lệ.');
      const hash = data.password ? await hashPassword(data.password) : u.password_hash;
      const latest = db.prepare('SELECT * FROM users WHERE id=?').get(id);
      if (latest.role === 'admin' && !latest.disabled && (data.role !== 'admin' || data.disabled) && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND disabled=0").get().n <= 1) fail('Phải giữ ít nhất một quản trị viên hoạt động.');
      if (u.id === s.id && (data.role !== 'admin' || data.disabled)) fail('Không tự khóa hoặc hạ quyền tài khoản đang sử dụng.');
      db.prepare('UPDATE users SET role=?,disabled=?,password_hash=? WHERE id=?').run(data.role, Number(data.disabled), hash, id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); log(`Cập nhật người dùng ứng dụng ${u.username}: ${data.role}, ${data.disabled ? 'khóa' : 'hoạt động'}`);
      return send(res, 200, { ok: true });
    }
    fail('Không tìm thấy.', 404);
  }
  return { session, loggedIn, csrf, role, handle };
}
