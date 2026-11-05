// Tra cứu & chuyển nhóm — admin side: Family status shown to customers, invite link pools,
// bulk moves (one invite per customer), move progress and the customer lookup page settings.
import { familyStatusLabels, inviteExpiry, familyOccupancy, sortCustomers } from './domain.js';

const $ = selector => document.querySelector(selector);
const statusColors = { active: 'green', checking: 'amber', scanned: 'amber', disabled: 'red' };
const problem = status => status && status !== 'active';
const moveStates = {
  assigned: ['blue', 'Đã giao link · chưa mở'], opened: ['blue', 'Khách đã mở link'], failed: ['red', 'Không vào được'],
  joined: ['green', 'Đã vào nhóm'], cancelled: ['', 'Đã thu hồi link'], stale: ['', 'Khách đã chuyển hoặc bị xóa']
};
export const reportLabels = { twelve_months: 'Google báo chỉ được đổi nhóm 1 lần trong 12 tháng', invite_used: 'Lời mời đã dùng hoặc hết hạn', other_family: 'Khách đang ở nhóm gia đình khác', other: 'Lỗi khác' };
const statusTemplates = {
  checking: name => `Shop đang kiểm tra sự cố của ${name}. Bạn chưa cần làm gì, shop sẽ cập nhật tại đây.`,
  scanned: name => `${name} bị Google quét nên một số thành viên mất Premium. Shop đang chuyển bạn sang nhóm mới, hạn dùng giữ nguyên.`,
  disabled: name => `Tài khoản chủ của ${name} bị Google vô hiệu hoá. Shop đang chuyển bạn sang nhóm mới, hạn dùng giữ nguyên.`
};

export const lookupPageUrl = () => location.origin + '/tra-cuu.html';
export function familyStatus(state, familyId) {
  return (state.family_statuses || []).find(s => s.family_id === familyId) || { family_id: familyId, status: 'active', note: '', updated_at: '', revision: 0 };
}
const codeOf = (state, address) => state.lookup_codes?.[address] || '';
const personalLink = code => `${lookupPageUrl()}#ma=${code}`;
export function lookupMessage(state, member) {
  const code = codeOf(state, member.email); if (!code) return '';
  return `Link tra cứu Family của bạn: ${personalLink(code)}\nGmail: ${member.email} · Mã tra cứu: ${code}\nKhi YouTube Premium có vấn đề, mở link bằng Chrome hoặc Safari để xem tình trạng nhóm và nhận link vào nhóm mới.`;
}
const isJoin = move => move.from_family_id == null && !move.from_family_name;
function moveMessage(state, move) {
  const code = codeOf(state, move.email); if (!code) return '';
  if (isJoin(move)) return `Chào ${move.customer_name || 'bạn'}, link vào ${move.to_family_name} của bạn ở đây. Mở bằng Chrome hoặc Safari, nhập Gmail ${move.email}: ${personalLink(code)}\nMã tra cứu: ${code}`;
  return `Chào ${move.customer_name || 'bạn'}, ${move.from_family_name} đang gặp sự cố nên shop đã chuyển bạn sang nhóm mới, hạn dùng giữ nguyên. Mở link này bằng Chrome hoặc Safari, nhập Gmail ${move.email} để lấy link vào nhóm: ${personalLink(code)}\nMã tra cứu: ${code}`;
}
// Result of Lấy link từ Gmail (button and the 10-minute check in sheets.js).
export function gmailSummary(result) {
  const parts = [];
  if (result.added) parts.push(`thêm ${result.added} link`);
  if (result.updated) parts.push(`cập nhật ${result.updated} link`);
  let text = parts.length ? `Đã ${parts.join(', ')} từ Gmail${result.families?.length ? ' cho ' + result.families.join(', ') : ''}.` : result.found ? 'Link mời trong Gmail đã có đủ trên web.' : 'Không thấy thư mời Family nào trong 14 ngày qua.';
  if (result.unmatched_count) text += ` ${result.unmatched_count} thư chưa khớp mail chủ Family nào (${result.unmatched.slice(0, 3).join(', ')}${result.unmatched_count > 3 ? '…' : ''}).`;
  return text;
}
const gmailButton = ctx => ctx.state.gmail_import ? ctx.btn('invites-gmail', 'Lấy link từ Gmail', 'secondary', 'title="Đọc thư mời Family trong Gmail 14 ngày qua và thêm link vào đúng Family"') : '';

