// Tra cứu & chuyển nhóm — admin side: Family status shown to customers, invite link pools,
// bulk moves (one invite per customer), move progress and the customer lookup page settings.
import { familyStatusLabels, inviteExpiry, familyOccupancy, sortCustomers } from './domain.js';

const $ = selector => document.querySelector(selector);
const statusColors = { active: 'green', checking: 'amber', scanned: 'amber', disabled: 'red' };
const problem = status => status && status !== 'active';
const moveStates = {
  // Giving the customer their link is the end of the shop's work; joining is not tracked.
  assigned: ['blue', 'Đã giao link'], opened: ['green', 'Khách đã mở link'], failed: ['blue', 'Đã giao link'],
  joined: ['green', 'Đã vào nhóm'], cancelled: ['', 'Đã thu hồi link'], stale: ['', 'Khách đã chuyển hoặc bị xóa'],
  waiting: ['amber', 'Chờ link · khách tra cứu là nhận']
};
export const reportLabels = { twelve_months: 'Google báo chỉ được đổi nhóm 1 lần trong 12 tháng', invite_used: 'Lời mời đã dùng hoặc hết hạn', other_family: 'Khách đang ở nhóm gia đình khác', other: 'Lỗi khác' };
const statusTemplates = {
  checking: name => `Shop đang kiểm tra sự cố của ${name}. Bạn chưa cần làm gì, shop sẽ cập nhật tại đây.`,
  scanned: name => `${name} bị Google quét nên một số thành viên mất Premium. Shop đang chuyển bạn sang nhóm mới, hạn dùng giữ nguyên.`,
  disabled: name => `Tài khoản chủ của ${name} bị Google vô hiệu hoá. Shop đang chuyển bạn sang nhóm mới, hạn dùng giữ nguyên.`
};

