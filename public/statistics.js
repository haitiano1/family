const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=value=>value?escape(String(value).split('-').reverse().join('/')):'—';
const monthLabel=value=>value==='all'?'Toàn bộ lịch sử':'Tháng '+value.slice(5)+'/'+value.slice(0,4);
const money=value=>Number(value).toLocaleString('vi-VN')+' ₫';
const timestamp=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa rõ thời điểm';
let active;

export function unmountStatistics(){if(!active)return;active.controller?.abort();clearTimeout(active.timer);active.container.removeEventListener('change',active.change);active.container.removeEventListener('input',active.input);active.container.removeEventListener('click',active.click);active=null;}
export function mountStatistics(container,{today,api,customerInfo}){
  if(active?.container===container){load(active);return;}
  unmountStatistics();
  const view={container,api,customerInfo,month:today.slice(0,7),followCurrent:true,search:'',page:1,token:0};active=view;
  container.innerHTML=`<section class="card hero"><div><span class="eyebrow">GIA HẠN</span><h1>Thống kê</h1><p>Gia hạn đã xác nhận thành công, tính theo thời điểm xác nhận và giờ Việt Nam. Lịch sử được giữ lâu dài, kể cả khi xóa hồ sơ khách hoặc Family.</p></div></section><div id="statistics-totals"></div><section class="card"><h2>Lịch sử gia hạn</h2><div class="toolbar"><div class="statistics-field"><label for="statistics-month">Tháng thống kê</label><select id="statistics-month"><option value="${view.month}">${monthLabel(view.month)}</option><option value="all">Toàn bộ lịch sử</option></select></div><div class="statistics-field"><label for="statistics-search">Tìm lịch sử gia hạn</label><input id="statistics-search" maxlength="200" placeholder="Tìm tên, email, Family hoặc ghi chú…"></div></div><p>Chọn “Toàn bộ lịch sử” để xem cả các tháng cũ hơn. Tìm kiếm chỉ lọc danh sách bên dưới.</p><p id="statistics-error" role="alert"></p><div id="statistics-history" aria-live="polite"><p>Đang tải lịch sử…</p></div></section><section class="card"><h2>6 tháng gần nhất</h2><div id="statistics-months"><p>Đang tải thống kê…</p></div></section>`;
  view.change=event=>{if(event.target.id!=='statistics-month')return;view.month=event.target.value;view.followCurrent=false;view.page=1;clearTimeout(view.timer);load(view);};
  view.input=event=>{if(event.target.id!=='statistics-search')return;view.search=event.target.value;view.page=1;view.token++;view.controller?.abort();clearTimeout(view.timer);view.timer=setTimeout(()=>load(view),250);};
  view.click=event=>{const button=event.target.closest('[data-statistics-month],[data-statistics-page]');if(!button||!container.contains(button))return;if(button.dataset.statisticsMonth){view.month=button.dataset.statisticsMonth;view.followCurrent=false;view.page=1;}else view.page=Number(button.dataset.statisticsPage);clearTimeout(view.timer);load(view);};
  container.addEventListener('change',view.change);container.addEventListener('input',view.input);container.addEventListener('click',view.click);load(view);
}
function labels(container){container.querySelectorAll('table').forEach(table=>{table.classList.add('record-table');const headers=[...table.querySelectorAll('th')].map(th=>th.textContent);table.querySelectorAll('tbody tr').forEach(tr=>[...tr.cells].forEach((td,i)=>td.dataset.label=headers[i]));});}
async function load(view){
  if(active!==view)return;
  const token=++view.token;view.controller?.abort();view.controller=new AbortController();
  const query=new URLSearchParams({month:view.month,search:view.search,page:view.page});
  try{
    const data=await view.api('statistics?'+query,{signal:view.controller.signal});if(active!==view||token!==view.token)return;
    if(view.followCurrent&&view.month!==data.current_month){view.month=data.current_month;view.page=1;load(view);return;}
    const find=id=>view.container.querySelector('#'+id),selection=data.selected;
    find('statistics-error').textContent='';view.page=data.page;
    find('statistics-months').innerHTML=`<div class="table-wrap"><table><thead><tr><th>THÁNG</th><th>KHOẢNG THỜI GIAN</th><th>KHÁCH GIA HẠN</th><th>LƯỢT GIA HẠN</th><th>TỔNG TIỀN</th></tr></thead><tbody>${data.months.map(m=>`<tr><td><button class="secondary tiny" data-statistics-month="${m.month}">${monthLabel(m.month)}</button></td><td>${day(m.start_date)} → ${day(m.end_date)}</td><td>${m.customers}</td><td>${m.renewals}</td><td>${money(m.amount)}</td></tr>`).join('')}</tbody></table></div>`;
    find('statistics-totals').innerHTML=`<section class="statistics-selection"><h2>${monthLabel(selection.month)}</h2><p>${selection.start_date?day(selection.start_date)+' → '+day(selection.end_date)+'. ':''}Khách được đếm theo email khác nhau; mọi lượt gia hạn hoàn tất đều được cộng tiền.</p></section><div class="stats stats-three">${[['Khách gia hạn',selection.customers],['Lượt gia hạn',selection.renewals],['Tổng tiền gia hạn',money(selection.amount)]].map(([label,value])=>`<div class="card stat"><h2>${label}</h2><strong>${escape(value)}</strong></div>`).join('')}</div>`;
    const options=[...data.months.map(m=>m.month),'all'];if(!options.includes(view.month))options.unshift(view.month);
    find('statistics-month').innerHTML=options.map(month=>`<option value="${month}" ${month===view.month?'selected':''}>${monthLabel(month)}</option>`).join('');
    find('statistics-history').innerHTML=(data.rows.length?`<div class="table-wrap"><table><thead><tr><th>KHÁCH</th><th>FAMILY / GÓI</th><th>XÁC NHẬN GIA HẠN</th><th>KỲ SỬ DỤNG MỚI</th><th>TIỀN GIA HẠN</th><th>GHI CHÚ</th></tr></thead><tbody>${data.rows.map(h=>`<tr><td>${view.customerInfo(h,false)}</td><td>${escape(h.family_name)}<span class="subtext">${escape(h.plan_months)} tháng</span></td><td>${timestamp(h.created_at)}</td><td>${day(h.new_purchase_at||h.old_expires_at)} → ${day(h.new_expires_at)}</td><td>${money(h.amount)}<span class="subtext">Nhận tiền: ${day(h.paid_at)}</span></td><td class="statistics-note">${escape(h.note||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty"><h2>Chưa có lượt gia hạn phù hợp</h2><p>Chọn tháng khác, xem toàn bộ lịch sử hoặc điều chỉnh tìm kiếm.</p></div>')+`<div class="section-heading statistics-pagination"><p>${data.total} lượt · Trang ${data.page}/${Math.max(1,Math.ceil(data.total/data.page_size))}</p><div class="row-actions"><button class="secondary tiny" data-statistics-page="${data.page-1}" ${data.page<=1?'disabled':''}>← Trước</button><button class="secondary tiny" data-statistics-page="${data.page+1}" ${data.page*data.page_size>=data.total?'disabled':''}>Sau →</button></div></div>`;
    labels(view.container);
  }catch(error){if(active===view&&token===view.token&&error.name!=='AbortError')view.container.querySelector('#statistics-error').textContent=error.message;}
}