// ---- Gen mail mời: + addresses on the shop's Gmail, then their links from Gmail ----
const DAY = 86400000;
const inviteFor = (state, address) => (state.invites || []).filter(i => String(i.label).toLowerCase() === address).at(-1);
// Addresses made in the last 14 days (an invitation lasts two weeks), newest first.
const recentMails = (state, familyId) => (state.invite_mails || []).filter(m => m.family_id === familyId && Date.now() - Date.parse(m.created_at) < 14 * DAY).sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id - b.id);
const pendingMails = (state, familyId) => recentMails(state, familyId).filter(m => !inviteFor(state, m.email));
const suggestedCount = (state, familyId) => Math.min(5, Math.max(1, 5 - familyOccupancy(state.members, familyId).occupied));
// Add Family: pick how many addresses to make together with the Family (all on the shop Gmail).
export function inviteMailFields(ctx) {
  const { state, escape } = ctx;
  return `<div class="form-field"><label for="field-invite_count">Gen mail mời</label><select id="field-invite_count" name="invite_count">${[[0, 'Không tạo'], ...[1, 2, 3, 4, 5].map(n => [n, n + ' mail'])].map(([value, text]) => `<option value="${value}">${text}</option>`).join('')}</select></div>`
    + `<p class="subtext">Tạo luôn khi lưu Family: ${escape(state.invite_base_email || 'haihoangrr@gmail.com').replace('@', '+<em>đuôi ngẫu nhiên</em>@')}, không bao giờ trùng mail đã tạo.</p>`;
}
export async function createInviteMails(ctx, familyId, count) {
  count = Number(count); if (!count) return null;
  return ctx.post(`families/${familyId}/invite-mails`, { count });
}
// Family page: choosing a number creates the addresses at once.
const genMenu = (ctx, family) => `<details class="gen-menu"><summary class="secondary">Gen mail mời</summary><div class="gen-menu-list" role="group" aria-label="Số mail mời cần tạo">${[1, 2, 3, 4, 5].map(n => ctx.btn('invite-mails-gen', n + ' mail', 'secondary tiny', `data-id="${family.id}" data-count="${n}"`)).join('')}</div></details>`;
export function showInviteMails(ctx, result) {
  const { escape, state } = ctx, family = state.families.find(f => f.id === result.family_id), all = result.mails.join(', ');
  ctx.modal('Mail mời · ' + result.family_name, `<p>Đã tạo ${result.mails.length} mail mời mới.</p><div class="lookup-mail-list">${result.mails.map(address => `<div class="info-line"><strong class="info-text">${escape(address)}</strong>${ctx.copyButton(address, 'mail mời')}</div>`).join('')}</div><div class="row-actions">${ctx.copyButton(all, 'tất cả mail mời', 'Copy tất cả mail')}</div>`
    + `<ol class="lookup-steps"><li>Đăng nhập tài khoản chủ Family${family ? ` <strong>${escape(family.manager_email)}</strong>` : ''}, mở trang quản lý nhóm gia đình và mời các mail trên.</li><li>${state.gmail_import ? 'Quay lại Family này, bấm <strong>Lấy link mời</strong>: web hiện link của từng mail và lưu vào kho link.' : 'Mở từng thư mời trong Gmail, chuột phải nút Accept invitation → sao chép link, rồi bấm <strong>+ Thêm link mời</strong>.'}</li></ol>`, async () => {}, 'Đóng');
}
function fetchedMailsTable(ctx, familyId) {
  const { state, escape } = ctx, mails = recentMails(state, familyId);
  if (!mails.length) return '<p class="muted">Family này chưa có mail mời tạo trong 14 ngày qua. Bấm Gen mail mời để tạo.</p>';
  const rows = mails.map(m => {
    const invite = inviteFor(state, m.email), elsewhere = invite && invite.family_id !== familyId ? state.families.find(f => f.id === invite.family_id) : null;
    const status = !invite ? '<span class="badge amber">Chưa thấy thư mời</span>' : inviteStateBadge(ctx, invite) + (elsewhere ? `<span class="subtext">Lưu ở ${escape(elsewhere.name)} vì thư được mời từ chủ Family đó</span>` : '');
    return `<tr><td data-column="mail"><div class="info-line"><strong class="info-text">${escape(m.email)}</strong>${ctx.copyButton(m.email, 'mail mời')}</div></td><td data-column="invite">${invite ? `<span class="subtext lookup-url">${escape(invite.url)}</span>` : '<span class="subtext">—</span>'}</td><td data-column="state">${status}${invite ? `<div class="lookup-sent-row">${sentToggle(ctx, invite)}</div>` : ''}</td><td data-column="actions">${invite ? ctx.copyButton(invite.url, 'link mời', 'Copy link') : ''}</td></tr>`;
  }).join('');
  const links = mails.map(m => [m.email, inviteFor(state, m.email)]).filter(([, i]) => i).map(([address, i]) => `${address}: ${i.url}`).join('\n');
  return `<div class="table-wrap"><table class="lookup-table"><thead><tr><th scope="col">MAIL MỜI</th><th scope="col">LINK MỜI</th><th scope="col">TRẠNG THÁI</th><th scope="col"></th></tr></thead><tbody>${rows}</tbody></table></div>${links ? `<div class="row-actions">${ctx.copyButton(links, 'tất cả link mời', 'Copy tất cả link')}</div>` : ''}`;
}
function showFetchedMails(ctx, family, result) {
  const { state, escape } = ctx, bases = [...new Set(recentMails(state, family.id).map(m => m.email.replace(/\+[^@]*@/, '@')))];
  const wrongBox = result.mailbox && bases.length && !bases.includes(result.mailbox) ? `<p class="error-box">Apps Script đang đọc Gmail ${escape(result.mailbox)}, còn mail mời của Family này thuộc ${escape(bases.join(', '))}. Thư mời gửi tới Gmail khác sẽ không được thấy.</p>` : '';
  const moved = (result.mismatched || []).filter(m => recentMails(state, family.id).some(r => r.email === m.email));
  ctx.modal('Link mời · ' + family.name, `<p>${escape(gmailSummary(result))}</p>${wrongBox}${moved.length ? `<p class="notice">${moved.map(m => `${escape(m.email)} được mời từ chủ ${escape(m.invited_by)}, nên link lưu ở ${escape(m.invited_by)}.`).join(' ')}</p>` : ''}${fetchedMailsTable(ctx, family.id)}`, async () => {}, 'Đóng');
  const dialog = $('#modal'); dialog.classList.add('lookup-wide'); dialog.addEventListener('close', () => dialog.classList.remove('lookup-wide'), { once: true });
}
function pendingNotice(ctx, family) {
  const mails = pendingMails(ctx.state, family.id); if (!mails.length) return '';
  const { escape } = ctx;
  return `<div class="notice lookup-callout lookup-pending-mails"><div><strong>${mails.length} mail chờ lấy link</strong><span class="subtext">Mời các mail này từ tài khoản chủ ${escape(family.manager_email)}, rồi bấm ${ctx.state.gmail_import ? 'Lấy link mời' : '+ Thêm link mời để dán link'}.</span><div class="lookup-mail-list">${mails.map(m => `<div class="info-line"><span class="info-text">${escape(m.email)}</span>${ctx.copyButton(m.email, 'mail mời')}</div>`).join('')}</div></div><div class="row-actions">${ctx.copyButton(mails.map(m => m.email).join(', '), 'tất cả mail chờ mời', 'Copy tất cả mail')}</div></div>`;
}
export function familyStatusBadge(ctx, familyId) {
  const status = familyStatus(ctx.state, familyId).status;
  return problem(status) ? `<span class="badge ${statusColors[status]} lookup-family-badge">${ctx.escape(familyStatusLabels[status])}</span>` : '';
}
export function customerLookupAction(ctx, member) {
  const message = lookupMessage(ctx.state, member);
  return message ? ctx.copyButton(message, 'link tra cứu của khách', 'Copy link tra cứu') + ctx.btn('lookup-rotate', 'Đổi mã tra cứu', 'secondary tiny', `data-email="${ctx.escape(member.email)}"`) : '';
}

