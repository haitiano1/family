import { today, renewalDates } from './domain.js';
import { initArchive } from './archive.js';
export const renewalStatuses = ['not_contacted','reminded','awaiting_payment','partial','paid','declined'];
export function initRenewals(db, { fail, text, calendarDate, log }) {
  const archive=initArchive(db,{fail,log});
  return function renew(id, data, user, apply = false) {
    db.exec('SAVEPOINT renewal_save');
    try {
      const m = db.prepare('SELECT m.*,f.name AS family_name FROM members m JOIN families f ON f.id=m.family_id WHERE m.id=?').get(id);
      if (!m) fail('Không tìm thấy khách.', 404);
      if (!Number.isSafeInteger(data.revision) || data.revision !== m.renewal_revision) fail('Thông tin gia hạn đã thay đổi. Đóng hộp thoại, tải lại trang rồi thử lại.', 409);
      if (data.apply_now != null && typeof data.apply_now !== 'boolean') fail('Tùy chọn cập nhật hạn không hợp lệ.');
      let payment = { status:m.renewal_status, amount:m.renewal_amount, paid_at:m.renewal_paid_at, note:m.renewal_note };
      if (!apply) {
        if (!renewalStatuses.includes(data.status)) fail('Trạng thái gia hạn không hợp lệ.');
        const received=['paid','partial'].includes(data.status);
        const amount = Number(data.amount || 0), paid = received?calendarDate(data.paid_at==null||data.paid_at===''?today():data.paid_at):'', note = text(data.note);
        if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) fail('Số tiền gia hạn phải từ 0 đến 1 tỷ VND.');
        if (['paid','partial'].includes(data.status) && (!paid || amount <= 0)) fail('Cần số tiền đã nhận lớn hơn 0 và ngày nhận tiền.');
        if (paid && paid > today()) fail('Ngày đã nhận tiền không được ở tương lai.');
        payment = { status:data.status, amount, paid_at:paid, note };
      }
      if (apply || data.apply_now) {
        if (payment.status !== 'paid') fail('Cần ghi nhận đã thanh toán đủ tiền gia hạn trước.');
        const plan = Number(data.plan_months || 0); let dates;
        try { dates = renewalDates(m.expires_at,payment.paid_at,plan); } catch (error) { fail(error.message); }
        if (m.joined_at && dates.purchase_date < m.joined_at) fail('Ngày mua mới không được trước ngày mua hiện tại.');
        if (data.expires_at && calendarDate(data.expires_at) !== dates.expires_at) fail('Ngày hết hạn tự tính đã thay đổi. Hãy tải lại hộp thoại.');
        const result = db.prepare('INSERT INTO renewal_history(member_id,email,customer_name,family_name,old_expires_at,new_expires_at,plan_months,amount,paid_at,note,created_at,created_by,old_purchase_at,new_purchase_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(m.id,m.email,m.customer_name,m.family_name,m.expires_at,dates.expires_at,plan,payment.amount,payment.paid_at,payment.note,new Date().toISOString(),user.username,m.joined_at,dates.purchase_date);
        db.prepare("UPDATE members SET joined_at=?,expires_at=?,plan_months=?,payment_status='paid',amount=?,renewal_status='not_contacted',renewal_amount=0,renewal_paid_at='',renewal_note='',declined_at='',renewal_revision=renewal_revision+1 WHERE id=?").run(dates.purchase_date,dates.expires_at,plan,payment.amount,m.id);
        log(`${user.username}: xác nhận gia hạn khách #${m.id}, ngày mua ${dates.purchase_date}, hạn ${m.expires_at || 'chưa đặt'} → ${dates.expires_at}, đã nhận ${payment.amount} VND`);
        db.exec('RELEASE renewal_save'); return { ok:true,applied:true,history_id:Number(result.lastInsertRowid), ...dates };
      }
      db.prepare('UPDATE members SET renewal_status=?,renewal_amount=?,renewal_paid_at=?,renewal_note=?,declined_at=?,renewal_revision=renewal_revision+1 WHERE id=?').run(payment.status,payment.amount,payment.paid_at,payment.note,payment.status === 'declined' ? (m.declined_at || new Date().toISOString()) : '',m.id);
      log(`${user.username}: cập nhật gia hạn khách #${m.id}: ${payment.status}, đã nhận ${payment.amount} VND`);
      if(payment.status==='declined'){archive.sweep();const record=db.prepare('SELECT id FROM archived_customers WHERE original_member_id=? AND restored_at IS NULL ORDER BY id DESC LIMIT 1').get(m.id);db.exec('RELEASE renewal_save');return {ok:true,applied:false,archived:true,archive_id:record.id};}
      db.exec('RELEASE renewal_save'); return { ok:true,applied:false };
    } catch (error) { db.exec('ROLLBACK TO renewal_save; RELEASE renewal_save'); throw error; }
  };
}
