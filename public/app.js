import {startUpdater} from './updater.js';
import {openProductImport} from './product-import.js';
import {startSheetSync,queueSheetSync} from './sheets.js';
import { renewalDates, trialUsageDays, isPendingPayment, sortCustomers, sortFamilies, purchaseExpiry, familyOccupancy, renewalReceiptDate, today as localToday } from './domain.js';
import { prepareSheet, suggestMapping, importFields } from './csv.js';
import { contactParts } from './contacts.js';
import {mountVault,unmountVault} from './vault.js';
import {mountStatistics,unmountStatistics} from './statistics.js';
import {familyLookupSections,familyStatusParts,lookupPage,handleLookupAction,customerLookupAction,familyStatusBadge,inviteMailFields,createInviteMails,showInviteMails,customerReportsSection,customerReportsNotice,customerReportsCount} from './moves.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uiIcon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',alert:'<path d="m10.3 4.9-8 14a1.5 1.5 0 0 0 1.3 2.2h16.8a1.5 1.5 0 0 0 1.3-2.2l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-10 5h2"/>',wallet:'<path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v10H6a3 3 0 0 1-3-3V7"/><path d="M20 13h-4v4h4"/>',arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',check:'<path d="m5 12 4 4L19 6"/>',chart:'<path d="M4 4v16h16M8 15l4-4 4 2 4-7"/>',shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>'})[name]||''}</svg>`;
const searchField=(id,label,placeholder,value)=>`<div class="search-field">${uiIcon('search')}<input id="${id}" type="search" aria-label="${label}" placeholder="${placeholder}" value="${escape(value)}" autocomplete="off"></div>`;
const date = value => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';
const day = value => value ? value.split('-').reverse().join('/') : 'Chưa đặt';
const names = {overview:'Tổng quan',customers:'Khách & Gia hạn',families:'Family',archives:'Khách lưu trữ',import:'Nhập khách CSV',products:'Sản phẩm khác',issues:'Fix lỗi',journal:'Nhật ký',vault:'Kho tài khoản',statistics:'Thống kê',lookup:'Tra cứu khách'};
const products = { youtube:'YouTube Premium',google_one:'Google One',google_ai:'Google AI',other:'Khác' };
const planOptions = (value=0, unknown=false) => Object.fromEntries([...(unknown ? [[0,'Chưa đặt']] : []), ...[...new Set([1,2,3,6,12,...(Number(value)>0 ? [Number(value)] : [])])].sort((a,b)=>a-b).map(n=>[n,n+' tháng'])]);
const renewalLabels = { not_contacted: 'Chưa nhắc gia hạn', reminded: 'Đã nhắc khách', awaiting_payment: 'Chờ thanh toán (Confirmed)', partial: 'Đã trả một phần', paid: 'Đã thanh toán gia hạn', declined: 'Không gia hạn' };
const memberships = {unknown:'Chưa xác minh',active:'Đã vào',invited:'Đã mời, chưa vào',new:'Mua mới'};
const issueStatuses={todo:'Chờ fix',doing:'Đang fix',done:'Đã fix'};
const payments = { unknown: 'Chưa ghi nhận', unpaid: 'Chưa thanh toán', partial: 'Thanh toán một phần', paid: 'Đã thanh toán' };
const journalCategories={all:'Tất cả thao tác',create:'Thêm mới',edit:'Sửa',delete:'Xóa / Lưu trữ',renewal:'Gia hạn',transfer:'Chuyển Family',restore:'Khôi phục',import:'Nhập dữ liệu',other:'Khác / Nhật ký cũ'};
let state, customerSearch='',customerFilter='',submitModal,toastTimer,importData=null,importPreview=null,productSearch='',productFilter='',familySearch='',familyFilter='',issueSearch='',draggedIssue=null,journalSearch='',journalCategory='all',journalPage=1,journalToken=0,journalTimer,navigationSection=null,focusedIssueId=null,issueOrdering=false;
const listPages={customers:1,products:1,families:1};
const scrollPositions=new Map();let visibleRoute=location.hash;
const normalizeSearch=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLocaleLowerCase().trim();
function pageRows(rows,key){const count=Math.max(1,Math.ceil(rows.length/25));listPages[key]=Math.min(count,Math.max(1,listPages[key]));return rows.slice((listPages[key]-1)*25,listPages[key]*25);}
function pager(total,key){const page=listPages[key],count=Math.max(1,Math.ceil(total/25));return `<div class="list-pagination" aria-label="Phân trang"><span>${total?((page-1)*25+1):0}–${Math.min(page*25,total)} / ${total} hồ sơ · Trang ${page}/${count}</span>${btn('list-page','← Trước','secondary tiny',`data-list="${key}" data-page="${page-1}" ${page<=1?'disabled':''}`)}${btn('list-page','Sau →','secondary tiny',`data-list="${key}" data-page="${page+1}" ${page>=count?'disabled':''}`)}</div>`;}
const route=()=>(location.hash.slice(1)||'overview').split('/');
function toast(text,delay=6000) { $('#toast').textContent=text;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',delay); }
async function api(path,options={}) {
  const response=await fetch('/api/'+path,{...options,headers:{'Content-Type':'application/json','X-Fam-Request':'1'}});
  if (response.status===401) {location.replace('/access');throw new Error('Cần mở lại bằng mật khẩu truy cập.');}
  const data=await response.json();if (!response.ok) throw new Error(data.error||'Không thể thực hiện yêu cầu.');if(options.method&&!['GET','HEAD'].includes(options.method)&&!path.startsWith('sheets/')&&!path.startsWith('vault/')&&path!=='issues/order'&&!path.endsWith('/import/preview'))queueSheetSync();return data;
}
const post=(path,data)=>api(path,{method:'POST',body:JSON.stringify(data)});
const patch=(path,data)=>api(path,{method:'PATCH',body:JSON.stringify(data)});
async function refresh(render=true) {state=await api('state');if(state.sheets_supported)startSheetSync({api,refresh,toast,getState:()=>state});if(render)draw();}
const hero = (eyebrow, title, description, action = '') => `<section class="card hero"><div class="hero-copy"><span class="eyebrow">${eyebrow}</span><h1>${escape(title)}</h1><p>${description}</p></div>${action?`<div class="hero-actions">${action}</div>`:''}</section>`;
const empty = (title, description, action = '') => `<div class="empty"><div class="empty-icon">${uiIcon('check')}</div><h2>${title}</h2><p>${description}</p>${action}</div>`;
const stats = entries => `<div class="dashboard-summary stats ${entries.length===3?'stats-three':''}">${entries.map(([name, n]) => `<div class="card stat"><h2>${name}</h2><strong>${escape(n)}</strong></div>`).join('')}</div>`;
const btn=(action,title,type='secondary',attrs='')=>`<button class="${type}" data-action="${action}" ${attrs}>${title}</button>`;
const moreActions=(label,actions)=>`<details class="more-actions"><summary aria-label="${escape(label)}">…</summary><div class="more-actions-list">${actions}</div></details>`;
const input = (name, title, type = 'text', value = '', required = false, attrs = '') => `<div class="form-field"><label for="field-${name}">${title}</label><input id="field-${name}" name="${name}" type="${type}" value="${escape(value)}" ${required ? 'required' : ''} ${attrs}></div>`;
const select = (name, title, options, value) => `<div class="form-field"><label for="field-${name}">${title}</label><select id="field-${name}" name="${name}">${Object.entries(options).map(([key, name]) => `<option value="${escape(key)}" ${String(value) === key ? 'selected' : ''}>${escape(name)}</option>`).join('')}</select></div>`;
const noteField = value => `<div class="form-field"><label for="field-note">Ghi chú</label><textarea id="field-note" name="note" maxlength="1000">${escape(value)}</textarea></div>`;
function expiryBadge(m) {
  const labels = { unknown: 'Chưa đặt hạn', expired: `Quá hạn ${Math.abs(m.days_left)} ngày`, due_soon: m.days_left === 0 ? 'Hết hạn hôm nay' : `Còn ${m.days_left} ngày`, active: `Còn ${m.days_left} ngày` };
  return `<span class="badge ${m.expiry_status === 'expired' ? 'red' : m.expiry_status === 'due_soon' ? 'amber' : m.expiry_status === 'active' ? 'green' : ''}">${labels[m.expiry_status]}</span>`;
}
const copyIcon='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
function copyButton(value,label,text=''){return value?`<button type="button" class="${text?'secondary tiny copy-group':'copy-info'}" data-action="copy-info" data-copy="${escape(JSON.stringify(value))}" data-copy-label="${escape(label)}" title="Sao chép ${escape(label)}" aria-label="${escape(text||'Sao chép '+label)}">${copyIcon}${escape(text)}</button>`:'';}
// The personal lookup code sits right under the Gmail it belongs to (customer tables only).
function lookupCodeLine(code){return code?`<div class="info-line subtext lookup-code-line"><span class="info-text">Mã tra cứu <strong class="lookup-code">${escape(code)}</strong></span>${copyButton(code,'mã tra cứu')}</div>`:'';}
function customerInfo(m,includeNote=true,code=''){
  const name=m.customer_name||m.email||'',nameLabel=m.customer_name?'tên khách':'email khách';
  const contact=contactParts(m.contact).map(p=>p.href?`<a class="contact-link" href="${escape(p.href)}" target="_blank" rel="noopener noreferrer">${escape(p.text)}</a>`:escape(p.text)).join('');
  return `<div class="customer-info"><div class="info-line customer-name"><strong class="info-text">${escape(name)}</strong>${copyButton(name,nameLabel)}</div>${m.customer_name&&m.email?`<div class="info-line subtext"><span class="info-text">${escape(m.email)}</span>${copyButton(m.email,'email khách')}</div>`:''}${lookupCodeLine(code)}${m.contact?`<div class="info-line subtext"><span class="contact-content info-text">${contact}</span>${copyButton(m.contact,'Contact khách')}</div>`:''}${includeNote&&m.note?`<span class="subtext customer-note">${escape(m.note)}</span>`:''}</div>`;
}
async function copyInfo(button){
  const value=JSON.parse(button.dataset.copy);if(typeof value!=='string')throw Error('Thông tin sao chép không hợp lệ.');
  let copied=false;try{await navigator.clipboard.writeText(value);copied=true;}catch{}
  if(!copied){const buffer=document.createElement('textarea'),previous=document.activeElement;buffer.className='copy-buffer';buffer.value=value;buffer.readOnly=true;document.body.append(buffer);try{buffer.focus({preventScroll:true});buffer.select();buffer.setSelectionRange(0,value.length);copied=document.execCommand('copy');}catch{}finally{buffer.remove();if(previous?.isConnected)previous.focus({preventScroll:true});}}
  if(copied){toast('Đã sao chép '+button.dataset.copyLabel+'.',2000);return;}
  modal('Sao chép thông tin','<label for="copy-value">Nội dung</label><textarea id="copy-value" readonly>'+escape(value)+'</textarea><p>Chọn nội dung rồi dùng Sao chép của thiết bị.</p>',async()=>{},'Đóng');$('#copy-value').focus();$('#copy-value').select();
}
function customerTable(members,compact=false) {
  members=sortCustomers(members);
  const headers=compact?['KHÁCH HÀNG','FAMILY / GÓI','HẾT HẠN','GIA HẠN TIẾP THEO','THAO TÁC']:['KHÁCH HÀNG','FAMILY / GÓI','NGÀY MUA','HẾT HẠN','THANH TOÁN KỲ HIỆN TẠI','GIA HẠN TIẾP THEO','THAO TÁC'];
  return members.length ? `<div class="table-wrap"><table class="customer-table${compact?' customer-table--compact':''}"><thead><tr>${headers.map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${members.map(m => `<tr><td data-column="customer">${customerInfo(m,true,state.lookup_supported?state.lookup_codes?.[m.email]||'':'')}${familyIssueNotice(m.family_id,true)}</td><td data-column="family"><a class="email-link" href="#family/${m.family_id}">${escape(m.family_name)}</a><span class="subtext">${products[m.service]}${m.plan_months ? ' · ' + m.plan_months + ' tháng' : ''}</span></td>${compact?'':`<td data-column="purchased" class="date-cell">${day(m.joined_at)}</td>`}<td data-column="expiry" class="date-cell"><strong class="date-value">${day(m.expires_at)}</strong><span class="subtext">${expiryBadge(m)}</span></td>${compact?'':`<td data-column="payment"><span class="badge ${m.payment_status === 'paid' ? 'green' : 'amber'}">${payments[m.payment_status]}</span><strong class="subtext money">${Number(m.amount).toLocaleString('vi-VN')} ₫</strong></td>`}<td data-column="renewal"><span class="badge ${m.renewal_status === 'paid' ? 'green' : m.renewal_status==='not_contacted'?'':'amber'}">${renewalLabels[m.renewal_status] || renewalLabels.not_contacted}</span>${m.renewal_amount ? `<span class="subtext"><strong class="money">${Number(m.renewal_amount).toLocaleString('vi-VN')} ₫</strong>${['paid','partial'].includes(m.renewal_status)&&m.renewal_paid_at?' · '+day(m.renewal_paid_at):''}</span>` : ''}</td><td data-column="actions"><div class="row-actions">${m.renewal_status==='paid'?btn('renewal-apply','Xác nhận hạn mới','primary tiny',`data-id="${m.id}"`):btn('renewal-status','Gia hạn','primary tiny',`data-id="${m.id}"`)}<details class="more-actions"><summary aria-label="Thao tác khác cho ${escape(m.customer_name||m.email)}">…</summary><div class="more-actions-list">${m.renewal_status==='paid'?btn('renewal-status','Ghi nhận gia hạn','secondary tiny',`data-id="${m.id}"`):''}${btn('transfer-member','Chuyển Family','secondary tiny',`data-id="${m.id}"`)}${customerLookupAction(lookupContext,m)}${btn('renewal-history','Lịch sử','secondary tiny',`data-id="${m.id}"`)}${btn('edit-member','Sửa hồ sơ','secondary tiny',`data-id="${m.id}"`)}${btn('delete-member','Xóa hồ sơ','danger tiny',`data-id="${m.id}"`)}</div></details></div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có khách phù hợp', 'Thêm khách từ trang Family hoặc điều chỉnh bộ lọc.');
}
// Context handed to the Tra cứu & chuyển nhóm module (moves.js); state is read live.
const lookupContext={get state(){return state;},escape,btn,input,select,modal,post,patch,api,toast,day,date,customerInfo,copyButton,expiryBadge,moreActions,empty,hero,refresh};
function draw() {
  if (!state) return;
  let [page,id]=route();
  if (!['overview','customers','families','family','archives','import','products','issues','journal','vault','statistics','lookup'].includes(page)) {location.hash='overview';return;}
  const parent={import:'customers',family:'families'}[page]||page;
  navigationSection=parent;
  if(parent!=='issues')focusedIssueId=null;
  document.querySelectorAll('nav a').forEach(a=>{const current=a.dataset.page===parent;a.classList.toggle('active',current);if(current)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  // Customers who reported lost Premium show as a count on Fix lỗi.
  const reports=customerReportsCount(state),issuesLink=document.querySelector('nav a[data-page="issues"]');if(issuesLink){let badge=issuesLink.querySelector('.nav-count');if(reports&&!badge){badge=document.createElement('span');badge.className='nav-count';issuesLink.append(badge);}if(badge){badge.hidden=!reports;badge.textContent=String(reports);badge.title=reports+' khách báo mất Premium';}}
  document.body.dataset.page=page;
  $('#breadcrumb').textContent=id&&page==='family'?'Family / Chi tiết':names[parent];
  $('#header-date').textContent=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',weekday:'long',day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date());
  $('#header-actions').innerHTML=`<details class="header-more"><summary aria-label="Tiện ích ứng dụng">${uiIcon('grid')}<span>Tiện ích</span><span aria-hidden="true">⌄</span></summary><div class="header-more-list">${state.updates_supported?btn('updates-open','Cập nhật một chạm','secondary tiny'):''}${btn('backup','Sao lưu / Chuyển dữ liệu','secondary tiny')}${state.hosted?btn('close-access','Khóa ứng dụng','secondary tiny'):''}</div></details>`;
  if(state.updates_supported)startUpdater({toast});
  if(page==='statistics'){unmountVault();mountStatistics($('#main'),{today:state.today,api,customerInfo});return;}
  unmountStatistics();
  if(page==='vault'){mountVault($('#main'),{familyId:Number(id),families:state.families,members:state.members,issues:state.issues,getFamilyContext:()=>({families:state.families,members:state.members,issues:state.issues}),refreshFamilyContext:()=>refresh(false),toast});return;}
  unmountVault();
  let content = '';
  if (page==='overview') {
    content=todayOverview();
  } else if (page==='customers') {
    content=hero('KHÁCH HÀNG','Khách & Gia hạn','Email, Contact, kỳ sử dụng và thanh toán.',btn('add-member','+ Thêm khách','primary')+' <a class="secondary link-button" href="#import">↑ Nhập khách từ CSV</a>')+stats([['Khách đang ghi nhận',state.members.length],['Sắp hết hạn (2 ngày)',state.reminders.due_soon],['Chờ thanh toán (Confirmed)',state.members.filter(isPendingPayment).length]])+customerList();
  } else if (page==='products') {
    content=hero('SẢN PHẨM PHỤ','Sản phẩm khác','Netflix, Spotify, Google One, ChatGPT hoặc sản phẩm tự đặt tên.',btn('add-product','+ Thêm sản phẩm đã bán','primary')+' '+btn('import-products-sheet','Nhập từ Sheet','secondary'))+stats([['Đang ghi nhận',state.other_products.length],['Sắp hết hạn (2 ngày)',state.other_reminders.due_soon],['Đã quá hạn',state.other_reminders.expired],['Chưa đặt hạn',state.other_products.filter(p=>!p.expires_at).length]])+`<section class="card"><h2>Danh sách sản phẩm khách đã mua</h2><div class="toolbar">${searchField('product-search','Tìm sản phẩm','Tìm khách, sản phẩm hoặc Contact…',productSearch)}<select id="product-filter" aria-label="Lọc hạn sản phẩm">${Object.entries({'':'Tất cả',due_soon:'Sắp hết hạn',expired:'Đã quá hạn',unknown:'Chưa đặt hạn'}).map(([key,label])=>`<option value="${key}" ${key===productFilter ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div id="product-table">${filteredProducts()}</div></section>`;
  } else if (page === 'archives') {
    content = hero('LƯU TRỮ', 'Khách lưu trữ', 'Khách không gia hạn, khách vừa xóa và Family vừa xóa. Khôi phục hoặc xóa hồ sơ tại đây.') + `<section class="card"><p>Khách Family và sản phẩm khác được chuyển vào đây khi chọn Xóa hồ sơ; khách Không gia hạn cũng được lưu trữ. Thông tin, Contact và lịch sử được giữ.</p>${state.archives.length ? `<div class="table-wrap"><table><thead><tr><th>KHÁCH</th><th>FAMILY / SẢN PHẨM</th><th>NGÀY MUA / HẠN</th><th>LƯU TRỮ</th><th></th></tr></thead><tbody>${state.archives.map(a => `<tr><td>${customerInfo({...a.member,customer_name:a.customer_name,email:a.email},false)}</td><td>${escape(a.record_type==='other_product'?a.member.product:a.family_name)}<span class="subtext">${escape(a.record_type==='other_product'?'Sản phẩm khác':a.manager_email)}</span></td><td>${day(a.member.joined_at)} → ${day(a.member.expires_at)}</td><td>${date(a.archived_at)}<span class="subtext">${escape(a.reason)}</span></td><td><div class="row-actions">${btn('archive-details','Xem dữ liệu','secondary tiny',`data-id="${a.id}"`,'all')}${btn('archive-restore','Khôi phục','secondary tiny',`data-id="${a.id}"`)}${btn('archive-delete','Xóa khỏi lưu trữ','danger tiny',`data-id="${a.id}"`)}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có khách lưu trữ','Khách chọn Không gia hạn hoặc Xóa hồ sơ sẽ xuất hiện tại đây.')}</section>` + archivedFamilyTable();
  } else if (page==='families') {
    content=hero('FAMILY','Quản lý Family','Email quản lý, ghi chú và khách trong nhóm.',btn('add-family','+ Thêm Family','primary'))+`<section class="card"><h2>Danh sách Family</h2><div class="toolbar">${searchField('family-search','Tìm Family','Tìm Family, email quản lý hoặc khách…',familySearch)}<select id="family-filter" aria-label="Lọc Family">${Object.entries({'':'Tất cả',spare:'Fam dư slot',name:'Theo tên'}).map(([key,label])=>`<option value="${key}" ${key===familyFilter?'selected':''}>${label}</option>`).join('')}</select></div><div id="family-table">${familyTable()}</div></section>`;
  } else if(page==='issues') {
    content=hero('THEO DÕI LỖI','Fix lỗi','Lỗi mới báo nằm trên cùng. Kéo thẻ lên/xuống hoặc dùng mũi tên để đổi thứ tự; chuyển cột để đổi trạng thái.',btn('report-family','+ Báo lỗi','primary'))+customerReportsSection(lookupContext)+`<section class="card"><div class="toolbar">${searchField('issue-search','Tìm lỗi','Tìm mail, Family hoặc nội dung lỗi…',issueSearch)}</div><div id="issue-board">${issueBoard()}</div></section>`;
  } else if(page==='journal') {
    content=hero('LỊCH SỬ THAO TÁC','Nhật ký','Xem thời gian, nội dung và dữ liệu trước/sau khi sửa hoặc xóa.')+`<section class="card"><div class="toolbar">${searchField('journal-search','Tìm nhật ký','Tìm email, Family hoặc thao tác…',journalSearch)}<select id="journal-category" aria-label="Lọc loại thao tác">${Object.entries(journalCategories).map(([key,label])=>`<option value="${key}" ${key===journalCategory?'selected':''}>${label}</option>`).join('')}</select></div><p class="journal-legend"><span class="badge red">Xóa</span><span class="badge amber">Sửa</span> Chọn loại thao tác hoặc tìm theo email, Family. Nhật ký cũ chưa có loại được giữ trong Khác / Nhật ký cũ.</p><div id="journal-list"><p>Đang tải nhật ký…</p></div></section>`;
  } else if (page==='family') {
    const f=state.families.find(f=>f.id===Number(id));
    const familyMembers=sortCustomers(state.members.filter(m=>m.family_id===f?.id)),familyEmails=familyMembers.map(m=>m.email).filter(Boolean).join('\n');
    content=f ? `<a class="back" href="#families">← Danh sách Family</a>`+hero('FAMILY',f.name,`Email quản lý: <a class="email-link" href="#vault/${f.id}" title="Mở thông tin trong Kho tài khoản">${escape(f.manager_email)}</a>`,btn('add-member','+ Thêm khách','primary',`data-id="${f.id}"`))+(st=>`<section class="card family-info"><div class="section-heading"><div><h2>Thông tin Family ${st.badge}</h2><p>Ngày trial: ${f.trial_date ? day(f.trial_date) : 'Chưa nhập'} · ${escape(f.note||'Chưa có ghi chú')}</p>${st.line}${familyIssueNotice(f.id)}</div><div class="row-actions">${btn('edit-family','Sửa Family','secondary',`data-id="${f.id}"`)}${st.action}${familyIssueAction(f.id,'secondary')}</div></div>${st.callout}</section>`)(familyStatusParts(lookupContext,f))+`${familyLookupSections(lookupContext,f)}<section class="card"><div class="section-heading"><h2>Khách trong Family · ${familyOccupancy(familyMembers).label}</h2>${copyButton(familyEmails,'tất cả mail thành viên trong Family','Copy tất cả mail')}</div>${customerTable(familyMembers)}</section>` : empty('Không tìm thấy Family','Hồ sơ này có thể đã được chuyển vào Khách lưu trữ.');
  } else if (page==='lookup') content=lookupPage(lookupContext);
  else if (page==='import') content=importPage();
  else content=empty('Không tìm thấy trang','Chọn mục trong thanh điều hướng.');
  $('#main').innerHTML = content;
  labelTables();
  if(page==='journal')loadJournal();
  if(page==='issues'&&focusedIssueId!==null)document.querySelector(`[data-issue-id="${focusedIssueId}"]`)?.scrollIntoView({block:'nearest'});
}
function labelTables() {
  document.querySelectorAll('#main table').forEach(table=>{
    if (table.closest('#import-results')) return;
    const labels=[...table.querySelectorAll('thead th')].map(th=>{th.scope='col';return th.textContent.trim() || 'THAO TÁC';});
    table.classList.toggle('family-table',!!table.closest('#family-table'));
    if(!table.getAttribute('aria-label'))table.setAttribute('aria-label',table.closest('section')?.querySelector('h2')?.textContent||'Danh sách hồ sơ');
    table.classList.add('record-table');
    table.querySelectorAll('tbody tr').forEach(row=>[...row.cells].forEach((cell,i)=>cell.dataset.label=labels[i] || ''));
  });
}
function matchesCustomer(m,filter){return !filter||(filter==='confirmed'?isPendingPayment(m):filter==='paid_pending'?m.renewal_status==='paid':filter==='today'?m.days_left===0:m.expiry_status===filter);}
function filteredCustomers() {
  const q=normalizeSearch(customerSearch);
  const rows=sortCustomers(state.members.filter(m=>normalizeSearch(`${m.email} ${m.customer_name} ${m.contact} ${m.note} ${m.family_name}`).includes(q)&&matchesCustomer(m,customerFilter)));
  return customerTable(pageRows(rows,'customers'))+pager(rows.length,'customers');
}
function todayOverview(){
  const groups=[['expired','Quá hạn','alert','red'],['today','Hết hạn hôm nay','calendar','amber'],['due_soon','Sắp hết hạn (2 ngày)','clock','blue'],['confirmed','Chờ thanh toán','wallet','violet']];
  const cards=groups.map(([filter,title,icon,tone])=>`<button class="card task-card task-${tone}" data-action="open-customer-filter" data-filter="${filter}"><span class="task-top"><span class="task-label">${title}</span><span class="task-icon">${uiIcon(icon)}</span></span><strong class="task-count">${state.members.filter(m=>matchesCustomer(m,filter)).length}</strong><span class="task-link">Xem danh sách ${uiIcon('arrow')}</span></button>`).join('');
  const urgent=sortCustomers(state.members.filter(m=>['expired','due_soon'].includes(m.expiry_status)||isPendingPayment(m)||m.renewal_status==='paid'));
  const products=state.other_products.filter(p=>['expired','due_soon'].includes(p.expiry_status));
  const issues=state.issues.filter(i=>i.status!=='done');
  return hero('KHÔNG GIAN LÀM VIỆC','Hôm nay cần xử lý',`Theo dõi khách, nhắc hạn và quản lý tài khoản — tất cả trong một nơi.`,btn('add-member','+ Thêm khách','primary')+'<a class="secondary link-button" href="#families">Quản lý Family</a>')+customerReportsNotice(lookupContext)+`<section class="dashboard-today" aria-label="Việc cần làm hôm nay"><div class="task-grid">${cards}</div></section><section class="card dashboard-customers"><div class="section-heading table-heading"><div><h2>Khách cần xử lý <span class="section-count">${urgent.length}</span></h2><p>Ưu tiên theo hạn · Hiển thị tối đa 10 khách</p></div><a class="email-link section-link" href="#customers">Tất cả khách ${uiIcon('arrow')}</a></div>${urgent.length?customerTable(urgent.slice(0,10),true):empty('Đã xử lý xong việc hôm nay','Không có khách sắp hết hạn, quá hạn hoặc cần xử lý thanh toán.')}</section><div class="dashboard-grid"><section class="card attention-panel"><div class="section-heading"><h2>Trạng thái Family</h2><span class="panel-icon">${uiIcon('shield')}</span></div><div class="family-summary"><div><strong>${state.families.length}</strong><span>Family đang quản lý</span></div><div><strong>${state.members.length}</strong><span>Hồ sơ khách</span></div></div><a class="support-status ${issues.length?'has-issues':''}" href="#issues"><span>${uiIcon(issues.length?'alert':'check')} ${issues.length?issues.length+' lỗi cần hỗ trợ':'Không có lỗi đang chờ xử lý'}</span>${uiIcon('arrow')}</a>${(state.moves||[]).some(m=>m.effective_state==='failed')?`<a class="support-status has-issues" href="#lookup"><span>${uiIcon('alert')} ${(state.moves||[]).filter(m=>m.effective_state==='failed').length} khách báo không vào được nhóm mới</span>${uiIcon('arrow')}</a>`:''}</section><section class="card quick-panel"><h2>Truy cập nhanh</h2><p>Các công cụ thường dùng trong ngày</p><div class="quick-links"><a href="#vault"><span class="quick-icon">${uiIcon('shield')}</span><span><strong>Kho tài khoản</strong><small>Thông tin Family & mã 2FA</small></span>${uiIcon('arrow')}</a><a href="#statistics"><span class="quick-icon">${uiIcon('chart')}</span><span><strong>Thống kê</strong><small>Mua mới & gia hạn theo tháng</small></span>${uiIcon('arrow')}</a>${state.lookup_supported?`<a href="#lookup"><span class="quick-icon">${uiIcon('users')}</span><span><strong>Tra cứu khách</strong><small>Chuyển nhóm & link mời</small></span>${uiIcon('arrow')}</a>`:''}</div></section></div>`+(products.length?`<section class="card"><div class="section-heading"><h2>Sản phẩm cần nhắc hạn <span class="section-count">${products.length}</span></h2><a class="email-link" href="#products">Xem tất cả →</a></div>${otherProductTable(products.slice(0,5))}</section>`:'');
}
function modal(title, fields, handler, submit = 'Lưu') {
  $('#modal-title').textContent = title; $('#modal-fields').innerHTML = fields; $('#form-error').textContent = ''; $('#modal-form button[type=submit]').hidden = false; $('#modal-form button[type=submit]').textContent = submit; submitModal = handler; $('#modal').showModal();
}
function memberFields(m = {}) {
  return '<div data-purchase-form>'+input('email', 'Email khách', 'email', m.email, true, 'maxlength="254"') + input('customer_name', 'Tên khách', 'text', m.customer_name, false, 'maxlength="200"') + input('contact', 'Liên hệ (điện thoại / Zalo)', 'text', m.contact, false, 'maxlength="1000"') + select('plan_months', 'Gói mua', planOptions(m.plan_months,true), m.plan_months || 0) + '<div class="form-grid">' + input('joined_at', 'Ngày mua', 'date', m.joined_at ?? state.today) + input('expires_at', 'Ngày hết hạn', 'date', m.expires_at) + '</div>' + select('payment_status', 'Thanh toán', payments, m.payment_status || 'unpaid') + input('amount', 'Số tiền đã ghi nhận (VND)', 'number', m.amount || 0, false, 'min="0" max="1000000000" step="1"') + noteField(m.note) + select('membership_status','Trạng thái thành viên',memberships,m.membership_status || 'unknown') + '<p>Chọn Mua mới để lưu lượt mua đầu theo Ngày mua. Lịch sử này được giữ khi đổi trạng thái hoặc gia hạn.</p>' + '<p>Để lưu tiền và lịch sử gia hạn, dùng nút Gia hạn rồi Xác nhận hạn mới. Sửa hồ sơ không tự thu tiền.</p></div>';
}
$('#modal-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  try {const result=await submitModal(Object.fromEntries(new FormData(event.currentTarget)));$('#modal').close();await refresh(false);if(result?.route)location.hash=result.route;draw();if(typeof result?.after==='function')result.after();}
  catch (error) { $('#form-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
$('#close-modal').onclick = $('#cancel-modal').onclick = () => $('#modal').close();
for (const eventName of ['input','change']) document.addEventListener(eventName,event=>{
  // Text searches already render on input; rendering again on blur removes a clicked row button.
  if(eventName==='change'&&event.target.tagName!=='SELECT')return;
  if(event.target.id==='family-filter'){listPages.families=1;familyFilter=event.target.value;$('#family-table').innerHTML=familyTable();labelTables();return;}
  if(event.target.id==='family-search'){listPages.families=1;familySearch=event.target.value;$('#family-table').innerHTML=familyTable();labelTables();return;}
  if(event.target.id==='issue-search'){issueSearch=event.target.value;$('#issue-board').innerHTML=issueBoard();return;}
  if(event.target.id==='journal-category'){if(eventName!=='change')return;journalCategory=event.target.value;journalPage=1;clearTimeout(journalTimer);loadJournal();return;}
  if(event.target.id==='journal-search'){journalSearch=event.target.value;journalPage=1;++journalToken;$('#journal-list').innerHTML='<p>Đang tìm nhật ký…</p>';clearTimeout(journalTimer);journalTimer=setTimeout(loadJournal,250);return;}
  if (event.target.id==='product-search' || event.target.id==='product-filter') { listPages.products=1; if(event.target.id==='product-search')productSearch=event.target.value;else productFilter=event.target.value;$('#product-table').innerHTML=filteredProducts();labelTables();return;}
  if (event.target.id==='customer-search') customerSearch=event.target.value;
  else if (event.target.id==='customer-filter') customerFilter=event.target.value;
  else return;
  listPages.customers=1;
  $('#customer-table').innerHTML=filteredCustomers();
  labelTables();
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]'); if (!button) return;
  const { action, id, kind, email } = button.dataset;
  try {
    if(await handleLookupAction(lookupContext,action,button))return;
    if(action==='import-products-sheet'){openProductImport({api,refresh:()=>refresh(),toast});return;}else if(action==='issue-reorder'){await nudgeIssue(Number(id),button.dataset.direction);return;}else if(action==='issue-order-reset'){await saveIssueOrder(button.dataset.status,null,true);return;}else if(action==='copy-info'){await copyInfo(button);return;}else if(action==='view-family-issue'){showFamilyIssue(Number(id));return;}else if(action==='report-family'){
      if(!state.families.length)return toast('Tạo Family trước khi báo lỗi.');
      if(id&&openFamilyIssue(Number(id))){showFamilyIssue(Number(id));return;}
      const available=state.families.filter(f=>!openFamilyIssue(f.id));
      if(!available.length)return toast('Các Family đều đã có case đang chờ hoặc đang fix. Mở case hiện có để xử lý.');
      modal('Báo lỗi Family',select('family_id','Family',Object.fromEntries(available.map(f=>[f.id,f.name+' · '+f.manager_email])),id||available[0].id)+select('issue_target','Mail gặp lỗi',{},'')+input('subject_email','Email được báo lỗi','email','',false,'readonly')+'<div class="form-grid">'+input('trial_date','Ngày trial trong Family','date','',false,'readonly')+input('reported_on','Ngày lỗi (ngày báo lỗi)','date',state.today,false,'readonly')+'</div><p id="issue-usage-preview"></p><p class="subtext">Báo lỗi mail quản lý sẽ tự đặt Family thành <strong>Bị quét</strong> để khách thấy trên trang tra cứu. Khi case chuyển sang Đã fix, Family tự về <strong>Đang hoạt động</strong>.</p>'+input('title','Nội dung lỗi (không bắt buộc)','text','',false,'maxlength="200" placeholder="Bị quét"')+'<p class="subtext">Để trống thì web ghi là Bị quét.</p>'+noteField(''),async data=>{const [type,targetId]=data.issue_target.split(':');const created=await post('issues',{family_id:Number(data.family_id),target_type:type,target_id:Number(targetId),title:data.title,note:data.note});focusedIssueId=created.id;issueSearch='';location.hash='issues';toast('Đã đưa mail vào Chờ fix.');},'Báo lỗi');updateIssueTargets();
    }else if(action==='issue-complete'){
      const issue=state.issues.find(i=>i.id===Number(id));completeIssue(issue);
    }else if(action==='issue-edit'){
      const issue=state.issues.find(i=>i.id===Number(id));modal('Sửa lỗi',`<p>${escape(issue.subject_email)} · ${escape(issue.family_name)}</p>`+input('title','Nội dung lỗi','text',issue.title,false,'maxlength="200" placeholder="Bị quét"')+noteField(issue.note)+select('status','Trạng thái lỗi',issueStatuses,issue.status)+completionFields(issue),async data=>{const result=await patch('issues/'+issue.id,issuePayload(issue,data));if(data.resolution==='replace'){listPages.families=1;familySearch='';customerSearch='';}toast('Đã lưu lỗi.');if(data.status==='done'&&data.resolution==='replace')return afterOwnerChange(issue,result);});updateCompletionFields();
    }else if(action==='issue-delete'){
      const issue=state.issues.find(i=>i.id===Number(id));if(!issue||issue.status!=='done')return;
      modal('Xóa case đã fix?',`<p>${escape(issue.subject_email)} · ${escape(issue.title)}</p><p>Chỉ xóa thẻ lỗi khỏi bảng Fix lỗi. Hồ sơ trong Family được giữ; nhật ký vẫn lưu case này.</p>`,async()=>{await api('issues/'+issue.id,{method:'DELETE',body:JSON.stringify({revision:issue.revision,expected_created_at:issue.created_at})});toast('Đã xóa case đã fix.');},'Xóa case');
    }else if(action==='journal-details'){
      const entry=await api('journal/'+kind+'/'+id);modal('Chi tiết nhật ký',journalDetails(entry),async()=>{},'Đóng');
    }else if(action==='journal-page'){
      journalPage=Number(button.dataset.page);loadJournal();
    }else if (action==='backup') {
      modal('Sao lưu / Chuyển dữ liệu','<p>File sao lưu giữ khách, Family, Contact, sản phẩm khác, lịch sử gia hạn, khách lưu trữ, ngày trial, case lỗi, nhật ký và Kho tài khoản ở dạng mã hóa.</p><p>Để mở kho sau khôi phục, dùng lại mật khẩu kho đã đặt.</p><p><a class="primary link-button" href="/api/backup" download>Tải file sao lưu</a></p><label for="backup-file">Khôi phục vào ứng dụng đang trống</label><input id="backup-file" type="file" accept=".json,application/json"><p>Để chuyển lên hosting: tải file từ máy tính, mở địa chỉ hosting rồi chọn file tại đây. Bản khôi phục chỉ nhận vào ứng dụng đang trống.</p>',async()=>{const file=$('#backup-file').files[0];if (!file) throw new Error('Chọn file sao lưu .json để khôi phục, hoặc nhấn Hủy sau khi tải sao lưu.');if (file.size>32000000) throw new Error('File quá lớn (tối đa 32 MB).');let data;try {data=JSON.parse(await file.text());} catch {throw new Error('File JSON không hợp lệ.');}const result=await post('restore',data);toast(`Đã khôi phục ${result.customers} khách, ${result.families} Family và ${result.other_products} sản phẩm khác.`);},'Khôi phục dữ liệu');
    } else if (action==='close-access') {
      await unmountVault(true);await post('access/close',{});location.replace('/access');
    } else if(action==='transfer-member'){
      const m=state.members.find(m=>m.id===Number(id));if(!m)return toast('Hồ sơ khách đã thay đổi. Tải lại trang.');
      if(!state.families.some(f=>f.id!==m.family_id))return toast('Thêm một Family khác trước khi chuyển khách.');
      modal('Chuyển Family',customerInfo(m,false)+`<p>Đang ở: <strong>${escape(m.family_name)}</strong> · ${escape(m.manager_email)}</p><div id="transfer-family-fields" data-source-family="${m.family_id}">`+input('transfer_search','Tìm mail chủ Family','search','',false,'placeholder="Nhập mail chủ Family hoặc tên nhóm…" maxlength="254" autocomplete="off"')+select('family_id','Family nhận khách',{},'')+'<p id="transfer-family-preview"></p></div><p>Giữ nguyên gói, ngày mua/hạn, Contact, thanh toán và lịch sử gia hạn. Case Fix lỗi gắn với mail khách sẽ được xóa khỏi bảng. Nhật ký lưu Family cũ/mới và dữ liệu case trước khi xóa.</p>',async data=>{
        const family=state.families.find(f=>f.id===Number(data.family_id));if(!family)throw Error('Chọn Family nhận khách.');
        const result=await post('members/'+m.id+'/transfer',{family_id:family.id,expected_manager_email:family.manager_email,expected_family_id:m.family_id,expected_email:m.email,revision:m.renewal_revision});familySearch='';toast('Đã chuyển '+m.email+' sang '+result.family_name+'.');return {route:'family/'+result.family_id};
      },'Chuyển Family');$('#transfer-family-fields [name=family_id]').required=true;updateTransferFamilies();
    } else if (action === 'product-remind') {
      const m = state.other_products.find(p=>p.id===Number(id));
      const text = `Chào ${m.customer_name || 'bạn'}, gói ${m.product || products[m.service]} của tài khoản ${m.email} sẽ hết hạn vào ${day(m.expires_at)}${m.days_left < 0 ? ' (đã quá hạn)' : m.days_left === 0 ? ' (hôm nay)' : ` (còn ${m.days_left} ngày)`}. Bạn có muốn gia hạn tiếp không? Nếu có, nhắn mình để xác nhận gói và thanh toán nhé. Cảm ơn bạn!`;
      modal('Mẫu tin nhắc hạn', '<label for="reminder-text">Nội dung gửi khách</label><textarea id="reminder-text" rows="7">'+escape(text)+'</textarea><p>Liên hệ: '+escape(m.contact || 'Chưa có thông tin liên hệ')+'</p><p>Chọn Sao chép rồi tự gửi qua Zalo/Facebook. Ứng dụng không gửi tin thay bạn.</p>', async () => { const message = $('#reminder-text').value; try { await navigator.clipboard.writeText(message); toast('Đã sao chép mẫu tin. Bạn có thể dán để gửi khách.'); } catch { $('#reminder-text').select(); throw new Error('Không sao chép tự động được. Chọn nội dung trong ô rồi dùng chức năng Sao chép của thiết bị.'); } }, 'Sao chép');
    } else if (action==='add-product' || action==='edit-product') {
      const p=action==='edit-product' ? state.other_products.find(p=>p.id===Number(id)) : null;
      const choices=Object.fromEntries([...new Set(['Netflix','Spotify','Google One','ChatGPT','Khác',...(p ? [p.product] : [])])].map(value=>[value,value]));
      const customerChoices={'':'Nhập khách riêng',...Object.fromEntries(state.members.map(m=>[m.id,(m.customer_name||m.email)+' · '+m.email]))};
      modal(p ? 'Sửa sản phẩm đã bán' : 'Thêm sản phẩm đã bán','<div data-purchase-form>'+select('product','Sản phẩm',choices,p?.product||'Netflix')+input('custom_product','Tên sản phẩm khác (khi chọn Khác)','text','',false,'maxlength="100"')+input('purchase_source','Nguồn mua','text',p?.purchase_source||'',false,'maxlength="200" placeholder="Tên nhà cung cấp, cửa hàng hoặc nơi mua…"')+select('existing_customer','Lấy thông tin khách Family (không bắt buộc)',customerChoices,'')+input('customer_name','Tên khách','text',p?.customer_name,false,'maxlength="200"')+input('email','Email khách','email',p?.email,false,'maxlength="254"')+input('contact','Contact (Facebook / Zalo / liên hệ)','text',p?.contact,false,'maxlength="1000"')+select('plan_months','Gói mua',planOptions(p?.plan_months,true),p?.plan_months||0)+input('joined_at','Ngày mua','date',p?.joined_at??state.today)+input('expires_at','Ngày hết hạn','date',p?.expires_at)+select('payment_status','Thanh toán',payments,p?.payment_status||'unknown')+input('amount','Số tiền (VND)','number',p?.amount||0,false,'min="0" max="1000000000" step="1"')+noteField(p?.note)+'<p>Để trống ngày hết hạn nếu sản phẩm không có hạn. Còn 2 ngày hoặc đã quá hạn sẽ hiện ở Tổng quan.</p></div>',async data=>{const payload={...data,product:data.product==='Khác' ? data.custom_product : data.product};await(p ? patch('other-products/'+id,payload) : post('other-products',payload));toast('Đã lưu sản phẩm đã bán.');});
    } else if (action==='delete-product') {
      const p=state.other_products.find(p=>p.id===Number(id));modal('Chuyển sản phẩm vào lưu trữ?',`<p><strong>${escape(p.product)}</strong> · ${escape(p.customer_name||p.email)}</p><p>Hồ sơ sẽ về Khách lưu trữ. Tên, email, Contact, gói, ngày mua/hạn, thanh toán và ghi chú được giữ để khôi phục.</p>`,async()=>{await api('other-products/'+id,{method:'DELETE'});toast('Đã chuyển sản phẩm vào Khách lưu trữ.');return {route:'archives'};},'Chuyển vào lưu trữ');
    } else if (action === 'archive-details') {
      const a=state.archives.find(a=>a.id===Number(id)),m=a.member,isProduct=a.record_type==='other_product';const history=isProduct?[]:(await api('archives/'+id+'/history')).history;
      modal(isProduct?'Dữ liệu sản phẩm lưu trữ':'Dữ liệu khách lưu trữ',customerInfo(m,false)+(isProduct?`<p>Sản phẩm: ${escape(m.product)}</p>`:'')+`<p>Gói: ${m.plan_months?m.plan_months+' tháng':'Chưa đặt'} · Ngày mua ${day(m.joined_at)} · Hạn ${day(m.expires_at)}</p><p>Thanh toán: ${payments[m.payment_status]} · ${Number(m.amount).toLocaleString('vi-VN')} ₫</p><p>Ghi chú: ${escape(m.note)}</p>`+(isProduct?'':`<p>Gia hạn: ${renewalLabels[m.renewal_status]} · ${escape(m.renewal_note)}</p><h2>Lịch sử gia hạn</h2>`+(history.map(h=>`<div class="list-item">${day(h.old_expires_at)} → ${day(h.new_expires_at)}<p>${Number(h.amount).toLocaleString('vi-VN')} ₫ · ${escape(h.created_by)} · ${date(h.created_at)}</p></div>`).join('')||'<p>Chưa có lần đã xác nhận.</p>')),async()=>{},'Đóng');
    } else if(action==='archive-delete'){
      const a=state.archives.find(a=>a.id===Number(id));if(!a)return toast('Hồ sơ không còn trong danh sách. Tải lại trang.');
      modal('Xóa hồ sơ khỏi lưu trữ?',`<p><strong>${escape(a.customer_name||a.email)}</strong></p><p>${escape(a.email)} · ${escape(a.record_type==='other_product'?a.member.product:a.family_name)}</p><p>Hồ sơ này sẽ bị xóa khỏi Khách lưu trữ và không còn khôi phục bằng nút Khôi phục. Nhật ký giữ dữ liệu trước khi xóa; lịch sử gia hạn vẫn được giữ.</p>`,async()=>{await api('archives/'+a.id,{method:'DELETE',body:JSON.stringify({expected_archived_at:a.archived_at,expected_email:a.email})});toast('Đã xóa hồ sơ khỏi Khách lưu trữ.');},'Xóa khỏi lưu trữ');
    } else if (action === 'archive-restore') {
      const a=state.archives.find(a=>a.id===Number(id));
      if(a.record_type==='other_product'){modal('Khôi phục sản phẩm đã bán',`<p><strong>${escape(a.member.product)}</strong> · ${escape(a.customer_name||a.email)}</p><p>Hồ sơ sẽ trở lại Sản phẩm khác, giữ nguyên Contact, gói, ngày mua/hạn, thanh toán và ghi chú.</p>`,async()=>{await post('archives/'+id+'/restore',{});toast('Đã khôi phục sản phẩm và thông tin khách.');return {route:'products'};},'Khôi phục');return;}
      if (!state.families.length) return toast('Tạo hồ sơ Family trước khi khôi phục khách.');
      modal('Khôi phục khách', `<p>${escape(a.email)} sẽ trở lại danh sách hoạt động. Hạn cũ, thanh toán và lịch sử được giữ. Khách đã chọn Không gia hạn sẽ trở về Chưa nhắc.</p>` + select('family_id','Family nhận khách',Object.fromEntries(state.families.map(f=>[f.id,f.name+' · '+f.manager_email])),a.member.family_id), async data=>{ await post('archives/'+id+'/restore',data); toast('Đã khôi phục khách và lịch sử.'); }, 'Khôi phục');
    } else if(action==='family-archive-delete'){
      const f=state.archived_families.find(f=>f.id===Number(id));if(!f)return toast('Family không còn trong danh sách. Tải lại trang.');
      modal('Xóa Family khỏi lưu trữ?',`<p><strong>${escape(f.name)}</strong> · ${escape(f.manager_email)}</p><p>Chỉ xóa hồ sơ Family. ${f.customers} khách còn lưu trữ được giữ để khôi phục riêng vào Family khác. Lịch sử gia hạn và nhật ký vẫn được giữ.</p>`,async()=>{const result=await api('archived-families/'+f.id,{method:'DELETE',body:JSON.stringify({expected_archived_at:f.archived_at,expected_created_at:f.created_at,expected_manager_email:f.manager_email})});toast('Đã xóa Family; giữ '+result.kept_customers+' khách trong lưu trữ.');},'Xóa Family');
    } else if(action==='family-archive-restore'){
      const f=state.archived_families.find(f=>f.id===Number(id));modal('Khôi phục Family',`<p>${escape(f.name)} · ${escape(f.manager_email)}</p><p>Khôi phục hồ sơ Family, ngày trial, ghi chú và ${f.customers} khách còn lưu trữ cùng Family.</p>`,async()=>{await post('archived-families/'+id+'/restore',{});toast('Đã khôi phục Family và khách.');return {route:'family/'+id};},'Khôi phục');
    } else if (['add-family','edit-family'].includes(action)) {
      const f=action==='edit-family' ? state.families.find(f=>f.id===Number(id)) : null;
      modal(f ? 'Sửa Family' : 'Thêm Family',input('name','Tên Family','text',f?.name,true,'maxlength="200"')+input('manager_email','Email quản lý Family','email',f?.manager_email,true,'maxlength="254"')+(f?'<p>Đổi email quản lý sẽ ngắt liên kết thông tin Kho của mail cũ. Mail mới không dùng lại mật khẩu hoặc 2FA cũ; bạn có thể bổ sung sau trong Kho.</p>':'')+input('trial_date','Ngày trial','date',f?.trial_date||'')+'<p>Nhập ngày bắt đầu trial của mail quản lý. Khi báo lỗi, ứng dụng lưu ngày này để tính số ngày đã sử dụng.</p>'+noteField(f?.note)+(!f&&state.lookup_supported?inviteMailFields(lookupContext):''),async data=>{
        const {invite_count,...family}=data;
        if(f){await patch('families/'+id,{...family,service:f.service});toast('Đã lưu Family.');return;}
        const created=await post('families',{...family,service:'youtube'});toast('Đã lưu Family.');
        if(!Number(invite_count))return;
        // The Family exists now; a failed address batch is reported without losing it.
        try{const result=await createInviteMails(lookupContext,created.id,invite_count);return {route:'family/'+created.id,after:()=>showInviteMails(lookupContext,result)};}
        catch(error){toast('Đã tạo Family, chưa tạo được mail mời: '+error.message,10000);return {route:'family/'+created.id};}
      });
    } else if (action==='add-member') {
      if (!state.families.length) return toast('Thêm Family trước, rồi thêm khách vào nhóm.');
      const familyField=id ? '' : select('family_id','Family nhận khách',Object.fromEntries(state.families.map(f=>[f.id,f.name+' · '+f.manager_email])),state.families[0].id);
      modal('Thêm khách',familyField+memberFields(),async data=>{await post('members',{...data,family_id:Number(id||data.family_id)});toast('Đã thêm khách.');});
    }
    else if (action === 'edit-member') {
      const m = state.members.find(m => m.id === Number(id)); modal('Sửa khách / Gia hạn', memberFields(m), async data => { await patch('members/' + id, data); toast('Đã cập nhật khách và hạn sử dụng.'); });
    } else if (action === 'renewal-status') {
      const m = state.members.find(m => m.id === Number(id));
      modal('Gia hạn · ' + (m.customer_name || m.email), `<div id="renewal-form" data-expiry="${escape(m.expires_at)}" data-receipt-status="${escape(m.renewal_status)}" data-receipt-date="${escape(m.renewal_paid_at)}">` + select('status', 'Trạng thái gia hạn', renewalLabels, m.renewal_status === 'not_contacted' ? 'paid' : m.renewal_status) + input('amount', 'Số tiền đã nhận cho lần gia hạn (VND)', 'number', m.renewal_amount, false, 'min="0" max="1000000000" step="1"') + input('paid_at', 'Ngày nhận tiền gia hạn', 'date', renewalReceiptDate(m,m.renewal_status==='not_contacted'?'paid':m.renewal_status), false, `max="${localToday()}"`) + '<p id="renewal-receipt-note" class="subtext"></p>' + select('plan_months', 'Gói gia hạn', planOptions(m.plan_months), m.plan_months || 1) + '<label class="check-label"><input type="checkbox" name="apply_now" id="renewal-auto" checked> Tự cập nhật ngày mua và hạn khi đã thanh toán đủ</label><p id="renewal-date-preview"></p><label for="renewal-note">Ghi chú gia hạn</label><textarea id="renewal-note" name="note" maxlength="1000">' + escape(m.renewal_note) + '</textarea><p>Chờ tiền hoặc trả một phần chưa đổi ngày. Kỳ mới luôn nối từ ngày hết hạn cũ, kể cả trả muộn. Ngày nhận tiền được lưu riêng. Chọn Không gia hạn sẽ chuyển khách vào Khách lưu trữ ngay.</p></div>', async data => { const result = await patch('members/' + id + '/renewal', { ...data, revision:m.renewal_revision, apply_now:data.apply_now === 'on' && data.status === 'paid' }); if(result.archived){toast('Đã chuyển khách vào Khách lưu trữ.');return {route:'archives'};}toast(result.applied ? 'Đã gia hạn: ngày mua và ngày hết hạn đã cập nhật.' : 'Đã lưu trạng thái gia hạn; ngày chưa thay đổi.'); }, 'Lưu gia hạn');
      updateRenewalReceiptInput();updateRenewalPreview();
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
      modal('Chuyển hồ sơ vào lưu trữ?', '<p>'+(table==='families'?'Family và toàn bộ khách trong nhóm':'Hồ sơ khách')+' sẽ về mục Khách lưu trữ. Dữ liệu và lịch sử được giữ để bạn khôi phục khi cần.</p>', async () => { await api(table + '/' + id, { method: 'DELETE' }); toast('Đã chuyển hồ sơ vào lưu trữ.');return {route:'archives'}; }, 'Chuyển vào lưu trữ');
    }
  } catch (error) { toast(error.message); }
});
window.addEventListener('scroll',()=>scrollPositions.set(visibleRoute,window.scrollY),{passive:true});
window.addEventListener('hashchange',()=>{visibleRoute=location.hash;draw();window.scrollTo(0,scrollPositions.get(visibleRoute)||0);});
window.addEventListener('pageshow',event=>{if(event.persisted)draw();});
async function sync() {
  if (document.querySelector('dialog[open],.more-actions[open],.header-more[open],.nav-more[open]')||draggedIssue!==null) return;
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

function updateRenewalReceiptInput(reset=false){
  const form=$('#renewal-form'),field=form?.querySelector('[name=paid_at]');if(!field)return;
  const status=form.querySelector('[name=status]').value,received=['paid','partial'].includes(status);
  field.disabled=!received;field.required=received;field.max=localToday();
  if(!received)field.value='';
  else if(reset||!field.value)field.value=renewalReceiptDate({renewal_status:form.dataset.receiptStatus,renewal_paid_at:form.dataset.receiptDate},status);
  $('#renewal-receipt-note').textContent=received?'Ngày thực nhận tiền; mặc định hôm nay, bạn có thể chọn lại.':'Chưa nhận tiền: ngày nhận tiền để trống.';
}
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
document.addEventListener('change', event => { if (event.target.closest('#renewal-form')) {if(event.target.name==='status')updateRenewalReceiptInput(true);updateRenewalPreview();} });

function customerList() {
  return `<section class="card"><h2>Danh sách khách</h2><div class="toolbar">${searchField('customer-search','Tìm khách','Tìm tên, email, Contact hoặc Family…',customerSearch)}<select id="customer-filter" aria-label="Lọc khách">${Object.entries({'':'Tất cả khách',expired:'Quá hạn',today:'Hết hạn hôm nay',due_soon:'Sắp hết hạn',confirmed:'Chờ thanh toán',paid_pending:'Đã thu tiền, chưa cập nhật hạn',unknown:'Chưa đặt hạn'}).map(([key,label])=>`<option value="${key}" ${customerFilter===key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div id="customer-table">${filteredCustomers()}</div></section>`;
}

function otherProductTable(rows) {
  return rows.length ? `<div class="table-wrap"><table><thead><tr><th>SẢN PHẨM / KHÁCH</th><th>NGUỒN MUA</th><th>NGÀY MUA</th><th>NGÀY HẾT HẠN</th><th>THANH TOÁN</th><th>GHI CHÚ</th><th></th></tr></thead><tbody>${rows.map(p=>`<tr><td><div class="info-line"><strong class="info-text">${escape(p.product)}</strong>${copyButton(p.product,'tên sản phẩm')}</div><span class="subtext">${p.plan_months?p.plan_months+' tháng':'Chưa đặt gói'}</span>${customerInfo(p,false)}</td><td class="product-source-cell"><div class="info-line"><span class="info-text">${escape(p.purchase_source||'—')}</span>${copyButton(p.purchase_source,'nguồn mua')}</div></td><td><div class="info-line"><span>${day(p.joined_at)}</span>${copyButton(p.joined_at?day(p.joined_at):'','ngày mua')}</div></td><td><div class="info-line"><span>${day(p.expires_at)}</span>${copyButton(p.expires_at?day(p.expires_at):'','ngày hết hạn')}</div><span class="subtext">${expiryBadge(p)}</span></td><td>${payments[p.payment_status]}<span class="subtext">${Number(p.amount).toLocaleString('vi-VN')} ₫</span></td><td><div class="info-line"><span class="info-text">${escape(p.note)}</span>${copyButton(p.note,'ghi chú')}</div></td><td><div class="row-actions">${p.expires_at ? btn('product-remind','Nhắc hạn','secondary tiny',`data-id="${p.id}"`) : ''}${moreActions('Thao tác khác cho '+p.product,btn('edit-product','Sửa','secondary tiny',`data-id="${p.id}"`)+btn('delete-product','Xóa','danger tiny',`data-id="${p.id}"`))}</div></td></tr>`).join('')}</tbody></table></div>` : empty('Chưa có sản phẩm phù hợp','Thêm sản phẩm khách đã mua và ghi chú để theo dõi.',btn('add-product','+ Thêm sản phẩm đã bán','primary'));
}
function filteredProducts(){const q=normalizeSearch(productSearch);const rows=state.other_products.filter(p=>normalizeSearch(`${p.product} ${p.purchase_source||''} ${p.customer_name} ${p.email} ${p.contact} ${p.note}`).includes(q)&&(!productFilter||p.expiry_status===productFilter));return otherProductTable(pageRows(rows,'products'))+pager(rows.length,'products');}
document.addEventListener('change',event=>{
  if(event.target.name!=='existing_customer'||!event.target.value)return;
  const m=state.members.find(m=>m.id===Number(event.target.value));if(!m)return;
  for(const name of ['customer_name','email','contact']){const field=$('#modal-fields [name='+name+']');if(field)field.value=m[name]||'';}
});

function archivedFamilyTable(){
  const rows=state.archived_families||[];if(!rows.length)return '';
  return `<section class="card"><h2>Family lưu trữ</h2><div class="table-wrap"><table><thead><tr><th>FAMILY</th><th>EMAIL QUẢN LÝ</th><th>NGÀY TRIAL</th><th>KHÁCH CÒN LƯU TRỮ</th><th>NGÀY LƯU TRỮ</th><th></th></tr></thead><tbody>${rows.map(f=>`<tr><td><strong>${escape(f.name)}</strong><span class="subtext">${escape(f.note)}</span></td><td><div class="info-line"><span class="info-text">${escape(f.manager_email)}</span>${copyButton(f.manager_email,'email quản lý')}</div></td><td>${day(f.trial_date)}</td><td>${f.customers}</td><td>${date(f.archived_at)}</td><td><div class="row-actions">${btn('family-archive-restore','Khôi phục Family','secondary tiny',`data-id="${f.id}"`)}${btn('family-archive-delete','Xóa khỏi lưu trữ','danger tiny',`data-id="${f.id}"`)}</div></td></tr>`).join('')}</tbody></table></div></section>`;
}
function updatePurchaseExpiry(event){
  const field=event.target,form=field.closest('[data-purchase-form]');if(!form||!['plan_months','joined_at'].includes(field.name))return;
  const purchased=form.querySelector('[name=joined_at]').value,months=Number(form.querySelector('[name=plan_months]').value);if(!purchased||!months)return;
  try{form.querySelector('[name=expires_at]').value=purchaseExpiry(purchased,months);}catch(error){$('#form-error').textContent=error.message;}
}
document.addEventListener('input',updatePurchaseExpiry);
document.addEventListener('change',updatePurchaseExpiry);

function updateTransferFamilies(){
  const form=$('#transfer-family-fields');if(!form)return;const field=form.querySelector('[name=family_id]'),source=Number(form.dataset.sourceFamily),q=form.querySelector('[name=transfer_search]').value.trim().toLocaleLowerCase(),previous=field.value;
  const matches=state.families.filter(f=>`${f.manager_email} ${f.name}`.toLocaleLowerCase().includes(q)),exact=matches.find(f=>f.manager_email.toLocaleLowerCase()===q&&f.id!==source);
  field.innerHTML='<option value="">Chọn Family nhận khách…</option>'+matches.map(f=>`<option value="${f.id}" ${f.id===source?'disabled':''}>${escape(f.manager_email)} · ${escape(f.name)} · ${familyOccupancy(state.members,f.id).label}${f.id===source?' (Family hiện tại)':''}</option>`).join('');
  field.value=exact?String(exact.id):matches.some(f=>String(f.id)===previous&&f.id!==source)?previous:'';
  updateTransferPreview(matches.length===0);
}
function updateTransferPreview(noMatches=false){
  const field=$('#transfer-family-fields [name=family_id]');if(!field)return;const family=state.families.find(f=>f.id===Number(field.value));
  $('#transfer-family-preview').textContent=family?`${family.name} · ${family.manager_email} · ${familyOccupancy(state.members,family.id).label} khách đang ghi nhận`:noMatches?'Không tìm thấy Family phù hợp.':'Nhập mail chủ Family hoặc mở danh sách để chọn nhóm nhận khách.';
}
document.addEventListener('input',event=>{if(event.target.name==='transfer_search')updateTransferFamilies();});
document.addEventListener('change',event=>{if(event.target.closest('#transfer-family-fields')&&event.target.name==='family_id')updateTransferPreview();});

function openFamilyIssue(familyId){return (state.issues||[]).filter(i=>i.family_id===familyId&&['todo','doing'].includes(i.status)).sort((a,b)=>b.id-a.id)[0];}
function familyIssueNotice(familyId,managerOnly=false){const family=state.families.find(f=>f.id===familyId),issue=managerOnly?(state.issues||[]).filter(i=>i.family_id===familyId&&i.target_type==='manager'&&i.target_id===family?.manager_id&&i.subject_email===family?.manager_email&&['todo','doing'].includes(i.status)).sort((a,b)=>b.id-a.id)[0]:openFamilyIssue(familyId);return issue?`<div class="family-issue-notice"><span class="badge amber">Mail đã báo lỗi — ${issue.status==='doing'?'đang fix':'chờ fix'}</span><span class="subtext">Mail lỗi: ${escape(issue.subject_email)}</span></div>`:'';}
function familyIssueAction(familyId,type='secondary tiny'){const issue=openFamilyIssue(familyId);return btn(issue?'view-family-issue':'report-family',issue?'Xem lỗi':'Báo lỗi',type,`data-id="${familyId}"`);}
function showFamilyIssue(familyId){const issue=openFamilyIssue(familyId);if(!issue)return;focusedIssueId=issue.id;issueSearch='';if(route()[0]==='issues')draw();else location.hash='issues';}
function familyTable(){
  const q=normalizeSearch(familySearch);const matches=sortFamilies(state.families,state.members,familyFilter).filter(f=>normalizeSearch(`${f.name} ${f.manager_email} ${f.note} ${state.members.filter(m=>m.family_id===f.id).map(m=>m.email+' '+m.customer_name).join(' ')}`).includes(q));
  const rows=pageRows(matches,'families');
  return (rows.length?`<div class="table-wrap"><table><thead><tr><th>FAMILY</th><th>EMAIL QUẢN LÝ</th><th>NGÀY TRIAL</th><th>KHÁCH ĐANG GHI NHẬN</th><th>THAO TÁC</th></tr></thead><tbody>${rows.map(f=>`<tr><td><a class="email-link" href="#family/${f.id}">${escape(f.name)}</a>${familyStatusBadge(lookupContext,f.id)}<span class="subtext">${escape(f.note)}</span></td><td><div class="info-line"><span class="info-text">${escape(f.manager_email)}</span>${copyButton(f.manager_email,'email quản lý')}</div>${familyIssueNotice(f.id)}</td><td class="date-cell">${f.trial_date ? day(f.trial_date) : 'Chưa nhập'}</td><td><div class="occupancy ${familyOccupancy(state.members,f.id).occupied>5?'over-capacity':''}"><strong>${familyOccupancy(state.members,f.id).label}</strong><span class="occupancy-track" aria-hidden="true"><span class="occupancy-fill-${Math.min(5,Math.max(0,familyOccupancy(state.members,f.id).occupied))}"></span></span></div></td><td><div class="row-actions"><a class="primary link-button tiny" href="#family/${f.id}">Mở Family</a>${moreActions('Thao tác khác cho '+f.name,btn('edit-family','Sửa','secondary tiny',`data-id="${f.id}"`)+familyIssueAction(f.id)+btn('delete-family-record','Xóa hồ sơ','danger tiny',`data-id="${f.id}"`))}</div></td></tr>`).join('')}</tbody></table></div>`:empty('Chưa có Family phù hợp','Thêm Family hoặc điều chỉnh tìm kiếm.'))+pager(matches.length,'families');
}
function issueEmail(issue){
  const family=state.families.find(f=>f.id===issue.family_id),archived=(state.archived_families||[]).find(f=>f.id===issue.family_id);
  const href=family?`#family/${family.id}`:archived?'#archives':'',title=family?`Mở ${family.name} và tất cả thành viên`:archived?`${archived.name} đã lưu trữ — mở Khách lưu trữ`:'';
  const mail=`<strong>${escape(issue.subject_email)}</strong>`;
  return `<div class="info-line issue-email">${href?`<a class="info-text issue-family-link" href="${href}" title="${escape(title)}">${mail}</a>`:`<strong class="info-text">${escape(issue.subject_email)}</strong>`}${copyButton(issue.subject_email,'mail lỗi')}</div>`;
}
function issueOrderCompare(a,b){return Number(a.sort_position??0)-Number(b.sort_position??0)||String(b.created_at).localeCompare(String(a.created_at))||b.id-a.id;}
function issueColumn(status){return (state.issues||[]).filter(i=>i.status===status).sort(issueOrderCompare);}
function visibleIssues(){const q=normalizeSearch(issueSearch);return (state.issues||[]).filter(i=>normalizeSearch(`${i.subject_email} ${i.original_email} ${i.family_name} ${i.title} ${i.note} ${i.resolution_note}`).includes(q));}
async function saveIssueOrder(status,order,reset=false){
  if(issueOrdering)return;const rows=issueColumn(status);if(!rows.length)return;
  const previousFocus=document.activeElement?.dataset?.action==='issue-reorder'?{id:document.activeElement.dataset.id,direction:document.activeElement.dataset.direction}:null;
  issueOrdering=true;const board=$('#issue-board');if(board){board.setAttribute('aria-busy','true');board.querySelectorAll('[data-action="issue-reorder"],[data-action="issue-order-reset"]').forEach(button=>button.disabled=true);}
  try{await post('issues/order',{status,order:order||rows.map(i=>i.id),expected:rows.map(i=>({id:i.id,created_at:i.created_at,revision:i.revision})),order_token:rows[0].order_token,reset});await refresh(false);if(route()[0]==='issues')$('#issue-board').innerHTML=issueBoard();toast(reset?'Đã xếp lỗi mới báo lên trên.':'Đã lưu thứ tự case.');}
  catch(error){toast(error.message);await refresh(false);}
  finally{issueOrdering=false;if(route()[0]==='issues'&&$('#issue-board')){$('#issue-board').innerHTML=issueBoard();$('#issue-board').removeAttribute('aria-busy');if(previousFocus){const same=$(`#issue-board [data-action="issue-reorder"][data-id="${previousFocus.id}"][data-direction="${previousFocus.direction}"]`);(same&&!same.disabled?same:$(`#issue-board [data-action="issue-reorder"][data-id="${previousFocus.id}"]:not(:disabled)`))?.focus({preventScroll:true});}}}
}
async function nudgeIssue(id,direction){
  const issue=(state.issues||[]).find(i=>i.id===id);if(!issue)return;
  const visible=visibleIssues().filter(i=>i.status===issue.status).sort(issueOrderCompare),at=visible.findIndex(i=>i.id===id),target=visible[at+(direction==='up'?-1:1)];if(!target)return;
  await placeIssue(id,target.id,direction==='down');
}
async function placeIssue(id,targetId,after=false){
  const issue=(state.issues||[]).find(i=>i.id===id);if(!issue||id===targetId)return;
  const rows=issueColumn(issue.status),order=rows.map(i=>i.id).filter(value=>value!==id);let at=targetId===null?order.length:order.indexOf(targetId);if(at<0)return;if(after&&targetId!==null)at++;
  order.splice(at,0,id);if(order.every((value,index)=>value===rows[index].id))return;
  await saveIssueOrder(issue.status,order);
}
function issueBoard(){
  const rows=visibleIssues();
  return `<div class="issue-board">${Object.entries(issueStatuses).map(([status,label])=>{const items=rows.filter(i=>i.status===status).sort(issueOrderCompare),allItems=issueColumn(status);return `<section class="issue-column" data-status-column="${status}" aria-label="${label}"><div class="issue-column-heading"><h2>${label} <span class="badge">${items.length}</span></h2>${allItems.some(i=>i.order_custom)?btn('issue-order-reset','Mới nhất','secondary tiny',`data-status="${status}" ${issueOrdering?'disabled':''} title="Xếp lại lỗi mới báo lên trên"`):''}</div><div class="issue-stack">${items.map((i,index)=>`<article class="issue-card ${i.id===focusedIssueId?'focused':''}" draggable="true" data-issue-id="${i.id}"><div class="issue-card-tools"><span class="issue-drag-handle" aria-hidden="true" title="Kéo để sắp xếp">⠿</span><span class="subtext issue-reported">Báo lúc ${date(i.created_at)}</span><div class="issue-order-buttons">${btn('issue-reorder','↑','secondary tiny',`data-id="${i.id}" data-direction="up" aria-label="Đưa lỗi ${escape(i.subject_email)} lên trên" ${index===0||issueOrdering?'disabled':''}`)}${btn('issue-reorder','↓','secondary tiny',`data-id="${i.id}" data-direction="down" aria-label="Đưa lỗi ${escape(i.subject_email)} xuống dưới" ${index===items.length-1||issueOrdering?'disabled':''}`)}</div></div>${issueEmail(i)}<span class="subtext">${escape(i.family_name)} · ${i.target_type==='manager'?'Mail quản lý':'Mail khách'}</span><div class="issue-dates"><span>Ngày lỗi: <b>${i.reported_on ? day(i.reported_on) : 'Chưa có'}</b></span><span>Ngày trial: <b>${i.trial_date ? day(i.trial_date) : 'Chưa nhập'}</b></span><span>Đã sử dụng: <b>${i.days_used!==null&&i.days_used!==undefined ? i.days_used+' ngày' : i.trial_date ? 'Chưa đến ngày trial' : 'Chưa có ngày trial'}</b></span></div><h3>${escape(i.title)}</h3><p>${escape(i.note)}</p>${i.original_email!==i.subject_email?`<span class="subtext">Mail báo lỗi ban đầu: ${escape(i.original_email)}${copyButton(i.original_email,'mail báo lỗi ban đầu')}</span>`:''}${i.resolution_note?`<p class="resolution-note">${escape(i.resolution_note)}</p><span class="subtext">${date(i.done_at)}</span>`:''}${!i.target_available&&i.status!=='done'?'<span class="badge amber">Hồ sơ liên quan không còn trong Family</span>':''}<label for="issue-status-${i.id}" class="sr-label">Trạng thái ${escape(i.subject_email)}</label><select id="issue-status-${i.id}" data-issue-status="${i.id}" aria-label="Trạng thái ${escape(i.subject_email)}">${Object.entries(issueStatuses).map(([v,n])=>`<option value="${v}" ${status===v?'selected':''}>${n}</option>`).join('')}</select><div class="row-actions">${btn('issue-edit','Sửa lỗi','secondary tiny',`data-id="${i.id}"`)}${status!=='done'?btn('issue-complete','Đã fix','primary tiny',`data-id="${i.id}"`):btn('issue-delete','Xóa case','danger tiny',`data-id="${i.id}"`)}</div></article>`).join('')||'<p class="issue-empty">Chưa có lỗi trong cột này.</p>'}</div></section>`;}).join('')}</div>`;
}
function updateIssueTargets(){
  const family=state.families.find(f=>f.id===Number($('#modal-fields [name=family_id]')?.value));if(!family)return;
  const choices={['manager:'+family.manager_id]:'Mail quản lý · '+family.manager_email,...Object.fromEntries(state.members.filter(m=>m.family_id===family.id).map(m=>['member:'+m.id,'Mail khách · '+m.email]))};
  const field=$('#modal-fields [name=issue_target]');const trial=$('#modal-fields [name=trial_date]');if(trial)trial.value=family.trial_date||'';const usage=$('#issue-usage-preview');if(usage){const days=trialUsageDays(family.trial_date,state.today);usage.textContent=days===null ? (family.trial_date ? 'Ngày trial sau ngày báo lỗi; chưa có số ngày sử dụng.' : 'Chưa nhập ngày trial trong Family; vẫn có thể báo lỗi.') : 'Đã sử dụng '+days+' ngày tính đến ngày báo lỗi.';}field.innerHTML=Object.entries(choices).map(([key,label])=>`<option value="${key}">${escape(label)}</option>`).join('');updateIssueMail();
}
function updateIssueMail(){
  const [type,id]=($('#modal-fields [name=issue_target]')?.value||'').split(':');const row=(type==='manager'?state.accounts:state.members).find(r=>r.id===Number(id));const field=$('#modal-fields [name=subject_email]');if(field)field.value=row?.email||'';
}
// Đổi mail chủ keeps the customers in this Family: each one waits for a link of the new owner,
// so Gen mail mời is offered right here (one address per customer, at most 5).
function ownerInviteField(issue){const customers=state.members.filter(m=>m.family_id===issue.family_id).length,count=Math.min(5,customers);return select('invite_count','Gen mail mời cho chủ mới',Object.fromEntries([0,1,2,3,4,5].map(n=>[n,n?`${n} mail${n===count&&customers?' (bằng số khách)':''}`:'Không tạo'])),String(count))+`<p>${customers?`${customers} khách giữ nguyên trạng thái và ở lại Family này. Mỗi khách tự nhận một link mới khi tra cứu Gmail. `:''}Link và mail mời cũ của chủ cũ được bỏ. Trong Kho, Family này hiện mail mới và ngày trial là hôm nay; mật khẩu, 2FA, mail khôi phục và ghi chú để trống để bạn nhập sau.</p>`;}
const issuePayload=(issue,data)=>({...data,invite_count:data.invite_count===undefined?undefined:Number(data.invite_count),revision:issue.revision,expected_created_at:issue.created_at,expected_email:issue.target_current_email||issue.subject_email});
// After Đổi mail chủ: open the Family and show the new addresses to copy.
function afterOwnerChange(issue,result){if(!result?.invite_mails?.mails?.length)return result?.waiting_customers?{route:'family/'+issue.family_id}:undefined;return {route:'family/'+issue.family_id,after:()=>showInviteMails(lookupContext,result.invite_mails)};}
function completionFields(issue){const owner=issue.target_type==='manager';return `<div id="issue-completion" data-original-status="${issue.status}">`+select('resolution','Khi Đã fix',owner?{keep:'Giữ nguyên mail',replace:'Đổi sang Gmail chủ mới'}:{keep:'Giữ nguyên mail khách',replace:'Đổi sang Gmail khách mới'},'keep')+(owner?'<p class="subtext"><strong>Giữ nguyên mail</strong>: Google đã mở lại, khách không cần làm gì. <strong>Đổi sang Gmail chủ mới</strong>: khách ở lại Family này và tự nhận link mới khi tra cứu.</p>':'')+`<div id="replacement-field">`+input('replacement_email','Mail mới','email','',false,'maxlength="254"')+(issue.target_type==='manager'&&state.lookup_supported?ownerInviteField(issue):'')+`<p>Đổi mail sẽ cập nhật hồ sơ quản lý/khách trong Family và ghi rõ mail cũ → mail mới trong thẻ Đã fix và nhật ký.</p>${issue.target_type==='manager'?'<p>Nếu mail mới đã có Kho trong một Family trống, hệ thống dùng đầy đủ thông tin Kho và ngày trial của mail đó; giữ mail cũ trong Family lưu trữ. Nếu Family của mail mới đang có khách hoặc case lỗi, hệ thống dừng để tránh ảnh hưởng dữ liệu. Mail mới chưa có trong hệ thống sẽ dùng ngày xác nhận và để trống thông tin Kho.</p>':''}</div>`+`</div>`;}
function updateCompletionFields(){const section=$('#issue-completion');if(!section)return;const status=$('#modal-fields [name=status]')?.value||'done';section.hidden=status!=='done'||section.dataset.originalStatus==='done';const resolution=$('#modal-fields [name=resolution]').value,replacing=!section.hidden&&resolution==='replace';$('#replacement-field').hidden=!replacing;$('#modal-fields [name=replacement_email]').required=replacing;}
function completeIssue(issue){
  if(!issue)return;
  modal('Hoàn tất fix lỗi',`<p><strong>${escape(issue.subject_email)}</strong> · ${escape(issue.family_name)}</p><p>${escape(issue.title)}</p>`+completionFields(issue)+noteField(issue.note),async data=>{
    const result=await patch('issues/'+issue.id,{...issuePayload(issue,data),status:'done'});
    if(data.resolution==='replace'){listPages.families=1;familySearch='';customerSearch='';}
    toast(data.resolution==='replace'?(result?.waiting_customers?`Đã đổi mail chủ. ${result.waiting_customers} khách sẽ nhận link mới khi tra cứu Gmail.`:'Đã fix và cập nhật mail trong Family.'):'Đã fix, giữ nguyên mail.');
    if(data.resolution==='replace')return afterOwnerChange(issue,result);
  },'Xác nhận Đã fix');updateCompletionFields();
}
async function moveIssue(id,status){const issue=(state.issues||[]).find(i=>i.id===Number(id));if(!issue||issue.status===status)return;if(status==='done'){completeIssue(issue);return;}try{await patch('issues/'+issue.id,{status,revision:issue.revision,expected_created_at:issue.created_at});await refresh();toast('Đã chuyển sang '+issueStatuses[status]+'.');}catch(error){toast(error.message);await refresh();}}
document.addEventListener('change',event=>{if(event.target.dataset.issueStatus)moveIssue(event.target.dataset.issueStatus,event.target.value);if(event.target.name==='family_id'&&$('#modal-fields [name=issue_target]'))updateIssueTargets();if(event.target.name==='issue_target')updateIssueMail();if(['status','resolution'].includes(event.target.name))updateCompletionFields();});
document.addEventListener('dragstart',event=>{const card=event.target.closest('.issue-card');if(!card||issueOrdering)return;if(event.target.closest('button,select,input,a')){event.preventDefault();return;}draggedIssue=Number(card.dataset.issueId);event.dataTransfer.setData('text/plain',String(draggedIssue));event.dataTransfer.effectAllowed='move';card.classList.add('dragging');});
function clearIssueDrag(){document.querySelectorAll('.dragging,.drag-over,.drop-before,.drop-after').forEach(el=>el.classList.remove('dragging','drag-over','drop-before','drop-after'));}
document.addEventListener('dragover',event=>{
  const col=event.target.closest('[data-status-column]');if(!col||draggedIssue===null||issueOrdering)return;
  event.preventDefault();event.dataTransfer.dropEffect='move';clearIssueDrag();col.classList.add('drag-over');
  const card=event.target.closest('.issue-card'),source=(state.issues||[]).find(i=>i.id===draggedIssue);
  if(card&&Number(card.dataset.issueId)!==draggedIssue&&source?.status===col.dataset.statusColumn)card.classList.add(event.clientY>card.getBoundingClientRect().top+card.offsetHeight/2?'drop-after':'drop-before');
});
document.addEventListener('dragleave',event=>{const col=event.target.closest('[data-status-column]');if(col&&!col.contains(event.relatedTarget))col.classList.remove('drag-over');});
document.addEventListener('drop',event=>{
  const col=event.target.closest('[data-status-column]');if(!col||draggedIssue===null||issueOrdering)return;event.preventDefault();
  const id=draggedIssue,source=(state.issues||[]).find(i=>i.id===id),card=event.target.closest('.issue-card'),after=card?event.clientY>card.getBoundingClientRect().top+card.offsetHeight/2:false;draggedIssue=null;clearIssueDrag();
  if(source?.status===col.dataset.statusColumn)placeIssue(id,card?Number(card.dataset.issueId):null,after);else moveIssue(id,col.dataset.statusColumn);
});
document.addEventListener('dragend',()=>{draggedIssue=null;clearIssueDrag();});
$('#modal').addEventListener('close',()=>{if(route()[0]==='issues')draw();});
function journalAction(entry){
  const label=entry.category==='other'?'':journalCategories[entry.category],color={delete:'red',edit:'amber',create:'green',restore:'green',renewal:'blue',transfer:'blue',import:'blue'}[entry.category]||'';
  return `<span class="badge ${color}">${escape(label||entry.action)}</span>${label?`<span class="subtext">${escape(entry.action)}</span>`:''}`;
}
async function loadJournal(){
  const token=++journalToken;try{const data=await api('journal?'+new URLSearchParams({search:journalSearch,category:journalCategory,page:journalPage}));if(token!==journalToken||route()[0]!=='journal'||!$('#journal-list'))return;$('#journal-list').innerHTML=(data.entries.length?`<div class="table-wrap"><table><thead><tr><th>THỜI GIAN</th><th>THAO TÁC</th><th>NỘI DUNG</th><th>CHI TIẾT</th></tr></thead><tbody>${data.entries.map(e=>`<tr><td>${date(e.created_at)}<span class="subtext">${escape(e.actor)}</span></td><td>${journalAction(e)}</td><td class="journal-message">${escape(e.message)}</td><td>${btn('journal-details','Xem chi tiết','secondary tiny',`data-kind="${e.kind}" data-id="${e.id}"`)}</td></tr>`).join('')}</tbody></table></div>`:empty('Chưa có nhật ký phù hợp','Điều chỉnh tìm kiếm hoặc thực hiện một thao tác.'))+`<div class="journal-pages"><span>${data.total} mục · Trang ${data.page}</span>${btn('journal-page','← Trước','secondary tiny',`data-page="${Math.max(1,data.page-1)}" ${data.page<=1?'disabled':''}`)}${btn('journal-page','Sau →','secondary tiny',`data-page="${data.page+1}" ${data.page*data.page_size>=data.total?'disabled':''}`)}</div>`;labelTables();}catch(error){if(token===journalToken&&$('#journal-list'))$('#journal-list').innerHTML='<p class="error-box">'+escape(error.message)+'</p>';}
}
const auditLabels={accounts:'Email quản lý',families:'Family',members:'Khách',archived_customers:'Khách lưu trữ',renewal_history:'Lịch sử gia hạn',new_purchase_history:'Lịch sử mua mới',other_purchases:'Sản phẩm khác',issues:'Lỗi',email:'Email',subject_email:'Mail gặp lỗi',original_email:'Mail báo lỗi ban đầu',customer_name:'Tên khách',contact:'Contact',name:'Tên',title:'Nội dung lỗi',note:'Ghi chú',joined_at:'Ngày mua',expires_at:'Ngày hết hạn',payment_status:'Thanh toán',amount:'Số tiền',plan_months:'Gói tháng',status:'Trạng thái lỗi',resolution_note:'Kết quả fix',resolution_email:'Mail sau fix',resolution:'Lựa chọn khi fix',renewal_status:'Trạng thái gia hạn'};
Object.assign(auditLabels,{purchase_source:'Nguồn mua',trial_date:'Ngày trial',reported_on:'Ngày lỗi',service:'Dịch vụ',product:'Sản phẩm',family_name:'Tên Family',manager_email:'Mail quản lý',old_expires_at:'Hạn cũ',new_expires_at:'Hạn mới',old_purchase_at:'Ngày mua cũ',new_purchase_at:'Ngày mua mới',paid_at:'Ngày nhận tiền',renewal_amount:'Tiền gia hạn',renewal_paid_at:'Ngày nhận tiền gia hạn',renewal_note:'Ghi chú gia hạn',declined_at:'Ngày chọn Không gia hạn',membership_status:'Trạng thái thành viên',archived_at:'Ngày lưu trữ',restored_at:'Ngày khôi phục',reason:'Lý do lưu trữ',done_at:'Ngày Đã fix',target_type:'Loại mail',snapshot:'Hồ sơ khách đã lưu'});
const auditHiddenFields=new Set(['id','revision','renewal_revision','target_id','family_id','manager_id','member_id','archive_id','restored_member_id','original_member_id','family_archive_id','created_at','updated_at','created_by','restored_by']);
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
  const changes=entry.changes||[];return `<p>${date(entry.created_at)} · ${escape(entry.actor||'Cá nhân')}</p><p>${escape(entry.message)}</p>`+(changes.length?changes.map(c=>{const keys=[...new Set([...Object.keys(c.before||{}),...Object.keys(c.after||{})])].filter(k=>!auditHiddenFields.has(k)&&JSON.stringify(c.before?.[k])!==JSON.stringify(c.after?.[k]));if(!keys.length)return '';return `<section class="audit-change"><h3>${auditLabels[c.table]||escape(c.table)} #${c.id} <span class="badge ${!c.before?'green':!c.after?'red':'amber'}">${!c.before?'Thêm':!c.after?'Xóa':'Sửa'}</span></h3>${keys.map(k=>`<div class="audit-value"><strong>${escape(auditLabels[k]||k)}</strong><span><b>Trước:</b> ${escape(auditValue(k,c.before?.[k]))}</span><span><b>Sau:</b> ${escape(auditValue(k,c.after?.[k]))}</span></div>`).join('')}</section>`;}).join(''):'<p>Nhật ký cũ chỉ có nội dung thao tác. Chi tiết trước/sau được lưu từ bản cập nhật này.</p>');
}

// Keep navigation and paging independent of mutation actions.
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-action="list-page"],[data-action="open-customer-filter"]');if(!button)return;
  if(button.dataset.action==='open-customer-filter'){customerFilter=button.dataset.filter;customerSearch='';listPages.customers=1;scrollPositions.set('#customers',0);location.hash='customers';return;}
  const key=button.dataset.list;listPages[key]=Number(button.dataset.page);const container=$({'customers':'#customer-table','products':'#product-table','families':'#family-table'}[key]);container.innerHTML=({customers:filteredCustomers,products:filteredProducts,families:familyTable}[key])();labelTables();container.closest('.card').scrollIntoView({block:'start'});
});
document.addEventListener('click',event=>{document.querySelectorAll('.more-actions[open]').forEach(menu=>{if(!menu.contains(event.target)||event.target.closest('button'))menu.open=false;});});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.more-actions[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus();});});

// Menus remain native details controls for mouse, touch and keyboard access.
document.addEventListener('click',event=>{
  if(event.target.closest('.skip-link')){event.preventDefault();$('#main').focus();$('#main').scrollIntoView({block:'start'});}
  document.querySelectorAll('.header-more[open],.nav-more[open]').forEach(menu=>{if(!menu.contains(event.target)||event.target.closest('[data-action],a'))menu.open=false;});
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.querySelectorAll('.header-more[open],.nav-more[open]').forEach(menu=>{menu.open=false;menu.querySelector('summary').focus();});});
