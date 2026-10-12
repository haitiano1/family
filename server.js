import http from 'node:http';
import { initDatabase } from './database.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { initOtherProducts } from './other-products.js';
import { validators } from './validation.js';
import { initArchive } from './archive.js';
import { initRenewals } from './renewal.js';
import { initImporter } from './importer.js';
import { today, expiry } from './domain.js';
import { beginAudit,finishAudit,cancelAudit,auditLog,auditAction,journal,journalEntry,withAudit } from './audit.js';
import { initIssues } from './issues.js';
import { hosting } from './hosting.js';
import { customerBackup, restoreCustomers } from './backup.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const access = hosting();
const dir = process.env.DATA_DIR || path.join(root, 'data');
const db = initDatabase(dir);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const one = (sql, ...args) => db.prepare(sql).get(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
const now = () => new Date().toISOString();
const log = message => auditLog(db,message);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const actor = { username:'Cục bộ' };
const { email,text,label,service,calendarDate,memberData } = validators(fail);
const saveOtherProduct=initOtherProducts(db,{fail,text,email,calendarDate,log});
const issues=initIssues(db,{fail,text,email,log});
const archive = initArchive(db, { fail,log, mode:'declined' });
await withAudit(db,'Tự động lưu trữ',()=>archive.sweep(),'Hệ thống');
let requestQueue=Promise.resolve();
const housekeeper = setInterval(() => { requestQueue=requestQueue.then(()=>withAudit(db,'Tự động lưu trữ',()=>archive.sweep(),'Hệ thống')).catch(()=>console.error('Archive sweep failed. Retry on the next interval.')); },60000); housekeeper.unref();
const renewMember = initRenewals(db, { fail, text, calendarDate, log });
const importCustomers = initImporter(db, { fail, email, text, memberData, log });
async function body(req, limit = 16384) {
  if(Object.hasOwn(req,'famBody'))return req.famBody;
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) fail('Yêu cầu cần Content-Type application/json.', 415);
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > limit) fail('Dữ liệu quá lớn.', 413); chunks.push(chunk); }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) fail('Dữ liệu cần là một đối tượng.'); return parsed; }
  catch { fail('JSON không hợp lệ.'); }
}
function send(res, status, value) { if(res.famCapture){res.famPending={status,value};return;}  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function handle(req, res) {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const host = req.headers.host;
    const url = new URL(req.url, `http://${host}`);
    if (!access.allowedHost(host)) fail('Địa chỉ truy cập không hợp lệ.', 403);
    if (req.method==='GET' && url.pathname==='/healthz') return send(res,200,{ok:true});
    const writing = !['GET', 'HEAD'].includes(req.method);
    if (writing && req.headers.origin && !access.allowedOrigin(req.headers.origin,host)) fail('Nguồn yêu cầu không hợp lệ.', 403);
    if (writing && url.pathname.startsWith('/api/') && req.headers['x-fam-request'] !== '1') fail('Yêu cầu thay đổi không hợp lệ.',403);
    if (access.enabled && req.method==='POST' && url.pathname==='/api/access') {
      const result=access.login((await body(req)).password);
      if (result.error) return send(res,result.status,{error:result.error});
      res.setHeader('Set-Cookie',result.cookie);return send(res,200,{ok:true});
    }
    if (access.enabled && !access.authorized(req)) {
      if (url.pathname.startsWith('/api/')) fail('Nhập mật khẩu truy cập để mở dữ liệu.',401);
      if (url.pathname==='/') {res.writeHead(302,{Location:'/access','Cache-Control':'no-store'});return res.end();}
    }
    if (access.enabled && req.method==='POST' && url.pathname==='/api/access/close') {
      res.setHeader('Set-Cookie','fam_access=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');return send(res,200,{ok:true});
    }
    if(req.method==='GET'&&url.pathname==='/api/journal')return send(res,200,journal(db,url.searchParams));
    if(req.method==='GET'&&/^\/api\/journal\/(audit|log)\/\d+$/.test(url.pathname)){const [,,,kind,id]=url.pathname.split('/');const entry=journalEntry(db,kind,Number(id));if(!entry)fail('Không tìm thấy nhật ký.',404);return send(res,200,entry);}
    if(['POST','PATCH'].includes(req.method)&&/^\/api\/issues(?:\/\d+)?$/.test(url.pathname)){const id=req.method==='PATCH'?Number(url.pathname.split('/').pop()):null;if((req.method==='POST'&&url.pathname!=='/api/issues')||(req.method==='PATCH'&&!id))fail('Không tìm thấy.',404);return send(res,id?200:201,issues.save(id,await body(req)));}
    if(req.method==='DELETE'&&/^\/api\/issues\/\d+$/.test(url.pathname))return send(res,200,issues.remove(Number(url.pathname.split('/').pop()),await body(req)));
    if (req.method==='GET' && url.pathname==='/api/backup') {
      res.setHeader('Content-Disposition',`attachment; filename="family-backup-${today()}.json"`);
      return send(res,200,customerBackup(db));
    }
    if (req.method==='POST' && url.pathname==='/api/restore') return send(res,200,restoreCustomers(db,await body(req,32000000),fail));
    if (['POST','PATCH'].includes(req.method) && /^\/api\/other-products(?:\/\d+)?$/.test(url.pathname)) {
      const id=req.method === 'PATCH' ? Number(url.pathname.split('/').pop()) : null;
      if (req.method === 'POST' && url.pathname !== '/api/other-products') fail('Không tìm thấy.',404);
      return send(res,id ? 200 : 201,saveOtherProduct(id,await body(req),actor));
    }
    if (req.method === 'DELETE' && /^\/api\/other-products\/\d+$/.test(url.pathname)) {
      const id=Number(url.pathname.split('/').pop());if (!one('SELECT id FROM other_purchases WHERE id=?',id)) fail('Không tìm thấy sản phẩm.',404);
      run('DELETE FROM other_purchases WHERE id=?',id);log(`${actor.username}: xóa sản phẩm khác #${id}`);return send(res,200,{ok:true});
    }
    if (req.method === 'POST' && ['/api/import/preview','/api/import/commit'].includes(url.pathname)) {
      const data = await body(req, 2000000);
      return send(res, 200, importCustomers(data, actor, url.pathname.endsWith('/commit')));
    }
    if (req.method === 'POST' && /^\/api\/archives\/\d+\/restore$/.test(url.pathname)) {
      const data = await body(req); return send(res,200,archive.restore(Number(url.pathname.split('/')[3]),data.family_id,actor));
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
      return send(res, 200, renewMember(Number(url.pathname.split('/')[3]), await body(req), actor, apply));
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      archive.sweep();
      const members = all('SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id ORDER BY m.id DESC').map(m => ({ ...m, ...expiry(m.expires_at) }));
      const other_products=all('SELECT * FROM other_purchases ORDER BY id DESC').map(p=>({...p,...expiry(p.expires_at)}));
      return send(res, 200, {
        hosted:access.enabled,issues:issues.list(),
        other_products,other_reminders:{due_soon:other_products.filter(p=>p.expiry_status==='due_soon').length,expired:other_products.filter(p=>p.expiry_status==='expired').length},
        accounts: all('SELECT a.*, f.id AS family_id, f.name AS family_name, f.service FROM accounts a LEFT JOIN families f ON f.manager_id=a.id ORDER BY a.id DESC'),
        families: all('SELECT f.*, a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id ORDER BY f.id DESC'),
        members, archives:archive.list(), archive_mode:archive.mode,
        logs: all('SELECT id,message,created_at FROM logs UNION ALL SELECT id,message,created_at FROM audit_events ORDER BY created_at DESC,id DESC LIMIT 100'), today: today(),
        reminders: { expired: members.filter(m => m.expiry_status === 'expired').length, due_soon: members.filter(m => m.expiry_status === 'due_soon').length, unpaid: members.filter(m => ['unpaid','partial'].includes(m.payment_status)).length, renewal_waiting: members.filter(m => ['awaiting_payment','partial'].includes(m.renewal_status)).length, renewal_paid_pending: members.filter(m => m.renewal_status === 'paid').length }
      });
    }
    if (['POST', 'PATCH'].includes(req.method) && /^\/api\/accounts(?:\/\d+)?$/.test(url.pathname)) {
      const data = await body(req); const address = email(data.email), note = text(data.note);
      if (req.method === 'POST' && url.pathname === '/api/accounts') {
        const result = run('INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)', address, note, now());
        log(`${actor.username}: thêm tài khoản ${address}`); return send(res, 201, { id: Number(result.lastInsertRowid) });
      }
      if (req.method === 'PATCH') {
        const id = Number(url.pathname.split('/').pop()); if (!one('SELECT id FROM accounts WHERE id=?', id)) fail('Không tìm thấy tài khoản.', 404);
        if (one('SELECT m.id FROM members m JOIN families f ON f.id=m.family_id WHERE f.manager_id=? AND m.email=?', id, address)) fail('Email trùng thành viên của Family.');
        run('UPDATE accounts SET email=?,note=? WHERE id=?', address, note, id); log(`${actor.username}: sửa tài khoản #${id}`); return send(res, 200, { ok: true });
      }
    }
    if (['POST', 'PATCH'].includes(req.method) && /^\/api\/families(?:\/\d+)?$/.test(url.pathname)) {
      const data = await body(req); const name = label(data.name), product = service(data.service || 'youtube'), note = text(data.note);
      if (req.method === 'POST' && url.pathname === '/api/families') {
        const managerEmail = data.manager_email ? email(data.manager_email) : null;
        db.exec('SAVEPOINT family_save');
        try {
          let manager = managerEmail ? one('SELECT * FROM accounts WHERE email=?',managerEmail) : one('SELECT * FROM accounts WHERE id=?',Number(data.manager_id));
          if (!manager && managerEmail) { const result=run('INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)',managerEmail,'',now()); manager={id:Number(result.lastInsertRowid)}; }
          if (!manager) fail('Nhập email quản lý Family hợp lệ.');
          const result = run('INSERT INTO families(name,manager_id,service,note,created_at,trial_date) VALUES (?,?,?,?,?,?)',name,manager.id,product,note,now(),calendarDate(data.trial_date));
          log(`${actor.username}: tạo Family ${name}`); db.exec('RELEASE family_save'); return send(res,201,{id:Number(result.lastInsertRowid)});
        } catch(error) {db.exec('ROLLBACK TO family_save; RELEASE family_save');throw error;}
      }
      if (req.method === 'PATCH') {
        const id=Number(url.pathname.split('/').pop()); const old=one('SELECT * FROM families WHERE id=?',id);if (!old) fail('Không tìm thấy Family.',404);
        const managerEmail=data.manager_email ? email(data.manager_email) : null;
        db.exec('SAVEPOINT family_save');
        try {
          let manager=managerEmail ? one('SELECT * FROM accounts WHERE email=?',managerEmail) : one('SELECT * FROM accounts WHERE id=?',Number(data.manager_id));
          if (!manager && managerEmail) {const result=run('INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)',managerEmail,'',now());manager={id:Number(result.lastInsertRowid),email:managerEmail};}
          if (!manager) fail('Nhập email quản lý Family hợp lệ.');
          if (one('SELECT id FROM members WHERE family_id=? AND email=?',id,manager.email)) fail('Email quản lý trùng một khách trong nhóm.');
          run('UPDATE families SET name=?,manager_id=?,service=?,note=?,trial_date=? WHERE id=?',name,manager.id,product,note,calendarDate(data.trial_date??old.trial_date),id);
          log(`${actor.username}: sửa Family #${id}`);db.exec('RELEASE family_save');return send(res,200,{ok:true});
        } catch(error) {db.exec('ROLLBACK TO family_save; RELEASE family_save');throw error;}
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
        log(`${actor.username}: ghi nhận khách ${values[0]} trong ${family.name}`); return send(res, 201, { id: Number(result.lastInsertRowid) });
      }
      if (req.method === 'PATCH') {
        if (values[9] !== 'invited' && one("SELECT COUNT(*) AS n FROM members WHERE family_id=? AND id!=? AND membership_status!='invited'", family.id,id).n >= 5) fail('Family đã đủ 5 thành viên ghi nhận.');
        run('UPDATE members SET email=?,customer_name=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=?,plan_months=?,membership_status=?,renewal_revision=renewal_revision+1 WHERE id=?', ...values, id);
        log(`${actor.username}: cập nhật khách #${id}, hạn ${values[4] || 'chưa đặt'}, thanh toán ${values[5]}`); return send(res, 200, { ok: true });
      }
    }
    if (req.method === 'DELETE' && /^\/api\/(accounts|families|members)\/\d+$/.test(url.pathname)) {
      const [, , table, rawId] = url.pathname.split('/'); const id = Number(rawId);
      const row = one(`SELECT * FROM ${table} WHERE id=?`, id); if (!row) fail('Không tìm thấy hồ sơ.', 404);
      if (table === 'accounts' && one('SELECT id FROM families WHERE manager_id=?', id)) fail('Hãy xóa hồ sơ Family liên quan trước.');
      run(`DELETE FROM ${table} WHERE id=?`, id); log(`${actor.username}: xóa hồ sơ nội bộ ${table} #${id}`); return send(res, 200, { ok: true });
    }
    if (req.method === 'GET') {
      const assets = { '/': ['index.html','text/html'], '/access':['access.html','text/html'], '/access.js':['access.js','text/javascript'], '/app.js': ['app.js','text/javascript'], '/style.css': ['style.css','text/css'], '/csv.js': ['csv.js','text/javascript'], '/domain.js': ['../domain.js','text/javascript'], '/manifest.webmanifest':['manifest.webmanifest','application/manifest+json'], '/icon-180.png':['icon-180.png','image/png'], '/icon-192.png':['icon-192.png','image/png'], '/icon-512.png':['icon-512.png','image/png'] };
      const asset = assets[url.pathname]; if (!asset) return send(res, 404, { error: 'Không tìm thấy.' });
      res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" });
      return res.end(readFileSync(path.join(root, 'public', asset[0])));
    }
    send(res, 404, { error: 'Không tìm thấy.' });
  } catch (error) {
    const constraint = /UNIQUE constraint/.test(error.message);
    send(res, constraint ? 409 : error.status || 500, { error: constraint ? 'Hồ sơ đã tồn tại; một email quản lý chỉ thuộc một Family.' : error.status ? error.message : 'Lỗi hệ thống.' });
  }
}
const server=http.createServer(async(req,res)=>{
  let path;
  try{path=new URL(req.url,'http://localhost').pathname;if(!['GET','HEAD'].includes(req.method)&&path.startsWith('/api/'))req.famBody=await body(req,path==='/api/restore'?32000000:path.startsWith('/api/import/')?2000000:16384);}
  catch(error){return send(res,error.status||400,{error:error.message});}
  requestQueue=requestQueue.then(async()=>{
    const audited=path==='/api/state'||(!['GET','HEAD'].includes(req.method)&&path.startsWith('/api/')&&!path.startsWith('/api/access'));
    if(!audited)return handle(req,res);
    beginAudit(db,auditAction(req.method,path),path==='/api/state'?'Hệ thống':'Cá nhân');res.famCapture=true;
    try{await handle(req,res);const pending=res.famPending;if(!pending)throw Error('Missing response');if(pending.status>=400)cancelAudit(db);else finishAudit(db);res.famCapture=false;send(res,pending.status,pending.value);}
    catch(error){try{cancelAudit(db);}catch{}res.famCapture=false;send(res,500,{error:'Không thể lưu thao tác và nhật ký. Dữ liệu chưa thay đổi.'});}
  }).catch(()=>{if(!res.writableEnded)send(res,500,{error:'Lỗi hệ thống.'});});
});
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => console.log(`Fam Manager started on port ${server.address().port}`));
