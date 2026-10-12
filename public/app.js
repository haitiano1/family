const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const names = { overview: 'Tổng quan', accounts: 'Tài khoản', families: 'Family', jobs: 'Jobs', integration: 'Tích hợp', logs: 'Nhật ký' };
const jobNames = { invite: 'Mời thành viên', remove_member: 'Kick thành viên', delete_family: 'Xóa Google Family', change_password: 'Đổi mật khẩu', setup_2fa: 'Thiết lập 2FA', check_trial: 'Kiểm tra trial', healthcheck: 'Healthcheck' };
let state, search = '', familyFilter = '', submitModal, toastTimer;
const route = () => (location.hash.slice(1) || 'overview').split('/');
const notice = '<div class="notice">Chế độ quản lý nội bộ · Chưa kết nối Google. Dữ liệu Family và thành viên được ghi nhận thủ công; tác vụ Google đang chờ tích hợp.</div>';
function toast(text) { $('#toast').textContent = text; $('#toast').style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').style.display = 'none', 6000); }
async function api(path, options) {
  const response = await fetch('/api/' + path, { ...options, headers: { 'Content-Type': 'application/json' } });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Không thể thực hiện yêu cầu.'); return data;
}
const post = (path, data) => api(path, { method: 'POST', body: JSON.stringify(data) });
async function refresh(render = true) { state = await api('state'); if (render) draw(); }
const hero = (eyebrow, title, description, action = '') => `<section class="card hero"><div><span class="eyebrow">${eyebrow}</span><h1>${escape(title)}</h1><p>${description}</p></div>${action}</section>`;
const empty = (title, description, action = '') => `<div class="empty"><div class="empty-icon">♧</div><h2>${title}</h2><p>${description}</p>${action}</div>`;
const stats = entries => `<div class="stats">${entries.map(([name, n]) => `<div class="card stat"><h2>${name}</h2><strong>${n}</strong></div>`).join('')}</div>`;
const btn = (action, title, type = 'secondary', attrs = '') => `<button class="${type}" data-action="${action}" ${attrs}>${title}</button>`;
function accountsTable(accounts) {
  if (!accounts.length) return empty(state.accounts.length ? 'Không tìm thấy tài khoản' : 'Thêm tài khoản đầu tiên', 'Quản lý email, ghi chú và hồ sơ Family trong một nơi.', btn('add-account', '+ Thêm tài khoản', 'primary'));
  return `<div class="table-wrap"><table><thead><tr><th>EMAIL</th><th>KẾT NỐI GOOGLE</th><th>ROLE FAMILY</th><th>GHI CHÚ</th><th>CẬP NHẬT</th><th></th></tr></thead><tbody>${accounts.map(a => `<tr><td><a class="email-link" href="#account/${a.id}">${escape(a.email)}</a><span class="subtext">${escape(a.family_name || 'Chưa gắn hồ sơ Family')}</span></td><td><span class="badge">Chưa kết nối</span></td><td>${a.family_id ? 'manager (ghi nhận)' : '—'}</td><td>${escape(a.note || '—')}</td><td>${date(a.created_at)}</td><td>${btn('delete-account', 'Xóa hồ sơ', 'danger tiny', `data-id="${a.id}"`)}</td></tr>`).join('')}</tbody></table></div>`;
}
function jobsTable(jobs) {
  return jobs.length ? `<div class="table-wrap"><table><thead><tr><th>ID</th><th>TÁC VỤ</th><th>ĐỐI TƯỢNG</th><th>TRẠNG THÁI</th><th>THỜI GIAN</th></tr></thead><tbody>${jobs.map(j => `<tr><td>#${j.id}</td><td>${jobNames[j.action]}</td><td>${escape(j.target)}</td><td><span class="badge amber">Chờ tích hợp</span><span class="subtext">Chưa thực hiện trên Google</span></td><td>${date(j.created_at)}</td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có tác vụ', 'Yêu cầu thao tác với Google sẽ xuất hiện tại đây.');
}
function draw() {
  if (!state) return;
  const [page, id] = route();
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.page === (page === 'account' ? 'accounts' : page === 'family' ? 'families' : page)));
  $('#breadcrumb').textContent = `Fam Manager › ${names[page] || (page === 'account' ? 'Tài khoản' : 'Family')} ${id ? '› #' + id : ''}`;
  let content = '';
  if (page === 'overview') {
    content = hero('KHÔNG GIAN LÀM VIỆC', 'Tổng quan', 'Theo dõi tài khoản, Family và các yêu cầu vận hành.', btn('add-account', '+ Thêm tài khoản', 'primary')) + notice + stats([['Tài khoản', state.accounts.length], ['Hồ sơ Family', state.families.length], ['Thành viên ghi nhận', state.members.length], ['Tác vụ chờ tích hợp', state.jobs.length]]) + `<div class="split"><section class="card"><h2>Tài khoản gần đây</h2><p>Dữ liệu được lưu trong hệ thống.</p>${accountsTable(state.accounts.slice(0, 5))}</section><section class="card"><h2>Hoạt động gần đây</h2>${state.logs.slice(0, 6).map(l => `<div class="list-item">${escape(l.message)}<span class="subtext">${date(l.created_at)}</span></div>`).join('') || empty('Chưa có hoạt động', 'Bắt đầu bằng cách thêm tài khoản của bạn.')}</section></div>`;
  } else if (page === 'accounts') {
    content = hero('TÀI KHOẢN', 'Managed accounts', 'Quản lý email, ghi chú và hồ sơ Family.', btn('add-account', '+ Thêm tài khoản', 'primary')) + `<section class="card"><h2>Danh sách tài khoản</h2><p>Dữ liệu được cập nhật mỗi 10 giây.</p><div class="toolbar"><input id="search" aria-label="Tìm tài khoản" placeholder="Tìm email, Family hoặc ghi chú…" value="${escape(search)}"><select id="family-filter" aria-label="Lọc Family"><option value="">Tất cả tài khoản</option><option value="with" ${familyFilter === 'with' ? 'selected' : ''}>Có hồ sơ Family</option><option value="without" ${familyFilter === 'without' ? 'selected' : ''}>Chưa gắn Family</option></select><small>${state.accounts.length} tài khoản</small></div><div id="account-table">${filteredAccounts()}</div></section>`;
  } else if (page === 'account') {
    const a = state.accounts.find(a => a.id === Number(id));
    if (!a) content = empty('Không tìm thấy tài khoản', 'Hồ sơ này có thể đã bị xóa.');
    else content = `<a class="back" href="#accounts">← Danh sách tài khoản</a>` + hero('TÀI KHOẢN', a.email, 'Xem hồ sơ Family và yêu cầu tác vụ liên quan.', '<span class="badge">Chưa kết nối Google</span>') + stats([['ID Family', a.family_id || '—'], ['Healthcheck', 'Chưa kiểm tra'], ['2FA', 'Chưa xác minh'], ['Trial', 'Chưa kiểm tra']]) + notice + `<section class="card"><h2>Thông tin tài khoản</h2><p>Ghi chú: ${escape(a.note || 'Chưa có ghi chú')}</p><p>Family: ${a.family_id ? `<a class="email-link" href="#family/${a.family_id}">${escape(a.family_name)}</a>` : 'Chưa có hồ sơ'}</p></section><section class="card"><h2>Tác vụ Google</h2><p>Các yêu cầu được lưu vào Jobs và chờ tích hợp công cụ.</p><div class="actions">${['healthcheck', 'change_password', 'setup_2fa', 'check_trial'].map(action => btn('account-job', jobNames[action], 'secondary', `data-kind="${action}" data-id="${a.id}"`)).join('')}${!a.family_id ? btn('add-family', 'Tạo hồ sơ Family', 'secondary', `data-id="${a.id}"`) : ''}</div></section><section class="card"><h2>Jobs của tài khoản</h2>${jobsTable(state.jobs.filter(j => j.target === a.email))}</section>`;
  } else if (page === 'families') {
    content = hero('FAMILY', 'Quản lý Family', 'Quản lý hồ sơ nhóm và danh sách thành viên của bạn.', btn('add-family', '+ Thêm hồ sơ Family', 'primary')) + notice + `<section class="card"><h2>Danh sách Family</h2>${state.families.length ? `<div class="table-wrap"><table><thead><tr><th>FAMILY</th><th>TÀI KHOẢN QUẢN LÝ</th><th>THÀNH VIÊN</th><th>TRẠNG THÁI GOOGLE</th><th></th></tr></thead><tbody>${state.families.map(f => `<tr><td><a class="email-link" href="#family/${f.id}">${escape(f.name)}</a><span class="subtext">#${f.id}</span></td><td>${escape(f.manager_email)}</td><td>${state.members.filter(m => m.family_id === f.id).length + 1}/6</td><td><span class="badge">Chưa xác minh</span></td><td>${btn('delete-family-record', 'Xóa hồ sơ', 'danger tiny', `data-id="${f.id}"`)}</td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có hồ sơ Family', 'Thêm tài khoản quản lý, sau đó tạo hồ sơ Family.', btn('add-family', '+ Thêm hồ sơ Family', 'primary'))}</section>`;
  } else if (page === 'family') {
    const f = state.families.find(f => f.id === Number(id));
    if (!f) content = empty('Không tìm thấy Family', 'Hồ sơ này có thể đã bị xóa.');
    else content = `<a class="back" href="#families">← Danh sách Family</a>` + hero('FAMILY', f.name, `Tài khoản quản lý: ${escape(f.manager_email)}`, btn('add-member', '+ Ghi nhận thành viên', 'primary', `data-id="${f.id}"`)) + notice + `<section class="card"><h2>Danh sách thành viên nội bộ</h2><div class="table-wrap"><table><thead><tr><th>EMAIL</th><th>VAI TRÒ</th><th>THAO TÁC</th></tr></thead><tbody><tr><td>${escape(f.manager_email)}</td><td><span class="badge blue">Manager</span></td><td>—</td></tr>${state.members.filter(m => m.family_id === f.id).map(m => `<tr><td>${escape(m.email)}</td><td>Thành viên (ghi nhận)</td><td><div class="row-actions">${btn('kick', 'Yêu cầu kick', 'secondary tiny', `data-id="${f.id}" data-email="${escape(m.email)}"`)}${btn('delete-member', 'Xóa hồ sơ', 'danger tiny', `data-id="${m.id}"`)}</div></td></tr>`).join('')}</tbody></table></div></section><section class="card"><h2>Tác vụ Google Family</h2><p>Cần tích hợp để thực hiện trên Google.</p><div class="actions">${btn('invite', 'Mời khách vào Family', 'secondary', `data-id="${f.id}"`)}${btn('delete-google-family', 'Yêu cầu xóa Google Family', 'danger', `data-id="${f.id}"`)}</div></section>`;
  } else if (page === 'jobs') content = hero('VẬN HÀNH', 'Tác vụ & Jobs', 'Theo dõi yêu cầu và trạng thái thực thi.') + notice + `<section class="card"><h2>100 tác vụ gần đây</h2>${jobsTable(state.jobs)}</section>`;
  else if (page === 'logs') content = hero('HỆ THỐNG', 'Nhật ký hoạt động', 'Lịch sử thay đổi hồ sơ và các yêu cầu tác vụ.') + `<section class="card"><h2>100 hoạt động gần đây</h2>${state.logs.map(l => `<div class="list-item">${escape(l.message)}<span class="subtext">#${l.id} · ${date(l.created_at)}</span></div>`).join('') || empty('Nhật ký trống', 'Hoạt động mới sẽ được ghi nhận tại đây.')}</section>`;
  else if (page === 'integration') content = hero('HỆ THỐNG', 'Tích hợp Google', 'Chuẩn bị kết nối công cụ vận hành ở giai đoạn tiếp theo.', '<span class="badge amber">Chưa cấu hình</span>') + `<section class="card"><h2>Các khả năng cần tích hợp</h2><p>Hiện tại ứng dụng chỉ quản lý dữ liệu nội bộ. Google chưa được kết nối.</p>${Object.values(jobNames).map(name => `<div class="list-item">${name}<span class="subtext">Chưa có công cụ thực thi · Yêu cầu được ghi nhận vào Jobs</span></div>`).join('')}</section><section class="card"><h2>Kết nối ở bước tiếp theo</h2><p>Cần xác định công cụ hoặc API có quyền truy cập hợp lệ cho từng thao tác, cách đăng nhập và kết quả trả về. Ứng dụng hiện không thu thập mật khẩu, mã OTP hoặc mã khôi phục.</p></section>`;
  else content = empty('Không tìm thấy trang', 'Chọn một mục trong thanh điều hướng.');
  $('#main').innerHTML = content;
}
function filteredAccounts() {
  const q = search.toLocaleLowerCase();
  return accountsTable(state.accounts.filter(a => `${a.email} ${a.note} ${a.family_name || ''}`.toLocaleLowerCase().includes(q) && (!familyFilter || (familyFilter === 'with' ? a.family_id : !a.family_id))));
}
function modal(title, fields, handler, submit = 'Lưu') {
  $('#modal-title').textContent = title; $('#modal-fields').innerHTML = fields; $('#form-error').textContent = ''; $('#modal-form button[type=submit]').textContent = submit; submitModal = handler; $('#modal').showModal();
}
const field = (name, title, type = 'text', placeholder = '') => `<label for="field-${name}">${title}</label><input id="field-${name}" name="${name}" type="${type}" placeholder="${placeholder}" required maxlength="${type === 'email' ? 254 : 200}">`;
async function recordJob(data) { await post('jobs', data); await refresh(); toast('Đã ghi nhận yêu cầu. Chưa thực hiện trên Google; chờ tích hợp.'); }
$('#modal-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  try { await submitModal(Object.fromEntries(new FormData(event.currentTarget))); $('#modal').close(); await refresh(); }
  catch (error) { $('#form-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
$('#close-modal').onclick = $('#cancel-modal').onclick = () => $('#modal').close();
document.addEventListener('input', event => { if (event.target.id === 'search') { search = event.target.value; $('#account-table').innerHTML = filteredAccounts(); } });
document.addEventListener('change', event => { if (event.target.id === 'family-filter') { familyFilter = event.target.value; $('#account-table').innerHTML = filteredAccounts(); } });
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const { action, id, kind, email } = button.dataset;
  try {
    if (action === 'add-account') modal('Thêm tài khoản', field('email', 'Email', 'email', 'you@gmail.com') + '<label for="note">Ghi chú</label><textarea id="note" name="note" maxlength="1000" placeholder="Tên khách, mục đích sử dụng…"></textarea><p>Chỉ lưu hồ sơ email; chưa đăng nhập Google.</p>', async data => { await post('accounts', data); toast('Đã thêm tài khoản.'); });
    else if (action === 'add-family') {
      const accounts = state.accounts.filter(a => !a.family_id);
      if (!accounts.length) return toast('Cần thêm tài khoản chưa quản lý hồ sơ Family trước.');
      modal('Thêm hồ sơ Family', field('name', 'Tên Family', 'text', 'Family của tôi') + `<label for="manager">Tài khoản quản lý</label><select id="manager" name="manager_id">${accounts.map(a => `<option value="${a.id}" ${String(a.id) === id ? 'selected' : ''}>${escape(a.email)}</option>`).join('')}</select><p>Tạo hồ sơ nội bộ; chưa tạo nhóm trên Google.</p>`, async data => { await post('families', data); toast('Đã tạo hồ sơ Family nội bộ.'); });
    } else if (action === 'add-member') modal('Ghi nhận thành viên', field('email', 'Email thành viên', 'email') + '<p>Thêm vào danh sách nội bộ; không gửi lời mời Google.</p>', async data => { await post('members', { ...data, family_id: Number(id) }); toast('Đã ghi nhận thành viên nội bộ.'); });
    else if (action === 'invite') modal('Yêu cầu mời khách', field('email', 'Email khách', 'email') + '<p>Yêu cầu sẽ chờ tích hợp, chưa gửi lời mời Google.</p>', data => recordJob({ ...data, family_id: Number(id), action: 'invite' }), 'Ghi nhận yêu cầu');
    else if (action === 'account-job') await recordJob({ action: kind, account_id: Number(id) });
    else if (action === 'kick' || action === 'delete-google-family') modal(action === 'kick' ? 'Yêu cầu kick thành viên' : 'Yêu cầu xóa Google Family', `<p>${action === 'kick' ? 'Thành viên: ' + escape(email) + '. ' : ''}Yêu cầu sẽ được lưu ở trạng thái chờ tích hợp. Chưa thay đổi trên Google.</p>`, () => recordJob({ action: action === 'kick' ? 'remove_member' : 'delete_family', family_id: Number(id), email }), 'Ghi nhận yêu cầu');
    else if (action.startsWith('delete-')) {
      const table = { 'delete-account': 'accounts', 'delete-family-record': 'families', 'delete-member': 'members' }[action];
      modal('Xóa hồ sơ nội bộ?', '<p>Hồ sơ sẽ bị xóa khỏi hệ thống này. ' + (table === 'families' ? 'Danh sách thành viên nội bộ cũng sẽ bị xóa. ' : '') + 'Tài khoản và nhóm trên Google không thay đổi.</p>', async () => { await api(table + '/' + id, { method: 'DELETE' }); toast('Đã xóa hồ sơ nội bộ.'); }, 'Xóa hồ sơ');
    }
  } catch (error) { toast(error.message); }
});
window.addEventListener('hashchange', draw);
async function sync() {
  const active = document.activeElement;
  try { await refresh(false); if (!$('#modal').open && !['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName)) draw(); }
  catch (error) { toast('Không thể cập nhật dữ liệu: ' + error.message); }
}
try { await refresh(); } catch { $('#main').innerHTML = '<div class="error-box">Không thể tải dữ liệu. Kiểm tra máy chủ và tải lại trang.</div>'; }
setInterval(sync, 10000);
