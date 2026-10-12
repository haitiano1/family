import { renewalDates } from './domain.js';
import { prepareSheet, suggestMapping, importFields } from './csv.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const day = value => value ? value.split('-').reverse().join('/') : 'Chưa đặt';
const names = { overview: 'Tổng quan', accounts: 'Tài khoản', families: 'Family', customers: 'Khách & Gia hạn', jobs: 'Jobs', integration: 'Google', logs: 'Nhật ký', users: 'Người dùng', profile: 'Tài khoản ứng dụng', import: 'Nhập khách CSV', archives:'Khách lưu trữ' };
const roles = { admin: 'Quản trị viên', operator: 'Nhân viên', viewer: 'Chỉ xem' };
const products = { youtube: 'YouTube Premium', google_one: 'Google One', google_ai: 'Google AI', other: 'Khác' };
const jobNames = { invite: 'Mời thành viên', remove_member: 'Kick thành viên', delete_family: 'Xóa Google Family', change_password: 'Đổi mật khẩu', setup_2fa: 'Thiết lập 2FA', check_trial: 'Kiểm tra trial', healthcheck: 'Healthcheck' };
const statuses = { blocked: 'Cần thao tác trên Google', manual_done: 'Đã làm — tự xác nhận', manual_failed: 'Thất bại — tự ghi nhận', cancelled: 'Đã hủy' };
const planOptions = (value=0, unknown=false) => Object.fromEntries([...(unknown ? [[0,'Chưa đặt']] : []), ...[...new Set([1,2,3,6,12,...(Number(value)>0 ? [Number(value)] : [])])].sort((a,b)=>a-b).map(n=>[n,n+' tháng'])]);
const renewalLabels = { not_contacted: 'Chưa nhắc gia hạn', reminded: 'Đã nhắc khách', awaiting_payment: 'Chờ thanh toán', partial: 'Đã trả một phần', paid: 'Đã thanh toán gia hạn', declined: 'Không gia hạn' };
const memberships = {unknown:'Chưa xác minh',active:'Đã vào',invited:'Đã mời, chưa vào'};
const payments = { unknown: 'Chưa ghi nhận', unpaid: 'Chưa thanh toán', partial: 'Thanh toán một phần', paid: 'Đã thanh toán' };
let state, auth, users = [], search = '', familyFilter = '', customerSearch = '', customerFilter = '', submitModal, toastTimer, sessionEpoch = 0, importData = null, importPreview = null;
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
  sessionEpoch++; importData = null; importPreview = null; state = null; users = []; if ($('#modal').open) $('#modal').close(); $('#modal-fields').innerHTML = '';
  document.body.classList.add('auth-mode'); $('#main').innerHTML = '';
  const setup = auth?.setup_required;
  $('#auth-screen').hidden = false;
  $('#auth-screen').innerHTML = `<section class="card auth-card"><div class="auth-brand">♧ Fam Manager</div><span class="eyebrow">${setup ? 'THIẾT LẬP LẦN ĐẦU' : 'CHÀO MỪNG TRỞ LẠI'}</span><h1>${setup ? 'Tạo quản trị viên' : 'Đăng nhập'}</h1><p>Tài khoản của ứng dụng, không phải tài khoản Google.</p><form id="auth-form">${input('username', 'Tên đăng nhập', 'text', '', true, 'autocomplete="username" minlength="3" maxlength="50"')}${input('password', 'Mật khẩu ứng dụng', 'password', '', true, `autocomplete="${setup ? 'new-password' : 'current-password'}" ${setup ? 'minlength="7"' : ''} maxlength="128"`)}${setup ? '<p>Tài khoản đầu tiên tự có quyền quản trị viên. Chọn mật khẩu riêng từ 7 ký tự.</p>' : ''}<p id="auth-error" role="alert"></p><button class="primary" type="submit">${setup ? 'Tạo quản trị viên' : 'Đăng nhập'}</button></form></section>`;
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
  return members.length ? `<div class="table-wrap"><table><thead><tr><th>KHÁCH HÀNG</th><th>FAMILY / GÓI</th><th>NGÀY MUA</th><th>HẾT HẠN</th><th>THANH TOÁN KỲ HIỆN TẠI</th><th>GIA HẠN TIẾP THEO</th><th>THAO TÁC</th></tr></thead><tbody>${members.map(m => `<tr><td><strong>${escape(m.customer_name || m.email)}</strong><span class="subtext">${escape(m.email)}</span><span class="subtext">${escape(m.contact)}</span><span class="subtext">${escape(m.note)}</span></td><td><a class="email-link" href="#family/${m.family_id}">${escape(m.family_name)}</a><span class="subtext">${products[m.service]}${m.plan_months ? ' · ' + m.plan_months + ' tháng' : ''}</span></td><td>${day(m.joined_at)}</td><td>${day(m.expires_at)}<span class="subtext">${expiryBadge(m)}</span></td><td><span class="badge ${m.payment_status === 'paid' ? 'green' : 'amber'}">${payments[m.payment_status]}</span><span class="subtext">${Number(m.amount).toLocaleString('vi-VN')} ₫</span></td><td><span class="badge ${m.renewal_status === 'paid' ? 'green' : 'amber'}">${renewalLabels[m.renewal_status] || renewalLabels.not_contacted}</span>${m.renewal_amount ? `<span class="subtext">${Number(m.renewal_amount).toLocaleString('vi-VN')} ₫ · ${day(m.renewal_paid_at)}</span>` : ''}</td><td><div class="row-actions">${m.expires_at ? btn('remind-message', 'Nhắc hạn', 'secondary tiny', `data-id="${m.id}"`) : ''}${btn('renewal-status', 'Gia hạn', 'secondary tiny', `data-id="${m.id}"`)}${m.renewal_status === 'paid' ? btn('renewal-apply', 'Xác nhận hạn mới', 'primary tiny', `data-id="${m.id}"`) : ''}${btn('renewal-history', 'Lịch sử', 'secondary tiny', `data-id="${m.id}"`, 'all')}${btn('edit-member', 'Sửa / Gia hạn', 'secondary tiny', `data-id="${m.id}"`)}${btn('kick', 'Yêu cầu kick', 'secondary tiny', `data-id="${m.family_id}" data-email="${escape(m.email)}"`)}${btn('delete-member', 'Xóa hồ sơ', 'danger tiny', `data-id="${m.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có khách phù hợp', 'Thêm khách từ trang Family hoặc điều chỉnh bộ lọc.');
}
function jobsTable(jobs) {
  return jobs.length ? `<div class="table-wrap"><table><thead><tr><th>ID / TÁC VỤ</th><th>ĐỐI TƯỢNG</th><th>TRẠNG THÁI</th><th>THỜI GIAN</th><th></th></tr></thead><tbody>${jobs.map(j => `<tr><td><a class="email-link" href="#job/${j.id}">#${j.id} · ${jobNames[j.action]}</a></td><td>${escape(j.target)}</td><td><span class="badge ${j.status === 'blocked' ? 'amber' : j.status === 'manual_done' ? 'green' : ''}">${statuses[j.status] || escape(j.status)}</span></td><td>${date(j.created_at)}</td><td><a class="secondary link-button tiny" href="#job/${j.id}">Xem hướng dẫn</a></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có tác vụ', 'Yêu cầu thao tác với Google sẽ xuất hiện tại đây.');
}
function draw() {
  if (!state || !auth?.user) return;
  document.body.classList.remove('auth-mode'); $('#auth-screen').hidden = true; $('#auth-screen').innerHTML = '';
  const [page, id] = route();
  const parent = { import: 'customers', account: 'accounts', family: 'families', job: 'jobs' }[page] || page;
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.page === parent));
  $('#users-nav').hidden = !admin();
  $('#breadcrumb').textContent = `Fam Manager › ${names[parent] || 'Tài khoản'} ${id ? '› #' + id : ''}`;
  $('#session-user').textContent = `${auth.user.username} · ${roles[auth.user.role]}`;
  let content = '';
  if (page === 'overview') {
    content = hero('KHÔNG GIAN LÀM VIỆC', 'Tổng quan', 'Quản lý khách hàng, hạn sử dụng và hồ sơ Family.', btn('add-account', '+ Thêm tài khoản', 'primary')) + stats([['Tài khoản', state.accounts.length], ['Hồ sơ Family', state.families.length], ['Sắp hết hạn (2 ngày)', state.reminders.due_soon], ['Khách đã quá hạn', state.reminders.expired]]) + `<section class="card"><div class="section-heading"><div><h2>Nhắc gia hạn</h2><p>Tính theo ngày Việt Nam. Hạn có hiệu lực hết ngày ghi nhận; không tự động kick khách.</p></div><a class="email-link" href="#customers">Xem tất cả khách →</a></div>${customerTable(state.members.filter(m => ['expired', 'due_soon'].includes(m.expiry_status)))}</section><div class="split"><section class="card"><h2>Thanh toán</h2><p>${state.reminders.unpaid} khách chưa thanh toán đủ kỳ hiện tại.</p><p>Gia hạn: ${state.reminders.renewal_waiting} khách chờ tiền/trả một phần; ${state.reminders.renewal_paid_pending} khách đã trả tiền nhưng chưa cập nhật hạn.</p><a class="email-link" href="#customers">Quản lý khách và thanh toán →</a></section><section class="card"><h2>Hoạt động gần đây</h2>${state.logs.slice(0, 5).map(l => `<div class="list-item">${escape(l.message)}<span class="subtext">${date(l.created_at)}</span></div>`).join('') || '<p>Chưa có hoạt động.</p>'}</section></div>`;
  } else if (page === 'customers') {
    content = hero('KHÁCH HÀNG', 'Khách & Gia hạn', 'Theo dõi thông tin liên hệ, ngày vào, hạn sử dụng và thanh toán.', canWrite() ? '<a class="primary link-button" href="#import">↑ Nhập khách từ CSV</a>' : '') + stats([['Khách đang ghi nhận', state.members.length], ['Sắp hết hạn', state.reminders.due_soon], ['Quá hạn', state.reminders.expired], ['Chưa thanh toán đủ', state.reminders.unpaid]]) + `<section class="card"><h2>Danh sách khách</h2><div class="toolbar"><input id="customer-search" aria-label="Tìm khách" placeholder="Tìm email, tên, liên hệ hoặc Family…" value="${escape(customerSearch)}"><select id="customer-filter" aria-label="Lọc khách">${Object.entries({ '': 'Tất cả khách', due_soon: 'Sắp hết hạn (2 ngày)', expired: 'Đã quá hạn', unpaid: 'Chưa thanh toán kỳ hiện tại', renewal_waiting: 'Chờ tiền gia hạn / trả một phần', renewal_paid: 'Đã nhận tiền — chưa cập nhật hạn', renewal_declined: 'Không gia hạn', unknown: 'Chưa đặt hạn' }).map(([key, name]) => `<option value="${key}" ${customerFilter === key ? 'selected' : ''}>${name}</option>`).join('')}</select></div><div id="customer-table">${filteredCustomers()}</div></section>`;
  } else if (page === 'archives') {
    content = hero('LƯU TRỮ', 'Khách không gia hạn', 'Khách đã chuyển khỏi danh sách hoạt động; thông tin và lịch sử vẫn được giữ.') + `<section class="card"><p>Chuyển tự động sau 7 ngày ${state.archive_mode === 'declined' ? 'kể từ khi chọn Không gia hạn' : 'sau ngày hết hạn'}, khi ứng dụng đang chạy. Không tự kick trên Google.</p>${state.archives.length ? `<div class="table-wrap"><table><thead><tr><th>KHÁCH</th><th>FAMILY</th><th>NGÀY MUA / HẠN</th><th>LƯU TRỮ</th><th></th></tr></thead><tbody>${state.archives.map(a => `<tr><td><strong>${escape(a.customer_name || a.email)}</strong><span class="subtext">${escape(a.email)}</span><span class="subtext">${escape(a.member.contact)}</span></td><td>${escape(a.family_name)}<span class="subtext">${escape(a.manager_email)}</span></td><td>${day(a.member.joined_at)} → ${day(a.member.expires_at)}</td><td>${date(a.archived_at)}<span class="subtext">${escape(a.reason)}</span></td><td><div class="row-actions">${btn('archive-details','Xem dữ liệu','secondary tiny',`data-id="${a.id}"`,'all')}${btn('archive-restore','Khôi phục','secondary tiny',`data-id="${a.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có khách lưu trữ','Chỉ khách chọn Không gia hạn và đủ thời gian mới được chuyển vào đây.')}</section>`;
  } else if (page === 'accounts') {
    content = hero('TÀI KHOẢN', 'Managed accounts', 'Quản lý email, ghi chú và hồ sơ Family.', btn('add-account', '+ Thêm tài khoản', 'primary')) + `<section class="card"><h2>Danh sách tài khoản</h2><p>Dữ liệu được cập nhật mỗi 10 giây.</p><div class="toolbar"><input id="search" aria-label="Tìm tài khoản" placeholder="Tìm email, Family hoặc ghi chú…" value="${escape(search)}"><select id="family-filter" aria-label="Lọc Family"><option value="">Tất cả tài khoản</option><option value="with" ${familyFilter === 'with' ? 'selected' : ''}>Có hồ sơ Family</option><option value="without" ${familyFilter === 'without' ? 'selected' : ''}>Chưa gắn Family</option></select><small>${state.accounts.length} tài khoản</small></div><div id="account-table">${filteredAccounts()}</div></section>`;
  } else if (page === 'account') {
    const a = state.accounts.find(a => a.id === Number(id));
    if (!a) content = empty('Không tìm thấy tài khoản', 'Hồ sơ này có thể đã bị xóa.');
    else content = `<a class="back" href="#accounts">← Danh sách tài khoản</a>` + hero('TÀI KHOẢN', a.email, 'Thông tin ghi nhận nội bộ.', btn('edit-account', 'Sửa thông tin', 'secondary', `data-id="${a.id}"`)) + notice + `<section class="card"><h2>Thông tin tài khoản</h2><p>Ghi chú: ${escape(a.note || 'Chưa có ghi chú')}</p><p>Family: ${a.family_id ? `<a class="email-link" href="#family/${a.family_id}">${escape(a.family_name)}</a>` : 'Chưa có hồ sơ'}</p></section><section class="card"><h2>Tác vụ Google</h2><p>Ghi nhận yêu cầu, mở trang Google rồi tự xác nhận kết quả.</p><div class="actions">${['healthcheck', 'change_password', 'setup_2fa', 'check_trial'].map(action => btn('account-job', jobNames[action], 'secondary', `data-kind="${action}" data-id="${a.id}"`)).join('')}${!a.family_id ? btn('add-family', 'Tạo hồ sơ Family', 'secondary', `data-id="${a.id}"`) : ''}</div></section><section class="card"><h2>Jobs của tài khoản</h2>${jobsTable(state.jobs.filter(j => j.account_id === a.id || j.target === a.email))}</section>`;
  } else if (page === 'families') {
    content = hero('FAMILY', 'Quản lý Family', 'Hồ sơ nhóm và danh sách khách hàng.', btn('add-family', '+ Thêm hồ sơ Family', 'primary')) + notice + `<section class="card"><h2>Danh sách Family</h2>${state.families.length ? `<div class="table-wrap"><table><thead><tr><th>FAMILY / GÓI</th><th>TÀI KHOẢN QUẢN LÝ</th><th>THÀNH VIÊN</th><th>THAO TÁC</th></tr></thead><tbody>${state.families.map(f => `<tr><td><a class="email-link" href="#family/${f.id}">${escape(f.name)}</a><span class="subtext">${products[f.service]}</span></td><td>${escape(f.manager_email)}</td><td>${state.members.filter(m => m.family_id === f.id && m.membership_status !== 'invited').length + 1}/6</td><td><div class="row-actions">${btn('edit-family', 'Sửa', 'secondary tiny', `data-id="${f.id}"`)}${btn('delete-family-record', 'Xóa hồ sơ', 'danger tiny', `data-id="${f.id}"`, 'admin')}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có hồ sơ Family', 'Thêm tài khoản quản lý, sau đó tạo hồ sơ Family.', btn('add-family', '+ Thêm hồ sơ Family', 'primary'))}</section>`;
  } else if (page === 'family') {
    const f = state.families.find(f => f.id === Number(id));
    if (!f) content = empty('Không tìm thấy Family', 'Hồ sơ này có thể đã bị xóa.');
    else content = `<a class="back" href="#families">← Danh sách Family</a>` + hero('FAMILY', f.name, `${products[f.service]} · Quản lý: ${escape(f.manager_email)}`, btn('add-member', '+ Thêm khách', 'primary', `data-id="${f.id}"`)) + notice + `<section class="card"><div class="section-heading"><div><h2>Thông tin Family</h2><p>${escape(f.note || 'Chưa có ghi chú')}</p></div>${btn('edit-family', 'Sửa hồ sơ', 'secondary', `data-id="${f.id}"`)}</div><p>Manager: ${escape(f.manager_email)} · ${state.members.filter(m => m.family_id === f.id && m.membership_status !== 'invited').length + 1}/6 người đang ghi nhận.</p></section><section class="card"><h2>Khách hàng trong nhóm</h2>${customerTable(state.members.filter(m => m.family_id === f.id))}</section><section class="card"><h2>Tác vụ Google Family</h2><div class="actions">${btn('invite', 'Mời khách vào Family', 'secondary', `data-id="${f.id}"`)}${btn('delete-google-family', 'Yêu cầu xóa Google Family', 'danger', `data-id="${f.id}"`, 'admin')}</div></section>`;
  } else if (page === 'import') content = canWrite() ? importPage() : empty('Không có quyền', 'Chỉ quản trị viên hoặc nhân viên được nhập khách.');
  else if (page === 'jobs') content = hero('VẬN HÀNH', 'Tác vụ & Jobs', 'Theo dõi yêu cầu và kết quả tự ghi nhận.') + notice + `<section class="card"><h2>100 tác vụ gần đây</h2>${jobsTable(state.jobs)}</section>`;
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
  return customerTable(state.members.filter(m => `${m.email} ${m.customer_name} ${m.contact} ${m.note} ${m.family_name}`.toLocaleLowerCase().includes(q) && (!customerFilter || (customerFilter === 'unpaid' ? ['unpaid','partial'].includes(m.payment_status) : customerFilter === 'renewal_waiting' ? ['awaiting_payment','partial'].includes(m.renewal_status) : customerFilter === 'renewal_paid' ? m.renewal_status === 'paid' : customerFilter === 'renewal_declined' ? m.renewal_status === 'declined' : m.expiry_status === customerFilter))));
}
function modal(title, fields, handler, submit = 'Lưu') {
  $('#modal-title').textContent = title; $('#modal-fields').innerHTML = fields; $('#form-error').textContent = ''; $('#modal-form button[type=submit]').hidden = false; $('#modal-form button[type=submit]').textContent = submit; submitModal = handler; $('#modal').showModal();
}
function memberFields(m = {}) {
  return input('email', 'Email khách', 'email', m.email, true, 'maxlength="254"') + input('customer_name', 'Tên khách', 'text', m.customer_name, false, 'maxlength="200"') + input('contact', 'Liên hệ (điện thoại / Zalo)', 'text', m.contact, false, 'maxlength="1000"') + select('plan_months', 'Gói mua', planOptions(m.plan_months,true), m.plan_months || 0) + '<div class="form-grid">' + input('joined_at', 'Ngày mua', 'date', m.joined_at ?? state.today) + input('expires_at', 'Ngày hết hạn', 'date', m.expires_at) + '</div>' + select('payment_status', 'Thanh toán', payments, m.payment_status || 'unpaid') + input('amount', 'Số tiền đã ghi nhận (VND)', 'number', m.amount || 0, false, 'min="0" max="1000000000" step="1"') + noteField(m.note) + select('membership_status','Trạng thái thành viên',memberships,m.membership_status || 'unknown') + '<p>Để lưu tiền và lịch sử gia hạn, dùng nút Gia hạn rồi Xác nhận hạn mới. Sửa hồ sơ không tự thu tiền hoặc thao tác Google.</p>';
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
    if (action === 'remind-message') {
      const m = state.members.find(m => m.id === Number(id));
      const text = `Chào ${m.customer_name || 'bạn'}, gói ${products[m.service]} của tài khoản ${m.email} sẽ hết hạn vào ${day(m.expires_at)}${m.days_left < 0 ? ' (đã quá hạn)' : m.days_left === 0 ? ' (hôm nay)' : ` (còn ${m.days_left} ngày)`}. Bạn có muốn gia hạn tiếp không? Nếu có, nhắn mình để xác nhận gói và thanh toán nhé. Cảm ơn bạn!`;
      modal('Mẫu tin nhắc hạn', '<label for="reminder-text">Nội dung gửi khách</label><textarea id="reminder-text" rows="7">'+escape(text)+'</textarea><p>Liên hệ: '+escape(m.contact || 'Chưa có thông tin liên hệ')+'</p><p>Chọn Sao chép rồi tự gửi qua Zalo/Facebook. Ứng dụng không gửi tin thay bạn.</p>', async () => { const message = $('#reminder-text').value; try { await navigator.clipboard.writeText(message); toast('Đã sao chép mẫu tin. Bạn có thể dán để gửi khách.'); } catch { $('#reminder-text').select(); throw new Error('Không sao chép tự động được. Nhấn Ctrl+C để sao chép nội dung đã chọn.'); } }, 'Sao chép');
    } else if (action === 'archive-details') {
      const a=state.archives.find(a=>a.id===Number(id)),m=a.member; const history=(await api('archives/'+id+'/history')).history;
      modal('Dữ liệu khách lưu trữ', `<p>${escape(m.customer_name || m.email)} · ${escape(m.email)}</p><p>Liên hệ: ${escape(m.contact)}</p><p>Gói: ${m.plan_months || 'chưa đặt'} tháng · Ngày mua ${day(m.joined_at)} · Hạn ${day(m.expires_at)}</p><p>Thanh toán: ${payments[m.payment_status]} · ${Number(m.amount).toLocaleString('vi-VN')} ₫</p><p>Ghi chú: ${escape(m.note)}</p><p>Gia hạn: ${renewalLabels[m.renewal_status]} · ${escape(m.renewal_note)}</p><h2>Lịch sử gia hạn</h2>` + (history.map(h=>`<div class="list-item">${day(h.old_expires_at)} → ${day(h.new_expires_at)}<p>${Number(h.amount).toLocaleString('vi-VN')} ₫ · ${escape(h.created_by)} · ${date(h.created_at)}</p></div>`).join('') || '<p>Chưa có lần đã xác nhận.</p>'), async()=>{}, 'Đóng');
    } else if (action === 'archive-restore') {
      const a=state.archives.find(a=>a.id===Number(id)); if (!state.families.length) return toast('Tạo hồ sơ Family trước khi khôi phục khách.');
      modal('Khôi phục khách', `<p>${escape(a.email)} sẽ trở lại danh sách hoạt động. Gia hạn tiếp theo về Chưa nhắc; hạn cũ và lịch sử được giữ.</p>` + select('family_id','Family nhận khách',Object.fromEntries(state.families.map(f=>[f.id,f.name+' · '+f.manager_email])),a.member.family_id), async data=>{ await post('archives/'+id+'/restore',data); toast('Đã khôi phục khách và lịch sử.'); }, 'Khôi phục');
    } else if (['add-account', 'edit-account'].includes(action)) {
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
    } else if (action === 'renewal-status') {
      const m = state.members.find(m => m.id === Number(id));
      modal('Gia hạn · ' + (m.customer_name || m.email), `<div id="renewal-form" data-expiry="${escape(m.expires_at)}">` + select('status', 'Trạng thái gia hạn', renewalLabels, m.renewal_status === 'not_contacted' ? 'paid' : m.renewal_status) + input('amount', 'Số tiền đã nhận cho lần gia hạn (VND)', 'number', m.renewal_amount, false, 'min="0" max="1000000000" step="1"') + input('paid_at', 'Ngày nhận tiền gia hạn', 'date', m.renewal_paid_at || state.today, false, `max="${state.today}"`) + select('plan_months', 'Gói gia hạn', planOptions(m.plan_months), m.plan_months || 1) + '<label class="check-label"><input type="checkbox" name="apply_now" id="renewal-auto" checked> Tự cập nhật ngày mua và hạn khi đã thanh toán đủ</label><p id="renewal-date-preview"></p><label for="renewal-note">Ghi chú gia hạn</label><textarea id="renewal-note" name="note" maxlength="1000">' + escape(m.renewal_note) + '</textarea><p>Chờ tiền hoặc trả một phần chưa đổi ngày. Kỳ mới luôn nối từ ngày hết hạn cũ, kể cả trả muộn. Ngày nhận tiền được lưu riêng. Không tự gửi tin hoặc đổi gói Google.</p></div>', async data => { const result = await patch('members/' + id + '/renewal', { ...data, revision:m.renewal_revision, apply_now:data.apply_now === 'on' && data.status === 'paid' }); toast(result.applied ? 'Đã gia hạn: ngày mua và ngày hết hạn đã cập nhật.' : 'Đã lưu trạng thái gia hạn; ngày chưa thay đổi.'); }, 'Lưu gia hạn');
      updateRenewalPreview();
    } else if (action === 'renewal-apply') {
      const m = state.members.find(m => m.id === Number(id));
      modal('Xác nhận gia hạn', `<div id="renewal-form" data-expiry="${escape(m.expires_at)}" data-paid="${escape(m.renewal_paid_at)}"><p>Khách: ${escape(m.customer_name || m.email)}<br>Hạn hiện tại: ${day(m.expires_at)}<br>Ngày nhận tiền: ${day(m.renewal_paid_at)}<br>Tiền gia hạn đã ghi nhận: ${Number(m.renewal_amount).toLocaleString('vi-VN')} ₫.</p>` + select('plan_months', 'Gói gia hạn', planOptions(m.plan_months), m.plan_months || 1) + '<p id="renewal-date-preview"></p><p>Hạn mới được tự tính theo gói. Xác nhận cập nhật ngày mua, hạn và lưu lịch sử; không thao tác trên Google.</p></div>', async data => { await post('members/' + id + '/renewal/apply', { ...data,revision:m.renewal_revision }); toast('Đã cập nhật ngày mua, hạn mới và lưu lịch sử.'); }, 'Xác nhận gia hạn');
      updateRenewalPreview();
    } else if (action === 'renewal-history') {
      const history = (await api('members/' + id + '/renewal-history')).history;
      modal('Lịch sử gia hạn', history.length ? history.map(h => `<div class="list-item"><strong>${day(h.old_expires_at)} → ${day(h.new_expires_at)}</strong><p>Ngày mua: ${day(h.old_purchase_at)} → ${day(h.new_purchase_at)}</p><p>${h.plan_months} tháng · ${Number(h.amount).toLocaleString('vi-VN')} ₫ · Nhận tiền ${day(h.paid_at)}</p><p>${escape(h.note)}</p><span class="subtext">${escape(h.created_by)} · ${date(h.created_at)}</span></div>`).join('') : '<p>Chưa có lần gia hạn đã xác nhận.</p>', async () => {}, 'Đóng');
    } else if (action === 'invite') modal('Yêu cầu mời khách', input('email', 'Email khách', 'email', '', true, 'maxlength="254"') + '<p>Chưa gửi lời mời. Sau khi lưu, mở trang Google để thao tác.</p>', data => recordJob({ ...data, family_id: Number(id), action: 'invite' }), 'Tạo yêu cầu');
    else if (action === 'account-job') await recordJob({ action: kind, account_id: Number(id) });
    else if (action === 'kick' || action === 'delete-google-family') modal(action === 'kick' ? 'Yêu cầu kick thành viên' : 'Yêu cầu xóa Google Family', `<p>${action === 'kick' ? 'Thành viên: ' + escape(email) + '. ' : ''}Chỉ tạo yêu cầu và hướng dẫn. Bạn cần xác nhận thao tác trực tiếp trên Google.</p>`, () => recordJob({ action: action === 'kick' ? 'remove_member' : 'delete_family', family_id: Number(id), email }), 'Tạo yêu cầu');
    else if (action === 'job-result') modal('Ghi nhận kết quả thủ công', select('status', 'Kết quả', { manual_done: 'Đã thực hiện trên Google (tôi xác nhận)', manual_failed: 'Thực hiện thất bại', cancelled: 'Hủy yêu cầu' }, 'manual_done') + '<label for="result-detail">Ghi chú kết quả</label><textarea id="result-detail" name="detail" required maxlength="1000" placeholder="Ghi kết quả thực tế, không ghi mật khẩu hoặc OTP."></textarea><p>Ứng dụng không xác minh kết quả Google và không tự thay đổi hồ sơ thành viên.</p>', async data => { await patch('jobs/' + id, data); toast('Đã lưu kết quả do bạn xác nhận.'); });
    else if (['add-user', 'edit-user'].includes(action)) {
      const u = action === 'edit-user' ? users.find(u => u.id === Number(id)) : null;
      modal(u ? `Sửa người dùng ${u.username}` : 'Thêm người dùng', (u ? '' : input('username', 'Tên đăng nhập', 'text', '', true, 'minlength="3" maxlength="50" autocomplete="off"')) + input('password', u ? 'Mật khẩu mới (để trống nếu giữ nguyên)' : 'Mật khẩu ứng dụng', 'password', '', !u, 'minlength="7" maxlength="128" autocomplete="new-password"') + select('role', 'Vai trò', roles, u?.role || 'operator') + (u ? select('disabled', 'Trạng thái', { false: 'Hoạt động', true: 'Khóa tài khoản' }, String(Boolean(u.disabled))) : '') + '<p>Không sử dụng mật khẩu Google. Cập nhật người dùng sẽ đăng xuất các phiên của người đó.</p>', async data => {
        await (u ? patch('users/' + id, { ...data, disabled: data.disabled === 'true' }) : post('users', data));
        if (u?.id === auth.user.id) { auth = await api('auth/status'); showAuth(); } else toast('Đã lưu người dùng.');
      });
    } else if (action === 'app-password') modal('Đổi mật khẩu ứng dụng', input('current_password', 'Mật khẩu hiện tại', 'password', '', true, 'autocomplete="current-password"') + input('password', 'Mật khẩu mới', 'password', '', true, 'minlength="7" maxlength="128" autocomplete="new-password"'), async data => { await post('auth/password', data); auth = await api('auth/status'); showAuth(); toast('Đã đổi mật khẩu. Hãy đăng nhập lại.'); });
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
function importPage() {
  const guide = '<section class="card"><h2>Từ Google Sheets sang ứng dụng</h2><p>Trong Google Sheets: Tệp → Tải xuống → Giá trị được phân tách bằng dấu phẩy (.csv). Mỗi lần tải chỉ gồm tab đang mở. Giữ bản sheet gốc để đối chiếu.</p><p>Hỗ trợ nhiều Family xếp nối tiếp nhau và cả bảng có dòng đầu chứa email quản lý, ô mật khẩu rồi Gói mua / Ngày mua / Ngày đến hạn. Ô mật khẩu đầu bảng được loại bỏ. Cột đếm ngược Ngày pay không nhập; số ngày còn lại được tính lại theo hạn.</p></section>';
  if (!importData) return hero('NHẬP DỮ LIỆU', 'Nhập khách từ Google Sheets', 'Chọn CSV, ghép cột, xem trước rồi xác nhận.') + guide + '<section class="card"><h2>Chọn tệp CSV</h2><label for="csv-file">Tệp CSV từ Google Sheets (tối đa 1 MB, 10.000 dòng)</label><input id="csv-file" type="file" accept=".csv,text/csv"><p>Không cần chia sẻ Google Sheet hoặc cấp quyền Google. Tệp được đọc trên máy bạn; chỉ các cột đã chọn được gửi tới ứng dụng cục bộ.</p></section>';
  const d = importData;
  const confidential = value => ['pass','password','matkhau','otp','recoverycode'].includes(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,''));
  const options = field => '<option value="-1">Không nhập cột này</option>' + d.headers.map((h,i) => confidential(h) ? '' : `<option value="${i}" ${d.mapping[field] === i ? 'selected' : ''}>${escape(h)} (cột ${i+1})</option>`).join('');
  return hero('NHẬP DỮ LIỆU', d.filename, `${d.records.length} dòng khách · Chưa lưu vào hệ thống.`, '<button class="secondary" id="import-reset">Chọn tệp khác</button>') + (d.legacy ? `<div class="notice">Đã nhận dạng ${d.family_count || 1} Family trong sheet. Các dòng email quản lý được tách riêng, toàn bộ ô mật khẩu/ghi chú xác minh ở dòng đó đã bỏ. Không nhập cột Ngày pay đếm ngược.</div>` : '') + `<section class="card"><h2>1. Chọn cột dữ liệu</h2><div class="mapping-grid">${Object.entries(importFields).map(([field,label]) => `<div><label for="map-${field}">${label}</label><select id="map-${field}" data-import-map="${field}">${options(field)}</select></div>`).join('')}</div><p>Ngày nhận dd/mm/yyyy hoặc yyyy-mm-dd. Gói nhận 1, 2, 3, 6, 12 tháng. Contact giữ nguyên liên kết/ghi chú. Nếu sheet không có thanh toán, giữ “Không nhập cột này”; không suy ra từ cột Ngày pay.</p></section><section class="card"><h2>2. Chọn Family và khách trùng</h2><label for="import-family">Family nhận khách (khi CSV không có cột Family)</label><select id="import-family"><option value="">Dùng cột Family/email quản lý hoặc tạo Family mới bên dưới</option>${state.families.map(f => `<option value="${f.id}" ${String(d.family_id) === String(f.id) ? 'selected' : ''}>${escape(f.name)} · ${escape(f.manager_email)}</option>`).join('')}</select>${admin() ? `<label class="check-label"><input id="import-create" type="checkbox" ${d.create_groups ? 'checked' : ''}> Cho phép tạo hồ sơ Family/tài khoản quản lý còn thiếu</label><div class="form-grid"><div><label for="import-manager">Email quản lý mặc định (khi chưa chọn Family)</label><input id="import-manager" type="email" value="${escape(d.default_manager)}" placeholder="manager@example.com"></div><div><label for="import-group-name">Tên Family mới (không bắt buộc)</label><input id="import-group-name" value="${escape(d.default_family)}" maxlength="200" placeholder="Family 01"></div></div>` : ''}<label for="import-duplicates">Khách đã có cùng email trong cùng Family</label><select id="import-duplicates"><option value="skip" ${d.duplicates === 'skip' ? 'selected' : ''}>Bỏ qua — giữ nguyên dữ liệu cũ</option><option value="update" ${d.duplicates === 'update' ? 'selected' : ''}>Cập nhật cột đã chọn — ô trống giữ dữ liệu cũ</option></select><p>Các dòng trùng trong CSV giữ dòng đầu. Family có tối đa 5 thành viên đang ghi nhận; hồ sơ Đã mời, chưa vào được giữ riêng và chưa tính chỗ. Khi có dòng lỗi, không nhập dòng nào; bạn sửa CSV rồi xem trước lại.</p><button id="import-preview" class="primary">Xem trước dữ liệu</button><p id="import-error" role="alert"></p></section><div id="import-results">${importPreview ? previewHTML(importPreview) : ''}</div>`;
}
function previewHTML(p) {
  const s = p.summary, labels = { create: 'Thêm mới', update: 'Cập nhật', skip: 'Bỏ qua', error: 'Lỗi' };
  return stats([['Thêm mới',s.create],['Cập nhật',s.update],['Bỏ qua',s.skip],['Dòng lỗi',s.errors]]) + `<section class="card"><h2>3. Xác nhận nhập</h2><p>${s.new_accounts} tài khoản quản lý mới, ${s.new_families} hồ sơ Family mới sẽ được tạo. Đây là hồ sơ nội bộ, không tạo nhóm hoặc mời khách trên Google.</p>${p.groups.length ? '<p>Family mới: '+p.groups.map(g => escape(g.name)+' · '+escape(g.manager_email)).join('; ')+'</p>' : ''}<div class="table-wrap"><table><thead><tr><th>DÒNG</th><th>EMAIL</th><th>FAMILY</th><th>XỬ LÝ</th><th>CHI TIẾT</th></tr></thead><tbody>${p.rows.map(r => `<tr><td>${r.line}</td><td>${escape(r.email)}<span class="subtext">${escape(r.customer_name)}</span></td><td>${escape(r.family_name)}${r.status === 'create' || r.status === 'update' ? `<span class="subtext">Gói ${r.plan_months || 'chưa đặt'} tháng · Mua ${day(r.joined_at)} · Hạn ${day(r.expires_at)}</span>` : ''}</td><td><span class="badge ${r.status === 'error' ? 'red' : 'blue'}">${labels[r.status]}</span></td><td>${escape(r.message)}</td></tr>`).join('')}</tbody></table></div>${s.total > p.rows.length ? `<p>Hiển thị ${p.rows.length}/${s.total} dòng đầu.</p>` : ''}${p.errors.length ? '<div class="error-box">'+p.errors.map(e => `Dòng ${e.line}: ${escape(e.message)}`).join('<br>')+'</div>' : ''}<p>Tệp gốc không được lưu. Kiểm tra thông tin và sao lưu thư mục data trước khi nhập lượng khách lớn.</p><button id="import-confirm" class="primary" ${s.errors || !(s.create+s.update) ? 'disabled' : ''}>Xác nhận nhập ${s.create+s.update} khách</button></section>`;
}
function importPayload() {
  if (importData.mapping.email < 0) throw new Error('Hãy chọn cột Email khách trước.');
  const d = importData, chosen = [...new Set(Object.values(d.mapping).filter(n => n >= 0))].sort((a,b) => a-b);
  const encode = value => '"'+value.replaceAll('"','""')+'"';
  const csv = [chosen.map(i => d.headers[i]), ...d.records.map(r => chosen.map(i => r.cells[i] || ''))].map(row => row.map(encode).join(',')).join('\n');
  return { csv, delimiter: ',', mapping: Object.fromEntries(Object.entries(d.mapping).map(([k,v]) => [k, chosen.indexOf(v)])), family_id: d.family_id, default_manager: d.default_manager, default_family: d.default_family, create_groups: d.create_groups, duplicates: d.duplicates, allow_overflow:d.allow_overflow,match_by_manager:d.match_by_manager };
}
function invalidateImport() { importPreview = null; const results = $('#import-results'); if (results) results.innerHTML = ''; }
document.addEventListener('change', async event => {
  if (event.target.id === 'csv-file') {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('CSV tối đa 1 MB. Chia thành nhiều tệp nếu quá lớn.');
      const parsed = prepareSheet(await file.text());
      const matching = state.families.find(f => f.manager_email === parsed.manager_email);
      importData = { ...parsed, filename: file.name, mapping: suggestMapping(parsed.headers), family_id: matching?.id || '', default_manager: parsed.manager_email, default_family: '', create_groups: false, duplicates: 'skip', allow_overflow:false,match_by_manager:Boolean(parsed.multi_family) }; importPreview = null; draw();
    } catch (error) { toast(error.message); }
    return;
  }
  if (!importData) return;
  if (event.target.dataset.importMap) importData.mapping[event.target.dataset.importMap] = Number(event.target.value);
  const keys = { 'import-family':'family_id', 'import-create':'create_groups','import-overflow':'allow_overflow', 'import-duplicates':'duplicates' };
  if (keys[event.target.id]) importData[keys[event.target.id]] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
  if (event.target.dataset.importMap || keys[event.target.id]) invalidateImport();
});
document.addEventListener('input', event => {
  if (!importData) return;
  const field = { 'import-manager':'default_manager', 'import-group-name':'default_family' }[event.target.id];
  if (field) { importData[field] = event.target.value.trim(); invalidateImport(); }
});
document.addEventListener('click', async event => {
  const id = event.target.closest('button')?.id;
  if (id === 'import-reset') { importData = null; importPreview = null; draw(); }
  if (!['import-preview','import-confirm'].includes(id)) return;
  const button = event.target.closest('button'); button.disabled = true; $('#import-error').textContent = '';
  try {
    if (id === 'import-preview') { importPreview = await post('import/preview', importPayload()); $('#import-results').innerHTML = previewHTML(importPreview); }
    else {
      if (!importPreview || importPreview.summary.errors) throw new Error('Cần xem trước và sửa dòng lỗi trước khi nhập.');
      const result = await post('import/commit', { ...importPayload(), preview_token: importPreview.preview_token });
      importData = null; importPreview = null; await refresh(false); customerSearch = ''; customerFilter = ''; location.hash = 'customers'; draw();
      toast(`Đã nhập ${result.summary.create} khách mới, cập nhật ${result.summary.update}, bỏ qua ${result.summary.skip}.`);
    }
  } catch (error) { invalidateImport(); const errorBox = $('#import-error'); if (errorBox) errorBox.textContent = error.message; else toast(error.message); }
  finally { button.disabled = false; }
});

function updateRenewalPreview() {
  const form = $('#renewal-form'); if (!form) return;
  const purchased = form.dataset.paid || form.querySelector('[name=paid_at]')?.value;
  const plan = form.querySelector('[name=plan_months]')?.value;
  const status = form.querySelector('[name=status]')?.value;
  const applying = !status || (status === 'paid' && $('#renewal-auto')?.checked);
  try {
    const dates = renewalDates(form.dataset.expiry,purchased,Number(plan));
    $('#renewal-date-preview').textContent = applying ? `Ngày mua mới: ${day(dates.purchase_date)} · Hạn mới tự tính: ${day(dates.expires_at)} (nối kỳ từ ${day(dates.base_date)}).` : 'Chỉ ghi nhận trạng thái; chưa cập nhật ngày mua hoặc hạn.';
  } catch (error) { $('#renewal-date-preview').textContent = applying ? error.message : 'Chỉ ghi nhận trạng thái; chưa cập nhật ngày.'; }
}
document.addEventListener('input', event => { if (event.target.closest('#renewal-form')) updateRenewalPreview(); });
document.addEventListener('change', event => { if (event.target.closest('#renewal-form')) updateRenewalPreview(); });
