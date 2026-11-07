// Trang tra cứu cho khách: Gmail + mã tra cứu → tình trạng nhóm và link vào nhóm mới.
import { familyStatusLabels } from './domain.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const day = value => value ? value.split('-').reverse().join('/') : 'chưa có';
const time = value => { if (!value) return ''; const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(p => [p.type, p.value])); return `${parts.hour}:${parts.minute} ngày ${parts.day}/${parts.month}`; };
const statusColors = { active: 'green', checking: 'amber', scanned: 'amber', disabled: 'red' };
const inApp = /FBAN|FBAV|FB_IAB|FBIOS|Messenger|Instagram|Zalo|Line\//i.test(navigator.userAgent);
let shop = {}, data = null, problemOpen = null;

async function call(path, body) {
  const options = body === undefined ? { headers: { 'X-Fam-Request': '1' } } : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Fam-Request': '1' }, body: JSON.stringify(body) };
  const response = await fetch('/api/lookup/' + path, options);
  let value = {}; try { value = await response.json(); } catch {}
  if (!response.ok) throw Object.assign(new Error(value.error || 'Không kết nối được. Kiểm tra mạng rồi thử lại.'), { status: response.status });
  return value;
}
function codeFromLink() {
  const short = location.search.match(/^\?([A-Za-z0-9]{6})$/); if (short) return short[1].toUpperCase();
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
    <div class="welcome"><h1>Tra cứu Premium</h1><p>Nhập Gmail bạn dùng khi mua và mã tra cứu shop gửi bạn. Trang hiện tình trạng nhóm, tiến trình shop đang xử lý và link vào nhóm khi có.</p></div>
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
const note = (title, text, tone = '') => text ? `<section class="message ${tone}"><span class="title">${escape(title)}</span><p>${escape(text)}</p></section>` : '';
const inAppHint = () => inApp ? `<div class="inapp"><strong>Bạn đang mở trong Messenger/Zalo.</strong><span>Google không cho vào nhóm trong trình duyệt của ứng dụng chat. Bấm ⋯ ở góc trên, chọn <strong>Mở bằng trình duyệt</strong> (Chrome/Safari), hoặc sao chép link trang này rồi mở bằng Chrome/Safari.</span><button type="button" class="btn small" data-act="copy-page">Sao chép link trang này</button></div>` : '';
const problemLabels = { lost_premium: ['Mất Premium hoặc hiện quảng cáo', 'YouTube hiện quảng cáo hoặc mất chữ Premium cạnh logo.'], left_family: ['Bị đưa ra khỏi nhóm gia đình', 'Google báo bạn không còn ở nhóm gia đình.'], other: ['Lỗi khác', 'Mô tả lỗi ở ô bên dưới.'] };
const tick = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// The shop's runner: an original chibi in a white cap with a red N. Pure SVG, animated in CSS.
const chibi = () => `<svg viewBox="0 0 56 62" aria-hidden="true">
  <ellipse class="shadow" cx="28" cy="59" rx="13" ry="2.6"/>
  <circle class="puff" cx="12" cy="54" r="3"/><circle class="puff puff-2" cx="10" cy="51" r="2.4"/><circle class="puff puff-3" cx="14" cy="50" r="2"/>
  <g class="chibi-body">
    <g class="leg leg-a"><rect x="21.5" y="45" width="5.5" height="9" rx="2.6" fill="#1e3a8a"/><ellipse cx="25.5" cy="54.6" rx="4" ry="2.3" fill="#0f1e3a"/></g>
    <g class="leg leg-b"><rect x="29" y="45" width="5.5" height="9" rx="2.6" fill="#24408f"/><ellipse cx="33" cy="54.6" rx="4" ry="2.3" fill="#0f1e3a"/></g>
    <g class="arm arm-a"><rect x="15" y="36" width="5" height="10" rx="2.5" fill="#ffd9b8"/></g>
    <rect x="18" y="34" width="20" height="14" rx="7" fill="#22c55e"/><path d="M24 34h8l-4 4z" fill="#16a34a"/>
    <g class="arm arm-b"><rect x="36" y="36" width="5" height="10" rx="2.5" fill="#ffe1c4"/></g>
    <circle cx="28" cy="23" r="14" fill="#ffe1c4" stroke="#f2c49b" stroke-width="1"/>
    <path d="M14.6 22c.4 3 1.6 5 3 6.2l.4-6zM41.4 22c-.4 3-1.6 5-3 6.2l-.4-6z" fill="#4a3223"/>
    <ellipse cx="22.6" cy="25" rx="2" ry="2.6" fill="#1b2233"/><ellipse cx="33.4" cy="25" rx="2" ry="2.6" fill="#1b2233"/>
    <circle cx="23.3" cy="24" r=".8" fill="#fff"/><circle cx="34.1" cy="24" r=".8" fill="#fff"/>
    <ellipse cx="19.4" cy="29.4" rx="2.6" ry="1.5" fill="#ff8fa3" opacity=".7"/><ellipse cx="36.6" cy="29.4" rx="2.6" ry="1.5" fill="#ff8fa3" opacity=".7"/>
    <path d="M25.6 29.6q2.4 2.2 4.8 0" fill="none" stroke="#8a3b2f" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M13.6 21.5C13.6 12 20 7 28 7s14.4 5 14.4 14.5z" fill="#ffffff" stroke="#d5dceb" stroke-width="1"/>
    <path d="M40 20.6c4.6-.2 8.4.6 9.6 2.2-2.6 1.2-6.6 1.4-10.6.8z" fill="#2f5bea"/>
    <circle cx="28" cy="7.4" r="1.6" fill="#2f5bea"/>
    <text x="28" y="19" text-anchor="middle" font-size="10.5" font-weight="900" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif" fill="#e5293b">N</text>
    <path class="sweat" d="M43 13c1.2 1.8 1.8 3 1.8 3.8a1.8 1.8 0 0 1-3.6 0c0-.8.6-2 1.8-3.8z" fill="#7cc4ff"/>
  </g>
</svg>`;

function joinTodo(move, includeLeave) {
  const link = move.invite_url
    ? `<a class="btn go big" href="${escape(move.invite_url)}" rel="noreferrer" data-open="${move.id}">${includeLeave ? 'Vào nhóm mới' : 'Vào nhóm'}</a><span class="sub">Link riêng của bạn, chỉ dùng được 1 lần. Đừng gửi cho người khác.</span>${move.invite_expires_on ? `<span class="sub">Link còn hiệu lực đến ${day(move.invite_expires_on)}.</span>` : ''}${shop.contact_url ? `<span class="sub">Bấm link mà Google báo lỗi, không vào được? ${contactLink('Nhắn shop', '')} kèm ảnh chụp lỗi.</span>` : ''}`
    : '';
  return `<ol class="todo">
      ${includeLeave ? `<li><div><h3>Rời nhóm cũ</h3><p>Vào trang Gia đình của Google, chọn Rời khỏi nhóm gia đình. Google báo bạn không còn ở nhóm nào thì bỏ qua bước này.</p><a class="btn small" href="https://g.co/YourFamily" target="_blank" rel="noopener noreferrer">Mở trang Gia đình Google</a></div></li>` : ''}
      <li><div><h3>Đăng nhập đúng Gmail</h3><p>Mở link bằng trình duyệt đang đăng nhập <strong>${escape(data.email)}</strong>. Trình duyệt đang đăng nhập Gmail khác thì Gmail đó sẽ vào nhóm thay bạn.</p></div></li>
      <li><div><h3>${includeLeave ? 'Bấm vào nhóm mới' : 'Bấm vào nhóm'}</h3><p>Google mở trang mời, bạn bấm đồng ý tham gia là xong.${includeLeave ? '' : ' Google báo bạn đang ở nhóm gia đình khác thì rời nhóm đó trước.'}</p>${link}</div></li>
    </ol>${inAppHint()}`;
}

// Each customer situation becomes a short sequence of stages: what happened, what the shop is
// doing, and the customer's own step. Handing over the link is the last stage: the shop does not
// track whether the customer joined. The runner stops at the current stage.
function flowOf(item) {
  const move = item.move && ['assigned', 'opened', 'failed'].includes(item.move.state) ? item.move : null, problem = item.problem;
  if (!['reported', 'incident', 'move', 'waiting'].includes(item.view)) return null;
  if ((move && move.kind === 'join') || (!move && item.view === 'waiting')) {
    const current = move?.invite_url ? 2 : 1;
    return {
      current, n: 3, yours: current === 2,
      title: current === 2 ? 'Bạn thao tác: vào nhóm' : 'Shop đang chuẩn bị link vào nhóm',
      sub: current === 2 ? 'Làm 2 bước ở mục Vào nhóm, mất khoảng 1 phút.' : 'Link riêng của bạn sẽ hiện ngay tại trang này.',
      steps: [
        { label: 'Đăng ký', title: 'Shop nhận đơn', detail: 'Shop đã ghi nhận Gmail của bạn.' },
        { label: 'Chuẩn bị', title: 'Chuẩn bị link vào nhóm', detail: current > 1 ? 'Link riêng của bạn đã sẵn sàng.' : 'Shop đang chuẩn bị link riêng cho bạn. Bạn chưa cần làm gì, link sẽ hiện ngay tại đây.' },
        { label: 'Vào nhóm', title: 'Bạn thao tác để vào nhóm', detail: current === 2 ? '' : 'Mở link riêng để vào nhóm.', body: current === 2 ? joinTodo(move, false) : '' }
      ]
    };
  }
  const shopNote = move && move.kind === 'move' ? move.from_note : item.status_note;
  const current = item.view === 'reported' ? 1 : move?.invite_url ? 3 : 2, linkLater = item.view === 'move' && !move?.invite_url;
  return {
    current, n: 4, yours: current === 3,
    title: current === 3 ? 'Bạn thao tác: vào nhóm mới' : current === 1 ? 'Shop đang kiểm tra nhóm của bạn' : linkLater ? 'Shop đang tạo link riêng cho bạn' : 'Hải đang chuẩn bị nhóm mới, phiền bạn đợi xíuuuu ^^',
    sub: current === 3 ? 'Làm 3 bước ở mục Bạn thao tác để vào nhóm mới, mất khoảng 1 phút.'
      : current === 1 ? 'Shop đã nhận báo lỗi của bạn. Kết quả kiểm tra sẽ hiện ngay tại đây.'
      : linkLater ? 'Nhóm mới đã sẵn sàng. Link riêng của bạn sẽ hiện ngay tại đây.'
      : 'Bạn chưa cần làm gì, link vào nhóm mới sẽ hiện ngay tại đây sau khi mình fix xong.',
    steps: [
      { label: 'Báo lỗi', title: problem ? 'Bạn báo mất Premium' : 'Phát hiện sự cố mất Premium', time: problem?.created_at || '', detail: problem ? (problemLabels[problem.reason] || [problem.reason])[0] : '' },
      { label: 'Tiếp nhận', title: current > 1 ? 'Shop đã tiếp nhận và đang xử lý' : 'Shop tiếp nhận', time: current > 1 && item.view === 'incident' ? item.status_updated_at : '', detail: current > 1 ? (shopNote || 'Nhóm Youtube của bạn bị Google quét nên có thể mất Premium. Shop đang xử lý và sẽ cập nhật tại đây.') : 'Shop đang kiểm tra nhóm của bạn. Nhóm gặp sự cố thì shop chuẩn bị nhóm mới cho bạn.' },
      { label: 'Đang xử lý', title: 'Chuẩn bị nhóm mới', detail: current > 2 ? 'Link riêng của bạn đã sẵn sàng.' : current === 2 ? 'Shop đang tạo nhóm mới và link riêng cho bạn. Bạn chưa cần làm gì, trang tự cập nhật.' : 'Shop tạo nhóm mới và link riêng cho bạn.' },
      { label: 'Vào nhóm mới', title: 'Bạn thao tác để vào nhóm mới', detail: current === 3 ? '' : 'Bạn tiến hành rời nhóm cũ rồi mở link riêng để vào nhóm mới.', body: current === 3 ? joinTodo(move, true) : '' }
    ]
  };
}
const watched = item => ['reported', 'incident', 'waiting'].includes(item.view) || (item.view === 'move' && !item.move?.invite_url);
function statusCard(item, flow) {
  const pct = Math.round((flow.current + 0.5) / flow.n * 100), live = flow.yours ? 'Bạn thao tác' : 'Đang xử lý';
  return `<section class="card status" data-progress="${pct}" data-key="${item.member_ref}" data-n="${flow.n}">
    <div class="status-meta"><span class="live">${live}</span><span class="step-count">Bước ${flow.current + 1}/${flow.n}</span></div>
    <h1>${escape(flow.title)}</h1>
    <p class="status-sub">${escape(flow.sub)}</p>
    <div class="track-wrap"><div class="runner">${chibi()}</div><div class="track" role="progressbar" aria-label="Tiến trình xử lý" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${escape(`Bước ${flow.current + 1} trên ${flow.n}: ${flow.steps[flow.current].title}`)}"><div class="fill"></div></div></div>
    <div class="labels" aria-hidden="true">${flow.steps.map((step, i) => `<span class="${i < flow.current ? 'done' : i === flow.current ? 'now' : ''}">${escape(step.label)}</span>`).join('')}</div>
    ${watched(item) ? `<p class="status-time" data-checked>${checkedText()}</p>` : ''}
  </section>`;
}
function timelineCard(flow) {
  return `<section class="card"><h2>Chi tiết tiến trình</h2><ol class="timeline">${flow.steps.map((step, i) => {
    const state = i < flow.current ? 'done' : i === flow.current ? 'now' : 'later';
    const right = state === 'now' ? `<span class="now-chip">${flow.yours ? 'Bạn thao tác' : 'Đang làm'}</span>` : step.time ? `<span class="step-time">${time(step.time)}</span>` : '';
    return `<li class="${state}"${state === 'now' ? ' aria-current="step"' : ''}><span class="dot">${state === 'done' ? tick : i + 1}</span><div class="step"><div class="step-head"><h3>${escape(step.title)}</h3>${right}</div>${step.detail ? `<p>${escape(step.detail)}</p>` : ''}${state === 'now' && step.body ? `<div class="step-body">${step.body}</div>` : ''}</div></li>`;
  }).join('')}</ol></section>`;
}
function planCard(item) {
  return `<section class="card plan">
    <div class="plan-name"><div><span class="label">Mail của bạn</span><strong>${escape(data.email)}</strong></div><span class="badge ${statusColors[item.status] || ''}">${escape(familyStatusLabels[item.status] || item.status)}</span></div>
    <div><span class="label">Gói</span><strong>YouTube Premium</strong><span class="sub">${escape(plan(item))}</span></div>
    <div><span class="label">Hạn dùng</span><strong>${day(item.expires_at)}</strong>${expiryLine(item)}</div>
  </section>`;
}
function problemForm(item) {
  return `<section class="card" id="problem-card"><form id="problem" data-member="${item.member_ref}">
    <div><h2>Báo mất Premium cho shop</h2><p class="muted">Shop nhận được ngay và kiểm tra nhóm của bạn. Tiến trình xử lý hiện tại trang này.</p></div>
    <fieldset><legend class="legend">Bạn đang gặp lỗi gì?</legend>${Object.entries(problemLabels).map(([value, [title, hint]], i) => `<label class="choice"><input type="radio" name="reason" value="${value}" ${i === 0 ? 'checked' : ''}><span><strong>${title}</strong><small>${hint}</small></span></label>`).join('')}</fieldset>
    <div class="field"><label for="problem-note">Ghi chú cho shop (không bắt buộc)</label><textarea id="problem-note" name="note" maxlength="500" placeholder="Ví dụ: Từ sáng nay YouTube hiện quảng cáo"></textarea></div>
    <p class="error" id="problem-error" role="alert"></p>
    <div class="actions"><button type="submit" class="btn primary">Gửi cho shop</button><button type="button" class="btn" data-act="problem-cancel">Quay lại</button></div>
  </form></section>`;
}
function calmCard(item) {
  const expired = item.view === 'expired', open = problemOpen === item.member_ref, handled = item.problem?.state === 'handled';
  return `<section class="card status ${expired ? 'stop' : 'done'}">
      <div class="status-meta"><span class="live">${expired ? 'Hết hạn' : 'Đang hoạt động'}</span></div>
      <h1>${expired ? `Gói đã hết hạn ${Math.abs(item.days_left)} ngày` : 'Premium đang hoạt động'}</h1>
      <p class="status-sub">${expired ? 'Gia hạn xong, thông tin mới hiện ngay trên trang này.' : 'Nhóm của bạn hoạt động bình thường. Bạn không cần làm gì thêm.'}</p>
    </section>`
    + (handled ? note('Shop đã xử lý báo lỗi của bạn' + (item.problem.handled_at ? ' lúc ' + time(item.problem.handled_at) : ''), item.problem.handled_note || 'Mở lại YouTube để kiểm tra. Vẫn lỗi thì báo lại cho shop.', 'green') : '')
    + planCard(item)
    + (expired
      ? `<section class="card"><h2>Gia hạn gói</h2><p class="muted">Nhắn shop để chọn gói và thanh toán. Shop xác nhận xong, bạn tải lại trang này.</p>${contactLink('Nhắn shop để gia hạn', 'btn primary big')}${open ? '' : `<button type="button" class="btn quiet" data-act="problem-open" data-member="${item.member_ref}">Vẫn đang gia hạn mà mất Premium? Báo cho shop</button>`}</section>`
      : `<section class="card"><h2>YouTube chưa hiện Premium?</h2><ul class="tips"><li>Kiểm tra YouTube đang đăng nhập đúng ${escape(data.email)}.</li><li>Đăng xuất YouTube rồi đăng nhập lại, đợi vài phút.</li></ul>${open ? '' : `<div class="actions"><button type="button" class="btn" data-act="problem-open" data-member="${item.member_ref}">Báo mất Premium cho shop</button>${contactLink('Nhắn shop')}</div>`}</section>`)
    + (open ? problemForm(item) : '');
}
function itemView(item) {
  const flow = flowOf(item);
  return flow ? statusCard(item, flow) + timelineCard(flow) + planCard(item) : calmCard(item);
}
function resultView(focus = true) {
  const items = data.items || [];
  show(`<div class="hello"><h1>Xin chào</h1><p>${escape(data.email)}</p></div>`
    + (items.length ? items.map(itemView).join('') : `<section class="card"><h2>Chưa tìm thấy nhóm đang hoạt động</h2><p class="muted">Gmail này không còn trong nhóm nào của shop.</p>${contactLink()}</section>`), focus);
  animateProgress(); watch();
}
// The runner starts from where it last stood (0 on first view) and runs to the current stage.
const lastProgress = new Map();
function animateProgress() {
  document.querySelectorAll('.status[data-progress]').forEach(card => {
    const key = card.dataset.key, target = Number(card.dataset.progress);
    card.style.setProperty('--n', card.dataset.n);
    card.style.setProperty('--p', lastProgress.has(key) ? lastProgress.get(key) : 0);
    void card.offsetWidth;
    requestAnimationFrame(() => requestAnimationFrame(() => card.style.setProperty('--p', target)));
    lastProgress.set(key, target);
  });
}
// While the shop is working on it, the page checks again every 30 seconds and when the customer comes back.
let pollTimer = null, checkedAt = null;
function checkedText() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(checkedAt || new Date()).map(p => [p.type, p.value]));
  return `Cập nhật lúc ${parts.hour}:${parts.minute}. Trang tự làm mới mỗi 30 giây.`;
}
function watch() {
  clearInterval(pollTimer); pollTimer = null;
  if (data && (data.items || []).some(watched)) pollTimer = setInterval(quietRefresh, 30000);
}
async function quietRefresh() {
  if (!data || document.visibilityState !== 'visible' || problemOpen !== null || document.activeElement?.closest?.('#view form')) return;
  try {
    const value = await call('me');
    if (value.signed_in === false) { clearInterval(pollTimer); return loginView('Phiên tra cứu đã hết. Nhập lại Gmail và mã tra cứu.', data?.email || ''); }
    checkedAt = new Date();
    if (JSON.stringify(value) !== JSON.stringify(data)) render(value, false);
    else document.querySelectorAll('[data-checked]').forEach(line => { line.textContent = checkedText(); });
  } catch { /* offline: try again on the next tick */ }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') quietRefresh(); });
function render(value, focus = true) { data = value; checkedAt = new Date(); resultView(focus); }


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
    } else if (form.id === 'problem') {
      const value = new FormData(form);
      try { const result = await call('problem', { member: Number(form.dataset.member), reason: value.get('reason'), note: value.get('note') || '' }); problemOpen = null; render(result, false); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      catch (error) { $('#problem-error').textContent = error.message; if (error.status === 409) { problemOpen = null; setTimeout(quietRefresh, 1500); } }
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
  const act = button.dataset.act;
  try {
    if (act === 'problem-open') { problemOpen = Number(button.dataset.member); resultView(false); $('#problem-card')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    else if (act === 'problem-cancel') { problemOpen = null; resultView(false); }
    else if (act === 'copy-page') await copyPage();
    else if (act === 'logout') { await call('logout', {}).catch(() => {}); problemOpen = null; clearInterval(pollTimer); loginView('', data?.email || ''); }
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
