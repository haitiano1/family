import { renewalDates, trialUsageDays, isPendingPayment, sortCustomers } from './domain.js';
import { prepareSheet, suggestMapping, importFields } from './csv.js';
import { contactParts } from './contacts.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const day = value => value ? value.split('-').reverse().join('/') : 'Chưa đặt';
const names = {overview:'Tổng quan',customers:'Khách & Gia hạn',families:'Family',archives:'Khách lưu trữ',import:'Nhập khách CSV',products:'Sản phẩm khác',issues:'Fix lỗi',journal:'Nhật ký'};
const products = { youtube:'YouTube Premium',google_one:'Google One',google_ai:'Google AI',other:'Khác' };
const planOptions = (value=0, unknown=false) => Object.fromEntries([...(unknown ? [[0,'Chưa đặt']] : []), ...[...new Set([1,2,3,6,12,...(Number(value)>0 ? [Number(value)] : [])])].sort((a,b)=>a-b).map(n=>[n,n+' tháng'])]);
const renewalLabels = { not_contacted: 'Chưa nhắc gia hạn', reminded: 'Đã nhắc khách', awaiting_payment: 'Chờ thanh toán (Confirmed)', partial: 'Đã trả một phần', paid: 'Đã thanh toán gia hạn', declined: 'Không gia hạn' };
const memberships = {unknown:'Chưa xác minh',active:'Đã vào',invited:'Đã mời, chưa vào'};
const issueStatuses={todo:'Chờ fix',doing:'Đang fix',done:'Đã fix'};
const payments = { unknown: 'Chưa ghi nhận', unpaid: 'Chưa thanh toán', partial: 'Thanh toán một phần', paid: 'Đã thanh toán' };
let state, customerSearch='',customerFilter='',submitModal,toastTimer,importData=null,importPreview=null,productSearch='',productFilter='',familySearch='',issueSearch='',draggedIssue=null,journalSearch='',journalPage=1,journalToken=0,journalTimer;
const route=()=>(location.hash.slice(1)||'overview').split('/');
function toast(text,delay=6000) { $('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',delay); }
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
const stats = entries => `<div class="stats ${entries.length===3?'stats-three':''}">${entries.map(([name, n]) => `<div class="card stat"><h2>${name}</h2><strong>${escape(n)}</strong></div>`).join('')}</div>`;
const btn=(action,title,type='secondary',attrs='')=>`<button class="${type}" data-action="${action}" ${attrs}>${title}</button>`;
const input = (name, title, type = 'text', value = '', required = false, attrs = '') => `<label for="field-${name}">${title}</label><input id="field-${name}" name="${name}" type="${type}" value="${escape(value)}" ${required ? 'required' : ''} ${attrs}>`;
const select = (name, title, options, value) => `<label for="field-${name}">${title}</label><select id="field-${name}" name="${name}">${Object.entries(options).map(([key, name]) => `<option value="${escape(key)}" ${String(value) === key ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select>`;
const noteField = value => `<label for="field-note">Ghi chú</label><textarea id="field-note" name="note" maxlength="1000">${escape(value)}</textarea>`;
function expiryBadge(m) {
  const labels = { unknown: 'Chưa đặt hạn', expired: `Quá hạn ${Math.abs(m.days_left)} ngày`, due_soon: m.days_left === 0 ? 'Hết hạn hôm nay' : `Còn ${m.days_left} ngày`, active: `Còn ${m.days_left} ngày` };
  return `<span class="badge ${m.expiry_status === 'expired' ? 'red' : m.expiry_status === 'due_soon' ? 'amber' : m.expiry_status === 'active' ? 'green' : ''}">${labels[m.expiry_status]}</span>`;
}
const copyIcon='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
function copyButton(value,label){return value?`<button type="button" class="copy-info" data-action="copy-info" data-copy="${escape(JSON.stringify(value))}" data-copy-label="${escape(label)}" title="Sao chép ${escape(label)}" aria-label="Sao chép ${escape(label)}">${copyIcon}</button>`:'';}
function customerInfo(m,includeNote=true){
  const name=m.customer_name||m.email||'',nameLabel=m.customer_name?'tên khách':'email khách';
  const contact=contactParts(m.contact).map(p=>p.href?`<a class="contact-link" href="${escape(p.href)}" target="_blank" rel="noopener noreferrer">${escape(p.text)}</a>`:escape(p.text)).join('');
  return `<div class="customer-info"><div class="info-line customer-name"><strong class="info-text">${escape(name)}</strong>${copyButton(name,nameLabel)}</div>${m.customer_name&&m.email?`<div class="info-line subtext"><span class="info-text">${escape(m.email)}</span>${copyButton(m.email,'email khách')}</div>`:''}${m.contact?`<div class="info-line subtext"><span class="contact-content info-text">${contact}</span>${copyButton(m.contact,'Contact khách')}</div>`:''}${includeNote&&m.note?`<span class="subtext customer-note">${escape(m.note)}</span>`:''}</div>`;
}
async function copyInfo(button){
  const value=JSON.parse(button.dataset.copy);if(typeof value!=='string')throw Error('Thông tin sao chép không hợp lệ.');
  let copied=false;try{await navigator.clipboard.writeText(value);copied=true;}catch{}
  if(!copied){const buffer=document.createElement('textarea'),previous=document.activeElement;buffer.className='copy-buffer';buffer.value=value;buffer.readOnly=true;document.body.append(buffer);try{buffer.focus({preventScroll:true});buffer.select();buffer.setSelectionRange(0,value.length);copied=document.execCommand('copy');}catch{}finally{buffer.remove();if(previous?.isConnected)previous.focus({preventScroll:true});}}
  if(copied){toast('Đã sao chép '+button.dataset.copyLabel+'.',2000);return;}
  modal('Sao chép thông tin','<label for="copy-value">Nội dung</label><textarea id="copy-value" readonly>'+escape(value)+'</textarea><p>Chọn nội dung rồi dùng Sao chép của thiết bị.</p>',async()=>{},'Đóng');$('#copy-value').focus();$('#copy-value').select();
}
function customerTable(members) {
  members=sortCustomers(members);
  return members.length ? `<div class="table-wrap"><table><thead><tr><th>KHÁCH HÀNG</th><th>FAMILY / GÓI</th><th>NGÀY MUA</th><th>HẾT HẠN</th><th>THANH TOÁN KỲ HIỆN TẠI</th><th>GIA HẠN TIẾP THEO</th><th>THAO TÁC</th></tr></thead><tbody>${members.map(m => `<tr><td>${customerInfo(m)}</td><td><a class="email-link" href="#family/${m.family_id}">${escape(m.family_name)}</a><span class="subtext">${products[m.service]}${m.plan_months ? ' · ' + m.plan_months + ' tháng' : ''}</span></td><td>${day(m.joined_at)}</td><td>${day(m.expires_at)}<span class="subtext">${expiryBadge(m)}</span></td><td><span class="badge ${m.payment_status === 'paid' ? 'green' : 'amber'}">${payments[m.payment_status]}</span><span class="subtext">${Number(m.amount).toLocaleString('vi-VN')} ₫</span></td><td><span class="badge ${m.renewal_status === 'paid' ? 'green' : 'amber'}">${renewalLabels[m.renewal_status] || renewalLabels.not_contacted}</span>${m.renewal_amount ? `<span class="subtext">${Number(m.renewal_amount).toLocaleString('vi-VN')} ₫ · ${day(m.renewal_paid_at)}</span>` : ''}</td><td><div class="row-actions">${m.expires_at ? btn('remind-message', 'Nhắc hạn', 'secondary tiny', `data-id="${m.id}"`) : ''}${btn('renewal-status', 'Gia hạn', 'secondary tiny', `data-id="${m.id}"`)}${m.renewal_status === 'paid' ? btn('renewal-apply', 'Xác nhận hạn mới', 'primary tiny', `data-id="${m.id}"`) : ''}${btn('renewal-history', 'Lịch sử', 'secondary tiny', `data-id="${m.id}"`, 'all')}${btn('edit-member', 'Sửa / Gia hạn', 'secondary tiny', `data-id="${m.id}"`)}${btn('delete-member', 'Xóa hồ sơ', 'danger tiny', `data-id="${m.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có khách phù hợp', 'Thêm khách từ trang Family hoặc điều chỉnh bộ lọc.');
}
function draw() {
  if (!state) return;
  let [page,id]=route();
  if (!['overview','customers','families','family','archives','import','products','issues','journal'].includes(page)) {location.hash='overview';return;}
  const parent={import:'customers',family:'families'}[page]||page;
  document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.dataset.page===parent));
  $('#breadcrumb').textContent=`YouTube Family › ${names[parent]} ${id ? '› #'+id : ''}`;
  $('#header-actions').innerHTML=btn('backup','Sao lưu / Chuyển dữ liệu','secondary tiny')+(state.hosted ? ' '+btn('close-access','Khóa ứng dụng','secondary tiny') : '');
  let content = '';
  if (page==='overview') {
    content=hero('KHÁCH HÀNG YOUTUBE','Tổng quan','Theo dõi khách, Family, thanh toán và gia hạn.',btn('add-member','+ Thêm khách','primary')+' '+btn('add-family','+ Thêm Family','secondary')) + stats([['Khách đang ghi nhận',state.members.length],['Family',state.families.length],['Sắp hết hạn (2 ngày)',state.reminders.due_soon+state.other_reminders.due_soon],['Chờ thanh toán (Confirmed)',state.members.filter(isPendingPayment).length]]) + `<section class="card"><h2>Gia hạn & Thanh toán</h2><p>${state.members.filter(isPendingPayment).length} khách chờ thanh toán gia hạn.${state.reminders.renewal_paid_pending ? ` ${state.reminders.renewal_paid_pending} khách đã trả tiền, cần xác nhận hạn mới.` : ''}</p></section>` + (state.other_products.some(p=>['due_soon','expired'].includes(p.expiry_status)) ? `<section class="card"><div class="section-heading"><h2>Sản phẩm khác cần nhắc hạn</h2><a class="email-link" href="#products">Xem sản phẩm khác →</a></div>${otherProductTable(state.other_products.filter(p=>['due_soon','expired'].includes(p.expiry_status)))}</section>` : '') + customerList();
  } else if (page==='customers') {
    content=hero('KHÁCH HÀNG','Khách & Gia hạn','Email, Contact, kỳ sử dụng và thanh toán.',btn('add-member','+ Thêm khách','primary')+' <a class="secondary link-button" href="#import">↑ Nhập khách từ CSV</a>')+stats([['Khách đang ghi nhận',state.members.length],['Sắp hết hạn (2 ngày)',state.reminders.due_soon],['Chờ thanh toán (Confirmed)',state.members.filter(isPendingPayment).length]])+customerList();
  } else if (page==='products') {
    content=hero('SẢN PHẨM PHỤ','Sản phẩm khác','Netflix, Spotify, Google One, ChatGPT hoặc sản phẩm tự đặt tên.',btn('add-product','+ Thêm sản phẩm đã bán','primary'))+stats([['Đang ghi nhận',state.other_products.length],['Sắp hết hạn (2 ngày)',state.other_reminders.due_soon],['Đã quá hạn',state.other_reminders.expired],['Chưa đặt hạn',state.other_products.filter(p=>!p.expires_at).length]])+`<section class="card"><h2>Danh sách sản phẩm khách đã mua</h2><div class="toolbar"><input id="product-search" aria-label="Tìm sản phẩm" placeholder="Tìm khách, sản phẩm, Contact hoặc ghi chú…" value="${escape(productSearch)}"><select id="product-filter" aria-label="Lọc hạn sản phẩm">${Object.entries({'':'Tất cả',due_soon:'Sắp hết hạn',expired:'Đã quá hạn',unknown:'Chưa đặt hạn'}).map(([key,label])=>`<option value="${key}" ${key===productFilter ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div id="product-table">${filteredProducts()}</div></section>`;
  } else if (page === 'archives') {
    content = hero('LƯU TRỮ', 'Khách không gia hạn', 'Khách đã chuyển khỏi danh sách hoạt động; thông tin và lịch sử vẫn được giữ.') + `<section class="card"><p>Khách chọn Không gia hạn được chuyển vào lưu trữ ngay; thông tin, Contact và lịch sử được giữ.</p>${state.archives.length ? `<div class="table-wrap"><table><thead><tr><th>KHÁCH</th><th>FAMILY</th><th>NGÀY MUA / HẠN</th><th>LƯU TRỮ</th><th></th></tr></thead><tbody>${state.archives.map(a => `<tr><td>${customerInfo({...a.member,customer_name:a.customer_name,email:a.email},false)}</td><td>${escape(a.family_name)}<span class="subtext">${escape(a.manager_email)}</span></td><td>${day(a.member.joined_at)} → ${day(a.member.expires_at)}</td><td>${date(a.archived_at)}<span class="subtext">${escape(a.reason)}</span></td><td><div class="row-actions">${btn('archive-details','Xem dữ liệu','secondary tiny',`data-id="${a.id}"`,'all')}${btn('archive-restore','Khôi phục','secondary tiny',`data-id="${a.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có khách lưu trữ','Khách chọn Không gia hạn sẽ xuất hiện tại đây.')}</section>`;
  } else if (page==='families') {
    content=hero('FAMILY','Quản lý Family','Email quản lý, ghi chú và khách trong nhóm.',btn('add-family','+ Thêm Family','primary'))+`<section class="card"><h2>Danh sách Family</h2><div class="toolbar"><input id="family-search" aria-label="Tìm Family" placeholder="Tìm tên Family, email quản lý, email khách hoặc ghi chú…" value="${escape(familySearch)}"></div><div id="family-table">${familyTable()}</div></section>`;
  } else if(page==='issues') {
    content=hero('THEO DÕI LỖI','Fix lỗi','Kéo thẻ giữa các cột, hoặc chọn trạng thái trên thẻ. Khi Đã fix, chọn giữ mail hay đổi mail.',btn('report-family','+ Báo lỗi','primary'))+`<section class="card"><div class="toolbar"><input id="issue-search" aria-label="Tìm lỗi" placeholder="Tìm mail, Family hoặc nội dung lỗi…" value="${escape(issueSearch)}"></div><div id="issue-board">${issueBoard()}</div></section>`;
  } else if(page==='journal') {
    content=hero('LỊCH SỬ THAO TÁC','Nhật ký','Xem thời gian, nội dung và dữ liệu trước/sau khi sửa hoặc xóa.')+`<section class="card"><div class="toolbar"><input id="journal-search" aria-label="Tìm nhật ký" placeholder="Tìm email, Family hoặc thao tác…" value="${escape(journalSearch)}"></div><div id="journal-list"><p>Đang tải nhật ký…</p></div></section>`;
  } else if (page==='family') {
    const f=state.families.find(f=>f.id===Number(id));
    content=f ? `<a class="back" href="#families">← Danh sách Family</a>`+hero('FAMILY',f.name,`Email quản lý: ${escape(f.manager_email)}`,btn('add-member','+ Thêm khách','primary',`data-id="${f.id}"`))+`<section class="card"><div class="section-heading"><div><h2>Thông tin Family</h2><p>Ngày trial: ${f.trial_date ? day(f.trial_date) : 'Chưa nhập'}</p><p>${escape(f.note||'Chưa có ghi chú')}</p></div><div class="row-actions">${btn('edit-family','Sửa Family','secondary',`data-id="${f.id}"`)}${btn('report-family','Báo lỗi','secondary',`data-id="${f.id}"`)}</div></div></section><section class="card"><h2>Khách trong Family</h2>${customerTable(state.members.filter(m=>m.family_id===f.id))}</section>` : empty('Không tìm thấy Family','Hồ sơ này có thể đã được xóa.');
  } else if (page==='import') content=importPage();
  else content=empty('Không tìm thấy trang','Chọn mục trong thanh điều hướng.');
  $('#main').innerHTML = content;
  labelTables();
  if(page==='journal')loadJournal();
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
  return customerTable(state.members.filter(m => `${m.email} ${m.customer_name} ${m.contact} ${m.note} ${m.family_name}`.toLocaleLowerCase().includes(q) && (!customerFilter || (customerFilter==='confirmed' ? isPendingPayment(m) : m.expiry_status==='due_soon'))));
}
function modal(title, fields, handler, submit = 'Lưu') {
  $('#modal-title').textContent = title; $('#modal-fields').innerHTML = fields; $('#form-error').textContent = ''; $('#modal-form button[type=submit]').hidden = false; $('#modal-form button[type=submit]').textContent = submit; submitModal = handler; $('#modal').showModal();
}
function memberFields(m = {}) {
  return input('email', 'Email khách', 'email', m.email, true, 'maxlength="254"') + input('customer_name', 'Tên khách', 'text', m.customer_name, false, 'maxlength="200"') + input('contact', 'Liên hệ (điện thoại / Zalo)', 'text', m.contact, false, 'maxlength="1000"') + select('plan_months', 'Gói mua', planOptions(m.plan_months,true), m.plan_months || 0) + '<div class="form-grid">' + input('joined_at', 'Ngày mua', 'date', m.joined_at ?? state.today) + input('expires_at', 'Ngày hết hạn', 'date', m.expires_at) + '</div>' + select('payment_status', 'Thanh toán', payments, m.payment_status || 'unpaid') + input('amount', 'Số tiền đã ghi nhận (VND)', 'number', m.amount || 0, false, 'min="0" max="1000000000" step="1"') + noteField(m.note) + select('membership_status','Trạng thái thành viên',memberships,m.membership_status || 'unknown') + '<p>Để lưu tiền và lịch sử gia hạn, dùng nút Gia hạn rồi Xác nhận hạn mới. Sửa hồ sơ không tự thu tiền.</p>';
}
$('#modal-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  try {const result=await submitModal(Object.fromEntries(new FormData(event.currentTarget)));$('#modal').close();await refresh(false);if(result?.route)location.hash=result.route;draw();}
  catch (error) { $('#form-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
$('#close-modal').onclick = $('#cancel-modal').onclick = () => $('#modal').close();
for (const eventName of ['input','change']) document.addEventListener(eventName,event=>{
  // Text searches already render on input; rendering again on blur removes a clicked row button.
  if(eventName==='change'&&event.target.tagName!=='SELECT')return;
  if(event.target.id==='family-search'){familySearch=event.target.value;$('#family-table').innerHTML=familyTable();labelTables();return;}
  if(event.target.id==='issue-search'){issueSearch=event.target.value;$('#issue-board').innerHTML=issueBoard();return;}
  if(event.target.id==='journal-search'){journalSearch=event.target.value;journalPage=1;++journalToken;$('#journal-list').innerHTML='<p>Đang tìm nhật ký…</p>';clearTimeout(journalTimer);journalTimer=setTimeout(loadJournal,250);return;}
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
    if(action==='copy-info'){await copyInfo(button);return;}else if(action==='report-family'){
      if(!state.families.length)return toast('Tạo Family trước khi báo lỗi.');
      modal('Báo lỗi Family',select('family_id','Family',Object.fromEntries(state.families.map(f=>[f.id,f.name+' · '+f.manager_email])),id||state.families[0].id)+select('issue_target','Mail gặp lỗi',{},'')+input('subject_email','Email được báo lỗi','email','',false,'readonly')+'<div class="form-grid">'+input('trial_date','Ngày trial trong Family','date','',false,'readonly')+input('reported_on','Ngày lỗi (ngày báo lỗi)','date',state.today,false,'readonly')+'</div><p id="issue-usage-preview"></p>'+input('title','Nội dung lỗi','text','',true,'maxlength="200"')+noteField(''),async data=>{const [type,targetId]=data.issue_target.split(':');await post('issues',{family_id:Number(data.family_id),target_type:type,target_id:Number(targetId),title:data.title,note:data.note});issueSearch='';location.hash='issues';toast('Đã đưa mail vào Chờ fix.');},'Báo lỗi');updateIssueTargets();
    }else if(action==='issue-complete'){
      const issue=state.issues.find(i=>i.id===Number(id));completeIssue(issue);
    }else if(action==='issue-edit'){
      const issue=state.issues.find(i=>i.id===Number(id));modal('Sửa lỗi',`<p>${escape(issue.subject_email)} · ${escape(issue.family_name)}</p>`+input('title','Nội dung lỗi','text',issue.title,true,'maxlength="200"')+noteField(issue.note)+select('status','Trạng thái lỗi',issueStatuses,issue.status)+completionFields(issue),async data=>{await patch('issues/'+issue.id,{...data,revision:issue.revision,expected_created_at:issue.created_at,expected_email:issue.target_current_email||issue.subject_email});if(data.resolution==='replace'){familySearch='';customerSearch='';}toast('Đã lưu lỗi.');});updateCompletionFields();
    }else if(action==='issue-delete'){
      const issue=state.issues.find(i=>i.id===Number(id));if(!issue||issue.status!=='done')return;
      modal('Xóa case đã fix?',`<p>${escape(issue.subject_email)} · ${escape(issue.title)}</p><p>Chỉ xóa thẻ lỗi khỏi bảng Fix lỗi. Hồ sơ trong Family được giữ; nhật ký vẫn lưu case này.</p>`,async()=>{await api('issues/'+issue.id,{method:'DELETE',body:JSON.stringify({revision:issue.revision,expected_created_at:issue.created_at})});toast('Đã xóa case đã fix.');},'Xóa case');
    }else if(action==='journal-details'){
      const entry=await api('journal/'+kind+'/'+id);modal('Chi tiết nhật ký',journalDetails(entry),async()=>{},'Đóng');
    }else if(action==='journal-page'){
      journalPage=Number(button.dataset.page);loadJournal();
    }else if (action==='backup') {
      modal('Sao lưu / Chuyển dữ liệu','<p>File sao lưu giữ khách, Family, Contact, sản phẩm khác, lịch sử gia hạn, khách lưu trữ, ngày trial, case lỗi và nhật ký.</p><p><a class="primary link-button" href="/api/backup" download>Tải file sao lưu</a></p><label for="backup-file">Khôi phục vào ứng dụng đang trống</label><input id="backup-file" type="file" accept=".json,application/json"><p>Để chuyển lên hosting: tải file từ máy tính, mở địa chỉ hosting rồi chọn file tại đây. Bản khôi phục chỉ nhận vào ứng dụng đang trống.</p>',async()=>{const file=$('#backup-file').files[0];if (!file) throw new Error('Chọn file sao lưu .json để khôi phục, hoặc nhấn Hủy sau khi tải sao lưu.');if (file.size>32000000) throw new Error('File quá lớn (tối đa 32 MB).');let data;try {data=JSON.parse(await file.text());} catch {throw new Error('File JSON không hợp lệ.');}const result=await post('restore',data);toast(`Đã khôi phục ${result.customers} khách, ${result.families} Family và ${result.other_products} sản phẩm khác.`);},'Khôi phục dữ liệu');
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
      modal('Dữ liệu khách lưu trữ', customerInfo(m,false)+`<p>Gói: ${m.plan_months || 'chưa đặt'} tháng · Ngày mua ${day(m.joined_at)} · Hạn ${day(m.expires_at)}</p><p>Thanh toán: ${payments[m.payment_status]} · ${Number(m.amount).toLocaleString('vi-VN')} ₫</p><p>Ghi chú: ${escape(m.note)}</p><p>Gia hạn: ${renewalLabels[m.renewal_status]} · ${escape(m.renewal_note)}</p><h2>Lịch sử gia hạn</h2>` + (history.map(h=>`<div class="list-item">${day(h.old_expires_at)} → ${day(h.new_expires_at)}<p>${Number(h.amount).toLocaleString('vi-VN')} ₫ · ${escape(h.created_by)} · ${date(h.created_at)}</p></div>`).join('') || '<p>Chưa có lần đã xác nhận.</p>'), async()=>{}, 'Đóng');
    } else if (action === 'archive-restore') {
      const a=state.archives.find(a=>a.id===Number(id)); if (!state.families.length) return toast('Tạo hồ sơ Family trước khi khôi phục khách.');
      modal('Khôi phục khách', `<p>${escape(a.email)} sẽ trở lại danh sách hoạt động. Gia hạn tiếp theo về Chưa nhắc; hạn cũ và lịch sử được giữ.</p>` + select('family_id','Family nhận khách',Object.fromEntries(state.families.map(f=>[f.id,f.name+' · '+f.manager_email])),a.member.family_id), async data=>{ await post('archives/'+id+'/restore',data); toast('Đã khôi phục khách và lịch sử.'); }, 'Khôi phục');
    } else if (['add-family','edit-family'].includes(action)) {
      const f=action==='edit-family' ? state.families.find(f=>f.id===Number(id)) : null;
      modal(f ? 'Sửa Family' : 'Thêm Family',input('name','Tên Family','text',f?.name,true,'maxlength="200"')+input('manager_email','Email quản lý Family','email',f?.manager_email,true,'maxlength="254"')+input('trial_date','Ngày trial','date',f?.trial_date||'')+'<p>Nhập ngày bắt đầu trial của mail quản lý. Khi báo lỗi, ứng dụng lưu ngày này để tính số ngày đã sử dụng.</p>'+noteField(f?.note),async data=>{await(f ? patch('families/'+id,{...data,service:f.service}) : post('families',{...data,service:'youtube'}));toast('Đã lưu Family.');});
    } else if (action==='add-member') {
      if (!state.families.length) return toast('Thêm Family trước, rồi thêm khách vào nhóm.');
      const familyField=id ? '' : select('family_id','Family nhận khách',Object.fromEntries(state.families.map(f=>[f.id,f.name+' · '+f.manager_email])),state.families[0].id);
      modal('Thêm khách',familyField+memberFields(),async data=>{await post('members',{...data,family_id:Number(id||data.family_id)});toast('Đã thêm khách.');});
    }
    else if (action === 'edit-member') {
      const m = state.members.find(m => m.id === Number(id)); modal('Sửa khách / Gia hạn', memberFields(m), async data => { await patch('members/' + id, data); toast('Đã cập nhật khách và hạn sử dụng.'); });
    } else if (action === 'renewal-status') {
      const m = state.members.find(m => m.id === Number(id));
      modal('Gia hạn · ' + (m.customer_name || m.email), `<div id="renewal-form" data-expiry="${escape(m.expires_at)}">` + select('status', 'Trạng thái gia hạn', renewalLabels, m.renewal_status === 'not_contacted' ? 'paid' : m.renewal_status) + input('amount', 'Số tiền đã nhận cho lần gia hạn (VND)', 'number', m.renewal_amount, false, 'min="0" max="1000000000" step="1"') + input('paid_at', 'Ngày nhận tiền gia hạn', 'date', m.renewal_paid_at || state.today, false, `max="${state.today}"`) + select('plan_months', 'Gói gia hạn', planOptions(m.plan_months), m.plan_months || 1) + '<label class="check-label"><input type="checkbox" name="apply_now" id="renewal-auto" checked> Tự cập nhật ngày mua và hạn khi đã thanh toán đủ</label><p id="renewal-date-preview"></p><label for="renewal-note">Ghi chú gia hạn</label><textarea id="renewal-note" name="note" maxlength="1000">' + escape(m.renewal_note) + '</textarea><p>Chờ tiền hoặc trả một phần chưa đổi ngày. Kỳ mới luôn nối từ ngày hết hạn cũ, kể cả trả muộn. Ngày nhận tiền được lưu riêng. Chọn Không gia hạn sẽ chuyển khách vào Khách lưu trữ ngay.</p></div>', async data => { const result = await patch('members/' + id + '/renewal', { ...data, revision:m.renewal_revision, apply_now:data.apply_now === 'on' && data.status === 'paid' }); if(result.archived){toast('Đã chuyển khách vào Khách lưu trữ.');return {route:'archives'};}toast(result.applied ? 'Đã gia hạn: ngày mua và ngày hết hạn đã cập nhật.' : 'Đã lưu trạng thái gia hạn; ngày chưa thay đổi.'); }, 'Lưu gia hạn');
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
  if ($('#modal').open||draggedIssue!==null) return;
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
  return `<section class="card"><h2>Danh sách khách</h2><div class="toolbar"><input id="customer-search" aria-label="Tìm khách" placeholder="Tìm email, tên, Contact hoặc Family…" value="${escape(customerSearch)}"><select id="customer-filter" aria-label="Lọc khách">${Object.entries({'':'Tất cả khách',due_soon:'Sắp hết hạn',confirmed:'Chờ thanh toán (Confirmed)'}).map(([key,label])=>`<option value="${key}" ${customerFilter===key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div id="customer-table">${filteredCustomers()}</div></section>`;
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

function familyTable(){
  const q=familySearch.toLocaleLowerCase();const rows=state.families.filter(f=>`${f.name} ${f.manager_email} ${f.note} ${state.members.filter(m=>m.family_id===f.id).map(m=>m.email+' '+m.customer_name).join(' ')}`.toLocaleLowerCase().includes(q));
  return rows.length?`<div class="table-wrap"><table><thead><tr><th>FAMILY</th><th>EMAIL QUẢN LÝ</th><th>NGÀY TRIAL</th><th>KHÁCH ĐANG GHI NHẬN</th><th>THAO TÁC</th></tr></thead><tbody>${rows.map(f=>{const open=(state.issues||[]).filter(i=>i.family_id===f.id&&i.status!=='done').length;return `<tr><td><a class="email-link" href="#family/${f.id}">${escape(f.name)}</a><span class="subtext">${escape(f.note)}</span>${open?`<span class="badge amber">${open} lỗi cần fix</span>`:''}</td><td>${escape(f.manager_email)}</td><td>${f.trial_date ? day(f.trial_date) : 'Chưa nhập'}</td><td>${state.members.filter(m=>m.family_id===f.id).length}</td><td><div class="row-actions">${btn('edit-family','Sửa','secondary tiny',`data-id="${f.id}"`)}${btn('delete-family-record','Xóa hồ sơ','danger tiny',`data-id="${f.id}"`)}${btn('report-family','Báo lỗi','secondary tiny',`data-id="${f.id}"`)}</div></td></tr>`;}).join('')}</tbody></table></div>`:empty('Chưa có Family phù hợp','Thêm Family hoặc điều chỉnh tìm kiếm.');
}
function issueBoard(){
  const q=issueSearch.toLocaleLowerCase(),rows=(state.issues||[]).filter(i=>`${i.subject_email} ${i.original_email} ${i.family_name} ${i.title} ${i.note} ${i.resolution_note}`.toLocaleLowerCase().includes(q));
  return `<div class="issue-board">${Object.entries(issueStatuses).map(([status,label])=>{const items=rows.filter(i=>i.status===status);return `<section class="issue-column" data-status-column="${status}" aria-label="${label}"><h2>${label} <span class="badge">${items.length}</span></h2><div class="issue-stack">${items.map(i=>`<article class="issue-card" draggable="true" data-issue-id="${i.id}"><strong>${escape(i.subject_email)}</strong><span class="subtext">${escape(i.family_name)} · ${i.target_type==='manager'?'Mail quản lý':'Mail khách'}</span><div class="issue-dates"><span>Ngày lỗi: <b>${i.reported_on ? day(i.reported_on) : 'Chưa có'}</b></span><span>Ngày trial: <b>${i.trial_date ? day(i.trial_date) : 'Chưa nhập'}</b></span><span>Đã sử dụng: <b>${i.days_used!==null&&i.days_used!==undefined ? i.days_used+' ngày' : i.trial_date ? 'Chưa đến ngày trial' : 'Chưa có ngày trial'}</b></span></div><h3>${escape(i.title)}</h3><p>${escape(i.note)}</p>${i.original_email!==i.subject_email?`<span class="subtext">Mail báo lỗi ban đầu: ${escape(i.original_email)}</span>`:''}${i.resolution_note?`<p class="resolution-note">${escape(i.resolution_note)}</p><span class="subtext">${date(i.done_at)}</span>`:''}${!i.target_available&&i.status!=='done'?'<span class="badge amber">Hồ sơ liên quan không còn trong Family</span>':''}<label for="issue-status-${i.id}" class="sr-label">Trạng thái ${escape(i.subject_email)}</label><select id="issue-status-${i.id}" data-issue-status="${i.id}" aria-label="Trạng thái ${escape(i.subject_email)}">${Object.entries(issueStatuses).map(([v,n])=>`<option value="${v}" ${status===v?'selected':''}>${n}</option>`).join('')}</select><div class="row-actions">${btn('issue-edit','Sửa lỗi','secondary tiny',`data-id="${i.id}"`)}${status!=='done'?btn('issue-complete','Đã fix','primary tiny',`data-id="${i.id}"`):btn('issue-delete','Xóa case','danger tiny',`data-id="${i.id}"`)}</div></article>`).join('')||'<p class="issue-empty">Chưa có lỗi trong cột này.</p>'}</div></section>`;}).join('')}</div>`;
}
function updateIssueTargets(){
  const family=state.families.find(f=>f.id===Number($('#modal-fields [name=family_id]')?.value));if(!family)return;
  const choices={['manager:'+family.manager_id]:'Mail quản lý · '+family.manager_email,...Object.fromEntries(state.members.filter(m=>m.family_id===family.id).map(m=>['member:'+m.id,'Mail khách · '+m.email]))};
  const field=$('#modal-fields [name=issue_target]');const trial=$('#modal-fields [name=trial_date]');if(trial)trial.value=family.trial_date||'';const usage=$('#issue-usage-preview');if(usage){const days=trialUsageDays(family.trial_date,state.today);usage.textContent=days===null ? (family.trial_date ? 'Ngày trial sau ngày báo lỗi; chưa có số ngày sử dụng.' : 'Chưa nhập ngày trial trong Family; vẫn có thể báo lỗi.') : 'Đã sử dụng '+days+' ngày tính đến ngày báo lỗi.';}field.innerHTML=Object.entries(choices).map(([key,label])=>`<option value="${key}">${escape(label)}</option>`).join('');updateIssueMail();
}
function updateIssueMail(){
  const [type,id]=($('#modal-fields [name=issue_target]')?.value||'').split(':');const row=(type==='manager'?state.accounts:state.members).find(r=>r.id===Number(id));const field=$('#modal-fields [name=subject_email]');if(field)field.value=row?.email||'';
}
function completionFields(issue){return `<div id="issue-completion" data-original-status="${issue.status}">`+select('resolution','Khi Đã fix',{'keep':'Giữ nguyên mail','replace':'Đổi sang mail mới'},'keep')+`<div id="replacement-field">`+input('replacement_email','Mail mới','email','',false,'maxlength="254"')+'</div><p>Đổi mail sẽ cập nhật hồ sơ quản lý/khách trong Family và ghi rõ mail cũ → mail mới trong thẻ Đã fix và nhật ký.</p></div>';}
function updateCompletionFields(){const section=$('#issue-completion');if(!section)return;const status=$('#modal-fields [name=status]')?.value||'done';section.hidden=status!=='done'||section.dataset.originalStatus==='done';const replacing=!section.hidden&&$('#modal-fields [name=resolution]').value==='replace';$('#replacement-field').hidden=!replacing;$('#modal-fields [name=replacement_email]').required=replacing;}
function completeIssue(issue){
  if(!issue)return;
  modal('Hoàn tất fix lỗi',`<p><strong>${escape(issue.subject_email)}</strong> · ${escape(issue.family_name)}</p><p>${escape(issue.title)}</p>`+completionFields(issue)+noteField(issue.note),async data=>{await patch('issues/'+issue.id,{...data,status:'done',revision:issue.revision,expected_created_at:issue.created_at,expected_email:issue.target_current_email||issue.subject_email});if(data.resolution==='replace'){familySearch='';customerSearch='';}toast(data.resolution==='replace'?'Đã fix và cập nhật mail trong Family.':'Đã fix, giữ nguyên mail.');},'Xác nhận Đã fix');updateCompletionFields();
}
async function moveIssue(id,status){const issue=(state.issues||[]).find(i=>i.id===Number(id));if(!issue||issue.status===status)return;if(status==='done'){completeIssue(issue);return;}try{await patch('issues/'+issue.id,{status,revision:issue.revision,expected_created_at:issue.created_at});await refresh();toast('Đã chuyển sang '+issueStatuses[status]+'.');}catch(error){toast(error.message);await refresh();}}
document.addEventListener('change',event=>{if(event.target.dataset.issueStatus)moveIssue(event.target.dataset.issueStatus,event.target.value);if(event.target.name==='family_id'&&$('#modal-fields [name=issue_target]'))updateIssueTargets();if(event.target.name==='issue_target')updateIssueMail();if(['status','resolution'].includes(event.target.name))updateCompletionFields();});
document.addEventListener('dragstart',event=>{const card=event.target.closest('.issue-card');if(!card)return;if(event.target.closest('button,select,input,a')){event.preventDefault();return;}draggedIssue=Number(card.dataset.issueId);event.dataTransfer.setData('text/plain',String(draggedIssue));event.dataTransfer.effectAllowed='move';card.classList.add('dragging');});
document.addEventListener('dragover',event=>{const col=event.target.closest('[data-status-column]');if(col&&draggedIssue!==null){event.preventDefault();event.dataTransfer.dropEffect='move';col.classList.add('drag-over');}});
document.addEventListener('dragleave',event=>{const col=event.target.closest('[data-status-column]');if(col&&!col.contains(event.relatedTarget))col.classList.remove('drag-over');});
document.addEventListener('drop',event=>{const col=event.target.closest('[data-status-column]');if(!col||draggedIssue===null)return;event.preventDefault();const id=draggedIssue;draggedIssue=null;document.querySelectorAll('.dragging,.drag-over').forEach(el=>el.classList.remove('dragging','drag-over'));moveIssue(id,col.dataset.statusColumn);});
document.addEventListener('dragend',()=>{draggedIssue=null;document.querySelectorAll('.dragging,.drag-over').forEach(el=>el.classList.remove('dragging','drag-over'));});
$('#modal').addEventListener('close',()=>{if(route()[0]==='issues')draw();});
async function loadJournal(){
  const token=++journalToken;try{const data=await api('journal?search='+encodeURIComponent(journalSearch)+'&page='+journalPage);if(token!==journalToken||route()[0]!=='journal'||!$('#journal-list'))return;$('#journal-list').innerHTML=(data.entries.length?`<div class="table-wrap"><table><thead><tr><th>THỜI GIAN</th><th>THAO TÁC</th><th>NỘI DUNG</th><th>CHI TIẾT</th></tr></thead><tbody>${data.entries.map(e=>`<tr><td>${date(e.created_at)}<span class="subtext">${escape(e.actor)}</span></td><td>${escape(e.action)}</td><td class="journal-message">${escape(e.message)}</td><td>${btn('journal-details','Xem chi tiết','secondary tiny',`data-kind="${e.kind}" data-id="${e.id}"`)}</td></tr>`).join('')}</tbody></table></div>`:empty('Chưa có nhật ký phù hợp','Điều chỉnh tìm kiếm hoặc thực hiện một thao tác.'))+`<div class="journal-pages"><span>${data.total} mục · Trang ${data.page}</span>${btn('journal-page','← Trước','secondary tiny',`data-page="${Math.max(1,data.page-1)}" ${data.page<=1?'disabled':''}`)}${btn('journal-page','Sau →','secondary tiny',`data-page="${data.page+1}" ${data.page*data.page_size>=data.total?'disabled':''}`)}</div>`;labelTables();}catch(error){if(token===journalToken&&$('#journal-list'))$('#journal-list').innerHTML='<p class="error-box">'+escape(error.message)+'</p>';}
}
const auditLabels={accounts:'Email quản lý',families:'Family',members:'Khách',archived_customers:'Khách lưu trữ',renewal_history:'Lịch sử gia hạn',other_purchases:'Sản phẩm khác',issues:'Lỗi',email:'Email',subject_email:'Mail gặp lỗi',original_email:'Mail báo lỗi ban đầu',customer_name:'Tên khách',contact:'Contact',name:'Tên',title:'Nội dung lỗi',note:'Ghi chú',joined_at:'Ngày mua',expires_at:'Ngày hết hạn',payment_status:'Thanh toán',amount:'Số tiền',plan_months:'Gói tháng',status:'Trạng thái lỗi',resolution_note:'Kết quả fix',resolution_email:'Mail sau fix',resolution:'Lựa chọn khi fix',renewal_status:'Trạng thái gia hạn'};
Object.assign(auditLabels,{trial_date:'Ngày trial',reported_on:'Ngày lỗi',service:'Dịch vụ',product:'Sản phẩm',family_name:'Tên Family',manager_email:'Mail quản lý',old_expires_at:'Hạn cũ',new_expires_at:'Hạn mới',old_purchase_at:'Ngày mua cũ',new_purchase_at:'Ngày mua mới',paid_at:'Ngày nhận tiền',renewal_amount:'Tiền gia hạn',renewal_paid_at:'Ngày nhận tiền gia hạn',renewal_note:'Ghi chú gia hạn',declined_at:'Ngày chọn Không gia hạn',membership_status:'Trạng thái thành viên',archived_at:'Ngày lưu trữ',restored_at:'Ngày khôi phục',reason:'Lý do lưu trữ',done_at:'Ngày Đã fix',target_type:'Loại mail',snapshot:'Hồ sơ khách đã lưu'});
const auditHiddenFields=new Set(['id','revision','renewal_revision','target_id','family_id','manager_id','member_id','archive_id','restored_member_id','original_member_id','created_at','updated_at','created_by','restored_by']);
function auditValue(key,value){
  if(value===null||value===undefined||value==='')return '—';
  const labels={payment_status:payments,renewal_status:renewalLabels,membership_status:memberships,status:issueStatuses,service:products,target_type:{manager:'Mail quản lý',member:'Mail khách'},resolution:{keep:'Giữ nguyên mail',replace:'Đổi sang mail mới'}}[key];
  if(labels)return labels[value]||value;
  if(['trial_date','reported_on','joined_at','expires_at','old_expires_at','new_expires_at','old_purchase_at','new_purchase_at','paid_at','renewal_paid_at'].includes(key))return day(value);
  if(['done_at','archived_at','restored_at','declined_at'].includes(key))return date(value);
  if(['amount','renewal_amount'].includes(key))return Number(value).toLocaleString('vi-VN')+' ₫';
  return value;
}
function journalDetails(entry){
  const changes=entry.changes||[];return `<p>${date(entry.created_at)} · ${escape(entry.actor||'Cá nhân')}</p><p>${escape(entry.message)}</p>`+(changes.length?changes.map(c=>{const keys=[...new Set([...Object.keys(c.before||{}),...Object.keys(c.after||{})])].filter(k=>!auditHiddenFields.has(k)&&JSON.stringify(c.before?.[k])!==JSON.stringify(c.after?.[k]));if(!keys.length)return '';return `<section class="audit-change"><h3>${auditLabels[c.table]||escape(c.table)} #${c.id} · ${!c.before?'Thêm':!c.after?'Xóa':'Sửa'}</h3>${keys.map(k=>`<div class="audit-value"><strong>${escape(auditLabels[k]||k)}</strong><span><b>Trước:</b> ${escape(auditValue(k,c.before?.[k]))}</span><span><b>Sau:</b> ${escape(auditValue(k,c.after?.[k]))}</span></div>`).join('')}</section>`;}).join(''):'<p>Nhật ký cũ chỉ có nội dung thao tác. Chi tiết trước/sau được lưu từ bản cập nhật này.</p>');
}
