// Trang tra cứu cho khách: Gmail + mã tra cứu → tình trạng nhóm và link vào nhóm mới.
import { familyStatusLabels } from './domain.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = value => value ? value.split('-').reverse().join('/') : 'chưa có';
const time = value => { if (!value) return ''; const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(p => [p.type, p.value])); return `${parts.hour}:${parts.minute} ngày ${parts.day}/${parts.month}`; };
const statusColors = { active: 'green', checking: 'amber', scanned: 'amber', disabled: 'red' };
const reasons = [
  ['twelve_months', 'Chỉ được đổi nhóm 1 lần trong 12 tháng', 'Gmail của bạn đã rời một nhóm gia đình khác trong năm nay.'],
  ['invite_used', 'Lời mời đã được dùng hoặc hết hạn', 'Shop sẽ gửi link khác cho bạn.'],
  ['other_family', 'Bạn đang ở một nhóm gia đình khác', 'Làm lại bước 1: rời nhóm cũ rồi mở lại link.'],
  ['other', 'Lỗi khác', 'Mô tả lỗi ở ô bên dưới.']
];
const inApp = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Zalo|Line\//i.test(navigator.userAgent);
let shop = {}, data = null, reporting = null;

async function call(path, body) {
  const options = body === undefined ? { headers: { 'X-Fam-Request': '1' } } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fam-Request': '1' }, body: JSON.stringify(body) };
  const response = await fetch('/api/lookup/' + path, options);
  let value = {}; try { value = await response.json(); } catch {}
  if (!response.ok) throw Object.assign(new Error(value.error || 'Không kết nối được. Kiểm tra mạng rồi thử lại.'), { status: response.status });
  return value;
}
function codeFromLink() {
  const hash = decodeURIComponent(location.hash.slice(1));
  const match = hash.match(/(?:^|&)ma=([A-Za-z0-9 -]{6,9})/) || hash.match(/^([A-Za-z0-9]{6})$/);
  return match ? match[1].toUpperCase().replace(/[\s-]/g, '') : '';
}
const contactLink = (text = shop.contact_label || 'Nhắn shop', type = 'btn') => shop.contact_url ? `<a class="${type}" href="${escape(shop.contact_url)}" target="_blank" rel="noopener noreferrer">${escape(text)}</a>` : '';
function footer() {
  $('#foot').innerHTML = (shop.help_text ? `<p>${escape(shop.help_text)}</p>` : '') + (shop.contact_url ? `<p>Cần hỗ trợ? ${contactLink(shop.contact_label || 'Nhắn shop', '')}</p>` : '');
}
function show(html, focus = true) {
  $('#view').innerHTML = html;
  $('#logout').hidden = !data;
  if (focus) { $('#view').focus({ preventScroll: true }); window.scrollTo(0, 0); }
}

function loginView(error = '', email = '', code = codeFromLink()) {
  data = null;
  show(`<section class="card">
    <div class="intro"><h1>Tra cứu nhóm Family</h1><p>Nhập Gmail bạn dùng khi mua và mã tra cứu shop gửi bạn để xem tình trạng nhóm. Khi nhóm gặp sự cố, link vào nhóm mới sẽ hiện ở đây.</p></div>
    <form id="login" novalidate>
      <div class="field"><label for="email">Gmail dùng khi mua</label><input id="email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required value="${escape(email)}" placeholder="ten.ban@gmail.com"></div>
      <div class="field"><label for="code">Mã tra cứu</label><input id="code" name="code" class="code" type="text" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="9" required value="${escape(code)}" placeholder="6 ký tự, ví dụ K7P2QX"><span class="sub">Mã nằm trong tin nhắn shop gửi bạn. Mở link shop gửi thì mã đã được điền sẵn.</span></div>
      <p class="error" id="login-error" role="alert">${escape(error)}</p>
      <button class="btn primary big" type="submit">Xem nhóm của tôi</button>
    </form>
  </section>
  <p class="trust">Trang chỉ hiện thông tin của chính bạn. Shop không bao giờ hỏi mật khẩu Gmail.</p>
  ${shop.contact_url ? `<p class="muted">Chưa có mã? ${contactLink('Nhắn shop để lấy mã', '')}</p>` : ''}`, false);
  (email ? $('#code') : $('#email')).focus();
}

