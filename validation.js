import { services } from './domain.js';
export function validators(fail) {
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
  const payment = data.payment_status || 'unpaid'; if (!['unknown','unpaid', 'paid', 'partial'].includes(payment)) fail('Trạng thái thanh toán không hợp lệ.');
  const amount = Number(data.amount || 0); if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000) fail('Số tiền phải là số nguyên từ 0 đến 1 tỷ đồng.');
  const plan = Number(data.plan_months || 0); if (!Number.isInteger(plan) || plan < 0 || plan > 120) fail('Gói mua cần từ 1 đến 120 tháng hoặc để chưa đặt.');
  const membership = data.membership_status || 'unknown'; if (!['unknown','active','invited'].includes(membership)) fail('Trạng thái thành viên không hợp lệ.');
  return [email(data.email), text(data.customer_name, 200), text(data.contact, 1000), joined, expires, payment, amount, text(data.note), plan, membership];
}
return { email,text,label,service,calendarDate,memberData };
}
