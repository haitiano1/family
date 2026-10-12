const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const day = value => value ? value.split('-').reverse().join('/') : 'Chưa đặt';
const names = { overview: 'Tổng quan', accounts: 'Tài khoản', families: 'Family', customers: 'Khách & Gia hạn', jobs: 'Jobs', integration: 'Google', logs: 'Nhật ký', users: 'Người dùng', profile: 'Tài khoản ứng dụng' };
const roles = { admin: 'Quản trị viên', operator: 'Nhân viên', viewer: 'Chỉ xem' };
const products = { youtube: 'YouTube Premium', google_one: 'Google One', google_ai: 'Google AI', other: 'Khác' };
const jobNames = { invite: 'Mời thành viên', remove_member: 'Kick thành viên', delete_family: 'Xóa Google Family', change_password: 'Đổi mật khẩu', setup_2fa: 'Thiết lập 2FA', check_trial: 'Kiểm tra trial', healthcheck: 'Healthcheck' };
const statuses = { blocked: 'Cần thao tác trên Google', manual_done: 'Đã làm — tự xác nhận', manual_failed: 'Thất bại — tự ghi nhận', cancelled: 'Đã hủy' };
const payments = { unpaid: 'Chưa thanh toán', partial: 'Thanh toán một phần', paid: 'Đã thanh toán' };
let state, auth, users = [], search = '', familyFilter = '', customerSearch = '', customerFilter = '', submitModal, toastTimer, sessionEpoch = 0;
const route = () => (location.hash.slice(1) || 'overview').split('/');
const canWrite = () => ['admin', 'operator'].includes(auth?.user?.role);
const admin = () => auth?.user?.role === 'admin';
const notice = '<div class="notice">Google Family chưa được đồng bộ tự động. Bạn thao tác trực tiếp trên trang Google, sau đó ghi nhận kết quả trong Jobs. Hồ sơ và kết quả là dữ liệu nhập thủ công.</div>';
function toast(text) { $('#toast').textContent = text; $('#toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').style.display = 'none', 6000); }
async function api(path, options = {}) {
  const response = await fetch('/api/' + path, { ...options, headers: { 'Content-Type': 'application/json', ...(auth?.csrf ? { 'X-CSRF-Token': auth.csrf } : {}) } });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401 && path !== 'auth/login') { auth = { user: null }; showAuth(); } throw new Error(data.error || 'Không thể thực hiện yêu cầu.'); }
  return data;
}
const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) });
const patch = (path, data) => api(path, { method: 'PATCH', body: JSON.stringify(data) });
async function refresh(render = true) {
  const epoch = sessionEpoch;
  const next = await api('state');
  if (epoch !== sessionEpoch || !auth?.user) return;
  const nextUsers = next.user.role === 'admin' ? (await api('users')).users : [];
  if (epoch !== sessionEpoch || !auth?.user) return;
  state = next; auth.user = state.user; users = nextUsers;
  if (render) draw();
}
function showAuth() {
  sessionEpoch++; state = null; users = []; if ($('#modal').open) $('#modal').close(); $('#modal-fields').innerHTML = '';
  document.body.classList.add('auth-mode'); $('#main').innerHTML = '';
  const setup = auth?.setup_required;
  $('#auth-screen').hidden = false;
  $('#auth-screen').innerHTML = `<section class="card auth-card"><div class="auth-brand">♧ Fam Manager</div><span class="eyebrow">${setup ? 'THIẾT LẬP LẦN ĐẦU' : 'CHÀO MỪNG TRỞ LẠI'}</span><h1>${setup ? 'Tạo quản trị viên' : 'Đăng nhập'}</h1><p>Tài khoản của ứng dụng, không phải tài khoản Google.</p><form id="auth-form">${setup ? input('code', 'Mã khởi tạo trong cửa sổ chạy ứng dụng', 'text', '', true, 'autocomplete="off"') : ''}${input('username', 'Tên đăng nhập', 'text', '', true, 'autocomplete="username" minlength="3" maxlength="50"')}${input('password', 'Mật khẩu ứng dụng', 'password', '', true, `autocomplete="${setup ? 'new-password' : 'current-password'}" ${setup ? 'minlength="12"' : ''} maxlength="128"`)}${setup ? '<p>Chọn mật khẩu riêng từ 12 ký tự. Không dùng mật khẩu Google.</p>' : ''}<p id="auth-error" role="alert"></p><button class="primary" type="submit">${setup ? 'Tạo quản trị viên' : 'Đăng nhập'}</button></form></section>`;
  $('#auth-form').onsubmit = async event => {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (setup) { await post('auth/setup', data); auth = { setup_required: false, user: null }; showAuth(); toast('Đã tạo quản trị viên. Hãy đăng nhập.'); }
      else { auth = await post('auth/login', data); await refresh(); }
    } catch (error) { $('#auth-error').textContent = error.message; }
    finally { button.disabled = false; }
  };
}
const hero = (eyebrow, title, description, action = '') => `<section class="card hero"><div><span class="eyebrow">${eyebrow}</span><h1>${escape(title)}</h1><p>${description}</p></div>${action}</section>`;
const empty = (title, description, action = '') => `<div class="empty"><div class="empty-icon">♧</div><h2>${title}</h2><p>${description}</p>${action}</div>`;
const stats = entries => `<div class="stats">${entries.map(([name, n]) => `<div class="card stat"><h2>${name}</h2><strong>${escape(n)}</strong></div>`).join('')}</div>`;
const btn = (action, title, type = 'secondary', attrs = '', permission = 'write') => (permission === 'admin' ? admin() : permission === 'write' ? canWrite() : true) ? `<button class="${type}" data-action="${action}" ${attrs}>${title}</button>` : '';
const input = (name, title, type = 'text', value = '', required = false, attrs = '') => `<label for="field-${name}">${title}</label><input id="field-${name}" name="${name}" type="${type}" value="${escape(value)}" ${required ? 'required' : ''} ${attrs}>`;
const select = (name, title, options, value) => `<label for="field-${name}">${title}</label><select id="field-${name}" name="${name}">${Object.entries(options).map(([key, name]) => `<option value="${escape(key)}" ${String(value) === key ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select>`;
const noteField = value => `<label for="field-note">Ghi chú</label><textarea id="field-note" name="note" maxlength="1000">${escape(value)}</textarea>`;
function accountsTable(accounts) {
  if (!accounts.length) return empty('Chưa có tài khoản phù hợp', 'Thêm email và ghi chú để bắt đầu.', btn('add-account', '+ Thêm tài khoản', 'primary'));
  return `<div class="table-wrap"><table><thead><tr><th>EMAIL</th><th>FAMILY</th><th>GHI CHÚ</th><th>NGÀY THÊM</th><th>THAO TÁC</th></tr></thead><tbody>${accounts.map(a => `<tr><td><a class="email-link" href="#account/${a.id}">${escape(a.email)}</a><span class="subtext">Chưa xác minh trên Google</span></td><td>${escape(a.family_name || 'Chưa gắn Family')}</td><td>${escape(a.note || '—')}</td><td>${date(a.created_at)}</td><td><div class="row-actions">${btn('edit-account', 'Sửa', 'secondary tiny', `data-id="${a.id}"`)}${btn('delete-account', 'Xóa hồ sơ', 'danger tiny', `data-id="${a.id}"`, 'admin')}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function expiryBadge(m) {
  const labels = { unknown: 'Chưa đặt hạn', expired: `Quá hạn ${Math.abs(m.days_left)} ngày`, due_soon: m.days_left === 0 ? 'Hết hạn hôm nay' : `Còn ${m.days_left} ngày`, active: `Còn ${m.days_left} ngày` };
  return `<span class="badge ${m.expiry_status === 'expired' ? 'red' : m.expiry_status === 'due_soon' ? 'amber' : m.expiry_status === 'active' ? 'green' : ''}">${labels[m.expiry_status]}</span>`;
}
function customerTable(members) {
  return members.length ? `<div class="table-wrap"><table><thead><tr><th>KHÁCH HÀNG</th><th>FAMILY / GÓI</th><th>NGÀY VÀO</th><th>HẾT HẠN</th><th>THANH TOÁN</th><th>THAO TÁC</th></tr></thead><tbody>${members.map(m => `<tr><td><strong>${escape(m.customer_name || m.email)}</strong><span class="subtext">${escape(m.email)}</span><span class="subtext">${escape(m.contact)}</span></td><td><a class="email-link" href="#family/${m.family_id}">${escape(m.family_name)}</a><span class="subtext">${products[m.service]}</span></td><td>${day(m.joined_at)}</td><td>${day(m.expires_at)}<span class="subtext">${expiryBadge(m)}</span></td><td><span class="badge ${m.payment_status === 'paid' ? 'green' : 'amber'}">${payments[m.payment_status]}</span><span class="subtext">${Number(m.amount).toLocaleString('vi-VN')} ₫</span></td><td><div class="row-actions">${btn('edit-member', 'Sửa / Gia hạn', 'secondary tiny', `data-id="${m.id}"`)}${btn('kick', 'Yêu cầu kick', 'secondary tiny', `data-id="${m.family_id}" data-email="${escape(m.email)}"`)}${btn('delete-member', 'Xóa hồ sơ', 'danger tiny', `data-id="${m.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có khách phù hợp', 'Thêm khách từ trang Family hoặc điều chỉnh bộ lọc.');
}
function jobsTable(jobs) {
  return jobs.length ? `<div class="table-wrap"><table><thead><tr><th>ID / TÁC VỤ</th><th>ĐỐI TƯỢNG</th><th>TRẠNG THÁI</th><th>THỜI GIAN</th><th></th></tr></thead><tbody>${jobs.map(j => `<tr><td><a class="email-link" href="#job/${j.id}">#${j.id} · ${jobNames[j.action]}</a></td><td>${escape(j.target)}</td><td><span class="badge ${j.status === 'blocked' ? 'amber' : j.status === 'manual_done' ? 'green' : ''}">${statuses[j.status] || escape(j.status)}</span></td><td>${date(j.created_at)}</td><td><a class="secondary link-button tiny" href="#job/${j.id}">Xem hướng dẫn</a></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có tác vụ', 'Yêu cầu thao tác với Google sẽ xuất hiện tại đây.');
}
function draw() {
  if (!state || !auth?.user) return;
  document.body.classList.remove('auth-mode'); $('#auth-screen').hidden = true; $('#auth-screen').innerHTML = '';
  const [page, id] = route();
  const parent = { account: 'accounts', family: 'families', job: 'jobs' }[page] || page;
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.page === parent));
  $('#users-nav').hidden = !admin();
  $('#breadcrumb').textContent = `Fam Manager › ${names[parent] || 'Tài khoản'} ${id ? '› #' + id : ''}`;
  $('#session-user').textContent = `${auth.user.username} · ${roles[auth.user.role]}`;
  let content = '';
  if (page === 'overview') {
    content = hero('KHÔNG GIAN LÀM VIỆC', 'Tổng quan', 'Quản lý khách hàng, hạn sử dụng và hồ sơ Family.', btn('add-account', '+ Thêm tài khoản', 'primary')) + stats([['Tài khoản', state.accounts.length], ['Hồ sơ Family', state.families.length], ['Sắp hết hạn (7 ngày)', state.reminders.due_soon], ['Khách đã quá hạn', state.reminders.expired]]) + `<section class="card"><div class="section-heading"><div><h2>Nhắc gia hạn</h2><p>Tính theo ngày Việt Nam. Hạn có hiệu lực hết ngày ghi nhận; không tự động kick khách.</p></div><a class="email-link" href="#customers">Xem tất cả khách →</a></div>${customerTable(state.members.filter(m => ['expired', 'due_soon'].includes(m.expiry_status)))}</section><div class="split"><section class="card"><h2>Thanh toán</h2><p>${state.reminders.unpaid} khách chưa thanh toán đủ. Số tiền là khoản bạn ghi nhận thủ công.</p><a class="email-link" href="#customers">Quản lý khách và thanh toán →</a></section><section class="card"><h2>Hoạt động gần đây</h2>${state.logs.slice(0, 5).map(l => `<div class="list-item">${escape(l.message)}<span class="subtext">${date(l.created_at)}</span></div>`).join('') || '<p>Chưa có hoạt động.</p>'}</section></div>`;
  } else if (page === 'customers') {
    content = hero('KHÁCH HÀNG', 'Khách & Gia hạn', 'Theo dõi thông tin liên hệ, ngày vào, hạn sử dụng và thanh toán.') + stats([['Khách đang ghi nhận', state.members.length], ['Sắp hết hạn', state.reminders.due_soon], ['Quá hạn', state.reminders.expired], ['Chưa thanh toán đủ', state.reminders.unpaid]]) + `<section class="card"><h2>Danh sách khách</h2><div class="toolbar"><input id="customer-search" aria-label="Tìm khách" placeholder="Tìm email, tên, liên hệ hoặc Family…" value="${escape(customerSearch)}"><select id="customer-filter" aria-label="Lọc khách">${Object.entries({ '': 'Tất cả khách', due_soon: 'Sắp hết hạn (7 ngày)', expired: 'Đã quá hạn', unpaid: 'Chưa thanh toán đủ', unknown: 'Chưa đặt hạn' }).map(([key, name]) => `<option value="${key}" ${customerFilter === key ? 'selected' : ''}>${name}</option>`).join('')}</select></div><div id="customer-table">${filteredCustomers()}</div></section>`;
  } else if (page === 'accounts') {
    content = hero('TÀI KHOẢN', 'Managed accounts', 'Quản lý email, ghi chú và hồ sơ Family.', btn('add-account', '+ Thêm tài khoản', 'primary')) + `<section class="card"><h2>Danh sách tài khoản</h2><p>Dữ liệu được cập nhật mỗi 10 giây.</p><div class="toolbar"><input id="search" aria-label="Tìm tài khoản" placeholder="Tìm email, Family hoặc ghi chú…" value="${escape(search)}"><select id="family-filter" aria-label="Lọc Family"><option value="">Tất cả tài khoản</option><option value="with" ${familyFilter === 'with' ? 'selected' : ''}>Có hồ sơ Family</option><option value="without" ${familyFilter === 'without' ? 'selected' : ''}>Chưa gắn Family</option></select><small>${state.accounts.length} tài khoản</small></div><div id="account-table">${filteredAccounts()}</div></section>`;
  } else if (page === 'account') {
    const a = state.accounts.find(a => a.id === Number(id));
    if (!a) content = empty('Không tìm thấy tài khoản', 'Hồ sơ này có thể đã bị xóa.');
    else content = `<a class="back" href="#accounts">← Danh sách tài khoản</a>` + hero('TÀI KHOẢN', a.email, 'Thông tin ghi nhận nội bộ.', btn('edit-account', 'Sửa thông tin', 'secondary', `data-id="${a.id}"`)) + notice + `<section class="card"><h2>Thông tin tài khoản</h2><p>Ghi chú: ${escape(a.note || 'Chưa có ghi chú')}</p><p>Family: ${a.family_id ? `<a class="email-link" href="#family/${a.family_id}">${escape(a.family_name)}</a>` : 'Chưa có hồ sơ'}</p></section><section class="card"><h2>Tác vụ Google</h2><p>Ghi nhận yêu cầu, mở trang Google rồi tự xác nhận kết quả.</p><div class="actions">${['healthcheck', 'change_password', 'setup_2fa', 'check_trial'].map(action => btn('account-job', jobNames[action], 'secondary', `data-kind="${action}" data-id="${a.id}"`)).join('')}${!a.family_id ? btn('add-family', 'Tạo hồ sơ Family', 'secondary', `data-id="${a.id}"`) : ''}</div></section><section class="card"><h2>Jobs của tài khoản</h2>${jobsTable(state.jobs.filter(j => j.account_id === a.id || j.target === a.email))}</section>`;
  } else if (page === 'families') {
    content = hero('FAMILY', 'Quản lý Family', 'Hồ sơ nhóm và danh sách khách hàng.', btn('add-family', '+ Thêm hồ sơ Family', 'primary')) + notice + `<section class="card"><h2>Danh sách Family</h2>${state.families.length ? `<div class="table-wrap"><table><thead><tr><th>FAMILY / GÓI</th><th>TÀI KHOẢN QUẢN LÝ</th><th>THÀNH VIÊN</th><th>THAO TÁC</th></tr></thead><tbody>${state.families.map(f => `<tr><td><a class="email-link" href="#family/${f.id}">${escape(f.name)}</a><span class="subtext">${products[f.service]}</span></td><td>${escape(f.manager_email)}</td><td>${state.members.filter(m => m.family_id === f.id).length + 1}/6</td><td><div class="row-actions">${btn('edit-family', 'Sửa', 'secondary tiny', `data-id="${f.id}"`)}${btn('delete-family-record', 'Xóa hồ sơ', 'danger tiny', `data-id="${f.id}"`, 'admin')}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có hồ sơ Family', 'Thêm tài khoản quản lý, sau đó tạo hồ sơ Family.', btn('add-family', '+ Thêm hồ sơ Family', 'primary'))}</section>`;
  } else if (page === 'family') {
    const f = state.families.find(f => f.id === Number(id));
    if (!f) content = empty('Không tìm thấy Family', 'Hồ sơ này có thể đã bị xóa.');
    else content = `<a class="back" href="#families">← Danh sách Family</a>` + hero('FAMILY', f.name, `${products[f.service]} · Quản lý: ${escape(f.manager_email)}`, btn('add-member', '+ Thêm khách', 'primary', `data-id="${f.id}"`)) + notice + `<section class="card"><div class="section-heading"><div><h2>Thông tin Family</h2><p>${escape(f.note || 'Chưa có ghi chú')}</p></div>${btn('edit-family', 'Sửa hồ sơ', 'secondary', `data-id="${f.id}"`)}</div><p>Manager: ${escape(f.manager_email)} · ${state.members.filter(m => m.family_id === f.id).length + 1}/6 người đang ghi nhận.</p></section><section class="card"><h2>Khách hàng trong nhóm</h2>${customerTable(state.members.filter(m => m.family_id === f.id))}</section><section class="card"><h2>Tác vụ Google Family</h2><div class="actions">${btn('invite', 'Mời khách vào Family', 'secondary', `data-id="${f.id}"`)}${btn('delete-google-family', 'Yêu cầu xóa Google Family', 'danger', `data-id="${f.id}"`, 'admin')}</div></section>`;
  } else if (page === 'jobs') content = hero('VẬN HÀNH', 'Tác vụ & Jobs', 'Theo dõi yêu cầu và kết quả tự ghi nhận.') + notice + `<section class="card"><h2>100 tác vụ gần đây</h2>${jobsTable(state.jobs)}</section>`;
  else if (page === 'job') {
    const j = state.jobs.find(j => j.id === Number(id));
    if (!j) content = empty('Không tìm thấy tác vụ', 'Danh sách hiển thị 100 tác vụ gần nhất.');
    else content = `<a class="back" href="#jobs">← Danh sách Jobs</a>` + hero('TÁC VỤ #' + j.id, jobNames[j.action], escape(j.target), `<span class="badge amber">${statuses[j.status]}</span>`) + `<section class="card"><h2>Thao tác trên Google</h2><p>Tài khoản cần đăng nhập: <strong>${escape(j.manager_email || 'Xem đối tượng trong yêu cầu cũ')}</strong></p><p>${escape(j.guide.instructions)}</p><p>Kiểm tra đúng tài khoản trong trình duyệt trước khi thao tác. Mở trang không tự đăng nhập hoặc thực hiện yêu cầu.</p><div class="actions"><a class="primary link-button" href="${escape(j.guide.url)}" target="_blank" rel="noopener noreferrer">Mở trang Google ↗</a></div></section><section class="card"><h2>Kết quả ghi nhận</h2><p>${escape(j.detail)}</p>${j.completed_at ? `<p>Người ghi nhận: ${escape(j.completed_by)} · ${date(j.completed_at)}</p>` : ''}<p>Kết quả này do người dùng xác nhận; ứng dụng không kiểm tra trực tiếp trên Google và không tự sửa danh sách thành viên.</p>${j.status === 'blocked' ? btn('job-result', 'Ghi nhận kết quả', 'secondary', `data-id="${j.id}"`, j.action === 'delete_family' ? 'admin' : 'write') : ''}</section>`;
  } else if (page === 'logs') content = hero('HỆ THỐNG', 'Nhật ký hoạt động', 'Lịch sử thay đổi và người thực hiện.') + `<section class="card"><h2>100 hoạt động gần đây</h2>${state.logs.map(l => `<div class="list-item">${escape(l.message)}<span class="subtext">#${l.id} · ${date(l.created_at)}</span></div>`).join('')}</section>`;
  else if (page === 'integration') content = hero('GOOGLE / YOUTUBE', 'Thao tác Google', 'Luồng hỗ trợ thao tác thủ công và ghi nhận kết quả.', '<span class="badge amber">Chưa tự động hóa</span>') + `<section class="card"><h2>YouTube Premium Family</h2><p>API YouTube công khai được kiểm tra chưa cung cấp phương thức mời/kick thành viên Family, xóa nhóm hoặc kiểm tra ưu đãi trial Premium. Chức năng memberships của API là hội viên kênh YouTube, không phải Family Premium.</p><p>Ứng dụng cung cấp trang thao tác chính thức cho từng yêu cầu và lưu kết quả bạn xác nhận. Không thu thập mật khẩu Google, OTP hoặc mã khôi phục.</p><div class="actions"><a class="secondary link-button" href="https://myaccount.google.com/family/details" target="_blank" rel="noopener noreferrer">Quản lý gia đình ↗</a><a class="secondary link-button" href="https://www.youtube.com/paid_memberships" target="_blank" rel="noopener noreferrer">Gói YouTube ↗</a><a class="secondary link-button" href="https://support.google.com/youtube/answer/7507349?hl=vi" target="_blank" rel="noopener noreferrer">Điều kiện gói Family ↗</a></div></section><section class="card"><h2>Giới hạn hiện tại</h2><p>Chưa có đồng bộ, worker tự động hoặc xác minh kết quả Google. Cần công cụ được cấp quyền và kiểm thử bằng tài khoản của bạn trước khi có thể bổ sung tự động hóa thực tế.</p><p>Bạn cần đối chiếu điều kiện của Google về thành viên, nơi cư trú và việc thay đổi nhóm trước khi mời hoặc xóa khách.</p></section>`;
  else if (page === 'users') content = !admin() ? empty('Không có quyền', 'Chỉ quản trị viên quản lý người dùng.') : hero('QUẢN TRỊ', 'Người dùng ứng dụng', 'Tài khoản đăng nhập riêng, tách biệt với email Google.', btn('add-user', '+ Thêm người dùng', 'primary', '', 'admin')) + `<section class="card"><h2>Phân quyền</h2><p>Quản trị viên: toàn bộ hồ sơ và người dùng. Nhân viên: sửa hồ sơ khách, ghi nhận tác vụ; không xóa Family/tài khoản quản lý. Chỉ xem: đọc dữ liệu.</p><div class="table-wrap"><table><thead><tr><th>TÊN ĐĂNG NHẬP</th><th>VAI TRÒ</th><th>TRẠNG THÁI</th><th></th></tr></thead><tbody>${users.map(u => `<tr><td>${escape(u.username)}</td><td>${roles[u.role]}</td><td>${u.disabled ? 'Đã khóa' : 'Hoạt động'}</td><td>${btn('edit-user', 'Sửa quyền / Mật khẩu', 'secondary tiny', `data-id="${u.id}"`, 'admin')}</td></tr>`).join('')}</tbody></table></div></section>`;
  else if (page === 'profile') content = hero('TÀI KHOẢN ỨNG DỤNG', auth.user.username, roles[auth.user.role]) + `<section class="card"><h2>Bảo mật đăng nhập</h2><p>Phiên đăng nhập có thời hạn 8 giờ. Đổi mật khẩu sẽ đăng xuất mọi phiên của tài khoản này.</p>${btn('app-password', 'Đổi mật khẩu ứng dụng', 'secondary', '', 'all')}</section>`;
  else content = empty('Không tìm thấy trang', 'Chọn một mục trong thanh điều hướng.');
  $('#main').innerHTML = content;
}
function filteredAccounts() {
  const q = search.toLocaleLowerCase();
  return accountsTable(state.accounts.filter(a => `${a.email} ${a.note} ${a.family_name || ''}`.toLocaleLowerCase().includes(q) && (!familyFilter || (familyFilter === 'with' ? a.family_id : !a.family_id))));
}
function filteredCustomers() {
  const q = customerSearch.toLocaleLowerCase();
  return customerTable(state.members.filter(m => `${m.email} ${m.customer_name} ${m.contact} ${m.note} ${m.family_name}`.toLocaleLowerCase().includes(q) && (!customerFilter || (customerFilter === 'unpaid' ? m.payment_status !== 'paid' : m.expiry_status === customerFilter))));
}
function modal(title, fields, handler, submit = 'Lưu') {
  $('#modal-title').textContent = title; $('#modal-fields').innerHTML = fields; $('#form-error').textContent = ''; $('#modal-form button[type=submit]').textContent = submit; submitModal = handler; $('#modal').showModal();
}
function memberFields(m = {}) {
  return input('email', 'Email khách', 'email', m.email, true, 'maxlength="254"') + input('customer_name', 'Tên khách', 'text', m.customer_name, false, 'maxlength="200"') + input('contact', 'Liên hệ (điện thoại / Zalo)', 'text', m.contact, false, 'maxlength="200"') + '<div class="form-grid">' + input('joined_at', 'Ngày vào', 'date', m.joined_at ?? state.today) + input('expires_at', 'Ngày hết hạn', 'date', m.expires_at) + '</div>' + select('payment_status', 'Thanh toán', payments, m.payment_status || 'unpaid') + input('amount', 'Số tiền đã ghi nhận (VND)', 'number', m.amount || 0, false, 'min="0" max="1000000000" step="1"') + noteField(m.note) + '<p>Gia hạn bằng cách đổi ngày hết hạn. Không tự động thu tiền, gửi lời mời hoặc kick trên Google.</p>';
}
async function recordJob(data) { const result = await post('jobs', data); await refresh(false); location.hash = 'job/' + result.id; draw(); toast('Đã ghi nhận yêu cầu. Mở trang Google để thực hiện.'); }
$('#modal-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  try { await submitModal(Object.fromEntries(new FormData(event.currentTarget))); $('#modal').close(); if (auth?.user) await refresh(); }
  catch (error) { $('#form-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
$('#close-modal').onclick = $('#cancel-modal').onclick = () => $('#modal').close();
$('#logout').onclick = async () => { try { await post('auth/logout', {}); auth = await api('auth/status'); showAuth(); } catch (error) { toast(error.message); } };
for (const [eventName, ids] of [['input', ['search', 'customer-search']], ['change', ['family-filter', 'customer-filter']]]) document.addEventListener(eventName, event => {
  const id = event.target.id; if (!ids.includes(id)) return;
  if (id === 'search') search = event.target.value; if (id === 'family-filter') familyFilter = event.target.value;
  if (id === 'customer-search') customerSearch = event.target.value; if (id === 'customer-filter') customerFilter = event.target.value;
  if (id.startsWith('customer')) $('#customer-table').innerHTML = filteredCustomers(); else $('#account-table').innerHTML = filteredAccounts();
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const { action, id, kind, email } = button.dataset;
  try {
    if (['add-account', 'edit-account'].includes(action)) {
      const a = state.accounts.find(a => a.id === Number(id));
      modal(a ? 'Sửa tài khoản' : 'Thêm tài khoản', input('email', 'Email', 'email', a?.email, true, 'maxlength="254"') + noteField(a?.note) + '<p>Chỉ lưu hồ sơ email; không đăng nhập Google.</p>', async data => { await (a ? patch('accounts/' + id, data) : post('accounts', data)); toast('Đã lưu tài khoản.'); });
    } else if (['add-family', 'edit-family'].includes(action)) {
      const f = action === 'edit-family' ? state.families.find(f => f.id === Number(id)) : null;
      const accounts = state.accounts.filter(a => !a.family_id || a.family_id === f?.id);
      if (!accounts.length) return toast('Cần thêm tài khoản chưa quản lý Family trước.');
      modal(f ? 'Sửa hồ sơ Family' : 'Thêm hồ sơ Family', input('name', 'Tên Family', 'text', f?.name, true, 'maxlength="200"') + select('manager_id', 'Tài khoản quản lý', Object.fromEntries(accounts.map(a => [a.id, a.email])), f?.manager_id || id) + select('service', 'Dịch vụ', products, f?.service || 'youtube') + noteField(f?.note) + '<p>Chỉ thay đổi hồ sơ nội bộ.</p>', async data => { await (f ? patch('families/' + id, data) : post('families', data)); toast('Đã lưu Family.'); });
    } else if (action === 'add-member') modal('Thêm khách', memberFields(), async data => { await post('members', { ...data, family_id: Number(id) }); toast('Đã thêm hồ sơ khách.'); });
    else if (action === 'edit-member') {
      const m = state.members.find(m => m.id === Number(id)); modal('Sửa khách / Gia hạn', memberFields(m), async data => { await patch('members/' + id, data); toast('Đã cập nhật khách và hạn sử dụng.'); });
    } else if (action === 'invite') modal('Yêu cầu mời khách', input('email', 'Email khách', 'email', '', true, 'maxlength="254"') + '<p>Chưa gửi lời mời. Sau khi lưu, mở trang Google để thao tác.</p>', data => recordJob({ ...data, family_id: Number(id), action: 'invite' }), 'Tạo yêu cầu');
    else if (action === 'account-job') await recordJob({ action: kind, account_id: Number(id) });
    else if (action === 'kick' || action === 'delete-google-family') modal(action === 'kick' ? 'Yêu cầu kick thành viên' : 'Yêu cầu xóa Google Family', `<p>${action === 'kick' ? 'Thành viên: ' + escape(email) + '. ' : ''}Chỉ tạo yêu cầu và hướng dẫn. Bạn cần xác nhận thao tác trực tiếp trên Google.</p>`, () => recordJob({ action: action === 'kick' ? 'remove_member' : 'delete_family', family_id: Number(id), email }), 'Tạo yêu cầu');
    else if (action === 'job-result') modal('Ghi nhận kết quả thủ công', select('status', 'Kết quả', { manual_done: 'Đã thực hiện trên Google (tôi xác nhận)', manual_failed: 'Thực hiện thất bại', cancelled: 'Hủy yêu cầu' }, 'manual_done') + '<label for="result-detail">Ghi chú kết quả</label><textarea id="result-detail" name="detail" required maxlength="1000" placeholder="Ghi kết quả thực tế, không ghi mật khẩu hoặc OTP."></textarea><p>Ứng dụng không xác minh kết quả Google và không tự thay đổi hồ sơ thành viên.</p>', async data => { await patch('jobs/' + id, data); toast('Đã lưu kết quả do bạn xác nhận.'); });
    else if (['add-user', 'edit-user'].includes(action)) {
      const u = action === 'edit-user' ? users.find(u => u.id === Number(id)) : null;
      modal(u ? `Sửa người dùng ${u.username}` : 'Thêm người dùng', (u ? '' : input('username', 'Tên đăng nhập', 'text', '', true, 'minlength="3" maxlength="50" autocomplete="off"')) + input('password', u ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu ứng dụng', 'password', '', !u, 'minlength="12" maxlength="128" autocomplete="new-password"') + select('role', 'Vai trò', roles, u?.role || 'operator') + (u ? select('disabled', 'Trạng thái', { false: 'Hoạt động', true: 'Khóa tài khoản' }, String(Boolean(u.disabled))) : '') + '<p>Không sử dụng mật khẩu Google. Cập nhật người dùng sẽ đăng xuất các phiên của người đó.</p>', async data => {
        await (u ? patch('users/' + id, { ...data, disabled: data.disabled === 'true' }) : post('users', data));
        if (u?.id === auth.user.id) { auth = await api('auth/status'); showAuth(); } else toast('Đã lưu người dùng.');
      });
    } else if (action === 'app-password') modal('Đổi mật khẩu ứng dụng', input('current_password', 'Mật khẩu hiện tại', 'password', '', true, 'autocomplete="current-password"') + input('password', 'Mật khẩu mới', 'password', '', true, 'minlength="12" maxlength="128" autocomplete="new-password"'), async data => { await post('auth/password', data); auth = await api('auth/status'); showAuth(); toast('Đã đổi mật khẩu. Hãy đăng nhập lại.'); });
    else if (action.startsWith('delete-')) {
      const table = { 'delete-account': 'accounts', 'delete-family-record': 'families', 'delete-member': 'members' }[action];
      modal('Xóa hồ sơ nội bộ?', '<p>Hồ sơ sẽ bị xóa khỏi ứng dụng. ' + (table === 'families' ? 'Danh sách khách trong hồ sơ này cũng sẽ bị xóa. ' : '') + 'Google không thay đổi.</p>', async () => { await api(table + '/' + id, { method: 'DELETE' }); toast('Đã xóa hồ sơ nội bộ.'); }, 'Xóa hồ sơ');
    }
  } catch (error) { toast(error.message); }
});
window.addEventListener('hashchange', draw);
async function sync() {
  if (!auth?.user || $('#modal').open) return;
  try { await refresh(false); if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) draw(); }
  catch (error) { if (auth?.user) toast('Không thể cập nhật: ' + error.message); }
}
try { auth = await api('auth/status'); if (auth.user) await refresh(); else showAuth(); }
catch { $('#main').innerHTML = '<div class="error-box">Không thể tải dữ liệu. Kiểm tra máy chủ rồi tải lại trang.</div>'; }
setInterval(sync, 10000);