const plan = item => item.plan_months ? `${item.plan_months} tháng` : 'Gói đang dùng';
function expiryLine(item) {
  if (item.expiry_status === 'unknown') return '<span class="sub">Shop chưa nhập hạn</span>';
  if (item.expiry_status === 'expired') return `<span class="sub bad">Đã hết hạn ${Math.abs(item.days_left)} ngày</span>`;
  return `<span class="sub ok">${item.days_left === 0 ? 'Hết hạn hôm nay' : `Còn ${item.days_left} ngày`}</span>`;
}
function groupCard(title, familyName, status, item) {
  return `<section class="card">
    <div class="row"><div><span class="label">${title}</span><span class="big">${escape(familyName)}</span></div><span class="badge ${statusColors[status] || ''}">${escape(familyStatusLabels[status] || status)}</span></div>
    <div class="facts"><div><span class="label">Gói</span><strong>YouTube Premium</strong><span class="sub">${escape(plan(item))}</span></div><div><span class="label">Hạn dùng</span><strong>${day(item.expires_at)}</strong>${expiryLine(item)}</div></div>
  </section>`;
}
const note = (title, text, tone = '') => text ? `<section class="message ${tone}"><span class="title">${escape(title)}</span><p>${escape(text)}</p></section>` : '';
const inAppHint = () => inApp ? `<div class="inapp"><strong>Bạn đang mở trong Messenger/Zalo.</strong><span>Google không cho vào nhóm trong trình duyệt của ứng dụng chat. Bấm ⋯ ở góc trên → <strong>Mở bằng trình duyệt</strong> (Chrome/Safari), hoặc sao chép link trang này rồi mở bằng Chrome/Safari.</span><button type="button" class="btn small" data-act="copy-page">Sao chép link trang này</button></div>` : '';