const readyInvites = (state, familyId) => (state.invites || []).filter(i => i.family_id === familyId && i.holder_state === 'ready');
const inviteName = (ctx, invite) => invite.label || 'Link #' + invite.id;
function inviteStateBadge(ctx, invite) {
  if (invite.holder_state === 'used') return `<span class="badge green">Đã dùng</span><span class="subtext">${ctx.escape(invite.holder_name || invite.holder_email)}</span>`;
  if (invite.holder_state === 'assigned') return `<span class="badge blue">Đã giao</span><span class="subtext">${ctx.escape(invite.holder_name || invite.holder_email)}</span>`;
  if (invite.holder_state === 'sent') return `<span class="badge amber">Đã gửi</span><span class="subtext">Lúc ${ctx.date(invite.sent_at)}</span>`;
  return '<span class="badge">Sẵn sàng</span>';
}
// Đã gửi: ticked by the owner after sending a link by hand, so it is not given to a second customer.
function sentToggle(ctx, invite) {
  const locked = ['used', 'assigned'].includes(invite.holder_state);
  return `<label class="lookup-sent" title="${locked ? 'Link đang giao hoặc đã dùng' : 'Tick khi đã gửi link này cho khách để không gửi nhầm cho người khác'}"><input type="checkbox" data-action="invite-sent" data-id="${invite.id}" ${invite.sent_at ? 'checked' : ''} ${locked ? 'disabled' : ''}> Đã gửi</label>`;
}
function expiryText(ctx, invite) {
  if (!invite.sent_on) return '<span class="subtext">Chưa nhập ngày gửi</span>';
  const left = Math.round((Date.parse(invite.expires_on) - Date.parse(ctx.state.today)) / 86400000);
  const badge = left < 0 ? `<span class="badge red">Đã hết hạn</span>` : left <= 2 ? `<span class="badge amber">Còn ${left} ngày</span>` : `<span class="badge green">Còn ${left} ngày</span>`;
  return `<strong class="date-value">${ctx.day(invite.expires_on)}</strong><span class="subtext">${badge}</span>`;
}
function inviteTable(ctx, invites) {
  const { escape, btn } = ctx;
  if (!invites.length) return '<p class="muted">Chưa có link mời. Gửi lời mời từ tài khoản chủ Family tới các mail của bạn (ví dụ mail+1, mail+2…), rồi dán link nút <strong>Chấp nhận lời mời</strong> vào đây.</p>';
  return `<div class="table-wrap"><table class="lookup-table"><thead><tr><th scope="col">LINK MỜI</th><th scope="col">LỜI MỜI HẾT HẠN</th><th scope="col">TRẠNG THÁI</th><th scope="col">THAO TÁC</th></tr></thead><tbody>${invites.map(i => `<tr><td data-column="invite"><strong>${escape(inviteName(ctx, i))}</strong><span class="subtext lookup-url">${escape(i.url)}</span></td><td data-column="expiry" class="date-cell">${expiryText(ctx, i)}</td><td data-column="state">${inviteStateBadge(ctx, i)}<div class="lookup-sent-row">${sentToggle(ctx, i)}</div></td><td data-column="actions"><div class="row-actions">${ctx.copyButton(i.url, 'link mời', 'Copy link')}${btn('invite-edit', 'Sửa', 'secondary tiny', `data-id="${i.id}"`)}${i.holder_state === 'assigned' ? '' : btn('invite-delete', 'Xóa', 'danger tiny', `data-id="${i.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function moveBadge(ctx, move) {
  const [color, text] = moveStates[move.effective_state] || ['', move.effective_state];
  const report = move.effective_state === 'failed' ? `<span class="subtext">${ctx.escape(reportLabels[move.report_reason] || move.report_reason)}${move.report_note ? ' · ' + ctx.escape(move.report_note) : ''}</span><span class="subtext">Báo lúc ${ctx.date(move.reported_at)}</span>` : '';
  return `<span class="badge ${color}">${text}</span>${report}`;
}
function moveTable(ctx, moves, showTarget = false) {
  const { escape, btn, state } = ctx;
  if (!moves.length) return '<p class="muted">Chưa có khách chuyển nhóm.</p>';
  return `<div class="table-wrap"><table class="lookup-table"><thead><tr><th scope="col">KHÁCH</th><th scope="col">${showTarget ? 'TỪ → ĐẾN' : 'TỪ FAMILY'}</th><th scope="col">LINK</th><th scope="col">TIẾN ĐỘ</th><th scope="col">THAO TÁC</th></tr></thead><tbody>${moves.map(move => {
    const open = ['assigned', 'opened', 'failed'].includes(move.effective_state);
    const message = open ? moveMessage(state, move) : '';
    const actions = open
      ? (message ? ctx.copyButton(message, 'tin nhắn gửi khách', 'Copy tin nhắn') : '') + btn('move-joined', 'Đã vào', 'primary tiny', `data-id="${move.id}"`) + ctx.moreActions('Thao tác khác cho ' + (move.customer_name || move.email), btn('move-reassign', 'Đổi link', 'secondary tiny', `data-id="${move.id}"`) + btn('move-release', 'Thu hồi link', 'danger tiny', `data-id="${move.id}"`))
      : btn('move-dismiss', 'Ẩn', 'secondary tiny', `data-id="${move.id}"`) + (move.effective_state === 'stale' ? btn('move-release', 'Thu hồi link', 'secondary tiny', `data-id="${move.id}"`) : '');
    return `<tr><td data-column="customer">${ctx.customerInfo({ customer_name: move.customer_name, email: move.email }, false)}</td><td data-column="family">${isJoin(move) ? '<span class="subtext">Khách mới · tự nhận link</span>' : escape(move.from_family_name)}${showTarget ? ` → <a class="email-link" href="#family/${move.to_family_id}">${escape(move.to_family_name)}</a>` : ''}</td><td data-column="invite">${escape(move.invite_label || (move.invite_id ? 'Link #' + move.invite_id : '—'))}</td><td data-column="state">${moveBadge(ctx, move)}<span class="subtext">Cập nhật ${ctx.date(move.updated_at)}</span></td><td data-column="actions"><div class="row-actions">${actions}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

export function familyLookupSections(ctx, family) {
  if (!ctx.state.lookup_supported) return '';
  const { state, escape, btn } = ctx;
  const status = familyStatus(state, family.id), members = state.members.filter(m => m.family_id === family.id);
  const movable = members.filter(m => m.expiry_status !== 'expired').length, expired = members.length - movable;
  const invites = (state.invites || []).filter(i => i.family_id === family.id), ready = invites.filter(i => i.holder_state === 'ready').length;
  const incoming = (state.moves || []).filter(m => m.to_family_id === family.id);
  const callout = problem(status.status) && members.length ? `<div class="notice lookup-callout"><div><strong>Nhóm đang có sự cố.</strong> ${movable} khách còn hạn có thể chuyển sang nhóm mới${expired ? `, ${expired} khách đã quá hạn sẽ thấy lời nhắc gia hạn` : ''}.</div>${btn('move-open', 'Chuyển khách sang nhóm mới', 'primary', `data-id="${family.id}"`)}</div>` : '';
  return `<section class="card lookup-card"><div class="section-heading"><div><h2>Trạng thái cho khách</h2><p>Khách thấy trạng thái và lời nhắn này trên trang tra cứu.</p></div><div class="row-actions">${btn('family-status', 'Đổi trạng thái', 'secondary', `data-id="${family.id}"`)}</div></div><div class="lookup-status"><span class="badge ${statusColors[status.status]}">${escape(familyStatusLabels[status.status])}</span>${status.updated_at ? `<span class="subtext">Cập nhật ${ctx.date(status.updated_at)}</span>` : ''}<p>${escape(status.note || 'Chưa có lời nhắn cho khách.')}</p></div>${callout}</section>`
    + (problem(status.status) && !invites.length ? '' : `<section class="card lookup-card"><div class="section-heading"><div><h2>Link mời vào Family này <span class="section-count">${ready}/${invites.length}</span></h2><p>Khách <strong>Đã mời, chưa vào</strong> hoặc <strong>Mua mới</strong> của Family này tra cứu Gmail sẽ tự nhận một link Sẵn sàng; link khách đã xem được tự tick <strong>Đã gửi</strong> và không giao cho ai khác. ${state.gmail_import ? 'Google gửi thư mời mới thì bấm Lấy link mời; web tự thay link chưa dùng của đúng Gmail nhận thư.' : 'Google đổi link thì bấm Sửa và dán link mới.'}</p></div><div class="row-actions">${genMenu(ctx, family)}${state.gmail_import ? btn('invite-mails-fetch', 'Lấy link mời', 'primary', `data-id="${family.id}" title="Đọc thư mời trong Gmail và hiện link của từng mail đã tạo"`) : ''}${btn('invite-add', '+ Thêm link mời', 'secondary', `data-id="${family.id}"`)}</div></div>${pendingNotice(ctx, family)}${inviteTable(ctx, invites)}</section>`)
    + (incoming.length ? `<section class="card lookup-card"><div class="section-heading"><div><h2>Khách nhận link vào Family này</h2><p>Khách chuyển đến và khách mới tự nhận link khi tra cứu. Khách bấm "Tôi đã vào được" hoặc bạn bấm Đã vào để chuyển khách sang đang ở nhóm.</p></div></div>${moveTable(ctx, incoming)}</section>` : '');
}

export function lookupPage(ctx) {
  const { state, escape, btn } = ctx;
  if (!state.lookup_supported) return ctx.empty('Bản này chưa hỗ trợ trang tra cứu', 'Cập nhật ứng dụng lên bản mới nhất.');
  const settings = state.lookup_settings || {}, incidents = state.families.filter(f => problem(familyStatus(state, f.id).status));
  const moves = state.moves || [], waiting = moves.filter(m => ['assigned', 'opened', 'failed'].includes(m.effective_state)), failed = moves.filter(m => m.effective_state === 'failed');
  const link = lookupPageUrl();
  return ctx.hero('TRA CỨU KHÁCH', 'Tra cứu & chuyển nhóm', 'Khách nhập Gmail và mã tra cứu để xem tình trạng nhóm và lấy link vào nhóm mới.', ctx.copyButton(link, 'link trang tra cứu', 'Copy link trang') + ` <a class="secondary link-button" href="/tra-cuu.html" target="_blank" rel="noopener">Mở trang khách</a>` + (state.gmail_import ? ' ' + gmailButton(ctx) : ''))
    + `<div class="dashboard-summary stats"><div class="card stat"><h2>Family có sự cố</h2><strong>${incidents.length}</strong></div><div class="card stat"><h2>Khách chờ vào nhóm</h2><strong>${waiting.length}</strong></div><div class="card stat"><h2>Khách báo không vào được</h2><strong>${failed.length}</strong></div></div>`
    + `<section class="card"><div class="section-heading"><div><h2>Family có sự cố</h2><p>Đặt trạng thái trong trang chi tiết Family.</p></div></div>${incidents.length ? `<div class="table-wrap"><table class="lookup-table"><thead><tr><th scope="col">FAMILY</th><th scope="col">TRẠNG THÁI</th><th scope="col">KHÁCH</th><th scope="col"></th></tr></thead><tbody>${incidents.map(f => { const s = familyStatus(state, f.id); return `<tr><td data-column="family"><a class="email-link" href="#family/${f.id}">${escape(f.name)}</a><span class="subtext">${escape(f.manager_email)}</span></td><td data-column="state"><span class="badge ${statusColors[s.status]}">${escape(familyStatusLabels[s.status])}</span><span class="subtext">${escape(s.note)}</span></td><td data-column="members">${familyOccupancy(state.members, f.id).label}</td><td data-column="actions"><a class="primary link-button tiny" href="#family/${f.id}">Mở Family</a></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Tất cả Family đang hoạt động bình thường.</p>'}</section>`
    + `<section class="card"><div class="section-heading"><div><h2>Khách đang chuyển nhóm</h2><p>Thứ tự mới nhất trước. Ẩn các lượt đã xong để danh sách gọn.</p></div></div>${moveTable(ctx, moves, true)}</section>`
    + `<section class="card"><div class="section-heading"><div><h2>Thông tin hiển thị cho khách</h2><p>Tên shop và link liên hệ xuất hiện trên trang tra cứu.</p></div><div class="row-actions">${btn('lookup-settings', 'Sửa thông tin', 'secondary')}</div></div><div class="list-item"><strong>Tên shop</strong><p>${escape(settings.shop_name || 'Chưa đặt')}</p></div><div class="list-item"><strong>Link liên hệ</strong><p>${settings.contact_url ? `<a class="contact-link" href="${escape(settings.contact_url)}" target="_blank" rel="noopener noreferrer">${escape(settings.contact_label || settings.contact_url)}</a>` : 'Chưa đặt'}</p></div><div class="list-item"><strong>Ghi chú cho khách</strong><p>${escape(settings.help_text || 'Chưa có')}</p></div></section>`
    + `<section class="card"><h2>Cách dùng</h2><ol class="lookup-steps"><li>Gửi mỗi khách link tra cứu riêng (menu … của khách → <strong>Copy link tra cứu</strong>), ví dụ lúc bán hoặc gia hạn.</li><li>Khi Family gặp sự cố: mở Family → <strong>Đổi trạng thái</strong> và viết lời nhắn cho khách.</li><li>Ở Family mới: gửi lời mời từ tài khoản chủ tới mail của bạn (ví dụ tenban+f09s1@gmail.com), rồi bấm <strong>Lấy link từ Gmail</strong>${state.gmail_import ? '' : ' (cần kết nối Google Sheet)'} hoặc <strong>+ Thêm link mời</strong> để dán tay.</li><li>Quay lại Family cũ → <strong>Chuyển khách sang nhóm mới</strong>. Mỗi khách nhận đúng một link.</li><li>Khách mở link tra cứu, nhập Gmail để thấy link vào nhóm mới; theo dõi tiến độ tại đây.</li></ol></section>`;
}

function statusFields(ctx, family, status) {
  const { escape } = ctx;
  return `<div class="form-field"><label for="field-status">Trạng thái nhóm</label><select id="field-status" name="status">${Object.entries(familyStatusLabels).map(([key, text]) => `<option value="${key}" ${key === status.status ? 'selected' : ''}>${escape(text)}</option>`).join('')}</select></div><div class="form-field"><label for="field-note">Lời nhắn cho khách</label><textarea id="field-note" name="note" maxlength="1000" rows="5">${escape(status.note)}</textarea></div><p class="subtext">Khách chỉ thấy tên Family, trạng thái và lời nhắn này. Không hiện mail chủ hoặc khách khác.</p>`;
}
function inviteFields(ctx, invite = {}) {
  return ctx.input('label', 'Tên link / mail nhận lời mời', 'text', invite.label || '', false, 'maxlength="200" placeholder="ví dụ shopmail+1@gmail.com"')
    + ctx.input('url', 'Link nút “Chấp nhận lời mời”', 'url', invite.url || '', true, 'maxlength="2000" placeholder="https://…" autocomplete="off"')
    + ctx.input('sent_on', 'Ngày gửi lời mời', 'date', invite.sent_on ?? ctx.state.today)
    + '<p class="subtext">Lời mời Google hết hạn sau 2 tuần. Link phải là link https của Google (myaccount.google.com, families.google.com hoặc notifications.googleapis.com).</p>';
}
function mappingRows(ctx, source, targetId) {
  const { state, escape } = ctx;
  const members = sortCustomers(state.members.filter(m => m.family_id === source.id)).sort((a, b) => (a.expiry_status === 'expired') - (b.expiry_status === 'expired'));
  const invites = readyInvites(state, targetId);
  let next = 0;
  const rows = members.map(m => {
    const pick = m.expiry_status !== 'expired' && next < invites.length ? invites[next++].id : '';
    return `<tr><td data-column="customer"><strong>${escape(m.customer_name || m.email)}</strong>${m.customer_name ? `<span class="subtext">${escape(m.email)}</span>` : ''}</td><td data-column="expiry" class="date-cell"><strong class="date-value">${ctx.day(m.expires_at)}</strong><span class="subtext">${ctx.expiryBadge(m)}</span></td><td data-column="invite"><select name="invite_${m.id}" aria-label="Link mời cho ${escape(m.customer_name || m.email)}" data-move-member="${m.id}"><option value="">Không chuyển${m.expiry_status === 'expired' ? ' (đã quá hạn)' : ''}</option>${invites.map(i => `<option value="${i.id}" ${i.id === pick ? 'selected' : ''}>${escape(inviteName(ctx, i))}${i.expires_on ? ' · hết hạn ' + ctx.day(i.expires_on) : ''}</option>`).join('')}</select></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="lookup-table"><thead><tr><th scope="col">KHÁCH</th><th scope="col">HẠN DÙNG</th><th scope="col">LINK MỜI Ở FAMILY MỚI</th></tr></thead><tbody>${rows}</tbody></table></div>${invites.length ? '' : '<p class="error-box">Family này chưa có link mời sẵn sàng. Mở Family mới và bấm + Thêm link mời trước.</p>'}`;
}
function updateMoveSummary() {
  const selects = [...document.querySelectorAll('#move-mapping select[data-move-member]')];
  const chosen = selects.map(s => s.value).filter(Boolean), duplicate = chosen.length !== new Set(chosen).size;
  $('#move-summary').textContent = duplicate ? 'Một link đang được chọn cho nhiều khách. Mỗi link chỉ giao cho một khách.' : `Chuyển ${chosen.length} khách · giữ lại ${selects.length - chosen.length} khách ở Family cũ.`;
  $('#move-summary').classList.toggle('lookup-warning', duplicate);
}
function openBulkMove(ctx, sourceId) {
  const { state, escape } = ctx;
  const source = state.families.find(f => f.id === sourceId); if (!source) return ctx.toast('Family đã thay đổi. Tải lại trang.');
  const targets = state.families.filter(f => f.id !== source.id).map(f => ({ family: f, ready: readyInvites(state, f.id).length })).sort((a, b) => b.ready - a.ready);
  if (!targets.length) return ctx.toast('Tạo Family mới và thêm link mời trước khi chuyển khách.');
  const status = familyStatus(state, source.id);
  ctx.modal('Chuyển khách sang nhóm mới', `<p>Từ <strong>${escape(source.name)}</strong> · <span class="badge ${statusColors[status.status]}">${escape(familyStatusLabels[status.status])}</span></p><div class="form-field"><label for="move-target">Family mới</label><select id="move-target" name="to_family_id">${targets.map(t => `<option value="${t.family.id}">${escape(t.family.name)} · ${escape(t.family.manager_email)} · ${t.ready} link sẵn sàng · ${familyOccupancy(state.members, t.family.id).label}</option>`).join('')}</select></div><div id="move-mapping"></div><p id="move-summary" role="status"></p><p class="subtext">Khách được chuyển ở trạng thái Đã mời, chưa vào cho đến khi khách xác nhận hoặc bạn bấm Đã vào. Giữ nguyên gói, ngày mua/hạn, Contact, thanh toán và lịch sử. Case Fix lỗi gắn với mail khách được xóa như khi Chuyển Family.</p>`, async data => {
      const fresh = ctx.state, target = fresh.families.find(f => f.id === Number(data.to_family_id));
      if (!target) throw Error('Chọn Family mới.');
      const assignments = Object.entries(data).filter(([key, value]) => key.startsWith('invite_') && value).map(([key, value]) => {
        const member = fresh.members.find(m => m.id === Number(key.slice(7))), invite = (fresh.invites || []).find(i => i.id === Number(value));
        if (!member || !invite) throw Error('Dữ liệu đã thay đổi. Đóng hộp thoại, tải lại rồi thử lại.');
        return { member_id: member.id, revision: member.renewal_revision, expected_email: member.email, invite_id: invite.id, invite_revision: invite.revision };
      });
      if (!assignments.length) throw Error('Chọn link mời cho ít nhất một khách.');
      if (new Set(assignments.map(a => a.invite_id)).size !== assignments.length) throw Error('Mỗi link chỉ giao cho một khách.');
      const result = await ctx.post('moves', { from_family_id: source.id, to_family_id: target.id, expected_manager_email: target.manager_email, assignments });
      ctx.toast(`Đã chuyển ${result.moved} khách sang ${result.family_name}. Gửi khách link tra cứu để lấy link vào nhóm.`);
      return { route: 'family/' + result.family_id };
    }, 'Chuyển khách');
  const dialog = $('#modal'); dialog.classList.add('lookup-wide'); dialog.addEventListener('close', () => dialog.classList.remove('lookup-wide'), { once: true });
  const render = () => { $('#move-mapping').innerHTML = mappingRows(ctx, source, Number($('#move-target').value)); updateMoveSummary(); };
  $('#move-target').addEventListener('change', render);
  $('#move-mapping').addEventListener('change', updateMoveSummary);
  render();
}

// Returns true when the action belongs to this module.
export async function handleLookupAction(ctx, action, button) {
  const { state } = ctx, id = Number(button.dataset.id);
  if (action === 'family-status') {
    const family = state.families.find(f => f.id === id); if (!family) return ctx.toast('Family đã thay đổi. Tải lại trang.'), true;
    const status = familyStatus(state, id);
    ctx.modal('Trạng thái cho khách · ' + family.name, statusFields(ctx, family, status), async data => {
      await ctx.patch(`families/${id}/status`, { status: data.status, note: data.note, revision: status.revision });
      ctx.toast('Đã lưu trạng thái nhóm. Khách thấy ngay trên trang tra cứu.');
    });
    $('#field-status').addEventListener('change', event => { const note = $('#field-note'); if (!note.value.trim() && statusTemplates[event.target.value]) note.value = statusTemplates[event.target.value](family.name); });
    return true;
  }
  if (action === 'invite-add') {
    const family = state.families.find(f => f.id === id); if (!family) return ctx.toast('Family đã thay đổi. Tải lại trang.'), true;
    ctx.modal('Thêm link mời · ' + family.name, inviteFields(ctx), async data => { await ctx.post(`families/${id}/invites`, data); ctx.toast('Đã thêm link mời.'); });
    return true;
  }
  if (action === 'invite-edit') {
    const invite = (state.invites || []).find(i => i.id === id); if (!invite) return ctx.toast('Link đã thay đổi. Tải lại trang.'), true;
    ctx.modal('Sửa link mời', inviteFields(ctx, invite) + (invite.holder_state === 'assigned' ? `<p class="notice">Link đang giao cho ${ctx.escape(invite.holder_name || invite.holder_email)}. Dán link mới thì khách thấy link mới ngay khi tra cứu.</p>` : ''), async data => { await ctx.patch('invites/' + id, { ...data, revision: invite.revision }); ctx.toast('Đã lưu link mời.'); });
    return true;
  }
  if (action === 'invite-delete') {
    const invite = (state.invites || []).find(i => i.id === id); if (!invite) return ctx.toast('Link đã thay đổi. Tải lại trang.'), true;
    ctx.modal('Xóa link mời?', `<p>${ctx.escape(inviteName(ctx, invite))}</p><p>Chỉ xóa link khỏi kho của Family. Lời mời trên Google vẫn còn cho đến khi hết hạn.</p>`, async () => { await ctx.api('invites/' + id, { method: 'DELETE', body: JSON.stringify({ revision: invite.revision }) }); ctx.toast('Đã xóa link mời.'); }, 'Xóa link');
    return true;
  }
  if (action === 'move-open') { openBulkMove(ctx, id); return true; }
  if (action === 'invite-sent') {
    const invite = (state.invites || []).find(i => i.id === id), sent = button.checked;
    if (!invite) { button.checked = !sent; return ctx.toast('Link đã thay đổi. Tải lại trang.'), true; }
    try { await ctx.patch(`invites/${id}/sent`, { sent, revision: invite.revision }); await ctx.refresh(); ctx.toast(sent ? 'Đã đánh dấu link đã gửi. Link này không được giao cho khách khác.' : 'Đã bỏ đánh dấu. Link quay lại trạng thái sẵn sàng.'); }
    catch (error) { button.checked = !sent; ctx.toast(error.message, 8000); }
    return true;
  }
  if (action === 'invite-mails-gen') {
    const family = state.families.find(f => f.id === id); if (!family) return ctx.toast('Family đã thay đổi. Tải lại trang.'), true;
    const menu = button.closest('details'); if (menu) menu.open = false;
    button.disabled = true;
    try { const result = await createInviteMails(ctx, family.id, button.dataset.count); await ctx.refresh(); showInviteMails(ctx, result); }
    catch (error) { ctx.toast(error.message, 8000); }
    finally { if (button.isConnected) button.disabled = false; }
    return true;
  }
  if (action === 'invite-mails-fetch') {
    const family = state.families.find(f => f.id === id); if (!family) return ctx.toast('Family đã thay đổi. Tải lại trang.'), true;
    button.disabled = true;
    try { const result = await ctx.post('sheets/gmail-invites', {}); await ctx.refresh(); showFetchedMails(ctx, ctx.state.families.find(f => f.id === id) || family, result); }
    catch (error) { ctx.toast(error.message, 12000); }
    finally { if (button.isConnected) button.disabled = false; }
    return true;
  }
  if (action === 'invites-gmail') {
    button.disabled = true;
    try { const result = await ctx.post('sheets/gmail-invites', {}); ctx.toast(gmailSummary(result), 9000); await ctx.refresh(); }
    catch (error) { ctx.toast(error.message, 12000); }
    finally { if (button.isConnected) button.disabled = false; }
    return true;
  }
  const move = (state.moves || []).find(m => m.id === id);
  if (['move-joined', 'move-release', 'move-reassign', 'move-dismiss'].includes(action) && !move) return ctx.toast('Lượt chuyển nhóm đã thay đổi. Tải lại trang.'), true;
  if (action === 'move-joined') {
    ctx.modal('Ghi nhận khách đã vào nhóm?', `${ctx.customerInfo(move, false)}<p>${ctx.escape(move.to_family_name)} · ${ctx.escape(move.invite_label)}</p><p>Khách chuyển sang đang ở nhóm và link được đánh dấu đã dùng.</p>`, async () => { await ctx.patch('moves/' + id, { action: 'joined', revision: move.revision }); ctx.toast('Đã ghi nhận khách vào nhóm.'); }, 'Đã vào nhóm');
    return true;
  }
  if (action === 'move-release') {
    ctx.modal('Thu hồi link?', `${ctx.customerInfo(move, false)}<p>Link ${ctx.escape(move.invite_label)} quay lại kho của ${ctx.escape(move.to_family_name)} để giao cho khách khác. Khách vẫn ở Family mới với trạng thái Đã mời, chưa vào; sửa hoặc chuyển khách như bình thường.</p>`, async () => { await ctx.patch('moves/' + id, { action: 'release', revision: move.revision }); ctx.toast('Đã thu hồi link về kho.'); }, 'Thu hồi link');
    return true;
  }
  if (action === 'move-reassign') {
    const invites = readyInvites(state, move.to_family_id);
    if (!invites.length) return ctx.toast(`${move.to_family_name} chưa có link sẵn sàng. Thêm link mời trước.`), true;
    ctx.modal('Đổi link cho khách', `${ctx.customerInfo(move, false)}<p>Link hiện tại: ${ctx.escape(move.invite_label || '—')}</p>` + ctx.select('invite_id', 'Link mới', Object.fromEntries(invites.map(i => [i.id, inviteName(ctx, i) + (i.expires_on ? ' · hết hạn ' + ctx.day(i.expires_on) : '')])), invites[0].id) + '<p class="subtext">Link cũ quay lại kho. Nếu link cũ đã bị dùng, hãy xóa nó khỏi kho.</p>', async data => {
      const invite = (ctx.state.invites || []).find(i => i.id === Number(data.invite_id)); if (!invite) throw Error('Chọn link mới.');
      await ctx.patch('moves/' + id, { action: 'reassign', invite_id: invite.id, invite_revision: invite.revision, revision: move.revision }); ctx.toast('Đã đổi link cho khách.');
    }, 'Đổi link');
    return true;
  }
  if (action === 'move-dismiss') { await ctx.patch('moves/' + id, { action: 'dismiss', revision: move.revision }); await ctx.refresh(); return true; }
  if (action === 'lookup-rotate') {
    const address = button.dataset.email;
    ctx.modal('Đổi mã tra cứu?', `<p>${ctx.escape(address)}</p><p>Mã cũ và link tra cứu cũ hết tác dụng ngay; khách đang mở trang sẽ phải nhập lại. Dùng khi mã bị lộ hoặc gửi nhầm người.</p>`, async () => {
      const result = await ctx.post('lookup-codes', { email: address }); ctx.toast(`Mã mới của ${result.email}: ${result.code}. Copy link tra cứu để gửi lại cho khách.`, 10000);
    }, 'Đổi mã');
    return true;
  }
  if (action === 'lookup-settings') {
    const s = state.lookup_settings || {};
    ctx.modal('Thông tin trang tra cứu', ctx.input('shop_name', 'Tên shop', 'text', s.shop_name, false, 'maxlength="100"') + ctx.input('contact_url', 'Link liên hệ (Messenger, Zalo…)', 'url', s.contact_url, false, 'maxlength="500" placeholder="https://m.me/…"') + ctx.input('contact_label', 'Chữ trên nút liên hệ', 'text', s.contact_label, false, 'maxlength="60" placeholder="Nhắn shop"') + `<div class="form-field"><label for="field-help_text">Ghi chú cho khách</label><textarea id="field-help_text" name="help_text" maxlength="500" placeholder="ví dụ Shop phản hồi trong 30 phút, 8h–22h.">${ctx.escape(s.help_text)}</textarea></div>`, async data => { await ctx.patch('lookup-settings', data); ctx.toast('Đã lưu thông tin trang tra cứu.'); });
    return true;
  }
  return false;
}
