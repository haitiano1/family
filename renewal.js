import { today } from './domain.js';
export const renewalStatuses = ['not_contacted','reminded','awaiting_payment','partial','paid','declined'];
export function initRenewals(db, { fail, text, calendarDate, log }) {
  return function renew(id, data, user, apply = false) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const m = db.prepare('SELECT m.*,f.name AS family_name FROM members m JOIN families f ON f.id=m.family_id WHERE m.id=?').get(id);
      if (!m) fail('Không tìm thấy khách.', 404);
      if (!Number.isSafeInteger(data.revision) || data.revision !== m.renewal_revision) fail('Thông tin gia hạn đã thay đổi. Đóng hộp thoại, tải lại trang rồi thử lại.', 409);
      if (apply) {
        if (m.renewal_status !== 'paid') fail('Cần ghi nhận đã thanh toán đủ tiền gia hạn trước.');
        const expires = calendarDate(data.expires_at); const plan = Number(data.plan_months || 0);
        if (!expires || expires <= (m.expires_at || m.joined_at || today()) || (m.joined_at && expires < m.joined_at)) fail('Hạn mới phải sau hạn hiện tại và ngày vào.');
        if (![1,2,3,6,12].includes(plan)) fail('Chọn gói gia hạn 1, 2, 3, 6 hoặc 12 tháng.');
        const result = db.prepare('INSERT INTO renewal_history(member_id,email,customer_name,family_name,old_expires_at,new_expires_at,plan_months,amount,paid_at,note,created_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(m.id,m.email,m.customer_name,m.family_name,m.expires_at,expires,plan,m.renewal_amount,m.renewal_paid_at,m.renewal_note,new Date().toISOString(),user.username);
        db.prepare("UPDATE members SET expires_at=?,plan_months=?,payment_status='paid',amount=?,renewal_status='not_contacted',renewal_amount=0,renewal_paid_at='',renewal_note='',renewal_revision=renewal_revision+1 WHERE id=?").run(expires,plan,m.renewal_amount,m.id);
        log(`${user.username}: xác nhận gia hạn khách #${m.id}, hạn ${m.expires_at || 'chưa đặt'} → ${expires}, đã nhận ${m.renewal_amount} VND`);
        db.exec('COMMIT'); return { ok:true,history_id:Number(result.lastInsertRowid) };
      }
      if (!renewalStatuses.includes(data.status)) fail('Trạng thái gia hạn không hợp lệ.');
      const amount = Number(data.amount || 0), paid = calendarDate(data.paid_at), note = text(data.note);
      if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) fail('Số tiền gia hạn phải từ 0 đến 1 tỷ VND.');
      if (['paid','partial'].includes(data.status) && (!paid || amount <= 0)) fail('Cần số tiền đã nhận lớn hơn 0 và ngày nhận tiền.');
      if (paid && paid > today()) fail('Ngày đã nhận tiền không được ở tương lai.');
      db.prepare('UPDATE members SET renewal_status=?,renewal_amount=?,renewal_paid_at=?,renewal_note=?,renewal_revision=renewal_revision+1 WHERE id=?').run(data.status,amount,paid,note,m.id);
      log(`${user.username}: cập nhật gia hạn khách #${m.id}: ${data.status}, đã nhận ${amount} VND`);
      db.exec('COMMIT'); return { ok:true };
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
}
