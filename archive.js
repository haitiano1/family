import { today } from './domain.js';
export function archiveDue(m, current = today(), mode = 'expiry') {
  if (m.renewal_status !== 'declined') return false;
  const selected = m.declined_at;
  const selectedDay = selected && Number.isFinite(Date.parse(selected)) ? (/^\d{4}-\d{2}-\d{2}$/.test(selected) ? selected : today(new Date(selected))) : '';
  const base = mode === 'declined' ? selectedDay : m.expires_at;
  return Boolean(base && (Date.parse(current)-Date.parse(base))/86400000 >= 7);
}
export function initArchive(db, { fail, log, mode = 'expiry' }) {
  function sweep(current = today()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const members = db.prepare('SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id').all().filter(m => archiveDue(m,current,mode));
      for (const m of members) {
        const stamp = new Date().toISOString();
        const result = db.prepare('INSERT INTO archived_customers(original_member_id,email,customer_name,family_name,manager_email,snapshot,archived_at,reason) VALUES (?,?,?,?,?,?,?,?)').run(m.id,m.email,m.customer_name,m.family_name,m.manager_email,JSON.stringify(m),stamp,mode === 'expiry' ? 'Không gia hạn, quá hạn đủ 7 ngày.' : 'Không gia hạn, đã chọn đủ 7 ngày.');
        const archiveId = Number(result.lastInsertRowid);
        db.prepare('UPDATE renewal_history SET archive_id=? WHERE member_id=?').run(archiveId,m.id);
        db.prepare('DELETE FROM members WHERE id=?').run(m.id);
        log(`Hệ thống: chuyển khách #${m.id} vào lưu trữ #${archiveId}; không thao tác Google`);
      }
      db.exec('COMMIT'); return members.length;
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function list() {
    return db.prepare('SELECT * FROM archived_customers WHERE restored_at IS NULL ORDER BY id DESC').all().map(r => {
      const m = JSON.parse(r.snapshot);
      return { id:r.id,email:r.email,customer_name:r.customer_name,family_name:r.family_name,manager_email:r.manager_email,archived_at:r.archived_at,reason:r.reason,member:m };
    });
  }
  function restore(id, familyId, user) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const row = db.prepare('SELECT * FROM archived_customers WHERE id=?').get(id);
      if (!row) fail('Không tìm thấy khách lưu trữ.',404); if (row.restored_at) fail('Khách đã được khôi phục.',409);
      const m = JSON.parse(row.snapshot);
      const family = db.prepare('SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?').get(Number(familyId));
      if (!family) fail('Chọn Family đang tồn tại để khôi phục.');
      if (family.email === m.email) fail('Email khách trùng tài khoản quản lý.');
      if (db.prepare('SELECT id FROM members WHERE family_id=? AND email=?').get(family.id,m.email)) fail('Email khách đã có trong Family này.',409);
      if (db.prepare('SELECT COUNT(*) AS n FROM members WHERE family_id=?').get(family.id).n >= 5) fail('Family đã đủ 5 khách.');
      const restoredId = Number(db.prepare("INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note,plan_months,renewal_status,renewal_amount,renewal_paid_at,renewal_note,renewal_revision,declined_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(family.id,m.email,m.customer_name,m.contact,m.joined_at,m.expires_at,m.payment_status,m.amount,m.note,m.plan_months,'not_contacted',0,'','',m.renewal_revision+1,'').lastInsertRowid);
      db.prepare('UPDATE archived_customers SET restored_at=?,restored_by=?,restored_member_id=? WHERE id=?').run(new Date().toISOString(),user.username,restoredId,id);
      db.prepare('UPDATE renewal_history SET member_id=? WHERE archive_id=?').run(restoredId,id);
      log(`${user.username}: khôi phục khách lưu trữ #${id} vào Family #${family.id}; gia hạn tiếp theo trở về Chưa nhắc`);
      db.exec('COMMIT'); return { ok:true,member_id:restoredId };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  return { sweep,list,restore,mode };
}