// A new customer's own link into their Family (handed out automatically on lookup).
function joinView(item) {
  const move = item.move, failed = move.state === 'failed';
  const link = move.invite_url
    ? `<a class="btn primary big" href="${escape(move.invite_url)}" rel="noreferrer" data-open="${move.id}">Vào nhóm →</a><span class="sub">Link riêng của bạn, chỉ dùng được 1 lần. Đừng gửi cho người khác.</span>${move.invite_expires_on ? `<span class="sub">Link còn hiệu lực đến ${day(move.invite_expires_on)}.</span>` : ''}`
    : `<p class="message blue"><span class="title">Shop đang chuẩn bị link cho bạn</span><span>Link riêng của bạn sẽ hiện ngay tại đây. Quay lại trang này sau ít phút hoặc nhắn shop.</span></p>`;
  return groupCard('Nhóm của bạn', item.family_name, item.status, item)
    + (failed ? note('Bạn đã báo lỗi' + (move.reported_at ? ' lúc ' + time(move.reported_at) : ''), 'Shop đang xử lý. Bạn vẫn có thể thử lại link bên dưới hoặc chờ shop nhắn.', 'red') : '')
    + `<section class="card">
      <div class="row"><h2>Vào nhóm</h2><span class="badge blue">${escape(item.family_name)}</span></div>
      <ol class="steps">
        <li><span class="num" aria-hidden="true">1</span><div><h3>Đăng nhập đúng Gmail</h3><p>Mở link bằng trình duyệt đang đăng nhập <strong>${escape(data.email)}</strong>. Nếu trình duyệt đang đăng nhập Gmail khác, Gmail đó sẽ vào nhóm thay bạn.</p></div></li>
        <li><span class="num" aria-hidden="true">2</span><div><h3>Bấm vào nhóm</h3><p>Google mở trang mời, bạn bấm đồng ý tham gia là xong. Nếu Google báo bạn đang ở nhóm gia đình khác, rời nhóm đó trước.</p>${link}</div></li>
      </ol>
      ${inAppHint()}
    </section>`
    + (!move.invite_url ? '' : reporting === move.id ? reportForm(move) : `<section class="card"><div><h2>Vào được chưa?</h2><p class="muted">Mở YouTube, thấy chữ Premium cạnh logo là xong.</p></div><div class="actions"><button type="button" class="btn success" data-act="joined" data-move="${move.id}">✓ Tôi đã vào được</button><button type="button" class="btn" data-act="report" data-move="${move.id}">Tôi không vào được</button></div></section>`);
}
function waitingView(item) {
  return groupCard('Nhóm của bạn', item.family_name, item.status, item)
    + note('Shop đang chuẩn bị link vào nhóm', 'Khi có link, link riêng của bạn sẽ hiện ngay tại trang này. Quay lại sau ít phút hoặc nhắn shop.', 'blue')
    + (shop.contact_url ? `<section class="card">${contactLink('Nhắn shop', 'btn primary big')}</section>` : '');
}
function moveView(item) {
  const move = item.move, failed = move.state === 'failed';
  if (move.kind === 'join') return joinView(item);
  const link = move.invite_url
    ? `<a class="btn primary big" href="${escape(move.invite_url)}" rel="noreferrer" data-open="${move.id}">Vào nhóm mới →</a><span class="sub">Link riêng của bạn, chỉ dùng được 1 lần. Đừng gửi cho người khác.</span>${move.invite_expires_on ? `<span class="sub">Link còn hiệu lực đến ${day(move.invite_expires_on)}.</span>` : ''}`
    : `<p class="message blue"><span class="title">Shop đang chuẩn bị link cho bạn</span><span>Link riêng của bạn sẽ hiện ngay tại đây. Quay lại trang này sau ít phút hoặc nhắn shop.</span></p>`;
  return groupCard('Nhóm cũ', move.from_family_name, move.from_status, item)
    + note('Lời nhắn từ shop', move.from_note)
    + (failed ? note('Bạn đã báo lỗi' + (move.reported_at ? ' lúc ' + time(move.reported_at) : ''), 'Shop đang xử lý. Bạn vẫn có thể thử lại link bên dưới hoặc chờ shop nhắn.', 'red') : '')
    + `<section class="card">
      <div class="row"><h2>Vào nhóm mới</h2><span class="badge blue">${escape(item.family_name)}</span></div>
      <ol class="steps">
        <li><span class="num" aria-hidden="true">1</span><div><h3>Rời nhóm cũ</h3><p>Vào trang Gia đình của Google, chọn Rời khỏi nhóm gia đình. Nếu Google báo bạn không còn ở nhóm nào thì bỏ qua bước này.</p><a class="btn small" href="https://g.co/YourFamily" target="_blank" rel="noopener noreferrer">Mở trang Gia đình Google ↗</a></div></li>
        <li><span class="num" aria-hidden="true">2</span><div><h3>Đăng nhập đúng Gmail</h3><p>Mở link bằng trình duyệt đang đăng nhập <strong>${escape(data.email)}</strong>. Nếu trình duyệt đang đăng nhập Gmail khác, Gmail đó sẽ vào nhóm thay bạn.</p></div></li>
        <li><span class="num" aria-hidden="true">3</span><div><h3>Bấm vào nhóm mới</h3><p>Google mở trang mời, bạn bấm đồng ý tham gia là xong.</p>${link}</div></li>
      </ol>
      ${inAppHint()}
    </section>`
    + (!move.invite_url ? '' : reporting === move.id ? reportForm(move) : `<section class="card"><div><h2>Vào được chưa?</h2><p class="muted">Mở YouTube, thấy chữ Premium cạnh logo là xong.</p></div><div class="actions"><button type="button" class="btn success" data-act="joined" data-move="${move.id}">✓ Tôi đã vào được</button><button type="button" class="btn" data-act="report" data-move="${move.id}">Tôi không vào được</button></div></section>`);
}
function reportForm(move) {
  return `<section class="card"><form id="report" data-move="${move.id}">
    <div><h2>Không vào được nhóm?</h2><p class="muted">Cho shop biết Google báo lỗi gì. Shop kiểm tra rồi nhắn lại cho bạn.</p></div>
    <fieldset><legend class="legend">Google báo lỗi gì?</legend>${reasons.map(([value, title, hint], i) => `<label class="choice"><input type="radio" name="reason" value="${value}" ${i === 0 ? 'checked' : ''}><span><strong>${title}</strong><small>${hint}</small></span></label>`).join('')}</fieldset>
    <div class="field"><label for="report-note">Ghi chú cho shop</label><textarea id="report-note" name="note" maxlength="500" placeholder="Ví dụ: bấm Vào nhóm mới thì Google báo lỗi"></textarea>${shop.contact_url ? `<span class="sub">Có ảnh chụp lỗi? Gửi qua ${contactLink(shop.contact_label || 'Messenger của shop', '')}.</span>` : ''}</div>
    <p class="error" id="report-error" role="alert"></p>
    <div class="actions"><button type="submit" class="btn primary">Gửi cho shop</button><button type="button" class="btn" data-act="cancel-report">Quay lại</button></div>
  </form></section>`;
}
function incidentView(item) {
  return groupCard('Nhóm hiện tại', item.family_name, item.status, item)
    + note('Lời nhắn từ shop', item.status_note)
    + note('Shop đang chuẩn bị nhóm mới', 'Khi có link vào nhóm mới, link sẽ hiện ngay tại trang này. Quay lại sau hoặc chờ shop nhắn bạn.', 'blue');
}
function expiredView(item) {
  return groupCard('Nhóm hiện tại', item.family_name, item.status, item)
    + `<section class="message red"><span class="title">Gói của bạn đã hết hạn</span><p>Gia hạn xong, thông tin mới sẽ hiện ngay trên trang này.</p></section>`
    + `<section class="card"><h2>Gia hạn gói</h2><p class="muted">Nhắn shop để chọn gói và thanh toán. Shop xác nhận xong, bạn tải lại trang này.</p>${contactLink('Nhắn shop để gia hạn', 'btn primary big')}</section>`;
}
function normalView(item) {
  const joined = item.move?.state === 'joined';
  return groupCard('Nhóm hiện tại', item.family_name, item.status, item)
    + (joined ? note('Đã vào nhóm mới', `Bạn đã vào ${item.family_name}${item.move.joined_at ? ' lúc ' + time(item.move.joined_at) : ''}. Hạn dùng giữ nguyên.`, 'green') : note('Nhóm đang hoạt động bình thường', 'Bạn không cần làm gì thêm.', 'green'))
    + `<section class="card"><h2>YouTube chưa hiện Premium?</h2><ul class="tips"><li>Kiểm tra YouTube đang đăng nhập đúng ${escape(data.email)}.</li><li>Đăng xuất YouTube rồi đăng nhập lại, đợi vài phút.</li></ul>${contactLink('Vẫn lỗi? Nhắn shop')}</section>`;
}
function resultView(focus = true) {
  const items = data.items || [];
  const views = { move: moveView, incident: incidentView, expired: expiredView, waiting: waitingView, normal: normalView };
  show(`<div class="intro"><h1>Xin chào</h1><p>${escape(data.email)}</p></div>`
    + (items.length ? items.map(item => (views[item.view] || normalView)(item)).join('') : `<section class="card"><h2>Chưa tìm thấy nhóm đang hoạt động</h2><p class="muted">Gmail này không còn trong nhóm nào của shop.</p>${contactLink()}</section>`), focus);
}
function render(value, focus = true) { data = value; resultView(focus); }

