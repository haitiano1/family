export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = kind => parts.find(p => p.type === kind).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function expiry(value, current = today()) {
  if (!value) return { expiry_status: 'unknown', days_left: null };
  const days = Math.round((Date.parse(value) - Date.parse(current)) / 86400000);
  return { expiry_status: days < 0 ? 'expired' : days <= 7 ? 'due_soon' : 'active', days_left: days };
}
export const services = ['google_one', 'google_ai', 'youtube', 'other'];
export const googleActions = ['invite', 'remove_member', 'delete_family', 'change_password', 'setup_2fa', 'check_trial', 'healthcheck'];
export function googleGuide(action, service = 'google_one') {
  const security = 'https://myaccount.google.com/security';
  const family = 'https://myaccount.google.com/family/details';
  const links = { invite: family, remove_member: family, delete_family: family, change_password: 'https://myaccount.google.com/signinoptions/password', setup_2fa: 'https://myaccount.google.com/signinoptions/two-step-verification', healthcheck: security,
    check_trial: service === 'youtube' ? 'https://www.youtube.com/paid_memberships' : 'https://one.google.com/'};
  const instructions = {
    invite: 'Đăng nhập tài khoản quản lý đúng nhóm, mở quản lý gia đình và gửi lời mời tới email trong yêu cầu. Kiểm tra trạng thái lời mời trên Google.',
    remove_member: 'Đăng nhập tài khoản quản lý, kiểm tra đúng nhóm và email, rồi xóa thành viên trên Google. Xác minh danh sách sau thao tác.',
    delete_family: 'Kiểm tra đúng tài khoản và nhóm. Đọc các hệ quả Google hiển thị trước khi quyết định xóa. Hệ thống này không xóa nhóm tự động.',
    change_password: 'Đăng nhập đúng tài khoản trên trang Google, đổi mật khẩu theo hướng dẫn. Không nhập mật khẩu Google vào Fam Manager.',
    setup_2fa: 'Đăng nhập đúng tài khoản và làm theo thiết lập xác minh hai bước trên Google. Không lưu OTP hoặc mã khôi phục trong hệ thống này.',
    check_trial: 'Đăng nhập tài khoản cần kiểm tra, xem gói dịch vụ và ưu đãi Google đang hiển thị. Ghi lại kết quả thủ công; hệ thống không tự xác định điều kiện trial.',
    healthcheck: 'Đăng nhập tài khoản cần kiểm tra và xem trạng thái bảo mật trên Google. Ghi lại kết quả thủ công.'
  };
  return { url: links[action], instructions: instructions[action], automated: false };
}