// The page link the shop shares: the short link when one is set (beeflix.vn/haiytb), else this site.
export const lookupPageUrl = (state = {}) => { const base = state.lookup_settings?.short_domain; return base ? (/^https?:\/\/[^/]+\/./.test(base) ? base : base + '/') : location.origin + '/tra-cuu.html'; };
export function familyStatus(state, familyId) {
  return (state.family_statuses || []).find(s => s.family_id === familyId) || { family_id: familyId, status: 'active', note: '', updated_at: '', revision: 0 };
}
const codeOf = (state, address) => state.lookup_codes?.[address] || '';
// Short link the shop sends: https://domain/?K7P2QX (older #ma= links keep working).
// With a path (beeflix.vn/haiytb) the code follows directly: beeflix.vn/haiytb?K7P2QX.
const personalLink = (state, code) => { const base = state.lookup_settings?.short_domain || location.origin; return /^https?:\/\/[^/]+\/./.test(base) ? `${base}?${code}` : `${base}/?${code}`; };
export function lookupMessage(state, member) {
  const code = codeOf(state, member.email); if (!code) return '';
  return `Link tra cứu Family của bạn: ${personalLink(state, code)}\nGmail: ${member.email} · Mã tra cứu: ${code}\nKhi YouTube Premium có vấn đề, mở link bằng Chrome hoặc Safari để xem tình trạng nhóm và nhận link vào nhóm mới.`;
}
const isJoin = move => move.from_family_id == null && !move.from_family_name;
function moveMessage(state, move) {
  const code = codeOf(state, move.email); if (!code) return '';
  // Customers never see Family names (the shop names them to remember them).
  if (isJoin(move)) return `Chào bạn, link vào nhóm của bạn ở đây. Mở bằng Chrome hoặc Safari, nhập Gmail ${move.email}: ${personalLink(state, code)}\nMã tra cứu: ${code}`;
  return `Chào bạn, nhóm YouTube của bạn đang gặp sự cố nên shop đã chuẩn bị nhóm mới, hạn dùng giữ nguyên. Mở link này bằng Chrome hoặc Safari, nhập Gmail ${move.email} để lấy link vào nhóm mới: ${personalLink(state, code)}\nMã tra cứu: ${code}`;
}
// Result of Lấy link từ Gmail (button and the 10-minute check in sheets.js).
export function gmailSummary(result) {
  const parts = [];
  if (result.added) parts.push(`thêm ${result.added} link`);
  if (result.updated) parts.push(`cập nhật ${result.updated} link`);
  let text = parts.length ? `Đã ${parts.join(', ')} từ Gmail${result.families?.length ? ' cho ' + result.families.join(', ') : ''}.` : result.found ? 'Link mời trong Gmail đã có đủ trên web.' : 'Không thấy thư mời Family nào trong 14 ngày qua.';
  if (result.assigned) text += ` Đã gán ${result.assigned} link cho khách trong Family.`;
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
  const autoNote = result.auto_assign ? (result.targets?.length
    ? `<p class="notice">Family chưa có link nào: khi link về, web tự gán sẵn cho ${result.targets.length} khách theo thứ tự — ${result.targets.map(t => `<strong>${escape(t.name || t.email)}</strong>`).join(', ')}. Khách tra cứu sẽ thấy đúng link của mình.</p>`
    : state.members.some(m => m.family_id === result.family_id)
      ? '<p class="notice">Khách trong Family đều là <strong>Mua mới</strong> hoặc <strong>Đã mời, chưa vào</strong> nên không gán sẵn: link về nằm trong kho và khách tự nhận link khi tra cứu Gmail.</p>'
      : '<p class="notice">Family chưa có khách để gán link. Link về sẽ nằm trong kho; sau khi thêm khách, bấm <strong>Gán mail</strong> ở một link → <strong>Gán link cho khách trong Family</strong>.</p>') : '';
  ctx.modal('Mail mời · ' + result.family_name, `<p>Đã tạo ${result.mails.length} mail mời mới.</p>${autoNote}<div class="lookup-mail-list">${result.mails.map(address => `<div class="info-line"><strong class="info-text">${escape(address)}</strong>${ctx.copyButton(address, 'mail mời')}</div>`).join('')}</div><div class="row-actions">${ctx.copyButton(all, 'tất cả mail mời', 'Copy tất cả mail')}</div>`
    + `<ol class="lookup-steps"><li>Đăng nhập tài khoản chủ Family${family ? ` <strong>${escape(family.manager_email)}</strong>` : ''}, mở trang quản lý nhóm gia đình và mời các mail trên.</li><li>${state.gmail_import ? 'Quay lại Family này, bấm <strong>Lấy link mời</strong>: web hiện link của từng mail và lưu vào kho link.' : 'Mở từng thư mời trong Gmail, chuột phải nút Accept invitation → sao chép link, rồi bấm <strong>+ Thêm link mời</strong>.'}</li></ol>`, async () => {}, 'Đóng');
}
function fetchedMailsTable(ctx, familyId) {
  const { state, escape } = ctx, mails = recentMails(state, familyId);
  if (!mails.length) return '<p class="muted">Family này chưa có mail mời tạo trong 14 ngày qua. Bấm Gen mail mời để tạo.</p>';
  const rows = mails.map(m => {
    const invite = inviteFor(state, m.email), elsewhere = invite && invite.family_id !== familyId ? state.families.find(f => f.id === invite.family_id) : null;
    const status = !invite ? '<span class="badge amber">Chưa thấy thư mời</span>' : inviteStateBadge(ctx, invite) + (elsewhere ? `<span class="subtext">Lưu ở ${escape(elsewhere.name)} vì thư được mời từ chủ Family đó</span>` : '');
    return `<tr><td data-column="mail"><div class="info-line"><strong class="info-text">${escape(m.email)}</strong>${ctx.copyButton(m.email, 'mail mời')}</div></td><td data-column="invite">${invite ? `<span class="subtext lookup-url">${escape(invite.url)}</span>` : '<span class="subtext">—</span>'}</td><td data-column="state">${status}</td><td data-column="actions">${invite ? ctx.copyButton(invite.url, 'link mời', 'Copy link') : ''}</td></tr>`;
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
  const { escape, state } = ctx;
  // Mails made for a Family with no link yet: show who each arriving link will go to.
  const targets = linkTargets(state, family.id), plan = new Map(), auto = mails.filter(m => m.auto_assign).sort((a, b) => a.id - b.id);
  auto.forEach((m, k) => plan.set(m.id, targets[k]?.member || null));
  const waitingNew = state.members.some(m => m.family_id === family.id && ['invited', 'new'].includes(m.membership_status));
  const planText = m => !plan.has(m.id) ? '' : plan.get(m.id) ? `<span class="pending-plan">→ gán cho <strong class="invite-recipient">${escape(plan.get(m.id).email)}</strong></span>` : `<span class="pending-plan muted">→ để trong kho${waitingNew ? ' (khách Mua mới / Đã mời, chưa vào tự nhận khi tra cứu)' : ''}</span>`;
  return `<div class="notice lookup-callout lookup-pending-mails"><div><strong>${mails.length} mail chờ lấy link</strong><span class="subtext">Mời các mail này từ tài khoản chủ ${escape(family.manager_email)}, rồi bấm ${ctx.state.gmail_import ? 'Lấy link mời' : '+ Thêm link mời để dán link'}.</span><div class="lookup-mail-list">${mails.map(m => `<div class="info-line"><span class="info-text">${escape(m.email)}</span>${ctx.copyButton(m.email, 'mail mời')}<button type="button" class="copy-info lookup-mail-delete" data-action="invite-mails-delete" data-id="${family.id}" data-mails="${m.id}" title="Xóa ${escape(m.email)}" aria-label="Xóa ${escape(m.email)}">×</button>${planText(m)}</div>`).join('')}</div></div><div class="row-actions lookup-pending-actions">${ctx.copyButton(mails.map(m => m.email).join(', '), 'tất cả mail chờ mời', 'Copy tất cả mail')}${ctx.btn('invite-mails-delete', mails.length > 1 ? 'Xóa tất cả' : 'Xóa mail', 'danger tiny', `data-id="${family.id}" data-mails="${mails.map(m => m.id).join(',')}"`)}</div></div>`;
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
// Same rule as the server: customers not "Đã mời, chưa vào" / "Mua mới", holding or having used no link of this Family; waiting ones first.
function linkTargets(state, familyId) {
  const list = state.members.filter(m => m.family_id === familyId && !['invited', 'new'].includes(m.membership_status)).sort((a, b) => a.id - b.id).map(member => {
    const move = (state.moves || []).filter(mv => mv.member_id === member.id && mv.to_family_id === familyId && mv.state !== 'cancelled').sort((a, b) => b.id - a.id)[0] || null;
    return { member, move };
  }).filter(({ move }) => !move || (['assigned', 'opened', 'failed'].includes(move.state) && move.invite_id == null));
  return [...list.filter(t => t.move), ...list.filter(t => !t.move)];
}
const linkPairs = (state, familyId) => { const targets = linkTargets(state, familyId); return readyInvites(state, familyId).filter(i => !i.sent_at).sort((a, b) => a.id - b.id).slice(0, targets.length).map((invite, k) => ({ invite, member: targets[k].member })); };
const inviteName = (ctx, invite) => invite.label || 'Link #' + invite.id;
// Once a customer joined with a link, the row shows that customer's Gmail instead of the + address.
// Gán mail: customers the shop noted on this link by hand, shown right after the invite mail.
const recipientsOf = invite => { try { const list = JSON.parse(invite.recipients || '[]'); return Array.isArray(list) ? list.filter(r => r && typeof r.email === 'string') : []; } catch { return []; } };
// The customer the web handed the link to (lookup or move) shows the same way, without duplicates.
const shownRecipients = invite => {
  const list = recipientsOf(invite);
  if (['assigned', 'used'].includes(invite.holder_state) && invite.holder_email && !list.some(r => r.email === invite.holder_email)) list.unshift({ email: invite.holder_email, name: invite.holder_name || '' });
  return list;
};
const notedLinks = (state, address) => (state.invites || []).filter(i => i.holder_state !== 'retired' && recipientsOf(i).some(r => r.email === address));
const recipientLine = (ctx, invite) => {
  const list = shownRecipients(invite); if (!list.length) return '';
  return `<span class="invite-sep" aria-hidden="true">–</span><span class="invite-recipients" title="Mail khách đã gán cho link này">${list.map(r => `<strong class="invite-recipient">${ctx.escape(r.email)}</strong>${r.name ? `<span class="invite-recipient-name"> (${ctx.escape(r.name)})</span>` : ''}`).join('<span class="invite-recipient-comma">, </span>')}</span>`;
};
const inviteTitle = (ctx, invite) => `<div class="invite-title"><strong>${ctx.escape(inviteName(ctx, invite))}</strong>${recipientLine(ctx, invite)}</div>`;
function inviteStateBadge(ctx, invite) {
  if (invite.holder_state === 'retired') return `<span class="badge">Link chủ cũ</span><span class="subtext">Không giao cho khách</span>`;
  if (invite.holder_state === 'used') return `<span class="badge green">Đã dùng</span><span class="subtext">${ctx.escape(invite.holder_name || invite.holder_email)}</span>`;
  // Đã gửi is set by the web itself: a link handed to a customer (lookup page or a move).
  if (invite.holder_state === 'assigned') return `<span class="badge amber">Đã gửi</span><span class="subtext">${ctx.escape(invite.holder_name || invite.holder_email)}</span><span class="subtext">${invite.sent_at ? 'Khách đã xem lúc ' + ctx.date(invite.sent_at) : 'Khách chưa mở trang tra cứu'}</span>`;
  if (invite.holder_state === 'sent') return `<span class="badge amber">Đã gửi</span><span class="subtext">Lúc ${ctx.date(invite.sent_at)} · không giao lại</span>`;
  return '<span class="badge">Sẵn sàng</span>';
}
// A link that was shown to someone and is no longer held (e.g. after Đổi link) stays out of
// the pool until the owner puts it back.
// Checking a link: open it with a Gmail that is in no family group (private tab). "You're invited"
// means nobody used it yet; "no longer valid" means someone joined with it.
const unsendButton = (ctx, invite) => {
  const open = ['ready', 'sent', 'assigned'].includes(invite.holder_state) ? `<a class="secondary link-button tiny" href="${ctx.escape(invite.url)}" target="_blank" rel="noopener noreferrer" title="Mở bằng Gmail không ở nhóm gia đình nào, trong tab ẩn danh">Mở để kiểm tra</a>` : '';
  if (invite.holder_state === 'ready') return open + ctx.btn('invite-mark-used', 'Đã dùng', 'secondary tiny', `data-id="${invite.id}" title="Google báo lời mời không còn hiệu lực: không giao link này nữa"`);
  if (invite.holder_state === 'sent') return open + ctx.btn('invite-unsend', 'Còn dùng được', 'secondary tiny', `data-id="${invite.id}" title="Google vẫn hiện lời mời: đưa lại vào kho cho khách khác"`);
  if (invite.holder_state === 'assigned') return open + ctx.btn('move-unassign', 'Còn dùng được', 'secondary tiny', `data-id="${invite.holder_move_id}" title="Google vẫn hiện lời mời: khách chưa vào, đưa link cho khách khác"`);
  return '';
};
function expiryText(ctx, invite) {
  if (!invite.sent_on) return '<span class="subtext">Chưa nhập ngày gửi</span>';
  const left = Math.round((Date.parse(invite.expires_on) - Date.parse(ctx.state.today)) / 86400000);
  const badge = left < 0 ? `<span class="badge red">Đã hết hạn</span>` : left <= 2 ? `<span class="badge amber">Còn ${left} ngày</span>` : `<span class="badge green">Còn ${left} ngày</span>`;
  return `<strong class="date-value">${ctx.day(invite.expires_on)}</strong><span class="subtext">${badge}</span>`;
}
function inviteTable(ctx, invites) {
  const { escape, btn } = ctx;
  if (!invites.length) return '<p class="muted">Chưa có link mời. Gửi lời mời từ tài khoản chủ Family tới các mail của bạn (ví dụ mail+1, mail+2…), rồi dán link nút <strong>Chấp nhận lời mời</strong> vào đây.</p>';
  return `<div class="table-wrap"><table class="lookup-table"><thead><tr><th scope="col">LINK MỜI</th><th scope="col">LỜI MỜI HẾT HẠN</th><th scope="col">TRẠNG THÁI</th><th scope="col">THAO TÁC</th></tr></thead><tbody>${invites.map(i => `<tr><td data-column="invite">${inviteTitle(ctx, i)}<span class="subtext lookup-url">${escape(i.url)}</span></td><td data-column="expiry" class="date-cell">${expiryText(ctx, i)}</td><td data-column="state">${inviteStateBadge(ctx, i)}</td><td data-column="actions"><div class="row-actions">${unsendButton(ctx, i)}${ctx.copyButton(i.url, 'link mời', 'Copy link')}${btn('invite-recipients', recipientsOf(i).length ? 'Sửa mail gán' : 'Gán mail', 'secondary tiny', `data-id="${i.id}" title="Ghi lại mail khách bạn đã gửi link này"`)}${ctx.moreActions('Thao tác khác cho ' + inviteName(ctx, i), btn('invite-edit', 'Sửa link', 'secondary tiny', `data-id="${i.id}"`) + (i.holder_state === 'assigned' ? '' : btn('invite-delete', 'Xóa link', 'danger tiny', `data-id="${i.id}"`)))}</div></td></tr>`).join('')}</tbody></table></div>`;
}
function moveBadge(ctx, move) {
  const key = move.effective_state === 'assigned' && move.invite_id == null ? 'waiting' : move.effective_state;
  const [color, text] = moveStates[key] || ['', move.effective_state];
  return `<span class="badge ${color}">${text}</span>`;
}
function moveTable(ctx, moves, showTarget = false) {
  const { escape, btn, state } = ctx;
  if (!moves.length) return '<p class="muted">Chưa có khách chuyển nhóm.</p>';
  return `<div class="table-wrap"><table class="lookup-table"><thead><tr><th scope="col">KHÁCH</th><th scope="col">${showTarget ? 'TỪ → ĐẾN' : 'TỪ FAMILY'}</th><th scope="col">LINK</th><th scope="col">TIẾN ĐỘ</th><th scope="col">THAO TÁC</th></tr></thead><tbody>${moves.map(move => {
    const open = ['assigned', 'opened', 'failed'].includes(move.effective_state);
    const message = open ? moveMessage(state, move) : '';
    const actions = open
      ? (message ? ctx.copyButton(message, 'tin nhắn gửi khách', 'Copy tin nhắn') : '') + ctx.moreActions('Thao tác khác cho ' + (move.customer_name || move.email), move.invite_id == null
        ? btn('move-reassign', 'Chọn link cho khách', 'secondary tiny', `data-id="${move.id}"`) + btn('move-release', 'Bỏ chờ link', 'danger tiny', `data-id="${move.id}"`)
        : btn('move-reassign', 'Đổi link', 'secondary tiny', `data-id="${move.id}"`) + btn('move-release', 'Thu hồi link', 'danger tiny', `data-id="${move.id}"`))
      : btn('move-dismiss', 'Ẩn', 'secondary tiny', `data-id="${move.id}"`) + (move.effective_state === 'stale' ? btn('move-release', 'Thu hồi link', 'secondary tiny', `data-id="${move.id}"`) : '');
    return `<tr><td data-column="customer">${ctx.customerInfo({ customer_name: move.customer_name, email: move.email }, false)}</td><td data-column="family">${isJoin(move) ? '<span class="subtext">Khách mới · tự nhận link</span>' : escape(move.from_family_name)}${showTarget ? ` → <a class="email-link" href="#family/${move.to_family_id}">${escape(move.to_family_name)}</a>` : ''}</td><td data-column="invite">${move.invite_id ? escape(move.invite_label || 'Link #' + move.invite_id) : (noted => noted.length ? `${noted.map(i => `<strong class="invite-recipient">${escape(inviteName(ctx, i))}</strong>`).join('<br>')}<span class="subtext">Đã gán mail ở bảng link Family</span>` : '—')(notedLinks(state, move.email))}</td><td data-column="state">${moveBadge(ctx, move)}<span class="subtext">Cập nhật ${ctx.date(move.updated_at)}</span></td><td data-column="actions"><div class="row-actions">${actions}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

// ---- Khách báo mất Premium (customer reports) ----
const openReports = state => (state.customer_reports || []).filter(r => !r.handled_at);
const reasonLabel = (state, reason) => (state.problem_reasons || {})[reason] || reason;
export function customerReportsCount(state) { return openReports(state).length; }
export function customerReportsNotice(ctx) {
  const count = openReports(ctx.state).length; if (!count) return '';
  const families = new Set(openReports(ctx.state).map(r => r.family_id)).size;
  return `<a class="notice report-alert" href="#issues"><span class="report-alert-dot" aria-hidden="true"></span><span><strong>${count} khách báo mất Premium</strong><span class="subtext">${families > 1 ? `Ở ${families} Family. ` : ''}Mở Fix lỗi để xem và xử lý.</span></span></a>`;
}
export function customerReportsSection(ctx) {
  const { state, escape, btn } = ctx, rows = openReports(state);
  const tg = state.telegram || {};
  const hint = tg.enabled ? '' : `<p class="subtext">Muốn biết ngay khi khách báo? ${btn('telegram-setup', 'Cài thông báo Telegram', 'secondary tiny')}</p>`;
  if (!rows.length) return state.lookup_supported && !tg.enabled ? `<section class="card report-card report-card-empty"><div class="section-heading"><div><h2>Khách báo mất Premium</h2><p>Khách tra cứu Gmail thấy nhóm vẫn bình thường mà mất Premium thì bấm báo cho shop. Báo lỗi hiện ở đây.</p></div></div>${hint}</section>` : '';
  const groups = [...new Map(rows.map(r => [r.family_id, []])).keys()].map(id => ({ id, rows: rows.filter(r => r.family_id === id) }));
  return `<section class="card report-card"><div class="section-heading"><div><h2>Khách báo mất Premium <span class="section-count">${rows.length}</span></h2><p>Nhiều khách cùng một Family báo thì thường là mail chủ bị quét: bấm <strong>Báo lỗi mail chủ</strong>. Nếu chỉ một khách bị, xử lý xong bấm <strong>Đã xử lý</strong> và để lại lời nhắn cho khách.</p></div></div>${hint}`
    + groups.map(group => {
      const family = state.families.find(f => f.id === group.id);
      const name = family ? family.name : group.rows[0].family_name;
      return `<div class="report-group"><div class="report-group-head"><div><strong>${family ? `<a class="email-link" href="#family/${family.id}">${escape(name)}</a>` : escape(name)}</strong>${family ? `<span class="subtext">${escape(family.manager_email)}</span>` : ''}</div><div class="row-actions">${family ? btn('report-family', 'Báo lỗi mail chủ', 'primary tiny', `data-id="${family.id}"`) : ''}${group.rows.length > 1 ? btn('customer-reports-handle', 'Đã xử lý tất cả', 'secondary tiny', `data-ids="${group.rows.map(r => r.id).join(',')}"`) : ''}</div></div>`
        + group.rows.map(r => `<div class="report-row"><div class="report-who">${ctx.customerInfo({ customer_name: (state.members.find(m => m.id === r.member_id) || {}).customer_name || '', email: r.email }, false)}</div><div class="report-what"><span class="badge amber">${escape(reasonLabel(state, r.reason))}</span>${r.note ? `<span class="subtext">“${escape(r.note)}”</span>` : ''}<span class="subtext">Báo lúc ${ctx.date(r.created_at)}</span></div><div class="row-actions">${btn('customer-reports-handle', 'Đã xử lý', 'secondary tiny', `data-ids="${r.id}"`)}</div></div>`).join('')
        + '</div>';
    }).join('') + '</section>';
}
function telegramCard(ctx) {
  const { state, escape, btn } = ctx, tg = state.telegram || {};
  return `<section class="card"><div class="section-heading"><div><h2>Thông báo Telegram</h2><p>${tg.enabled ? `Khi khách báo mất Premium, bot <strong>@${escape(tg.bot)}</strong> nhắn ngay cho <strong>${escape(tg.chat)}</strong>.` : 'Chưa bật. Bật để nhận tin trên điện thoại ngay khi khách báo mất Premium.'}</p></div><div class="row-actions">${tg.enabled ? btn('telegram-test', 'Gửi tin thử', 'secondary') + btn('telegram-setup', 'Đổi bot', 'secondary') + btn('telegram-off', 'Tắt', 'danger') : btn('telegram-setup', 'Cài thông báo Telegram', 'primary')}</div></div></section>`;
}

// Customer-facing status, shown inside the Family info card: badge, message line, button, and the incident callout.
export function familyStatusParts(ctx, family) {
  if (!ctx.state.lookup_supported) return { badge: '', line: '', action: '', callout: '' };
  const { state, escape, btn } = ctx;
  const status = familyStatus(state, family.id), members = state.members.filter(m => m.family_id === family.id);
  return {
    badge: `<span class="badge ${statusColors[status.status]}" title="Trạng thái khách thấy khi tra cứu">${escape(familyStatusLabels[status.status])}</span>`,
    line: `<p>Lời nhắn cho khách: ${status.note ? escape(status.note) : 'Chưa có'}${status.updated_at ? ` <span class="subtext-inline">· cập nhật ${ctx.date(status.updated_at)}</span>` : ''}</p>`,
    action: btn('family-status', 'Đổi trạng thái', 'secondary', `data-id="${family.id}"`),
    callout: problem(status.status) && members.length ? `<div class="notice lookup-callout"><div><strong>Nhóm đang có sự cố.</strong> Đã có Gmail chủ mới thì vào Fix lỗi → Đã fix → Đổi sang Gmail chủ mới: ${members.length} khách giữ nguyên trong Family này và tự nhận link mới khi tra cứu. Muốn dồn khách sang Family khác thì bấm nút bên cạnh.</div>${btn('move-open', 'Chuyển khách sang nhóm mới', 'primary', `data-id="${family.id}"`)}</div>` : ''
  };
}

export function familyLookupSections(ctx, family) {
  if (!ctx.state.lookup_supported) return '';
  const { state, escape, btn } = ctx;
  const status = familyStatus(state, family.id);
  // Links of a replaced owner stay stored (so Gmail never brings them back) but are not shown.
  const stored = (state.invites || []).filter(i => i.family_id === family.id), invites = stored.filter(i => i.holder_state !== 'retired');
  const ready = invites.filter(i => i.holder_state === 'ready').length, retired = stored.length - invites.length;
  const incoming = (state.moves || []).filter(m => m.to_family_id === family.id);
  return ''
    + (problem(status.status) && !invites.length ? '' : fold(`invites-${family.id}`, pendingMails(state, family.id).length > 0, 'Link mời vào Family này',
      [[ready, 'sẵn sàng', 'green'], [invites.filter(i => ['assigned', 'sent'].includes(i.holder_state)).length, 'đã gửi', 'amber'], [pendingMails(state, family.id).length, 'mail chờ link', 'blue']],
      `<div class="row-actions fold-actions">${genMenu(ctx, family)}${state.gmail_import ? btn('invite-mails-fetch', 'Lấy link mời', 'primary', `data-id="${family.id}" title="Đọc thư mời trong Gmail và hiện link của từng mail đã tạo"`) : ''}${btn('invite-add', '+ Thêm link mời', 'secondary', `data-id="${family.id}"`)}</div>${pendingNotice(ctx, family)}${inviteTable(ctx, invites)}`
      + `<p class="subtext fold-help">Khách chờ link tra cứu Gmail sẽ tự nhận một link Sẵn sàng; link đã đưa cho khách có tag Đã gửi và không giao cho ai khác. Kiểm tra link: <strong>Mở để kiểm tra</strong> bằng Gmail không ở nhóm nào (tab ẩn danh), Google hiện lời mời thì bấm <strong>Còn dùng được</strong>, báo không còn hiệu lực thì bấm <strong>Đã dùng</strong>.${retired ? ` Đã bỏ ${retired} link của chủ cũ.` : ''}</p>`))
    + (incoming.length ? fold(`incoming-${family.id}`, false, 'Khách nhận link vào Family này',
      [[incoming.filter(m => ['assigned', 'opened', 'failed'].includes(m.effective_state) && m.invite_id == null).length, 'chờ link', 'amber'], [incoming.filter(m => ['assigned', 'opened', 'failed'].includes(m.effective_state) && m.invite_id != null).length, 'đã nhận link', 'green']],
      (waitingIn => waitingIn.length ? `<div class="row-actions fold-actions">${btn('moves-release-waiting', `Bỏ chờ link cho ${waitingIn.length} khách`, 'secondary', `data-id="${family.id}" title="Khách vẫn ở nhóm hoặc bạn đã tự mời: tra cứu sẽ không còn báo đang chờ link"`)}</div>` : '')(incoming.filter(m => ['assigned', 'opened', 'failed'].includes(m.effective_state) && m.invite_id == null))
      + moveTable(ctx, incoming) + '<p class="subtext fold-help">Giao link là xong, không cần theo dõi khách đã vào hay chưa. Khách chờ link thấy “Shop đang tạo link riêng” khi tra cứu cho đến khi nhận link hoặc bạn bấm Bỏ chờ link.</p>') : '');
}
// Long sections of the Family page fold away; the head keeps the counts that matter.
const openFolds = new Set();
document.addEventListener('toggle', event => { const box = event.target; if (box instanceof HTMLDetailsElement && box.dataset.fold) { const key = box.dataset.fold; if (box.open) { openFolds.add(key); openFolds.delete('closed:' + key); } else { openFolds.delete(key); openFolds.add('closed:' + key); } } }, true);
function fold(key, openByDefault, title, counts, body) {
  if (openByDefault && !openFolds.has('closed:' + key)) openFolds.add(key);
  const chips = counts.filter(([n]) => n).map(([n, text, tone]) => `<span class="badge ${tone}">${n} ${text}</span>`).join('') || '<span class="badge">Chưa có</span>';
  return `<details class="card lookup-card fold" data-fold="${key}"${openFolds.has(key) ? ' open' : ''}><summary class="fold-head"><span class="fold-title"><h2>${title}</h2><span class="fold-chips">${chips}</span></span><span class="fold-toggle" aria-hidden="true"></span></summary><div class="fold-body">${body}</div></details>`;
}
export function lookupPage(ctx) {
  const { state, escape, btn } = ctx;
  if (!state.lookup_supported) return ctx.empty('Bản này chưa hỗ trợ trang tra cứu', 'Cập nhật ứng dụng lên bản mới nhất.');
  const settings = state.lookup_settings || {}, incidents = state.families.filter(f => problem(familyStatus(state, f.id).status));
  const moves = state.moves || [], open = moves.filter(m => ['assigned', 'opened', 'failed'].includes(m.effective_state)), waiting = open.filter(m => m.invite_id == null), handed = open.filter(m => m.invite_id != null);
  const link = lookupPageUrl(state);
  return ctx.hero('TRA CỨU KHÁCH', 'Tra cứu & chuyển nhóm', 'Khách nhập Gmail và mã tra cứu để xem tình trạng nhóm và lấy link vào nhóm mới.', ctx.copyButton(link, 'link trang tra cứu', 'Copy link trang') + ` <a class="secondary link-button" href="${escape(link)}" target="_blank" rel="noopener">Mở trang khách</a>` + (state.gmail_import ? ' ' + gmailButton(ctx) : ''))
    + `<div class="dashboard-summary stats"><div class="card stat"><h2>Family có sự cố</h2><strong>${incidents.length}</strong></div><div class="card stat"><h2>Khách chờ link</h2><strong>${waiting.length}</strong></div><div class="card stat"><h2>Khách đã nhận link</h2><strong>${handed.length}</strong></div></div>`
    + `<section class="card"><div class="section-heading"><div><h2>Family có sự cố</h2><p>Đặt trạng thái trong trang chi tiết Family.</p></div></div>${incidents.length ? `<div class="table-wrap"><table class="lookup-table"><thead><tr><th scope="col">FAMILY</th><th scope="col">TRẠNG THÁI</th><th scope="col">KHÁCH</th><th scope="col"></th></tr></thead><tbody>${incidents.map(f => { const s = familyStatus(state, f.id); return `<tr><td data-column="family"><a class="email-link" href="#family/${f.id}">${escape(f.name)}</a><span class="subtext">${escape(f.manager_email)}</span></td><td data-column="state"><span class="badge ${statusColors[s.status]}">${escape(familyStatusLabels[s.status])}</span><span class="subtext">${escape(s.note)}</span></td><td data-column="members">${familyOccupancy(state.members, f.id).label}</td><td data-column="actions"><a class="primary link-button tiny" href="#family/${f.id}">Mở Family</a></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Tất cả Family đang hoạt động bình thường.</p>'}</section>`
    // Folded like the Family page: the head keeps the counts, the full list opens on demand.
    + fold('lookup-moves', false, 'Link đã giao cho khách', [[waiting.length, 'chờ link', 'amber'], [handed.length, 'đã nhận link', 'green'], [moves.length - open.length, 'đã xong / cần xem', '']], moves.length ? moveTable(ctx, moves, true) + '<p class="subtext fold-help">Mới nhất trước. Khách chờ link sẽ tự nhận khi có link Sẵn sàng.</p>' : '<p class="muted">Chưa có khách nhận link.</p>')
    + telegramCard(ctx)
    + `<section class="card"><div class="section-heading"><div><h2>Thông tin hiển thị cho khách</h2><p>Tên shop và link liên hệ xuất hiện trên trang tra cứu.</p></div><div class="row-actions">${btn('lookup-settings', 'Sửa thông tin', 'secondary')}</div></div><div class="list-item"><strong>Tên shop</strong><p>${escape(settings.shop_name || 'Chưa đặt')}</p></div><div class="list-item"><strong>Zalo</strong><p>${settings.zalo_url ? `<a class="contact-link" href="${escape(settings.zalo_url)}" target="_blank" rel="noopener noreferrer">${escape(settings.zalo_url)}</a>` : 'Chưa đặt'}</p></div><div class="list-item"><strong>Facebook</strong><p>${settings.facebook_url ? `<a class="contact-link" href="${escape(settings.facebook_url)}" target="_blank" rel="noopener noreferrer">${escape(settings.facebook_url)}</a>` : 'Chưa đặt'}</p></div><div class="list-item"><strong>Link liên hệ khác</strong><p>${settings.contact_url ? `<a class="contact-link" href="${escape(settings.contact_url)}" target="_blank" rel="noopener noreferrer">${escape(settings.contact_label || settings.contact_url)}</a>` : 'Chưa đặt'}</p></div><div class="list-item"><strong>Ghi chú cho khách</strong><p>${escape(settings.help_text || 'Chưa có')}</p></div></section>`
    + `<section class="card"><h2>Cách dùng</h2><ol class="lookup-steps"><li>Gửi mỗi khách link tra cứu riêng (menu … của khách → <strong>Copy link tra cứu</strong>), ví dụ lúc bán hoặc gia hạn.</li><li>Khi mail chủ bị quét: <strong>Fix lỗi → Báo lỗi</strong>. Family tự thành Bị quét và khách thấy lời nhắn.</li><li>Có Gmail chủ mới: <strong>Đã fix → Đổi sang Gmail chủ mới</strong>, chọn số mail mời. Khách ở lại Family và chờ link của chủ mới.</li><li>Mời các mail vừa tạo từ Gmail chủ mới, rồi bấm <strong>Lấy link mời</strong>${state.gmail_import ? '' : ' (cần kết nối Google Sheet; hoặc <strong>+ Thêm link mời</strong> để dán tay)'}.</li><li>Khách mở link tra cứu, nhập Gmail để thấy link vào nhóm mới; theo dõi tiến độ tại đây.</li></ol></section>`;
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
  const members = sortCustomers(state.members.filter(m => m.family_id === source.id));
  const invites = readyInvites(state, targetId);
  let next = 0;
  const rows = members.map(m => {
    const pick = next < invites.length ? invites[next++].id : '';
    return `<tr><td data-column="customer"><strong>${escape(m.customer_name || m.email)}</strong>${m.customer_name ? `<span class="subtext">${escape(m.email)}</span>` : ''}</td><td data-column="expiry" class="date-cell"><strong class="date-value">${ctx.day(m.expires_at)}</strong><span class="subtext">${ctx.expiryBadge(m)}</span></td><td data-column="invite"><select name="invite_${m.id}" aria-label="Link mời cho ${escape(m.customer_name || m.email)}" data-move-member="${m.id}"><option value="">Không chuyển</option>${invites.map(i => `<option value="${i.id}" ${i.id === pick ? 'selected' : ''}>${escape(inviteName(ctx, i))}${i.expires_on ? ' · hết hạn ' + ctx.day(i.expires_on) : ''}</option>`).join('')}</select></td></tr>`;
  }).join('');
  return `<div class="table-wrap"><table class="lookup-table"><thead><tr><th scope="col">KHÁCH</th><th scope="col">HẠN DÙNG</th><th scope="col">LINK MỜI Ở FAMILY MỚI</th></tr></thead><tbody>${rows}</tbody></table></div>${invites.length ? '' : '<p class="error-box">Family này chưa có link mời sẵn sàng. Mở Family mới và bấm + Thêm link mời trước.</p>'}`;
}
// A Google Family holds the owner and 5 members: warn before the new Family would go over.
function updateMoveSummary(state) {
  const selects = [...document.querySelectorAll('#move-mapping select[data-move-member]')];
  const chosen = selects.map(s => s.value).filter(Boolean), duplicate = chosen.length !== new Set(chosen).size;
  const targetId = Number($('#move-target')?.value), already = state ? state.members.filter(m => m.family_id === targetId).length : 0, total = already + chosen.length;
  const over = !duplicate && total > 5;
  $('#move-summary').textContent = duplicate ? 'Một link đang được chọn cho nhiều khách. Mỗi link chỉ giao cho một khách.'
    : `Chuyển ${chosen.length} khách · giữ lại ${selects.length - chosen.length} khách ở Family cũ.` + (over ? ` Family mới sẽ có ${total} khách (đang có ${already}), quá 5 chỗ của Google Family. Bỏ chuyển bớt ${total - 5} khách hoặc chọn Family khác.` : '');
  $('#move-summary').classList.toggle('lookup-warning', duplicate || over);
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
  const render = () => { $('#move-mapping').innerHTML = mappingRows(ctx, source, Number($('#move-target').value)); updateMoveSummary(ctx.state); };
  $('#move-target').addEventListener('change', render);
  $('#move-mapping').addEventListener('change', () => updateMoveSummary(ctx.state));
  render();
}

// Returns true when the action belongs to this module.
export async function handleLookupAction(ctx, action, button) {
  const { state } = ctx, id = Number(button.dataset.id);
  if (action === 'moves-release-waiting') {
    const family = state.families.find(f => f.id === id), rows = (state.moves || []).filter(m => m.to_family_id === id && ['assigned', 'opened', 'failed'].includes(m.effective_state) && m.invite_id == null);
    if (!family || !rows.length) return ctx.toast('Danh sách đã thay đổi. Tải lại trang.'), true;
    ctx.modal(`Bỏ chờ link cho ${rows.length} khách?`, `<p>${rows.map(m => ctx.escape(m.customer_name ? `${m.customer_name} (${m.email})` : m.email)).join(', ')}</p><p>Các khách này sẽ không còn thấy “Shop đang tạo link riêng” khi tra cứu, mà thấy ${ctx.escape(family.name)} hoạt động bình thường. Dùng khi khách vẫn ở trong nhóm hoặc bạn đã tự mời khách.</p>`, async () => {
      let done = 0; for (const m of rows) { await ctx.patch('moves/' + m.id, { action: 'release', revision: m.revision }); done++; }
      ctx.toast(`Đã bỏ chờ link cho ${done} khách.`);
    }, 'Bỏ chờ link');
    return true;
  }
  if (action === 'customer-reports-handle') {
    const ids = String(button.dataset.ids || '').split(',').map(Number), rows = ids.map(i => (state.customer_reports || []).find(r => r.id === i && !r.handled_at));
    if (!rows.length || rows.some(r => !r)) return ctx.toast('Báo lỗi đã thay đổi. Tải lại trang.'), true;
    ctx.modal(rows.length > 1 ? `Đã xử lý ${rows.length} báo lỗi` : 'Đã xử lý báo lỗi', `<p>${rows.map(r => ctx.escape(r.email)).join(', ')}</p><div class="form-field"><label for="field-note">Lời nhắn cho khách (không bắt buộc)</label><textarea id="field-note" name="note" maxlength="500" rows="3" placeholder="Ví dụ: Shop đã mời lại bạn, kiểm tra Gmail rồi bấm chấp nhận."></textarea></div><p class="subtext">Khách thấy lời nhắn này trên trang tra cứu trong 3 ngày.</p>`, async data => {
      for (const r of rows) await ctx.patch(`customer-reports/${r.id}`, { revision: r.revision, note: data.note || '' });
      ctx.toast(rows.length > 1 ? `Đã xử lý ${rows.length} báo lỗi.` : 'Đã xử lý báo lỗi.');
    }, 'Đã xử lý');
    return true;
  }
  if (action === 'telegram-setup') {
    const tg = state.telegram || {};
    ctx.modal('Cài thông báo Telegram', `<ol class="lookup-steps telegram-steps"><li>Mở Telegram, tìm <strong>@BotFather</strong>, gửi <code>/newbot</code>. Đặt tên (ví dụ <em>Hải Premium thông báo</em>) và tên đăng nhập kết thúc bằng <em>bot</em>.</li><li>BotFather gửi một mã dạng <code>123456789:AAE…</code>. Copy và dán vào ô dưới.</li><li>Bấm vào link bot BotFather gửi (t.me/…), rồi bấm <strong>Bắt đầu / Start</strong>. Muốn nhận tin trong nhóm chat thì thêm bot vào nhóm và gửi một tin bất kỳ.</li><li>Bấm <strong>Kết nối</strong>. Web gửi một tin thử về Telegram của bạn.</li></ol>`
      + ctx.input('token', 'Mã bot (token)', 'text', '', !tg.enabled, `maxlength="120" autocomplete="off" spellcheck="false" placeholder="${tg.enabled ? 'Để trống để giữ bot hiện tại' : '123456789:AAE…'}"`)
      + '<p class="subtext">Mã bot chỉ lưu trên máy chủ của bạn, không hiện lại trên web.</p>', async data => {
      const result = await ctx.post('telegram', { token: data.token || '' });
      ctx.toast(`Đã kết nối @${result.telegram.bot}. Kiểm tra tin thử trên Telegram.`);
    }, 'Kết nối');
    return true;
  }
  if (action === 'telegram-test') { try { await ctx.post('telegram/test', {}); ctx.toast('Đã gửi tin thử. Kiểm tra Telegram.'); } catch (error) { ctx.toast(error.message); } return true; }
  if (action === 'telegram-off') {
    ctx.modal('Tắt thông báo Telegram?', '<p>Khách vẫn báo mất Premium được và báo lỗi vẫn hiện ở Fix lỗi, chỉ không gửi tin Telegram nữa.</p>', async () => { await ctx.api('telegram', { method: 'DELETE', body: '{}' }); ctx.toast('Đã tắt thông báo Telegram.'); }, 'Tắt');
    return true;
  }
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
    ctx.modal('Thêm link mời · ' + family.name, inviteFields(ctx), async data => { const saved = await ctx.post(`families/${id}/invites`, data); ctx.toast(saved.assigned?.length ? `Đã thêm link mời và gán cho ${saved.assigned.map(a => a.name || a.email).join(', ')}.` : 'Đã thêm link mời.'); });
    return true;
  }
  if (action === 'invite-edit') {
    const invite = (state.invites || []).find(i => i.id === id); if (!invite) return ctx.toast('Link đã thay đổi. Tải lại trang.'), true;
    ctx.modal('Sửa link mời', inviteFields(ctx, invite) + (invite.holder_state === 'assigned' ? `<p class="notice">Link đang giao cho ${ctx.escape(invite.holder_name || invite.holder_email)}. Dán link mới thì khách thấy link mới ngay khi tra cứu.</p>` : ''), async data => { await ctx.patch('invites/' + id, { ...data, revision: invite.revision }); ctx.toast('Đã lưu link mời.'); });
    return true;
  }
  if (action === 'invite-recipients') {
    const invite = (state.invites || []).find(i => i.id === id); if (!invite) return ctx.toast('Link đã thay đổi. Tải lại trang.'), true;
    const { escape } = ctx, current = recipientsOf(invite), ready = invite.holder_state === 'ready';
    const members = [...state.members].sort((a, b) => (b.family_id === invite.family_id) - (a.family_id === invite.family_id) || a.email.localeCompare(b.email));
    const rows = [0, 1, 2, 3, 4].map(k => `<input name="r_email_${k}" type="email" list="recipient-members" maxlength="254" autocomplete="off" aria-label="Mail khách ${k + 1}" placeholder="${k ? '' : 'mailkhach@gmail.com'}" value="${escape(current[k]?.email || '')}"><input name="r_name_${k}" maxlength="100" autocomplete="off" aria-label="Tên khách ${k + 1}" placeholder="${k ? '' : 'Tên (không bắt buộc)'}" value="${escape(current[k]?.name || '')}">`).join('');
    const pairs = linkPairs(state, invite.family_id);
    const quick = pairs.length ? `<div class="assign-all"><p><strong>Gán nhanh cho khách trong Family:</strong> ${pairs.length} link Sẵn sàng → ${pairs.length} khách chưa có link. Khách tra cứu sẽ thấy đúng link của mình.</p><ul>${pairs.map(p => `<li>${escape(inviteName(ctx, p.invite))} → <strong class="invite-recipient">${escape(p.member.email)}</strong>${p.member.customer_name ? ` (${escape(p.member.customer_name)})` : ''}</li>`).join('')}</ul><button type="button" class="primary tiny" data-action="invite-assign-all" data-id="${invite.family_id}">Gán ${pairs.length} link cho khách</button><p class="subtext">Không gán khách “Đã mời, chưa vào” / “Mua mới”: họ tự nhận link còn lại khi tra cứu. Hoặc ghi mail tay bên dưới.</p></div>` : '';
    ctx.modal('Gán mail cho link · ' + inviteName(ctx, invite), `${quick}<p class="subtext">Ghi lại mail khách bạn đã gửi link này để dễ quản lý. Không bắt buộc, tối đa 5 mail; để trống hết là bỏ gán.</p><div class="recipient-grid"><span class="recipient-head" aria-hidden="true">Mail khách</span><span class="recipient-head" aria-hidden="true">Tên khách</span>${rows}</div><datalist id="recipient-members">${members.map(m => `<option value="${escape(m.email)}">${escape([m.customer_name, m.family_name].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>${ready ? '<label class="check-line"><input type="checkbox" name="mark_sent" checked> <span>Đánh dấu <strong>Đã gửi</strong> — web không tự giao link này cho khách khác khi tra cứu</span></label>' : ''}`, async data => {
      const recipients = [0, 1, 2, 3, 4].map(k => ({ email: String(data['r_email_' + k] || '').trim(), name: String(data['r_name_' + k] || '').trim() })).filter(r => r.email);
      const result = await ctx.patch(`invites/${id}/recipients`, { recipients, revision: invite.revision, mark_sent: data.mark_sent === 'on' });
      ctx.toast(recipients.length ? `Đã gán ${recipients.length} mail cho link${result.marked_sent ? ' · đánh dấu Đã gửi' : ''}.` : 'Đã bỏ mail gán khỏi link.');
    });
    // Picking a customer's Gmail from the list fills the name when it is empty.
    const box = document.getElementById('modal-fields');
    box.oninput = event => { const k = /^r_email_(\d)$/.exec(event.target.name || '')?.[1]; if (k === undefined) return; const member = state.members.find(m => m.email === event.target.value.trim().toLowerCase()), name = box.querySelector(`[name="r_name_${k}"]`); if (member && name && !name.value) name.value = member.customer_name || ''; };
    return true;
  }
  if (action === 'invite-assign-all') {
    button.disabled = true;
    try {
      const result = await ctx.post(`families/${id}/assign-links`, {});
      document.getElementById('modal')?.close();
      ctx.toast(result.assigned.length ? `Đã gán ${result.assigned.length} link: ${result.assigned.map(a => a.name || a.email).join(', ')}.` : 'Không còn link Sẵn sàng hoặc khách cần gán.', 8000);
      await ctx.refresh();
    } catch (error) { ctx.toast(error.message, 8000); } finally { if (button.isConnected) button.disabled = false; }
    return true;
  }
  if (action === 'invite-delete') {
    const invite = (state.invites || []).find(i => i.id === id); if (!invite) return ctx.toast('Link đã thay đổi. Tải lại trang.'), true;
    ctx.modal('Xóa link mời?', `<p>${ctx.escape(inviteName(ctx, invite))}</p><p>Chỉ xóa link khỏi kho của Family. Lời mời trên Google vẫn còn cho đến khi hết hạn.</p>`, async () => { await ctx.api('invites/' + id, { method: 'DELETE', body: JSON.stringify({ revision: invite.revision }) }); ctx.toast('Đã xóa link mời.'); }, 'Xóa link');
    return true;
  }
  if (action === 'move-open') { openBulkMove(ctx, id); return true; }
  if (action === 'invite-mark-used') {
    const invite = (state.invites || []).find(i => i.id === id); if (!invite) return ctx.toast('Link đã thay đổi. Tải lại trang.'), true;
    ctx.modal('Đánh dấu link đã dùng?', `<p>${ctx.escape(inviteName(ctx, invite))}</p><p>Google báo lời mời không còn hiệu lực khi mở bằng Gmail không ở nhóm nào: đã có người vào bằng link này. Web sẽ không giao link này cho khách nữa.</p>`, async () => {
      await ctx.patch(`invites/${id}/sent`, { sent: true, revision: invite.revision }); ctx.toast('Đã đánh dấu link đã dùng.');
    }, 'Đã dùng');
    return true;
  }
  if (action === 'invite-unsend') {
    const invite = (state.invites || []).find(i => i.id === id); if (!invite) return ctx.toast('Link đã thay đổi. Tải lại trang.'), true;
    ctx.modal('Đưa link lại vào kho?', `<p>${ctx.escape(inviteName(ctx, invite))}</p><p>Mở link bằng Gmail không ở nhóm nào mà Google vẫn hiện lời mời thì link chưa ai dùng; khách tra cứu tiếp theo có thể nhận link này.</p>`, async () => {
      await ctx.patch(`invites/${id}/sent`, { sent: false, revision: invite.revision }); ctx.toast('Link quay lại Sẵn sàng.');
    }, 'Đưa lại vào kho');
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
  if (action === 'invite-mails-delete') {
    const ids = String(button.dataset.mails || '').split(',').map(Number).filter(Boolean), mails = (state.invite_mails || []).filter(m => ids.includes(m.id));
    if (!mails.length) return ctx.toast('Mail mời đã thay đổi. Tải lại trang.'), true;
    ctx.modal(mails.length > 1 ? `Xóa ${mails.length} mail mời?` : 'Xóa mail mời?', `<div class="lookup-mail-list">${mails.map(m => `<div class="info-line"><span class="info-text">${ctx.escape(m.email)}</span></div>`).join('')}</div><p>Chỉ xóa khỏi danh sách chờ lấy link trên web. Nếu đã mời mail này từ tài khoản chủ, lời mời trên Google vẫn còn.</p>`, async () => {
      const result = await ctx.api(`families/${id}/invite-mails`, { method: 'DELETE', body: JSON.stringify({ ids }) }); ctx.toast(`Đã xóa ${result.deleted} mail mời.`);
    }, 'Xóa');
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
  if (['move-joined', 'move-release', 'move-reassign', 'move-dismiss', 'move-unassign'].includes(action) && !move) return ctx.toast('Lượt chuyển nhóm đã thay đổi. Tải lại trang.'), true;
  if (action === 'move-joined') {
    ctx.modal('Ghi nhận khách đã vào nhóm?', `${ctx.customerInfo(move, false)}<p>${ctx.escape(move.to_family_name)} · ${ctx.escape(move.invite_label)}</p><p>Khách chuyển sang đang ở nhóm và link được đánh dấu đã dùng.</p>`, async () => { await ctx.patch('moves/' + id, { action: 'joined', revision: move.revision }); ctx.toast('Đã ghi nhận khách vào nhóm.'); }, 'Đã vào nhóm');
    return true;
  }
  if (action === 'move-unassign') {
    ctx.modal('Link còn dùng được?', `${ctx.customerInfo(move, false)}<p>Bạn đã mở link ${ctx.escape(move.invite_label)} bằng Gmail không ở nhóm nào và Google vẫn hiện lời mời, tức là khách chưa vào nhóm bằng link này.</p><p>Link trở về Sẵn sàng để giao cho khách khác. Khách này chờ link mới: mở lại trang tra cứu sẽ thấy Shop đang chuẩn bị link.</p>`, async () => {
      await ctx.patch(`moves/${move.id}`, { action: 'unassign', revision: move.revision });
      ctx.toast('Đã đưa link về kho.');
    }, 'Đưa về kho');
    return true;
  }
  if (action === 'move-release' && move.invite_id == null) {
    ctx.modal('Bỏ chờ link?', `${ctx.customerInfo(move, false)}<p>Khách sẽ không còn thấy màn hình “Shop đang tạo link riêng” khi tra cứu, mà thấy nhóm ${ctx.escape(move.to_family_name)} hoạt động bình thường. Dùng khi khách vẫn ở trong nhóm hoặc bạn đã tự mời khách.</p>`, async () => { await ctx.patch('moves/' + id, { action: 'release', revision: move.revision }); ctx.toast('Đã bỏ chờ link cho khách.'); }, 'Bỏ chờ link');
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
    ctx.modal('Thông tin trang tra cứu', ctx.input('shop_name', 'Tên shop', 'text', s.shop_name, false, 'maxlength="100"') + ctx.input('zalo_url', 'Link Zalo', 'url', s.zalo_url, false, 'maxlength="500" placeholder="https://zalo.me/0901234567"') + ctx.input('facebook_url', 'Link Facebook / Messenger', 'url', s.facebook_url, false, 'maxlength="500" placeholder="https://m.me/ten.trang"') + ctx.input('contact_url', 'Link liên hệ khác (không bắt buộc)', 'url', s.contact_url, false, 'maxlength="500" placeholder="https://…"') + ctx.input('contact_label', 'Chữ trên nút liên hệ khác', 'text', s.contact_label, false, 'maxlength="60" placeholder="Nhắn shop"') + `<div class="form-field"><label for="field-help_text">Ghi chú cho khách</label><textarea id="field-help_text" name="help_text" maxlength="500" placeholder="ví dụ Shop phản hồi trong 30 phút, 8h–22h.">${ctx.escape(s.help_text)}</textarea></div>` + ctx.input('short_domain', 'Link ngắn (không bắt buộc)', 'text', s.short_domain, false, 'maxlength="200" placeholder="ví dụ beeflix.vn/haiytb" autocapitalize="none" spellcheck="false"') + '<p class="subtext">Tên miền phụ (có thể kèm đường dẫn) đã chuyển hướng về website này. Link gửi khách sẽ thành beeflix.vn/haiytb?MÃ. Để trống thì dùng tên miền website.</p>', async data => { await ctx.patch('lookup-settings', data); ctx.toast('Đã lưu thông tin trang tra cứu.'); });
    return true;
  }
  return false;
}
