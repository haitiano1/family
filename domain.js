export function today(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = kind => parts.find(p => p.type === kind).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function expiry(value, current = today()) {
  if (!value) return { expiry_status: 'unknown', days_left: null };
  const days = Math.round((Date.parse(value) - Date.parse(current)) / 86400000);
  return { expiry_status: days < 0 ? 'expired' : days <= 2 ? 'due_soon' : 'active', days_left: days };
}
export const services = ['google_one', 'google_ai', 'youtube', 'other'];
export const familyStatusLabels = { active:'Đang hoạt động', checking:'Đang kiểm tra', scanned:'Bị quét', disabled:'Bị vô hiệu hoá' };
// Google family invitations expire two weeks after they are sent.
export function inviteExpiry(sentOn) {
  if (typeof sentOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sentOn)) return '';
  const date = new Date(sentOn + 'T00:00:00Z'); if (!Number.isFinite(date.getTime())) return '';
  date.setUTCDate(date.getUTCDate() + 14); return date.toISOString().slice(0, 10);
}
export function isPendingPayment(member) {
  return !['paid','declined'].includes(member.renewal_status) && (['awaiting_payment','partial'].includes(member.renewal_status) || member.expiry_status==='expired');
}
export function renewalReceiptDate(member,status,current=today()) {
  if(!['paid','partial'].includes(status))return '';
  return status===member.renewal_status&&member.renewal_paid_at?member.renewal_paid_at:current;
}
export function sortCustomers(members) {
  return [...members].sort((a,b)=>(a.expires_at||'9999-99-99').localeCompare(b.expires_at||'9999-99-99') || a.id-b.id);
}
export function familyOccupancy(members, familyId) {
  const rows=familyId===undefined?members:members.filter(member=>member.family_id===familyId);
  const pending=rows.filter(member=>member.membership_status==='invited').length;
  const occupied=rows.length-pending;
  return {occupied,pending,capacity:5,label:`${occupied}/5${pending?` (${pending} chưa vào)`:''}`};
}
export function sortFamilies(families, members, filter='') {
  const counts=new Map();for(const m of members)if(m.membership_status!=='invited')counts.set(m.family_id,(counts.get(m.family_id)||0)+1);
  const rows=families.filter(f=>filter!=='spare'||(counts.get(f.id)||0)<5);
  return [...rows].sort(filter==='name'?(a,b)=>b.name.localeCompare(a.name,'vi',{numeric:true})||b.id-a.id:(a,b)=>(a.trial_date||'9999-99-99').localeCompare(b.trial_date||'9999-99-99')||b.id-a.id);
}
export function purchaseExpiry(purchaseDate, months) {
  return renewalDates(purchaseDate,purchaseDate,months).expires_at;
}
// Calendar days elapsed at the report date; the first day is day zero.
export function trialUsageDays(trialDate, reportedOn) {
  if (![trialDate,reportedOn].every(value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value)) return null;
  const days=Math.round((Date.parse(reportedOn)-Date.parse(trialDate))/86400000);
  return days>=0?days:null;
}
// Add calendar months, clamping to the last valid day instead of overflowing February.
export function renewalDates(previousExpiry, purchaseDate, months) {
  if (!Number.isInteger(Number(months)) || Number(months) < 1 || Number(months) > 120) throw new Error('Chọn gói gia hạn từ 1 đến 120 tháng.');
  if (!previousExpiry) throw new Error('Khách chưa có ngày hết hạn. Bổ sung hạn hiện tại trước khi gia hạn.');
  for (const value of [purchaseDate, previousExpiry]) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error('Ngày nhận tiền hoặc ngày hết hạn không hợp lệ.');
  }
  const base = previousExpiry;
  const target = new Date(base + 'T00:00:00Z'); const day = target.getUTCDate();
  target.setUTCDate(1); target.setUTCMonth(target.getUTCMonth() + Number(months));
  const last = new Date(target); last.setUTCMonth(last.getUTCMonth() + 1, 0);
  target.setUTCDate(Math.min(day,last.getUTCDate()));
  const expires = target.toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) throw new Error('Ngày hết hạn vượt phạm vi hỗ trợ.');
  return { purchase_date: base, base_date: base, expires_at: expires };
}