async function copyPage() {
  const value = location.origin + location.pathname + location.hash;
  try { await navigator.clipboard.writeText(value); alertInline('Đã sao chép link. Mở Chrome/Safari và dán vào ô địa chỉ.'); }
  catch { window.prompt('Sao chép link này rồi mở bằng Chrome/Safari:', value); }
}
function alertInline(text) { const box = document.querySelector('.inapp'); if (box) { let line = box.querySelector('.sub'); if (!line) { line = document.createElement('span'); line.className = 'sub ok'; box.append(line); } line.textContent = text; } }

document.addEventListener('submit', async event => {
  const form = event.target; event.preventDefault();
  const button = form.querySelector('button[type=submit]'); button.disabled = true;
  try {
    if (form.id === 'login') {
      const email = form.email.value.trim(), code = form.code.value.trim();
      if (!email || !code) { $('#login-error').textContent = 'Nhập Gmail và mã tra cứu.'; return; }
      try { render(await call('verify', { email, code })); }
      catch (error) { $('#login-error').textContent = error.message; }
    } else if (form.id === 'report') {
      const value = new FormData(form);
      try { reporting = null; render(await call('report', { move_id: Number(form.dataset.move), reason: value.get('reason'), note: value.get('note') || '' })); }
      catch (error) { reporting = Number(form.dataset.move); $('#report-error').textContent = error.message; }
    }
  } finally { if (button.isConnected) button.disabled = false; }
});
document.addEventListener('click', async event => {
  const open = event.target.closest('[data-open]');
  if (open) { // Record the click, then let the browser follow the Google link.
    fetch('/api/lookup/open', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Fam-Request': '1' }, body: JSON.stringify({ move_id: Number(open.dataset.open) }) }).catch(() => {});
    return;
  }
  const button = event.target.closest('[data-act]'); if (!button) return;
  const act = button.dataset.act, move = Number(button.dataset.move);
  try {
    if (act === 'joined') { button.disabled = true; render(await call('joined', { move_id: move })); }
    else if (act === 'report') { reporting = move; resultView(false); $('#report')?.scrollIntoView({ block: 'start' }); }
    else if (act === 'cancel-report') { reporting = null; resultView(false); }
    else if (act === 'copy-page') await copyPage();
    else if (act === 'logout') { await call('logout', {}).catch(() => {}); reporting = null; loginView('', data?.email || ''); }
  } catch (error) {
    button.disabled = false;
    if (error.status === 401) loginView('Phiên tra cứu đã hết. Nhập lại Gmail và mã tra cứu.', data?.email || '');
    else { document.querySelector('#view .flash')?.remove(); $('#view').insertAdjacentHTML('afterbegin', `<section class="message red flash" role="alert"><span class="title">Chưa thực hiện được</span><p>${escape(error.message)}</p></section>`); window.scrollTo(0, 0); }
  }
});
window.addEventListener('hashchange', () => { if (!data && codeFromLink() && $('#code')) $('#code').value = codeFromLink(); });

try { shop = (await call('info')).shop || {}; } catch { shop = {}; }
if (shop.shop_name) { $('#shop-name').textContent = shop.shop_name; document.title = 'Tra cứu nhóm · ' + shop.shop_name; }
footer();
try { const current = await call('me'); if (current.signed_in === false) loginView(); else render(current, false); }
catch (error) { loginView(error.message); }
