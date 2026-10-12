import { renewalDates } from './domain.js';
import { prepareSheet, suggestMapping, importFields } from './csv.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const day = value => value ? value.split('-').reverse().join('/') : 'Chưa đặt';
const names = {overview:'Tổng quan',customers:'Khách & Gia hạn',families:'Family',archives:'Khách lưu trữ',import:'Nhập khách CSV',products:'Sản phẩm khác'};
const products = { youtube:'YouTube Premium',google_one:'Google One',google_ai:'Google AI',other:'Khác' };
const planOptions = (value=0, unknown=false) => Object.fromEntries([...(unknown ? [[0,'Chưa đặt']] : []), ...[...new Set([1,2,3,6,12,...(Number(value)>0 ? [Number(value)] : [])])].sort((a,b)=>a-b).map(n=>[n,n+' tháng'])]);
const renewalLabels = { not_contacted: 'Chưa nhắc gia hạn', reminded: 'Đã nhắc khách', awaiting_payment: 'Chờ thanh toán', partial: 'Đã trả một phần', paid: 'Đã thanh toán gia hạn', declined: 'Không gia hạn' };
const memberships = {unknown:'Chưa xác minh',active:'Đã vào',invited:'Đã mời, chưa vào'};
const payments = { unknown: 'Chưa ghi nhận', unpaid: 'Chưa thanh toán', partial: 'Thanh toán một phần', paid: 'Đã thanh toán' };
let state, customerSearch='',customerFilter='',submitModal,toastTimer,importData=null,importPreview=null,productSearch='',productFilter='';
const route=()=>(location.hash.slice(1)||'overview').split('/');
function toast(text) { $('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',6000); }
async function api(path,options={}) {
  const response=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json','X-Fam-Request':'1'}});
  if (response.status===401) {location.replace('/access');throw new Error('Cần mở lại bằng mật khẩu truy cập.');}
  const data=await response.json();if (!response.ok) throw new Error(data.error||'Không thể thực hiện yêu cầu.');return data;
}
const post=(path,data)=>api(path,{method:'POST',body:JSON.stringify(data)});
const patch=(path,data)=>api(path,{method:'PATCH',body:JSON.stringify(data)});
async function refresh(render=true) {state=await api('state');if(render)draw();}
const hero = (eyebrow, title, description, action = '') => `<section class="card hero"><div><span class="eyebrow">${eyebrow}</span><h1>${escape(title)}</h1><p>${description}</p></div>${action}</section>`;
const empty = (title, description, action = '') => `<div class="empty"><div class="empty-icon">♧</div><h2>${title}</h2><p>${description}</p>${action}</div>`;
const stats = entries => `<div class="stats">${entries.map(([name, n]) => `<div class="card stat"><h2>${name}</h2><strong>${escape(n)}</strong></div>`).join('')}</div>`;
const btn=(action,title,type='secondary',attrs='')=>`<button class="${type}" data-action="${action}" ${attrs}>${title}</button>`;
const input = (name, title, type = 'text', value = '', required = false, attrs = '') => `<label for="field-${name}">${title}</label><input id="field-${name}" name="${name}" type="${type}" value="${escape(value)}" ${required ? 'required' : ''} ${attrs}>`;
const select = (name, title, options, value) => `<label for="field-${name}">${title}</label><select id="field-${name}" name="${name}">${Object.entries(options).map(([key, name]) => `<option value="${escape(key)}" ${String(value) === key ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select>`;
const noteField = value => `<label for="field-note">Ghi chú</label><textarea id="field-note" name="note" maxlength="1000">${escape(value)}</textarea>`;
function expiryBadge(m) {
  const labels = { unknown: 'Chưa đặt hạn', expired: `Quá hạn ${Math.abs(m.days_left)} ngày`, due_soon: m.days_left === 0 ? 'Hết hạn hôm nay' : `Còn ${m.days_left} ngày`, active: `Còn ${m.days_left} ngày` };
  return `<span class="badge ${m.expiry_status === 'expired' ? 'red' : m.expiry_status === 'due_soon' ? 'amber' : m.expiry_status === 'active' ? 'green' : ''}">${labels[m.expiry_status]}</span>`;
}
function customerTable(members) {
  return members.length ? `<div class="table-wrap"><table><thead><tr><th>KHÁCH HÀNG</th><th>FAMILY / GÓI</th><th>NGÀY MUA</th><th>HẾT HẠN</th><th>THANH TOÁN KỲ HIỆN TẠI</th><th>GIA HẠN TIẾP THEO</th><th>THAO TÁC</th></tr></thead><tbody>${members.map(m => `<tr><td><strong>${escape(m.customer_name || m.email)}</strong><span class="subtext">${escape(m.email)}</span><span class="subtext">${escape(m.contact)}</span><span class="subtext">${escape(m.note)}</span></td><td><a class="email-link" href="#family/${m.family_id}">${escape(m.family_name)}</a><span class="subtext">${products[m.service]}${m.plan_months ? ' · ' + m.plan_months + ' tháng' : ''}</span></td><td>${day(m.joined_at)}</td><td>${day(m.expires_at)}<span class="subtext">${expiryBadge(m)}</span></td><td><span class="badge ${m.payment_status === 'paid' ? 'green' : 'amber'}">${payments[m.payment_status]}</span><span class="subtext">${Number(m.amount).toLocaleString('vi-VN')} ₫</span></td><td><span class="badge ${m.renewal_status === 'paid' ? 'green' : 'amber'}">${renewalLabels[m.renewal_status] || renewalLabels.not_contacted}</span>${m.renewal_amount ? `<span class="subtext">${Number(m.renewal_amount).toLocaleString('vi-VN')} ₫ · ${day(m.renewal_paid_at)}</span>` : ''}</td><td><div class="row-actions">${m.expires_at ? btn('remind-message', 'Nhắc hạn', 'secondary tiny', `data-id="${m.id}"`) : ''}${btn('renewal-status', 'Gia hạn', 'secondary tiny', `data-id="${m.id}"`)}${m.renewal_status === 'paid' ? btn('renewal-apply', 'Xác nhận hạn mới', 'primary tiny', `data-id="${m.id}"`) : ''}${btn('renewal-history', 'Lịch sử', 'secondary tiny', `data-id="${m.id}"`, 'all')}${btn('edit-member', 'Sửa / Gia hạn', 'secondary tiny', `data-id="${m.id}"`)}${btn('delete-member', 'Xóa hồ sơ', 'danger tiny', `data-id="${m.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có khách phù hợp', 'Thêm khách từ trang Family hoặc điều chỉnh bộ lọc.');
}
function draw() {
  if (!state) return;
  let [page,id]=route();
  if (!['overview','customers','families','family','archives','import','products'].includes(page)) {location.hash='overview';return;}
  const parent={import:'customers',family:'families'}[page]||page;
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===parent));
  $('#breadcrumb').textContent=`YouTube Family › ${names[parent]} ${id ? '› #'+id : ''}`;
  $('#header-actions').innerHTML=btn('backup','Sao lưu / Chuyển dữ liệu','secondary tiny')+(state.hosted ? ' '+btn('close-access','Khóa ứng dụng','secondary tiny') : '');
  let content = '';
  if (page==='overview') {
    content=hero('KHÁCH HÀNG YOUTUBE','Tổng quan','Theo dõi khách, Family, thanh toán và gia hạn.',btn('add-member','+ Thêm khách','primary')+' '+btn('add-family','+ Thêm Family','secondary')) + stats([['Khách đang ghi nhận',state.members.length],['Family',state.families.length],['Sắp hết hạn (2 ngày)',state.reminders.due_soon+state.other_reminders.due_soon],['Đã quá hạn',state.reminders.expired+state.other_reminders.expired]]) + `<section class="card"><h2>Gia hạn & Thanh toán</h2><p>${state.reminders.renewal_waiting} khách chờ tiền/trả một phần · ${state.reminders.renewal_paid_pending} khách đã trả tiền nhưng chưa cập nhật hạn · ${state.reminders.unpaid} khách chưa thanh toán đủ kỳ hiện tại.</p></section>` + (state.other_products.some(p=>['due_soon','expired'].includes(p.expiry_status)) ? `<section class="card"><div class="section-heading"><h2>Sản phẩm khác cần nhắc hạn</h2><a class="email-link" href="#products">Xem sản phẩm khác →</a></div>${otherProductTable(state.other_products.filter(p=>['due_soon','expired'].includes(p.expiry_status)))}</section>` : '') + customerList();
  } else if (page==='customers') {
    content=hero('KHÁCH HÀNG','Khách & Gia hạn','Email, Contact, kỳ sử dụng và thanh toán.',btn('add-member','+ Thêm khách','primary')+' <a class="secondary link-button" href="#import">↑ Nhập khách từ CSV</a>')+stats([['Khách đang ghi nhận',state.members.length],['Sắp hết hạn (2 ngày)',state.reminders.due_soon],['Quá hạn',state.reminders.expired],['Chưa thanh toán đủ',state.reminders.unpaid]])+customerList();
  } else if (page==='products') {
    content=hero('SẢN PHẨM PHỤ','Sản phẩm khác','Netflix, Spotify, Google One, ChatGPT hoặc sản phẩm tự đặt tên.',btn('add-product','+ Thêm sản phẩm đã bán','primary'))+stats([['Đang ghi nhận',state.other_products.length],['Sắp hết hạn (2 ngày)',state.other_reminders.due_soon],['Đã quá hạn',state.other_reminders.expired],['Chưa đặt hạn',state.other_products.filter(p=>!p.expires_at).length]])+`<section class="card"><h2>Danh sách sản phẩm khách đã mua</h2><div class="toolbar"><input id="product-search" aria-label="Tìm sản phẩm" placeholder="Tìm khách, sản phẩm, Contact hoặc ghi chú…" value="${escape(productSearch)}"><select id="product-filter" aria-label="Lọc hạn sản phẩm">${Object.entries({'':'Tất cả',due_soon:'Sắp hết hạn',expired:'Đã quá hạn',unknown:'Chưa đặt hạn'}).map(([key,label])=>`<option value="${key}" ${key===productFilter ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div id="product-table">${filteredProducts()}</div></section>`;
  } else if (page === 'archives') {
    content = hero('LƯU TRỮ', 'Khách không gia hạn', 'Khách đã chuyển khỏi danh sách hoạt động; thông tin và lịch sử vẫn được giữ.') + `<section class="card"><p>Chuyển tự động sau 7 ngày ${state.archive_mode === 'declined' ? 'kể từ khi chọn Không gia hạn' : 'sau ngày hết hạn'}, khi ứng dụng đang chạy. </p>${state.archives.length ? `<div class="table-wrap"><table><thead><tr><th>KHÁCH</th><th>FAMILY</th><th>NGÀY MUA / HẠN</th><th>LƯU TRỮ</th><th></th></tr></thead><tbody>${state.archives.map(a => `<tr><td><strong>${escape(a.customer_name || a.email)}</strong><span class="subtext">${escape(a.email)}</span><span class="subtext">${escape(a.member.contact)}</span></td><td>${escape(a.family_name)}<span class="subtext">${escape(a.manager_email)}</span></td><td>${day(a.member.joined_at)} → ${day(a.member.expires_at)}</td><td>${date(a.archived_at)}<span class="subtext">${escape(a.reason)}</span></td><td><div class="row-actions">${btn('archive-details','Xem dữ liệu','secondary tiny',`data-id="${a.id}"`,'all')}${btn('archive-restore','Khôi phục','secondary tiny',`data-id="${a.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có khách lưu trữ','Chỉ khách chọn Không gia hạn và đủ thời gian mới được chuyển vào đây.')}</section>`;
  } else if (page==='families') {
    content=hero('FAMILY','Quản lý Family','Email quản lý, ghi chú và khách trong nhóm.',btn('add-family','+ Thêm Family','primary'))+`<section class="card"><h2>Danh sách Family</h2>${state.families.length ? `<div class="table-wrap"><table><thead><tr><th>FAMILY</th><th>EMAIL QUẢN LÝ</th><th>KHÁCH ĐANG GHI NHẬN</th><th></th></tr></thead><tbody>${state.families.map(f=>`<tr><td><a class="email-link" href="#family/${f.id}">${escape(f.name)}</a><span class="subtext">${escape(f.note)}</span></td><td>${escape(f.manager_email)}</td><td>${state.members.filter(m=>m.family_id===f.id).length}</td><td><div class="row-actions">${btn('edit-family','Sửa','secondary tiny',`data-id="${f.id}"`)}${btn('delete-family-record','Xóa hồ sơ','danger tiny',`data-id="${f.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có Family','Thêm tên Family và email quản lý để bắt đầu.',btn('add-family','+ Thêm Family','primary'))}</section>`;
  } else if (page==='family') {
    const f=state.families.find(f=>f.id===Number(id));
    content=f ? `<a class="back" href="#families">← Danh sách Family</a>`+hero('FAMILY',f.name,`Email quản lý: ${escape(f.manager_email)}`,btn('add-member','+ Thêm khách','primary',`data-id="${f.id}"`))+`<section class="card"><div class="section-heading"><div><h2>Thông tin Family</h2><p>${escape(f.note||'Chưa có ghi chú')}</p></div>${btn('edit-family','Sửa Family','secondary',`data-id="${f.id}"`)}</div></section><section class="card"><h2>Khách trong Family</h2>${customerTable(state.members.filter(m=>m.family_id===f.id))}</section>` : empty('Không tìm thấy Family','Hồ sơ này có thể đã được xóa.');
  } else if (page==='import') content=importPage();
  else content=empty('Không tìm thấy trang','Chọn mục trong thanh điều hướng.');
  $('#main').innerHTML = content;
  labelTables();
}
function labelTables() {
  document.querySelectorAll('#main table').forEach(table=>{
    if (table.closest('#import-results')) return;
    const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim() || 'THAO TÁC');
    table.classList.add('record-table');
    table.querySelectorAll('tbody tr').forEach(row=>[...row.cells].forEach((cell,i)=>cell.dataset.label=labels[i] || ''));
  });
}
function filteredCustomers() {
  const q = customerSearch.toLocaleLowerCase();
  return customerTable(state.members.filter(m => `${m.email} ${m.customer_name} ${m.contact} ${m.note} ${m.family_name}`.toLocaleLowerCase().includes(q) && (!customerFilter || (customerFilter === 'unpaid' ? ['unpaid','partial'].includes(m.payment_status) : customerFilter === 'renewal_waiting' ? ['awaiting_payment','partial'].includes(m.renewal_status) : customerFilter === 'renewal_paid' ? m.renewal_status === 'paid' : customerFilter === 'renewal_declined' ? m.renewal_status === 'declined' : m.expiry_status === customerFilter))));
}
function modal(title, fields, handler, submit = 'Lưu') {
  $('#modal-title').textContent = title; $('#modal-fields').innerHTML = fields; $('#form-error').textContent = ''; $('#modal-form button[type=submit]').hidden = false; $('#modal-form button[type=submit]').textContent = submit; submitModal = handler; $('#modal').showModal();
}
function memberFields(m = {}) {
  return input('email', 'Email khách', 'email', m.email, true, 'maxlength="254"') + input('customer_name', 'Tên khách', 'text', m.customer_name, false, 'maxlength="200"') + input('contact', 'Liên hệ (điện thoại / Zalo)', 'text', m.contact, false, 'maxlength="1000"') + select('plan_months', 'Gói mua', planOptions(m.plan_months,true), m.plan_months || 0) + '<div class="form-grid">' + input('joined_at', 'Ngày mua', 'date', m.joined_at ?? state.today) + input('expires_at', 'Ngày hết hạn', 'date', m.expires_at) + '</div>' + select('payment_status', 'Thanh toán', payments, m.payment_status || 'unpaid') + input('amount', 'Số tiền đã ghi nhận (VND)', 'number', m.amount || 0, false, 'min="0" max="1000000000" step="1"') + noteField(m.note) + select('membership_status','Trạng thái thành viên',memberships,m.membership_status || 'unknown') + '<p>Để lưu tiền và lịch sử gia hạn, dùng nút Gia hạn rồi Xác nhận hạn mới. Sửa hồ sơ không tự thu tiền.</p>';
}
$('#modal-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  try { await submitModal(Object.fromEntries(new FormData(event.currentTarget))); $('#modal').close(); await refresh(); }
  catch (error) { $('#form-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
$('#close-modal').onclick = $('#cancel-modal').onclick = () => $('#modal').close();
for (const eventName of ['input','change']) document.addEventListener(eventName,event=>{
  if (event.target.id==='product-search' || event.target.id==='product-filter') { if(event.target.id==='product-search')productSearch=event.target.value;else productFilter=event.target.value;$('#product-table').innerHTML=filteredProducts();labelTables();return;}
  if (event.target.id==='customer-search') customerSearch=event.target.value;
  else if (event.target.id==='customer-filter') customerFilter=event.target.value;
  else return;
  $('#customer-table').innerHTML=filteredCustomers();
  labelTables();
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const { action, id, kind, email } = button.dataset;
  try {
    if (action==='backup') {
      modal('Sao lưu / Chuyển dữ liệu','<p>File sao lưu giữ khách, Family, Contact, sản phẩm khác, lịch sử gia hạn và khách lưu trữ.</p><p><a class="primary link-button" href="/api/backup" download>Tải file sao lưu</a></p><label for="backup-file">Khôi phục vào ứng dụng đang trống</label><input id="backup-file" type="file" accept=".json,application/json"><p>Để chuyển lên hosting: tải file từ máy tính, mở địa chỉ hosting rồi chọn file tại đây. Bản khôi phục chỉ nhận vào ứng dụng đang trống.</p>',async()=>{const file=$('#backup-file').files[0];if (!file) throw new Error('Chọn file sao lưu .json để khôi phục, hoặc nhấn Hủy sau khi tải sao lưu.');if (file.size>32000000) throw new Error('File quá lớn (tối đa 32 MB).');let data;try {data=JSON.parse(await file.text());} catch {throw new Error('File JSON không hợp lệ.');}const result=await post('restore',data);toast(`Đã khôi phục ${result.customers} khách, ${result.families} Family và ${result.other_products} sản phẩm khác.`);},'Khôi phục dữ liệu');
    } else if (action==='close-access') {
      await post('access/close',{});location.replace('/access');
    } else if (action === 'remind-message' || action === 'product-remind') {
      const m = action==='product-remind' ? state.other_products.find(p=>p.id===Number(id)) : state.members.find(m => m.id === Number(id));
      const text = `Chào ${m.customer_name || 'bạn'}, gói ${m.product || products[m.service]} của tài khoản ${m.email} sẽ hết hạn vào ${day(m.expires_at)}${m.days_left < 0 ? ' (đã quá hạn)' : m.days_left === 0 ? ' (hôm nay)' : ` (còn ${m.days_left} ngày)`}. Bạn có muốn gia hạn tiếp không? Nếu có, nhắn mình để xác nhận gói và thanh toán nhé. Cảm ơn bạn!`;
      modal('Mẫu tin nhắc hạn', '<label for="reminder-text">Nội dung gửi khách</label><textarea id="reminder-text" rows="7">'+escape(text)+'</textarea><p>Liên hệ: '+escape(m.contact || 'Chưa có thông tin liên hệ')+'</p><p>Chọn Sao chép rồi tự gửi qua Zalo/Facebook. Ứng dụng không gửi tin thay bạn.</p>', async () => { const message = $('#reminder-text').value; try { await navigator.clipboard.writeText(message); toast('Đã sao chép mẫu tin. Bạn có thể dán để gửi khách.'); } catch { $('#reminder-text').select(); throw new Error('Không sao chép tự động được. Chọn nội dung trong ô rồi dùng chức năng Sao chép của thiết bị.'); } }, 'Sao chép');
    } else if (action==='add-product' || action==='edit-product') {
      const p=action==='edit-product' ? state.other_products.find(p=>p.id===Number(id)) : null;
      const choices=Object.fromEntries([...new Set(['Netflix','Spotify','Google One','ChatGPT','Khác',...(p ? [p.product] : [])])].map(value=>[value,value]));
      const customerChoices={'':'Nhập khách riêng',...Object.fromEntries(state.members.map(m=>[m.id,(m.customer_name||m.email)+' · '+m.email]))};
      modal(p ? 'Sửa sản phẩm đã bán' : 'Thêm sản phẩm đã bán',select('product','Sản phẩm',choices,p?.product||'Netflix')+input('custom_product','Tên sản phẩm khác (khi chọn Khác)','text','',false,'maxlength="100"')+select('existing_customer','Lấy thông tin khách Family (không bắt buộc)',customerChoices,'')+input('customer_name','Tên khách','text',p?.customer_name,false,'maxlength="200"')+input('email','Email khách','email',p?.email,false,'maxlength="254"')+input('contact','Contact (Facebook / Zalo / liên hệ)','text',p?.contact,false,'maxlength="1000"')+input('joined_at','Ngày mua','date',p?.joined_at??state.today)+input('expires_at','Ngày hết hạn','date',p?.expires_at)+select('payment_status','Thanh toán',payments,p?.payment_status||'unknown')+input('amount','Số tiền (VND)','number',p?.amount||0,false,'min="0" max="1000000000" step="1"')+noteField(p?.note)+'<p>Để trống ngày hết hạn nếu sản phẩm không có hạn. Còn 2 ngày hoặc đã quá hạn sẽ hiện ở Tổng quan.</p>',async data=>{const payload={...data,product:data.product==='Khác' ? data.custom_product : data.product};await(p ? patch('other-products/'+id,payload) : post('other-products',payload));toast('Đã lưu sản phẩm đã bán.');});
    } else if (action==='delete-product') {
      modal('Xóa hồ sơ sản phẩm?', '<p>Hồ sơ bán sản phẩm này sẽ bị xóa.</p>',async()=>{await api('other-products/'+id,{method:'DELETE'});toast('Đã xóa hồ sơ sản phẩm.');},'Xóa hồ sơ');
    } else if (action === 'archive-details') {
      const a=state.archives.find(a=>a.id===Number(id)),m=a.member; const history=(await api('archives/'+id+'/history')).history;
      modal('Dữ liệu khách lưu trữ', `<p>${escape(m.customer_name || m.email)} · ${escape(m.email)}</p><p>Liên hệ: ${escape(m.contact)}</p><p>Gói: ${m.plan_months || 'chưa đặt'} tháng · Ngày mua ${day(m.joined_at)} · Hạn ${day(m.expires_at)}</p><p>Thanh toán: ${payments[m.payment_status]} · ${Number(m.amount).toLocaleString('vi-VN')} ₫</p><p>Ghi chú: ${escape(m.note)}</p><p>Gia hạn: ${renewalLabels[m.renewal_status]} · ${escape(m.renewal_note)}</p><h2>Lịch sử gia hạn</h2>` + (history.map(h=>`<div class="list-item">${day(h.old_expires_at)} → ${day(h.new_expires_at)}<p>${Number(h.amount).toLocaleString('vi-VN')} ₫ · ${escape(h.created_by)} · ${date(h.created_at)}</p></div>`).join('') || '<p>Chưa có lần đã xác nhận.</p>'), async()=>{}, 'Đóng');
    } else if (action === 'archive-restore') {
      const a=state.archives.find(a=>a.id===Number(id)); if (!state.families.length) return toast('Tạo hồ sơ Family trước khi khôi phục khách.');
      modal('Khôi phục khách', `<p>${escape(a.email)} sẽ trở lại danh sách hoạt động. Gia hạn tiếp theo về Chưa nhắc; hạn cũ và lịch sử được giữ.</p>` + select('family_id','Family nhận khách',Object.fromEntries(state.families.map(f=>[f.id,f.name+' · '+f.manager_email])),a.member.family_id), async data=>{ await post('archives/'+id+'/restore',data); toast('Đã khôi phục khách và lịch sử.'); }, 'Khôi phục');
    } else if (['add-family','edit-family'].includes(action)) {
      const f=action==='edit-family' ? state.families.find(f=>f.id===Number(id)) : null;
      modal(f ? 'Sửa Family' : 'Thêm Family',input('name','Tên Family','text',f?.name,true,'maxlength="200"')+input('manager_email','Email quản lý Family','email',f?.manager_email,true,'maxlength="254"')+noteField(f?.note),async data=>{await(f ? patch('families/'+id,{...data,service:f.service}) : post('families',{...data,service:'youtube'}));toast('Đã lưu Family.');});
    } else if (action==='add-member') {
      if (!state.families.length) return toast('Thêm Family trước, rồi thêm khách vào nhóm.');
      const familyField=id ? '' : select('family_id','Family nhận khách',Object.fromEntries(state.families.map(f=>[f.id,f.name+' · '+f.manager_email])),state.families[0].id);
      modal('Thêm khách',familyField+memberFields(),async data=>{await post('members',{...data,family_id:Number(id||data.family_id)});toast('Đã thêm khách.');});
    }
    else if (action === 'edit-member') {
      const m = state.members.find(m => m.id === Number(id)); modal('Sửa khách / Gia hạn', memberFields(m), async data => { await patch('members/' + id, data); toast('Đã cập nhật khách và hạn sử dụng.'); });
    } else if (action === 'renewal-status') {
      const m = state.members.find(m => m.id === Number(id));
      modal('Gia hạn · ' + (m.customer_name || m.email), `<div id="renewal-form" data-expiry="${escape(m.expires_at)}">` + select('status', 'Trạng thái gia hạn', renewalLabels, m.renewal_status === 'not_contacted' ? 'paid' : m.renewal_status) + input('amount', 'Số tiền đã nhận cho lần gia hạn (VND)', 'number', m.renewal_amount, false, 'min="0" max="1000000000" step="1"') + input('paid_at', 'Ngày nhận tiền gia hạn', 'date', m.renewal_paid_at || state.today, false, `max="${state.today}"`) + select('plan_months', 'Gói gia hạn', planOptions(m.plan_months), m.plan_months || 1) + '<label class="check-label"><input type="checkbox" name="apply_now" id="renewal-auto" checked> Tự cập nhật ngày mua và hạn khi đã thanh toán đủ</label><p id="renewal-date-preview"></p><label for="renewal-note">Ghi chú gia hạn</label><textarea id="renewal-note" name="note" maxlength="1000">' + escape(m.renewal_note) + '</textarea><p>Chờ tiền hoặc trả một phần chưa đổi ngày. Kỳ mới luôn nối từ ngày hết hạn cũ, kể cả trả muộn. Ngày nhận tiền được lưu riêng. </p></div>', async data => { const result = await patch('members/' + id + '/renewal', { ...data, revision:m.renewal_revision, apply_now:data.apply_now === 'on' && data.status === 'paid' }); toast(result.applied ? 'Đã gia hạn: ngày mua và ngày hết hạn đã cập nhật.' : 'Đã lưu trạng thái gia hạn; ngày chưa thay đổi.'); }, 'Lưu gia hạn');
      updateRenewalPreview();
    } else if (action === 'renewal-apply') {
      const m = state.members.find(m => m.id === Number(id));
      modal('Xác nhận gia hạn', `<div id="renewal-form" data-expiry="${escape(m.expires_at)}" data-paid="${escape(m.renewal_paid_at)}"><p>Khách: ${escape(m.customer_name || m.email)}<br>Hạn hiện tại: ${day(m.expires_at)}<br>Ngày nhận tiền: ${day(m.renewal_paid_at)}<br>Tiền gia hạn đã ghi nhận: ${Number(m.renewal_amount).toLocaleString('vi-VN')} ₫.</p>` + select('plan_months', 'Gói gia hạn', planOptions(m.plan_months), m.plan_months || 1) + '<p id="renewal-date-preview"></p><p>Hạn mới được tự tính theo gói. Xác nhận cập nhật ngày mua, hạn và lưu lịch sử; </p></div>', async data => { await post('members/' + id + '/renewal/apply', { ...data,revision:m.renewal_revision }); toast('Đã cập nhật ngày mua, hạn mới và lưu lịch sử.'); }, 'Xác nhận gia hạn');
      updateRenewalPreview();
    } else if (action === 'renewal-history') {
      const history = (await api('members/' + id + '/renewal-history')).history;
      modal('Lịch sử gia hạn', history.length ? history.map(h => `<div class="list-item"><strong>${day(h.old_expires_at)} → ${day(h.new_expires_at)}</strong><p>Ngày mua: ${day(h.old_purchase_at)} → ${day(h.new_purchase_at)}</p><p>${h.plan_months} tháng · ${Number(h.amount).toLocaleString('vi-VN')} ₫ · Nhận tiền ${day(h.paid_at)}</p><p>${escape(h.note)}</p><span class="subtext">${escape(h.created_by)} · ${date(h.created_at)}</span></div>`).join('') : '<p>Chưa có lần gia hạn đã xác nhận.</p>', async () => {}, 'Đóng');
    }
    else if (action.startsWith('delete-')) {
      const table = { 'delete-account': 'accounts', 'delete-family-record': 'families', 'delete-member': 'members' }[action];
      modal('Xóa hồ sơ nội bộ?', '<p>Hồ sơ sẽ bị xóa khỏi ứng dụng. ' + (table === 'families' ? 'Danh sách khách trong hồ sơ này cũng sẽ bị xóa. ' : '') + '</p>', async () => { await api(table + '/' + id, { method: 'DELETE' }); toast('Đã xóa hồ sơ nội bộ.'); }, 'Xóa hồ sơ');
    }
  } catch (error) { toast(error.message); }
});
window.addEventListener('hashchange', draw);
async function sync() {
  if ($('#modal').open) return;
  try {await refresh(false);if (!['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))draw();}
  catch(error){toast('Không thể cập nhật: '+error.message);}
}
try {await refresh();} catch {$('#main').innerHTML='<div class="error-box">Không thể tải dữ liệu. Kiểm tra máy chủ rồi tải lại trang.</div>';}
setInterval(sync, 10000);
function importPage() {
  const guide = '<section class="card"><h2>Từ Google Sheets sang ứng dụng</h2><p>Trong Google Sheets: Tệp → Tải xuống → Giá trị được phân tách bằng dấu phẩy (.csv). Mỗi lần tải chỉ gồm tab đang mở. Giữ bản sheet gốc để đối chiếu.</p><p>Hỗ trợ nhiều Family xếp nối tiếp nhau và cả bảng có dòng đầu chứa email quản lý, ô mật khẩu rồi Gói mua / Ngày mua / Ngày đến hạn. Ô mật khẩu đầu bảng được loại bỏ. Cột đếm ngược Ngày pay không nhập; số ngày còn lại được tính lại theo hạn.</p></section>';
  if (!importData) return hero('NHẬP DỮ LIỆU', 'Nhập khách từ Google Sheets', 'Chọn CSV, ghép cột, xem trước rồi xác nhận.') + guide + '<section class="card"><h2>Chọn tệp CSV</h2><label for="csv-file">Tệp CSV từ Google Sheets (tối đa 1 MB, 10.000 dòng)</label><input id="csv-file" type="file" accept=".csv,text/csv"><p>Không cần chia sẻ Google Sheet hoặc cấp quyền Google. Tệp được đọc trên máy bạn; chỉ các cột đã chọn được gửi tới ứng dụng cục bộ.</p></section>';
  const d = importData;
  const confidential = value => ['pass','password','matkhau','otp','recoverycode'].includes(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().replace(/[^a-z0-9]/g,''));
  const options = field => '<option value="-1">Không nhập cột này</option>' + d.headers.map((h,i) => confidential(h) ? '' : `<option value="${i}" ${d.mapping[field] === i ? 'selected' : ''}>${escape(h)} (cột ${i+1})</option>`).join('');
  return hero('NHẬP DỮ LIỆU', d.filename, `${d.records.length} dòng khách · Chưa lưu vào hệ thống.`, '<button class="secondary" id="import-reset">Chọn tệp khác</button>') + (d.legacy ? `<div class="notice">Đã nhận dạng ${d.family_count || 1} Family trong sheet. Các dòng email quản lý được tách riêng, toàn bộ ô mật khẩu/ghi chú xác minh ở dòng đó đã bỏ. Không nhập cột Ngày pay đếm ngược.</div>` : '') + `<section class="card"><h2>1. Chọn cột dữ liệu</h2><div class="mapping-grid">${Object.entries(importFields).map(([field,label]) => `<div><label for="map-${field}">${label}</label><select id="map-${field}" data-import-map="${field}">${options(field)}</select></div>`).join('')}</div><p>Ngày nhận dd/mm/yyyy hoặc yyyy-mm-dd. Gói nhận 1, 2, 3, 6, 12 tháng. Contact giữ nguyên liên kết/ghi chú. Nếu sheet không có thanh toán, giữ “Không nhập cột này”; không suy ra từ cột Ngày pay.</p></section><section class="card"><h2>2. Chọn Family và khách trùng</h2><label for="import-family">Family nhận khách (khi CSV không có cột Family)</label><select id="import-family"><option value="">Dùng cột Family/email quản lý hoặc tạo Family mới bên dưới</option>${state.families.map(f => `<option value="${f.id}" ${String(d.family_id) === String(f.id) ? 'selected' : ''}>${escape(f.name)} · ${escape(f.manager_email)}</option>`).join('')}</select>${true ? `<label class="check-label"><input id="import-create" type="checkbox" ${d.create_groups ? 'checked' : ''}> Cho phép tạo hồ sơ Family/tài khoản quản lý còn thiếu</label><div class="form-grid"><div><label for="import-manager">Email quản lý mặc định (khi chưa chọn Family)</label><input id="import-manager" type="email" value="${escape(d.default_manager)}" placeholder="manager@example.com"></div><div><label for="import-group-name">Tên Family mới (không bắt buộc)</label><input id="import-group-name" value="${escape(d.default_family)}" maxlength="200" placeholder="Family 01"></div></div>` : ''}<label for="import-duplicates">Khách đã có cùng email trong cùng Family</label><select id="import-duplicates"><option value="skip" ${d.duplicates === 'skip' ? 'selected' : ''}>Bỏ qua — giữ nguyên dữ liệu cũ</option><option value="update" ${d.duplicates === 'update' ? 'selected' : ''}>Cập nhật cột đã chọn — ô trống giữ dữ liệu cũ</option></select><p>Các dòng trùng trong CSV giữ dòng đầu. Family có tối đa 5 thành viên đang ghi nhận; hồ sơ Đã mời, chưa vào được giữ riêng và chưa tính chỗ. Khi có dòng lỗi, không nhập dòng nào; bạn sửa CSV rồi xem trước lại.</p><button id="import-preview" class="primary">Xem trước dữ liệu</button><p id="import-error" role="alert"></p></section><div id="import-results">${importPreview ? previewHTML(importPreview) : ''}</div>`;
}
function previewHTML(p) {
  const s = p.summary, labels = { create: 'Thêm mới', update: 'Cập nhật', skip: 'Bỏ qua', error: 'Lỗi' };
  return stats([['Thêm mới',s.create],['Cập nhật',s.update],['Bỏ qua',s.skip],['Dòng lỗi',s.errors]]) + `<section class="card"><h2>3. Xác nhận nhập</h2><p>${s.new_accounts} tài khoản quản lý mới, ${s.new_families} hồ sơ Family mới sẽ được tạo. Dữ liệu được lưu vào danh sách khách và Family.</p>${p.groups.length ? '<p>Family mới: '+p.groups.map(g => escape(g.name)+' · '+escape(g.manager_email)).join('; ')+'</p>' : ''}<div class="table-wrap"><table><thead><tr><th>DÒNG</th><th>EMAIL</th><th>FAMILY</th><th>XỬ LÝ</th><th>CHI TIẾT</th></tr></thead><tbody>${p.rows.map(r => `<tr><td>${r.line}</td><td>${escape(r.email)}<span class="subtext">${escape(r.customer_name)}</span></td><td>${escape(r.family_name)}${r.status === 'create' || r.status === 'update' ? `<span class="subtext">Gói ${r.plan_months || 'chưa đặt'} tháng · Mua ${day(r.joined_at)} · Hạn ${day(r.expires_at)}</span>` : ''}</td><td><span class="badge ${r.status === 'error' ? 'red' : 'blue'}">${labels[r.status]}</span></td><td>${escape(r.message)}</td></tr>`).join('')}</tbody></table></div>${s.total > p.rows.length ? `<p>Hiển thị ${p.rows.length}/${s.total} dòng đầu.</p>` : ''}${p.errors.length ? '<div class="error-box">'+p.errors.map(e => `Dòng ${e.line}: ${escape(e.message)}`).join('<br>')+'</div>' : ''}<p>Tệp gốc không được lưu. Kiểm tra thông tin và sao lưu thư mục data trước khi nhập lượng khách lớn.</p><button id="import-confirm" class="primary" ${s.errors || !(s.create+s.update) ? 'disabled' : ''}>Xác nhận nhập ${s.create+s.update} khách</button></section>`;
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

function customerList() {
  return `<section class="card"><h2>Danh sách khách</h2><div class="toolbar"><input id="customer-search" aria-label="Tìm khách" placeholder="Tìm email, tên, Contact hoặc Family…" value="${escape(customerSearch)}"><select id="customer-filter" aria-label="Lọc khách">${Object.entries({'':'Tất cả khách',due_soon:'Sắp hết hạn (2 ngày)',expired:'Đã quá hạn',unpaid:'Chưa thanh toán kỳ hiện tại',renewal_waiting:'Chờ tiền gia hạn / trả một phần',renewal_paid:'Đã trả tiền — chưa cập nhật hạn',renewal_declined:'Không gia hạn',unknown:'Chưa đặt hạn'}).map(([key,label])=>`<option value="${key}" ${customerFilter===key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div id="customer-table">${filteredCustomers()}</div></section>`;
}

function otherProductTable(rows) {
  return rows.length ? `<div class="table-wrap"><table><thead><tr><th>SẢN PHẨM / KHÁCH</th><th>NGÀY MUA</th><th>NGÀY HẾT HẠN</th><th>THANH TOÁN</th><th>GHI CHÚ</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td><strong>${escape(p.product)}</strong><span class="subtext">${escape(p.customer_name||p.email)}</span><span class="subtext">${escape(p.email)}</span><span class="subtext">${escape(p.contact)}</span></td><td>${day(p.joined_at)}</td><td>${day(p.expires_at)}<span class="subtext">${expiryBadge(p)}</span></td><td>${payments[p.payment_status]}<span class="subtext">${Number(p.amount).toLocaleString('vi-VN')} ₫</span></td><td>${escape(p.note)}</td><td><div class="row-actions">${p.expires_at ? btn('product-remind','Nhắc hạn','secondary tiny',`data-id="${p.id}"`) : ''}${btn('edit-product','Sửa','secondary tiny',`data-id="${p.id}"`)}${btn('delete-product','Xóa','danger tiny',`data-id="${p.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có sản phẩm phù hợp','Thêm sản phẩm khách đã mua và ghi chú để theo dõi.',btn('add-product','+ Thêm sản phẩm đã bán','primary'));
}
function filteredProducts(){const q=productSearch.toLowerCase();return otherProductTable(state.other_products.filter(p=>`${p.product} ${p.customer_name} ${p.email} ${p.contact} ${p.note}`.toLowerCase().includes(q)&&(!productFilter||p.expiry_status===productFilter)));}
document.addEventListener('change',event=>{
  if(event.target.name!=='existing_customer'||!event.target.value)return;
  const m=state.members.find(m=>m.id===Number(event.target.value));if(!m)return;
  for(const name of ['customer_name','email','contact']){const field=$('#modal-fields [name='+name+']');if(field)field.value=m[name]||'';}
});
