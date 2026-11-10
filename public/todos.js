// Việc cần làm: personal reminders on Tổng quan. Write tonight for tomorrow; tomorrow it shows under Hôm nay.
let draft = '', due = '', showUpcoming = false;
const pencil = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>';
const trash = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

const shift = (day, n) => { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const gap = (from, to) => Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
const localDay = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
function dayLabel(day, today) {
  if (!day) return 'Không đặt ngày';
  if (day === today) return 'Hôm nay';
  if (day === shift(today, 1)) return 'Ngày mai';
  const d = new Date(day + 'T00:00:00Z');
  return new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', weekday: 'long' }).format(d).replace(/^./, c => c.toUpperCase()) + ', ' + day.slice(8, 10) + '/' + day.slice(5, 7);
}

function item(ctx, t, today, tag = '') {
  const { escape } = ctx, done = !!t.done_at;
  return `<li class="todo-item${done ? ' is-done' : ''}" data-todo="${t.id}">
<label class="todo-check"><input type="checkbox" data-todo-toggle="${t.id}"${done ? ' checked' : ''}><span class="todo-text">${escape(t.text)}</span></label>
${tag}<span class="todo-tools"><button type="button" class="todo-tool" data-action="todo-edit" data-id="${t.id}" aria-label="Sửa việc: ${escape(t.text)}" title="Sửa">${pencil}</button><button type="button" class="todo-tool danger-tool" data-action="todo-delete" data-id="${t.id}" aria-label="Xóa việc: ${escape(t.text)}" title="Xóa">${trash}</button></span></li>`;
}

export function todoCard(ctx) {
  const { state, escape } = ctx, today = state.today, tomorrow = shift(today, 1), todos = state.todos || [];
  if (!due || due < today) due = today;
  const open = todos.filter(t => !t.done_at);
  const overdue = open.filter(t => t.due_on && t.due_on < today);
  const now = open.filter(t => !t.due_on || t.due_on === today);
  const later = open.filter(t => t.due_on > today);
  const finished = todos.filter(t => t.done_at && localDay(t.done_at) === today);
  const left = overdue.length + now.length;
  const rows = overdue.map(t => item(ctx, t, today, `<span class="todo-tag late">Quá hạn ${gap(t.due_on, today)} ngày</span>`)).join('')
    + now.map(t => item(ctx, t, today)).join('')
    + finished.map(t => item(ctx, t, today, t.due_on && t.due_on !== today ? `<span class="todo-tag">${escape(dayLabel(t.due_on, today))}</span>` : '')).join('');
  const upcoming = later.length ? `<details class="todo-later"${showUpcoming ? ' open' : ''}><summary>Sắp tới <span class="chip-count">${later.length}</span>${later.some(t => t.due_on === tomorrow) ? `<span class="todo-later-hint">${later.filter(t => t.due_on === tomorrow).length} việc ngày mai</span>` : ''}</summary><ul class="todo-list">${later.map(t => item(ctx, t, today, `<span class="todo-tag">${escape(dayLabel(t.due_on, today))}</span>`)).join('')}</ul></details>` : '';
  const seg = (value, label) => `<button type="button" class="todo-seg${due === value ? ' active' : ''}" data-todo-day="${value}" aria-pressed="${due === value}">${label}</button>`;
  return `<section class="card todo-card" aria-labelledby="todo-title"><div class="todo-head"><h2 id="todo-title">Việc cần làm</h2><span class="todo-summary">${left ? `Hôm nay còn <strong>${left}</strong> việc` : open.length || finished.length ? 'Hôm nay đã xong hết' : 'Ghi lại việc để khỏi quên'}</span></div>
<form class="todo-add" id="todo-form" autocomplete="off"><label class="sr-label" for="todo-text">Nội dung việc</label><input id="todo-text" name="text" maxlength="300" placeholder="Thêm việc… (Enter để lưu)" value="${escape(draft)}">
<div class="todo-when" role="group" aria-label="Ngày làm">${seg(today, 'Hôm nay')}${seg(tomorrow, 'Ngày mai')}<label class="sr-label" for="todo-date">Chọn ngày khác</label><input type="date" id="todo-date" min="${today}" value="${due}" class="${due !== today && due !== tomorrow ? 'active' : ''}"></div>
<button type="submit" class="primary">Thêm</button></form>
${rows ? `<ul class="todo-list">${rows}</ul>` : `<p class="todo-empty">${later.length ? 'Hôm nay chưa có việc nào.' : 'Chưa có việc nào. Tối nay viết sẵn việc cho Ngày mai, sáng mai mở web là thấy.'}</p>`}${upcoming}</section>`;
}

export function initTodos(ctx) {
  const { api, post, patch, toast, refresh, modal, input, escape } = ctx;
  const card = () => document.querySelector('.todo-card');
  const markDay = () => { const c = card(); if (!c) return; const today = ctx.state.today, tomorrow = shift(today, 1); c.querySelectorAll('.todo-seg').forEach(b => { const on = b.dataset.todoDay === due; b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); }); const date = c.querySelector('#todo-date'); date.value = due; date.classList.toggle('active', due !== today && due !== tomorrow); };
  const again = async focus => { await refresh(); if (focus) document.querySelector('#todo-text')?.focus(); };
  document.addEventListener('input', event => { if (event.target.id === 'todo-text') draft = event.target.value; });
  document.addEventListener('change', async event => {
    if (event.target.id === 'todo-date') { due = event.target.value || ctx.state.today; markDay(); return; }
    const id = event.target.dataset?.todoToggle; if (!id) return;
    const row = event.target.closest('.todo-item'); row?.classList.toggle('is-done', event.target.checked);
    try { await patch('todos/' + id, { done: event.target.checked }); await refresh(); }
    catch (error) { event.target.checked = !event.target.checked; row?.classList.toggle('is-done', event.target.checked); toast(error.message); }
  });
  document.addEventListener('toggle', event => { if (event.target.classList?.contains('todo-later')) showUpcoming = event.target.open; }, true);
  document.addEventListener('submit', async event => {
    if (event.target.id !== 'todo-form') return;
    event.preventDefault();
    const field = event.target.querySelector('#todo-text'), text = field.value.trim(), button = event.target.querySelector('button[type=submit]');
    if (!text) { field.focus(); return; }
    button.disabled = true;
    try {
      const saved = await post('todos', { text, due_on: due });
      draft = ''; const today = ctx.state.today;
      if (saved.due_on > today) showUpcoming = true;
      const label = dayLabel(saved.due_on, today);
      toast(`Đã thêm việc ${['Hôm nay', 'Ngày mai'].includes(label) ? 'cho ' + label.toLowerCase() : label === 'Không đặt ngày' ? 'không đặt ngày' : 'cho ' + label}.`, 2500);
      await again(true);
    } catch (error) { toast(error.message); } finally { button.disabled = false; }
  });
  document.addEventListener('click', async event => {
    const day = event.target.closest('[data-todo-day]'); if (day) { due = day.dataset.todoDay; markDay(); document.querySelector('#todo-text')?.focus(); return; }
    const button = event.target.closest('[data-action="todo-edit"],[data-action="todo-delete"]'); if (!button) return;
    const t = (ctx.state.todos || []).find(x => x.id === Number(button.dataset.id)); if (!t) return;
    if (button.dataset.action === 'todo-delete') {
      try { await api('todos/' + t.id, { method: 'DELETE' }); toast('Đã xóa việc.', 2000); await refresh(); } catch (error) { toast(error.message); }
      return;
    }
    modal('Sửa việc', input('text', 'Nội dung việc', 'text', t.text, true, 'maxlength="300"') + input('due_on', 'Ngày làm (để trống nếu không đặt ngày)', 'date', t.due_on) + `<p class="subtext">Tạo lúc ${escape(ctx.date(t.created_at))}</p>`, async data => { await patch('todos/' + t.id, { text: data.text, due_on: data.due_on || '' }); toast('Đã lưu việc.', 2000); });
  });
}
