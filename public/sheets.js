import {gmailSummary} from './moves.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const scopeLabels={core:'Family / Khách',vault:'Kho tài khoản'};
const tabLabels={families:'Family',members:'Khách',codes:'Mã tra cứu',vault:'Kho'};
const stateLabels={running:'Đang đồng bộ',success:'Thành công',error:'Cần xử lý',conflict:'Có xung đột',idle:'Chưa có lượt mới'};
const stageLabels={sync_lock:'Lấy lượt đồng bộ',settings:'Đọc kết nối',read_remote:'Đọc Google Sheet',validate_remote:'Kiểm tra dữ liệu Sheet',snapshot_local:'Đọc dữ liệu trên web',normalize_vault:'Kiểm tra Kho',merge:'Đối chiếu thay đổi',begin_import:'Chuẩn bị nhập vào web',apply_core:'Nhập Family / Khách vào web',apply_vault:'Nhập Kho vào web',commit_import:'Lưu thay đổi trên web',snapshot_output:'Chuẩn bị dữ liệu gửi đi',write_remote:'Ghi Google Sheet',save_state:'Xác nhận kết quả',complete:'Đã hoàn tất',finished:'Đã hoàn tất'};
const icon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7h-5V2M4 17h5v5"/><path d="M20 7a8 8 0 0 0-13.5-3M4 17a8 8 0 0 0 13.5 3"/><path d="M20 7v5M4 17v-5"/></svg>';
const timestamp=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa có';
const compactTime=value=>{if(!value||!Number.isFinite(Date.parse(value)))return '';const parts=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value)),part=type=>parts.find(item=>item.type===type)?.value||'';return part('hour')+':'+part('minute')+' · '+part('day')+'/'+part('month');};
let lastGmail=0,state,ctx,busy=false,activeScope=null,vaultOpen=false,conflict=null,scheduled,editConnection=false,view='status',statusError='',lastMessage='',history=null,historyPage=1,historyToken=0,historyError='',historyLoading=false;
const changes={core:0,vault:0},acknowledged={core:0,vault:0},clientFailures={core:null,vault:null},lastAutoError={core:'',vault:''};
const pending=scope=>changes[scope]>acknowledged[scope];
const panel=()=>document.querySelector('#sheets-dialog');
function statusFor(scope){return state?.health?.[scope]||{state:'idle',last_success:state?.['last_'+scope]||null};}
function headerState(){
  if(statusError)return {tone:'error',title:'Chưa kiểm tra được Sheet',detail:'Mở để kiểm tra kết nối'};
  if(!state)return {tone:'idle',title:'Đang kiểm tra Sheet',detail:'Đọc trạng thái kết nối'};
  if(!state.configured)return {tone:'idle',title:'Sheet chưa kết nối',detail:'Mở để thiết lập'};
  const health=['core','vault'].map(scope=>({scope,...statusFor(scope)}));
  if(busy)return {tone:'running',title:'Đang đồng bộ Sheet',detail:scopeLabels[activeScope]||'Đang xử lý dữ liệu'};
  if(conflict||health.some(item=>item.state==='conflict'))return {tone:'conflict',title:'Sheet có xung đột',detail:'Mở để chọn dữ liệu giữ lại'};
  const localFailed=['core','vault'].find(scope=>clientFailures[scope]);
  if(localFailed)return {tone:'error',title:'Sheet cần xử lý',detail:scopeLabels[localFailed]+' chưa xác nhận hoàn tất'};
  const failed=health.find(item=>item.state==='error');
  if(failed)return {tone:'error',title:'Sheet cần xử lý',detail:scopeLabels[failed.scope]+' chưa đồng bộ xong'};
  const running=health.find(item=>item.state==='running');
  if(running)return {tone:'running',title:'Sheet đang xử lý',detail:scopeLabels[running.scope]+' · lượt đồng bộ khác'};
  if(pending('core')||vaultOpen&&pending('vault'))return {tone:'queued',title:'Sheet chờ đồng bộ',detail:'Có thay đổi trên web đang chờ gửi'};
  const core=statusFor('core'),last=core.last_success||state.last_core;
  if(last)return {tone:'success',title:'Family / Khách đã đồng bộ',detail:'Gần nhất '+compactTime(last),fullDetail:'Thành công gần nhất: '+timestamp(last)};
  return {tone:'idle',title:'Sheet chưa đồng bộ',detail:'Mở để đồng bộ lần đầu'};
}
function updateHeader(){
  const slot=document.querySelector('#sheet-health-slot');
  if(slot){const value=headerState();slot.innerHTML=`<button type="button" class="sheet-health sheet-health--${value.tone}" data-action="sheets-open" aria-label="${esc(value.title+'. '+(value.fullDetail||value.detail)+'. Mở trạng thái và lịch sử đồng bộ.')}" title="${esc(value.title+'. '+(value.fullDetail||value.detail))}"><span class="sheet-health-icon">${icon}</span><span class="sheet-health-copy"><strong>${esc(value.title)}</strong><small>${esc(value.detail)}</small></span><span class="sheet-health-dot" aria-hidden="true"></span></button>`;}
  document.dispatchEvent(new CustomEvent('family-sheet-status',{detail:{configured:!!state?.configured,health:state?.health||{},busy,pending:{core:pending('core'),vault:pending('vault')},status_error:!!statusError}}));
}
export function queueSheetSync(){
  if(!ctx||!state?.configured)return;
  changes.core++;schedule();updateHeader();updateScopeCards();
}
function schedule(){clearTimeout(scheduled);scheduled=setTimeout(async()=>{await run('core');if(vaultOpen&&pending('vault'))await run('vault');},1500);}
export function startSheetSync(context){
  if(ctx){updateHeader();return;}
  ctx=context;
  const dialog=document.createElement('dialog');dialog.id='sheets-dialog';dialog.setAttribute('aria-labelledby','sheets-title');dialog.innerHTML='<div id="sheets-panel"></div>';document.body.append(dialog);
  document.addEventListener('click',event=>{if(event.target.closest('[data-action="sheets-open"]'))open();});
  dialog.addEventListener('click',async event=>{
    const button=event.target.closest('[data-sheets]');if(!button)return;
    const action=button.dataset.sheets;
    if(action==='close'){dialog.close();return;}
    if(action==='view-status'||action==='view-history'){view=action==='view-history'?'history':'status';render();if(view==='history')await loadHistory();return;}
    if(action==='history-page'){historyPage=Number(button.dataset.page)||1;await loadHistory();return;}
    if(action==='history-refresh'){await loadHistory();return;}
    if(action==='edit-link'){editConnection=!editConnection;render();return;}
    if(action==='sync'){const success=await run('core',{},true);if(success&&!conflict&&vaultOpen)await run('vault',{},true);return;}
    if(action==='disconnect'){
      if(!confirm('Ngắt kết nối? Dữ liệu web và Sheet vẫn được giữ.'))return;
      button.disabled=true;try{await ctx.api('sheets/config',{method:'DELETE'});conflict=null;changes.core=acknowledged.core=changes.vault=acknowledged.vault=0;await status();render();if(history)await loadHistory();}catch(error){message(error.message);}finally{if(button.isConnected)button.disabled=false;}return;
    }
    if(['web','sheet'].includes(action)){
      if(!conflict||!confirm('Áp dụng bản '+(action==='web'?'web':'Sheet')+' cho các hồ sơ xung đột?'))return;
      const old=conflict;await run(old.scope,{choice:action,conflict_token:old.token},true);
    }
  });
  dialog.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.target,button=form.querySelector('[type=submit]');button.disabled=true;
    try{await ctx.api('sheets/config',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});form.reset();editConnection=false;await status();render();await run('core',{},true);}catch(error){message(error.message);}finally{if(button.isConnected)button.disabled=false;}
  });
  dialog.addEventListener('close',()=>{dialog.querySelectorAll('input').forEach(input=>input.value='');editConnection=false;if(pending('core')||vaultOpen&&pending('vault'))schedule();});
  document.addEventListener('family-vault-state',event=>{
    vaultOpen=!!event.detail.unlocked;updateHeader();updateScopeCards();
    if(vaultOpen&&state?.configured){changes.vault++;setTimeout(()=>run('vault'),1600);}
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){status().catch(()=>{});run('core');}});
  status().catch(()=>{});
  setInterval(async()=>{
    if(document.hidden)return;
    // Reading health is safe while a connection form is being edited. Its inputs
    // are never replaced by background polling or a sync completion.
    await status().catch(()=>{});
    if(state?.configured&&!conflict){await run('core');if(vaultOpen)await run('vault');}
    await gmailCheck();
  },30000);
  updateHeader();
}
// Every 10 minutes while the website is open, file new invite links from Gmail (Apps Script v5.8+).
async function gmailCheck(){
  if(!state?.configured||!state.gmail_invites||busy||document.querySelector('dialog[open]')||Date.now()-lastGmail<600000)return;
  lastGmail=Date.now();
  try{const result=await ctx.api('sheets/gmail-invites',{method:'POST',body:'{}'});if(result.added||result.updated){ctx.toast(gmailSummary(result),9000);await ctx.refresh(false);document.dispatchEvent(new Event('family-sheet-updated'));}}catch{}
}
async function status(){
  try{state=await ctx.api('sheets/status');statusError='';for(const scope of ['core','vault']){const health=statusFor(scope),failure=clientFailures[scope],attempt=health.attempt_id||health.id||null;if(!state.configured||failure&&attempt!==failure.attempt&&['success','error','conflict'].includes(health.state))clientFailures[scope]=null;}updateHeader();updateScopeCards();}
  catch(error){statusError=error.message;updateHeader();throw error;}
}
function connectionForm(){return `<form id="sheets-config"><label for="sheets-url">${state?.configured?'URL triển khai mới':'URL Apps Script kết thúc bằng /exec'}</label><input id="sheets-url" name="url" type="url" required autocomplete="off" value="${esc(state?.script_url||'')}" placeholder="https://script.google.com/macros/s/…/exec"><label for="sheets-token">Mã kết nối FAMILY_TOKEN${state?.configured?' (để trống để giữ mã hiện tại)':''}</label><input id="sheets-token" name="token" type="password" ${state?.configured?'':'required'} minlength="32" autocomplete="off"><div class="actions"><button type="submit" class="primary">${state?.configured?'Lưu link và đồng bộ':'Kết nối và tạo dữ liệu trên Sheet'}</button></div></form>`;}
function message(text){lastMessage=String(text||'');const target=document.querySelector('#sheets-message');if(target)target.textContent=lastMessage;}
function scopeCard(scope){
  const health=statusFor(scope),running=busy&&activeScope===scope,pause=scope==='vault'&&!vaultOpen;
  const mode=running?'running':clientFailures[scope]?'error':pending(scope)&&!['error','conflict','running'].includes(health.state)&&!pause?'queued':health.state;
  const title=mode==='queued'?'Chờ gửi thay đổi':stateLabels[mode]||stateLabels.idle;
  const last=health.last_success||state?.['last_'+scope];
  return `<section class="sheet-scope-card sheet-scope-card--${esc(mode)}"><div class="sheet-scope-heading"><h3>${scopeLabels[scope]}</h3><span class="sheet-state-badge sheet-state-badge--${esc(mode)}">${esc(title)}</span></div><p class="sheet-last-success">Thành công gần nhất<br><strong>${esc(timestamp(last))}</strong></p>${running?`<p>${esc(stageLabels[health.stage]||'Đang đối chiếu dữ liệu…')}</p>`:''}${clientFailures[scope]?'<p class="sheet-entry-error">Chưa xác nhận lượt đồng bộ hoàn tất. Thử đồng bộ lại để kiểm tra.</p>':health.state==='error'?errorHTML(health.error):''}${health.state==='conflict'?`<p>${Number(health.conflict_count)||0} hồ sơ cần chọn bản dữ liệu.${!conflict?' Nhấn Đồng bộ ngay để tải lại các hồ sơ cần chọn.':''}</p>`:''}${pause?'<p class="sheet-vault-paused">Kho đang khóa · Chỉ đồng bộ khi mở khóa và ở mục Kho.</p>':''}</section>`;
}
function updateScopeCards(){
  const cards=document.querySelector('#sheets-scope-cards');if(cards)cards.innerHTML=state?.configured?scopeCard('core')+scopeCard('vault'):'';
  panel()?.querySelectorAll('[data-sheets="sync"],[data-sheets="disconnect"],[data-sheets="edit-link"]').forEach(button=>button.disabled=busy);
  const sync=panel()?.querySelector('[data-sheets="sync"]');if(sync)sync.textContent=busy?'Đang đồng bộ…':'Đồng bộ ngay';
}
function errorHTML(error){
  if(!error)return '<p class="sheet-entry-error">Chưa xác nhận lượt đồng bộ hoàn tất.</p>';
  const location=error.location,where=location&&['FamilySync_Family','FamilySync_Khach','FamilySync_Kho'].includes(location.tab)&&Number.isInteger(location.row)&&Number.isInteger(location.column)?`${location.tab} · dòng ${location.row}, cột ${location.column}`:'';
  return `<p class="sheet-entry-error">${esc(error.message||'Chưa xác nhận lượt đồng bộ hoàn tất.')}</p>${where?`<p class="sheet-error-location">${esc(where)}</p>`:''}${error.code?`<span class="sheet-error-code">${esc(error.code)}${error.stage?' · '+esc(stageLabels[error.stage]||error.stage):''}</span>`:''}`;
}
function render(){
  const target=document.querySelector('#sheets-panel');if(!target)return;
  target.innerHTML=`<div class="dialog-heading"><h2 id="sheets-title">Đồng bộ Google Sheet</h2><button type="button" class="icon-button" data-sheets="close" aria-label="Đóng">×</button></div><p class="sheet-dialog-intro">Theo dõi kết quả Family / Khách và Kho riêng biệt.</p><div class="sheet-panel-tabs" aria-label="Nội dung đồng bộ"><button type="button" class="${view==='status'?'active':''}" data-sheets="view-status" aria-pressed="${view==='status'}">Trạng thái</button><button type="button" class="${view==='history'?'active':''}" data-sheets="view-history" aria-pressed="${view==='history'}">Lịch sử đồng bộ</button></div><p id="sheets-message" role="status"></p><div id="sheets-status-view" ${view==='status'?'':'hidden'}>`+(state?.configured?`<div id="sheets-scope-cards" class="sheet-scope-cards">${scopeCard('core')}${scopeCard('vault')}</div>${state.sheet_url?`<a class="email-link sheet-open-link" href="${esc(state.sheet_url)}" target="_blank" rel="noopener noreferrer">Mở Google Sheet →</a>`:''}<div id="sheets-conflicts"></div><div class="actions"><button type="button" class="primary" data-sheets="sync" ${busy?'disabled':''}>${busy?'Đang đồng bộ…':'Đồng bộ ngay'}</button><button type="button" class="secondary" data-sheets="edit-link" ${busy?'disabled':''}>${editConnection?'Hủy đổi link':'Đổi link triển khai'}</button><button type="button" class="danger" data-sheets="disconnect" ${busy?'disabled':''}>Ngắt kết nối</button></div>${editConnection?connectionForm():''}<details class="sheet-connection-details"><summary>Thông tin kết nối</summary><p>Bố cục Khách: <strong>${state.customer_layout==='grouped'?'Theo Family · dd/mm/yyyy':'Chưa xác nhận bố cục mới'}</strong></p><p>Phiên bản Google: <strong>${esc(state.script_version||'Chưa kiểm tra')}</strong></p><p>Lấy link từ Gmail: <strong>${state.gmail_invites?'Có · tự kiểm tra 10 phút/lần khi web mở':'Chưa có · cập nhật Code.gs, appsscript.json và chạy capQuyenGmail'}</strong></p><p>Tab Mã tra cứu: <strong>${state.lookup_codes?'Đang đồng bộ (FamilySync_MaTraCuu)':'Chưa có · cập nhật Code.gs bản mới rồi triển khai New version'}</strong></p>${state.script_url?`<a class="email-link sheet-script-url" href="${esc(state.script_url)}" target="_blank" rel="noopener noreferrer">${esc(state.script_url)}</a>`:''}</details><p class="sheet-auto-note">Tự kiểm tra mỗi 30 giây khi website đang mở. Đóng web sẽ tạm dừng tự đồng bộ; khi mở lại, website tiếp tục kiểm tra. Kho chỉ đồng bộ khi mở khóa và đang ở mục Kho.</p><p class="sheet-auto-note">Mật khẩu/khóa 2FA đã gửi lên Sheet vẫn đọc được ở đó sau khi khóa Kho.</p>`:`<p>Chạy script tạo Sheet và triển khai Apps Script theo tệp HUONG-DAN.md trong gói kết nối, rồi điền URL và mã kết nối ngay trên website.</p>${connectionForm()}`)+`</div><section id="sheets-history-view" ${view==='history'?'':'hidden'}><div class="sheet-history-heading"><div><h3>Lịch sử gần đây</h3><p>Lưu tối đa 100 lượt. Lượt tự kiểm tra không có thay đổi được rút gọn.</p></div><button type="button" class="secondary tiny" data-sheets="history-refresh">Làm mới</button></div><div id="sheets-history" aria-live="polite"></div></section>`;
  message(lastMessage);renderConflicts();renderHistory();updateHeader();
}
function renderConflicts(){
  const target=document.querySelector('#sheets-conflicts');if(!target)return;
  target.innerHTML=conflict?`<div class="notice"><h3>Cần chọn bản dữ liệu</h3><p>${conflict.rows.length} hồ sơ cùng thay đổi ở web và Sheet. Chưa ghi đè dữ liệu xung đột.</p><ul>${conflict.rows.slice(0,20).map(row=>`<li>${esc(tabLabels[row.tab]||'Hồ sơ')} · ${esc(row.label||row.id)} <small>(${esc(row.id)})</small></li>`).join('')}</ul><div class="actions"><button type="button" class="secondary" data-sheets="web">Dùng bản web</button><button type="button" class="secondary" data-sheets="sheet">Dùng bản Sheet</button></div></div>`:'';
}
function sumCounts(direction){
  if(!direction||typeof direction!=='object')return null;
  const total={added:0,updated:0,deleted:0};
  for(const record of Object.values(direction)){if(!record||!['added','updated','deleted'].every(key=>Number.isInteger(record[key])&&record[key]>=0))return null;for(const key of Object.keys(total))total[key]+=record[key];}
  return total;
}
function countSummary(direction){const total=sumCounts(direction);return total?`${total.added} thêm · ${total.updated} sửa · ${total.deleted} xóa`:'Chưa xác định kết quả';}
function directionHTML(title,counts){
  if(!counts||typeof counts!=='object')return `<div class="sheet-direction"><h4>${title}</h4><p>Chưa xác định kết quả.</p></div>`;
  return `<div class="sheet-direction"><h4>${title}</h4><div class="sheet-count-table"><table><thead><tr><th scope="col">Dữ liệu</th><th scope="col">Thêm</th><th scope="col">Sửa</th><th scope="col">Xóa</th></tr></thead><tbody>${Object.entries(counts).filter(([tab])=>tabLabels[tab]).map(([tab,count])=>`<tr><th scope="row">${tabLabels[tab]}</th>${['added','updated','deleted'].map(key=>`<td>${Number.isInteger(count?.[key])?count[key]:'—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
function entryHTML(entry){
  const stateName=stateLabels[entry.state]||'Chưa xác nhận',scope=scopeLabels[entry.scope]||'Sheet';
  const skipped=entry.skipped?.sheet_deletions_ignored;
  const success=entry.state==='success',knownNoChange=success&&[entry.counts?.sheet_to_web,entry.counts?.web_to_sheet].every(direction=>{const count=sumCounts(direction);return count&&count.added+count.updated+count.deleted===0;});
  return `<article class="sheet-history-entry sheet-history-entry--${esc(entry.state||'idle')}"><div class="sheet-entry-heading"><div><strong>${scope}</strong><span class="sheet-entry-time">${esc(timestamp(entry.finished_at||entry.started_at))}</span></div><span class="sheet-state-badge sheet-state-badge--${esc(entry.state||'idle')}">${esc(stateName)}</span></div><p class="sheet-entry-source">${entry.source==='auto'?'Tự động':'Thao tác trên web'}</p>${entry.state==='error'?errorHTML(entry.error):''}${entry.state==='conflict'?`<p class="sheet-entry-error">${Number(entry.conflict_count)||0} hồ sơ cùng thay đổi ở hai nơi; chờ bạn chọn bản giữ lại.</p>`:''}${entry.state==='running'?'<p>Đang xử lý. Chưa xác nhận hoàn tất.</p>':''}${entry.state==='error'&&entry.import_applied?'<p class="sheet-partial-note">Bước nhập vào web đã hoàn tất; lượt đồng bộ chưa hoàn tất.</p>':''}${!success&&entry.write_acknowledged===false?'<p class="sheet-partial-note">Chưa có xác nhận ghi thành công từ Google Sheet.</p>':''}${entry.layout_updated?'<p class="sheet-no-change">Đã cập nhật bố cục hiển thị trên Sheet.</p>':''}${knownNoChange?'<p class="sheet-no-change">Không có thay đổi dữ liệu.</p>':`<dl class="sheet-change-summary"><div><dt>Sheet → Web</dt><dd>${countSummary(entry.counts?.sheet_to_web)}</dd></div><div><dt>Web → Sheet</dt><dd>${countSummary(entry.counts?.web_to_sheet)}</dd></div></dl>`}${Number.isInteger(skipped)&&skipped>0?`<p class="sheet-skipped-note">${skipped} dòng bị xóa trên Sheet được giữ lại từ web. Việc xóa này chưa được áp dụng vào web.</p>`:''}<details class="sheet-entry-details"><summary>Chi tiết thay đổi</summary>${directionHTML('Sheet → Web',entry.counts?.sheet_to_web)}${directionHTML('Web → Sheet',entry.counts?.web_to_sheet)}${entry.stage?`<p class="sheet-stage">Bước: ${esc(stageLabels[entry.stage]||entry.stage)}</p>`:''}</details></article>`;
}
function renderHistory(){
  const target=document.querySelector('#sheets-history');if(!target)return;
  if(historyLoading&&!history){target.innerHTML='<p class="sheet-history-loading">Đang tải lịch sử…</p>';return;}
  if(historyError){target.innerHTML=`<p class="error-box">${esc(historyError)}</p><button type="button" class="secondary" data-sheets="history-refresh">Thử lại</button>`;return;}
  if(!history){target.innerHTML='<p class="sheet-history-loading">Mở Lịch sử đồng bộ để tải các lượt gần đây.</p>';return;}
  const entries=Array.isArray(history.entries)?history.entries:[];
  target.innerHTML=(entries.length?entries.map(entryHTML).join(''):'<div class="sheet-history-empty"><h4>Chưa có lịch sử đồng bộ</h4><p>Các lượt đồng bộ từ bản cập nhật này sẽ được ghi lại tại đây.</p></div>')+`<div class="sheet-history-pagination"><span>${Number(history.total)||0} lượt · Trang ${Number(history.page)||1}/${Math.max(1,Number(history.pages)||1)}</span><div><button type="button" class="secondary tiny" data-sheets="history-page" data-page="${historyPage-1}" ${historyPage<=1||historyLoading?'disabled':''}>← Trước</button><button type="button" class="secondary tiny" data-sheets="history-page" data-page="${historyPage+1}" ${historyPage>=(Number(history.pages)||1)||historyLoading?'disabled':''}>Sau →</button></div></div>`;
}
async function loadHistory(){
  const token=++historyToken;historyLoading=true;historyError='';renderHistory();
  try{const result=await ctx.api('sheets/history?page='+historyPage);if(token!==historyToken)return;history=result;historyPage=Number(result.page)||1;}
  catch(error){if(token===historyToken)historyError=error.message;}
  finally{if(token===historyToken){historyLoading=false;renderHistory();}}
}
async function open(){
  lastMessage='';try{await status();}catch(error){lastMessage='Chưa đọc được trạng thái mới: '+error.message;}
  render();if(!panel().open)panel().showModal();if(view==='history')await loadHistory();
}
async function run(scope,options={},interactive=false){
  if(!state?.configured||busy||(conflict&&!interactive)||(!interactive&&document.querySelector('dialog[open]'))||scope==='vault'&&!vaultOpen)return false;
  busy=true;activeScope=scope;const generation=changes[scope],previousAttempt=statusFor(scope).attempt_id||statusFor(scope).id||null;message('');updateHeader();updateScopeCards();let success=false;
  try{
    const result=await ctx.api(scope==='vault'?'vault/sheets-sync':'sheets/sync',{method:'POST',body:JSON.stringify({...options,source:interactive?'user':'auto'})});
    if(result.busy){if(interactive){const notice='Một tab khác đang đồng bộ Sheet. Bạn vẫn có thể tiếp tục quản lý khách trên web.';message(notice);ctx.toast(notice);}return false;}
    if(result.configured===false)return false;
    if(result.conflicts){conflict={scope,rows:result.conflicts,token:result.conflict_token};ctx.toast('Sheet có dữ liệu xung đột. Mở Đồng bộ Sheet để chọn bản giữ lại.');}
    else{
      conflict=null;success=true;clientFailures[scope]=null;lastAutoError[scope]='';acknowledged[scope]=generation;
      try{await ctx.refresh(false);document.dispatchEvent(new Event('family-sheet-updated'));}catch{message('Lượt đồng bộ đã trả kết quả thành công, nhưng chưa tải lại được dữ liệu web. Tải lại trang để kiểm tra.');}
      if(interactive){if(scope==='core'&&result.customer_layout&&result.customer_layout!=='grouped'){const warning='Dữ liệu đã đồng bộ, nhưng Google chưa xác nhận bố cục nhóm. Kiểm tra phiên bản script hoặc dùng Đổi link triển khai.';message(warning);ctx.toast(warning);}else ctx.toast('Đã đồng bộ '+(scope==='vault'?'Kho.':'Family và khách.'));}
    }
  }catch(error){
    if(scope==='vault'&&error.message.includes('khóa'))vaultOpen=false;
    // The persisted health response remains the source of truth after reload.
    // Until it can be read, do not retain a green success indicator.
    clientFailures[scope]={attempt:previousAttempt};statusError='Chưa xác nhận lượt đồng bộ hoàn tất';message(error.message);if(interactive||lastAutoError[scope]!==error.message)ctx.toast('Chưa đồng bộ Sheet: '+error.message);if(!interactive)lastAutoError[scope]=error.message;
  }finally{
    busy=false;activeScope=null;
    await status().catch(()=>{});updateHeader();updateScopeCards();renderConflicts();
    if(panel()?.open&&view==='history')await loadHistory();
    if(success&&pending('core'))schedule();
  }
  return success;
}
