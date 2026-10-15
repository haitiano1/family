import {projectVaultFamilies} from './vault-families.js';
const day=value=>value?value.split('-').reverse().join('/'):'Chưa nhập';
import {readVaultSheet,mapVaultSheet,vaultSheetFields} from './vault-sheet.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
const button=(action,label,id='',kind='secondary tiny')=>`<button type="button" class="${kind}" data-vault-action="${action}" ${id!==''?`data-id="${id}"`:''}>${label}</button>`;
const copy=(action,label,id)=>`<button type="button" class="copy-info" data-vault-action="${action}" data-id="${id}" title="${label}" aria-label="${label}">${icon}</button>`;
let active;
export function unmountVault(force=false){
  const current=active;active=null;if(current)current.dispose();
  if(force)return fetch('/api/vault/lock',{method:'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:'{}',keepalive:true}).catch(()=>{});
  return Promise.resolve();
}
window.addEventListener('pagehide',()=>{unmountVault();});
export function mountVault(container,{families,members,issues=[],getFamilyContext,refreshFamilyContext,toast}){
  if(active?.container===container){active.families=families;active.members=members;active.issues=issues;active.redraw();return;}
  const controller=new AbortController(),view={container,families,members,issues,dispose,redraw:()=>{if(unlocked)rows();}};active=view;
  let items=[],configured=false,unlocked=false,expires=0,offset=0,query='',familyFilter='',epoch=0,timer,polling=false,lastPoll=0,revealed=new Map(),revealedKeys=new Set(),lastCopiedId=null;
  const live=()=>active===view;
  const $=s=>container.querySelector(s);
  const now=()=>Date.now()+offset;
  function dispose(){controller.abort();clearInterval(timer);items=[];revealed.clear();revealedKeys.clear();query='';container.querySelectorAll('input,textarea').forEach(i=>i.value='');container.innerHTML='';document.removeEventListener('visibilitychange',hidePasswords);}
  async function api(path,method='GET',data){
    const requestEpoch=epoch;const response=await fetch('/api/vault/'+path,{method,headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:data===undefined?undefined:JSON.stringify(data),signal:controller.signal});
    if(response.status===401){await unmountVault(true);location.replace('/access');throw Error('Cần mở lại ứng dụng.');}
    const value=await response.json();if(response.status===423){if(live())locked('Kho đã tự khóa. Nhập mật khẩu để mở lại.');throw Error(value.error);}
    if(!response.ok)throw Error(value.error||'Không thể thực hiện thao tác trong kho.');if(!live()||requestEpoch!==epoch)throw new DOMException('Aborted','AbortError');return value;
  }
  const intro=()=>`<section class="card hero"><div><span class="eyebrow">MẬT KHẨU RIÊNG</span><h1>Kho tài khoản Family</h1><p>Danh sách liên kết từ mục Family, gồm mail chủ và ngày trial; các thông tin còn lại bạn tự nhập.</p></div>${unlocked?button('lock','Khóa kho','','secondary'):''}</section>`;
  function locked(message=''){
    epoch++;unlocked=false;clearInterval(timer);timer=null;items=[];revealed.clear();revealedKeys.clear();lastCopiedId=null;expires=0;query='';familyFilter='';
    const dialog=$('#vault-dialog');if(dialog){dialog.querySelectorAll('input,textarea').forEach(i=>i.value='');dialog.close();}
    container.innerHTML=intro()+`<section class="card vault-access"><h2>${configured?'Mở kho tài khoản':'Tạo mật khẩu kho lần đầu'}</h2><p>${configured?'Nhập mật khẩu riêng của kho.':'Mật khẩu kho khác mật khẩu vào website và dùng để giải mã thông tin đã lưu.'}</p><form id="vault-access-form"><label for="vault-password">${configured?'Mật khẩu kho':'Mật khẩu kho mới'}</label><input id="vault-password" name="password" type="password" required minlength="5" maxlength="128" autocomplete="${configured?'current-password':'new-password'}">${configured?'':'<label for="vault-confirm-password">Nhập lại mật khẩu kho</label><input id="vault-confirm-password" name="confirm_password" type="password" required minlength="5" maxlength="128" autocomplete="new-password">'}<p class="vault-error" role="alert">${esc(message)}</p><button class="primary" type="submit">${configured?'Mở kho':'Tạo mật khẩu kho'}</button></form><p>Mật khẩu từ 5 ký tự. Kho tự khóa sau 30 phút. Chuyển mục rồi quay lại trong phiên sẽ không cần nhập lại mật khẩu. Hãy giữ mật khẩu kho riêng; ứng dụng không khôi phục được mật khẩu đã quên.</p></section>`;
    $('#vault-access-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,submit=event.submitter;submit.disabled=true;form.querySelector('.vault-error').textContent='';try{const data=Object.fromEntries(new FormData(form));await api(configured?'unlock':'setup','POST',data);configured=true;form.querySelectorAll('input,textarea').forEach(i=>i.value='');await load();}catch(error){if(live()&&form.isConnected)form.querySelector('.vault-error').textContent=error.message;}finally{if(submit.isConnected)submit.disabled=false;}});
  }
  async function load(){await refreshFamilyContext?.();const data=await api('items');items=data.items;expires=data.session_expires;offset=data.server_time-Date.now();lastPoll=Date.now();unlocked=true;render();clearInterval(timer);timer=setInterval(tick,1000);}
  function render(){
    container.innerHTML=intro()+`<section class="card"><div class="section-heading"><div><h2>Danh sách Family</h2><p>Mọi Family đều hiện ở đây. Chọn Nhập thông tin để bổ sung mật khẩu, 2FA, mail khôi phục và Note.</p></div><div class="row-actions">${button('add','Bổ sung thông tin','','primary')}${button('import','Nhập từ Sheet')}${button('change-password','Đổi mật khẩu kho')}</div></div><div class="toolbar"><input id="vault-search" aria-label="Tìm tài khoản trong kho" placeholder="Tìm mail Family, mail khôi phục hoặc Note…" value="${esc(query)}"><select id="vault-family-filter" aria-label="Lọc Family trong kho">${Object.entries({'':'Tất cả',error:'Fam đang lỗi',name:'Theo tên'}).map(([v,label])=>`<option value="${v}" ${familyFilter===v?'selected':''}>${label}</option>`).join('')}</select></div><p id="vault-count" class="subtext"></p><p id="vault-error" class="vault-error" role="alert"></p><div id="vault-table"></div></section><dialog id="vault-dialog"><form id="vault-dialog-form"><div class="dialog-heading"><h2 id="vault-dialog-title"></h2>${button('dialog-close','×','','icon-button')}</div><div id="vault-dialog-fields"></div><p id="vault-dialog-error" class="vault-error" role="alert"></p><div class="dialog-footer">${button('dialog-close','Hủy')}<button id="vault-dialog-submit" type="submit" class="primary">Lưu</button></div></form></dialog>`;
    $('#vault-search').addEventListener('input',event=>{query=event.target.value;rows();});$('#vault-family-filter').addEventListener('change',event=>{familyFilter=event.target.value;rows();});rows();
  }
  function projection(queryValue=query,filter=familyFilter){const context=getFamilyContext?.();if(context){view.families=context.families;view.members=context.members;view.issues=context.issues||[];}return projectVaultFamilies(view.families,view.members||[],items,queryValue,filter,view.issues);}
  function table(records,linked){return `<div class="table-wrap"><table class="record-table vault-table"><thead><tr><th>MAIL FAMILY</th><th>NGÀY TRIAL</th><th>MẬT KHẨU</th><th>2FA</th><th>MÃ 2FA</th><th>MAIL KHÔI PHỤC</th><th>NOTE</th><th>THAO TÁC</th></tr></thead><tbody>${records.map(i=>`<tr class="${i.id===lastCopiedId?'vault-last-copied':''}" data-vault-id="${i.id}" ${linked?`data-family-id="${i.family_id}"`:''}><td data-label="MAIL FAMILY"><div class="info-line">${linked?`<a class="email-link info-text" href="#family/${i.family_id}">${esc(i.email)}</a>`:`<strong class="info-text">${esc(i.email)}</strong>`}${copy('account-copy','Sao chép tài khoản',i.id)}</div>${i.open_issue?`<div class="family-issue-notice"><span class="badge amber">Fam đang lỗi — ${i.open_issue.status==='doing'?'đang fix':'chờ fix'}</span></div>`:''}</td><td data-label="NGÀY TRIAL">${i.trial_date?`<div class="info-line"><span class="info-text">${day(i.trial_date)}</span>${copy('trial-copy','Sao chép ngày trial',i.id)}</div>`:'Chưa nhập'}</td><td data-label="MẬT KHẨU"><span class="vault-password-value" data-password-for="${i.id}">${i.has_password?esc(revealed.get(i.id)||'••••••••'):'—'}</span>${i.has_password?`<div class="row-actions">${button('password-reveal',revealed.has(i.id)?'Ẩn':'Hiện',i.id)}${copy('password-copy','Sao chép mật khẩu tài khoản',i.id)}</div>`:''}</td><td data-label="2FA">${i.has_totp?`<span class="info-text vault-key" data-key-for="${i.id}">${revealedKeys.has(i.id)?esc(i.totp_key.startsWith('otpauth:')?i.totp_key:i.totp_key.match(/.{1,4}/g).join(' ')):'********'}</span><div class="row-actions"><button type="button" class="secondary tiny" data-vault-action="key-reveal" data-id="${i.id}" aria-label="${revealedKeys.has(i.id)?'Ẩn':'Hiện'} khóa 2FA">${revealedKeys.has(i.id)?'Ẩn':'Hiện'}</button>${copy('key-copy','Sao chép khóa 2FA',i.id)}</div>`:'—'}</td><td data-label="MÃ 2FA">${i.has_totp?`<div class="info-line"><strong class="vault-code" data-code-for="${i.id}">${esc(i.code)}</strong>${copy('code-copy','Sao chép mã 2FA',i.id)}</div><span class="subtext" data-countdown-for="${i.id}"></span>`:'Chưa có khóa 2FA'}</td><td data-label="MAIL KHÔI PHỤC">${i.recovery_email?`<div class="info-line"><span class="info-text">${esc(i.recovery_email)}</span>${copy('recovery-copy','Sao chép mail khôi phục',i.id)}</div>`:'—'}</td><td data-label="NOTE">${i.note?`<div class="info-line"><span class="info-text vault-note">${esc(i.note)}</span>${copy('note-copy','Sao chép Note',i.id)}</div>`:'—'}</td><td data-label="THAO TÁC"><div class="row-actions">${button('edit',i.vault_id?'Sửa':'Nhập thông tin',i.id)}${i.vault_id?button('delete','Xóa thông tin kho',i.id,'danger tiny'):''}</div></td></tr>`).join('')}</tbody></table></div>`;}
  function rows(){
    const context=getFamilyContext?.()||view,owners=new Map(context.families.map(f=>[f.id,f.manager_email]));
    const stale=new Set(items.filter(i=>i.family_id&&owners.has(i.family_id)&&owners.get(i.family_id)!==i.email).map(i=>i.id));
    if(stale.size){items=items.filter(i=>!stale.has(i.id));for(const id of stale){revealed.delete(id);revealedKeys.delete(id);}if(stale.has(lastCopiedId))lastCopiedId=null;lastPoll=0;}
    const data=projection();$('#vault-count').textContent=`${data.rows.length}/${data.total} Family`;
    $('#vault-table').innerHTML=`<div id="vault-linked-table">${data.rows.length?table(data.rows,true):'<div class="empty"><h2>Chưa có Family phù hợp</h2><p>Thêm Family tại mục Family hoặc điều chỉnh tìm kiếm.</p></div>'}</div>${data.unlinked.length?`<details id="vault-unlinked"><summary>Thông tin chưa ghép Family (${data.unlinked.length})</summary><p>Thông tin đã lưu của mail không còn thuộc Family đang quản lý được giữ tại đây.</p>${table(data.unlinked,false)}</details>`:''}`;
    tick();
  }
  async function codes(){if(polling||!unlocked)return;polling=true;try{const data=await api('items');items=data.items;expires=data.session_expires;offset=data.server_time-Date.now();lastPoll=Date.now();if(live()&&unlocked){rows();$('#vault-error').textContent='';}}catch(error){if(live()&&unlocked)$('#vault-error').textContent=error.message;}finally{polling=false;}}
  function tick(){
    if(!live()||!unlocked)return;if(now()>=expires){locked('Kho đã tự khóa sau 30 phút.');api('lock','POST',{}).catch(()=>{});return;}
    let stale=false;for(const item of items){if(!item.has_totp)continue;const seconds=Math.max(0,Math.ceil((item.expires_at-now())/1000)),code=container.querySelector(`[data-code-for="${item.id}"]`),count=container.querySelector(`[data-countdown-for="${item.id}"]`);if(code)code.textContent=seconds>0?item.code:'…';if(count)count.textContent=seconds>0?`Còn ${seconds} giây`:'Đang cập nhật mã mới…';if(!seconds)stale=true;}
    if((stale||Date.now()-lastPoll>30000)&&Date.now()-lastPoll>1000&&!polling){lastPoll=Date.now();codes();}
  }
  function markCopied(id){
    if(!live()||!unlocked)return;lastCopiedId=id;$('#vault-error').textContent='';
    container.querySelectorAll('[data-vault-id]').forEach(row=>row.classList.toggle('vault-last-copied',Number(row.dataset.vaultId)===id));
  }
  async function clipboard(value,label,id){
    try{await navigator.clipboard.writeText(value);}catch{const buffer=document.createElement('textarea');buffer.className='copy-buffer';buffer.value=value;container.append(buffer);buffer.focus();buffer.select();const success=document.execCommand('copy');buffer.value='';buffer.remove();if(!success)throw Error('Không sao chép được. Chọn nội dung và dùng Sao chép của thiết bị.');}
    markCopied(id);toast('Đã sao chép '+label+'.',2000);
  }
  async function clipboardFetch(provider,label,id){
    const value=Promise.resolve().then(provider);
    if(navigator.clipboard?.write&&window.ClipboardItem){try{await navigator.clipboard.write([new ClipboardItem({'text/plain':value.then(text=>new Blob([text],{type:'text/plain'}))})]);markCopied(id);toast('Đã sao chép '+label+'.',2000);return;}catch{}}
    await clipboard(await value,label,id);
  }
  function field(name,label,type,value='',required=false){return `<label for="vault-field-${name}">${label}</label><input id="vault-field-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} autocomplete="off" ${type==='password'?'maxlength="2048"':''}>`;}
  function dialog(title,fields,submit,handler,cleanup=()=>{}){
    $('#vault-dialog').classList.remove('vault-import-dialog');$('#vault-dialog-title').textContent=title;$('#vault-dialog-fields').innerHTML=fields;$('#vault-dialog-error').textContent='';$('#vault-dialog-submit').textContent=submit;const form=$('#vault-dialog-form');form.onsubmit=async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{const result=await handler(Object.fromEntries(new FormData(form)));if(result===false)return;form.querySelectorAll('input,textarea').forEach(i=>i.value='');const savedDialog=$('#vault-dialog');revealed.clear();revealedKeys.clear();await load();savedDialog.close();}catch(error){if(live()&&unlocked&&form.isConnected)$('#vault-dialog-error').textContent=error.message;}finally{if(button.isConnected)button.disabled=false;}};$('#vault-dialog').showModal();
    const fieldsNode=$('#vault-dialog-fields');$('#vault-dialog').onclose=()=>{fieldsNode.querySelectorAll('input,textarea').forEach(i=>i.value='');fieldsNode.innerHTML='';form.onsubmit=null;cleanup();};
  }
  function importSheet(){
    let parsed=null,prepared=null,revision=0;
    dialog('Nhập hàng loạt từ Sheet',`<p>Copy cả dòng tiêu đề và các dòng tài khoản trong Google Sheet/Excel rồi dán bên dưới, hoặc chọn file CSV. Các cột: <strong>Tài khoản, Mật khẩu, 2FA, Mail khôi phục, Note</strong>; nhận cả tiêu đề Mail, Pass, Auth như Sheet của bạn. Tài khoản phải là mail chủ của Family đang có. Chỉ Tài khoản bắt buộc. Tối đa 500 dòng/lần.</p><label for="vault-sheet-file">Chọn file CSV (tối đa 1 MB)</label><input id="vault-sheet-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values"><label for="vault-sheet-source">Dữ liệu từ Sheet</label><textarea id="vault-sheet-source" rows="6" autocomplete="off" spellcheck="false" placeholder="Dán bảng có dòng tiêu đề ở đây…"></textarea><label class="check-label"><input id="vault-import-update" type="checkbox" checked> Cập nhật tài khoản đã có trong kho</label><label class="check-label"><input id="vault-import-keep-empty" type="checkbox" checked> Giữ dữ liệu cũ cho ô trống khi cập nhật</label><div id="vault-sheet-mapping"></div><div id="vault-sheet-preview"></div>`,'Xem trước',async()=>{
      if(!parsed)throw Error('Dán dữ liệu hoặc chọn file CSV trước.');
      if(!prepared){const mapping=Object.fromEntries(Object.keys(vaultSheetFields).map(k=>[k,Number($('#vault-map-'+k).value)])),rows=mapVaultSheet(parsed,mapping),version=revision,options={family_only:true,update_existing:$('#vault-import-update').checked,keep_empty:$('#vault-import-keep-empty').checked,preserve_fields:Object.keys(vaultSheetFields).filter(k=>k!=='email'&&mapping[k]<0)};const preview=await api('import/preview','POST',{items:rows,...options});if(version!==revision||!$('#vault-dialog').open)return false;prepared={...options,items:rows.map((row,index)=>{const proof=preview.items[index];return {...row,expected_id:proof.expected_id,expected_revision:proof.expected_revision,expected_created_at:proof.expected_created_at,expected_family_id:proof.expected_family_id};})};$('#vault-sheet-preview').innerHTML=`<p><strong>${preview.count} tài khoản: thêm mới ${preview.created}, cập nhật ${preview.updated}.</strong> Mật khẩu và khóa 2FA được ẩn trong bản xem trước. Cột không chọn được giữ nguyên khi cập nhật.</p><div class="table-wrap"><table class="record-table"><thead><tr><th>DÒNG</th><th>TÀI KHOẢN</th><th>THAO TÁC</th><th>MẬT KHẨU / 2FA</th><th>MAIL KHÔI PHỤC / NOTE</th></tr></thead><tbody>${preview.items.map(i=>`<tr><td data-label="DÒNG">${i.line}</td><td data-label="TÀI KHOẢN">${esc(i.email)}<span class="subtext">${i.trial_date?'Trial '+day(i.trial_date):''}</span></td><td data-label="THAO TÁC">${i.action==='update'?'Cập nhật':'Thêm mới'}</td><td data-label="MẬT KHẨU / 2FA">Mật khẩu: ${i.has_password?'Đã nhập':'Trống'}<br>2FA: ${i.has_totp?'Hợp lệ':'Trống'}</td><td data-label="MAIL KHÔI PHỤC / NOTE">${esc(i.recovery_email)}<span class="subtext vault-note">${esc(i.note)}</span></td></tr>`).join('')}</tbody></table></div>`;$('#vault-dialog-submit').textContent=`Nhập ${preview.count} tài khoản`;return false;}
      const result=await api('import','POST',prepared);toast(`Đã thêm ${result.created}, cập nhật ${result.updated} tài khoản trong kho.`);

    },()=>{parsed=null;prepared=null;revision++;});
    $('#vault-dialog').classList.add('vault-import-dialog');
    const reset=()=>{prepared=null;revision++;$('#vault-sheet-preview').innerHTML='';$('#vault-dialog-error').textContent='';$('#vault-dialog-submit').textContent='Xem trước';};
    function read(){reset();parsed=null;$('#vault-sheet-mapping').innerHTML='';try{parsed=readVaultSheet($('#vault-sheet-source').value);$('#vault-sheet-mapping').innerHTML=Object.entries(vaultSheetFields).map(([k,label])=>`<label for="vault-map-${k}">${label}</label><select id="vault-map-${k}"><option value="-1">Bỏ qua cột</option>${parsed.headers.map((h,index)=>`<option value="${index}" ${parsed.mapping[k]===index?'selected':''}>${esc(h)}</option>`).join('')}</select>`).join('');$('#vault-sheet-mapping').querySelectorAll('select').forEach(select=>select.onchange=reset);}catch(error){if($('#vault-sheet-source').value.trim())$('#vault-dialog-error').textContent=error.message;}}
    $('#vault-sheet-source').addEventListener('input',read);$('#vault-import-update').addEventListener('change',reset);$('#vault-import-keep-empty').addEventListener('change',reset);
    $('#vault-sheet-file').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;reset();const version=revision;try{if(file.size>1000000)throw Error('File CSV tối đa 1 MB.');const source=await file.text();if(!live()||!unlocked||!$('#vault-sheet-source')||version!==revision)return;$('#vault-sheet-source').value=source;read();}catch(error){if(live()&&$('#vault-dialog-error'))$('#vault-dialog-error').textContent=error.message;}});
  }
  async function edit(item){
    const data=item?.vault_id?await api('items/'+item.vault_id):{email:item?.email||'',password:'',totp:'',recovery_email:'',label:'',note:''};
    if(item?.family_id&&data.email!==item.email)throw Error('Mail chủ đã thay đổi. Tải lại kho rồi thử lại.');
    const choices=projection('','').rows.filter(row=>!row.vault_id);
    if(!item&&!choices.length){toast('Mọi Family đã có thông tin kho. Chọn Sửa tại Family cần cập nhật.');return;}
    const choice=!item?`<label for="vault-family-choice">Chọn Family</label><select id="vault-family-choice" required><option value="">Chọn Family cần bổ sung thông tin</option>${choices.map(f=>`<option value="${f.family_id}">${esc(f.email)} · Trial ${day(f.trial_date)}</option>`).join('')}</select>`:'';
    let selected=item;
    dialog(item?.vault_id?'Sửa thông tin tài khoản Family':'Nhập thông tin tài khoản Family',choice+field('email','Mail chủ Family','email',data.email,true)+`<p id="vault-edit-trial">${item?.family_id?'Ngày trial: '+day(item.trial_date):''}</p>`+field('password','Mật khẩu tài khoản','password',data.password)+button('form-reveal','Hiện / Ẩn mật khẩu')+field('totp','Khóa bí mật 2FA (nếu có)','password',data.totp)+button('totp-reveal','Hiện / Ẩn khóa 2FA')+'<p>Nhập khóa Base32 hoặc liên kết otpauth://. Kho tự bỏ khoảng trắng; chỉ dùng A–Z và 2–7.</p>'+field('recovery_email','Mail khôi phục (nếu có)','email',data.recovery_email)+`<label for="vault-field-note">Note</label><textarea id="vault-field-note" name="note" maxlength="1000">${esc(data.note||'')}</textarea>`,'Lưu thông tin',async values=>{
      if(!item&&!selected)throw Error('Chọn Family cần bổ sung thông tin.');const linked=selected?.family_id?{expected_family_id:selected.family_id,expected_manager_email:selected.email}:{};
      await api(item?.vault_id?'items/'+item.vault_id:'items',item?.vault_id?'PATCH':'POST',{...values,label:data.label,...linked,...(item?.vault_id?{revision:data.revision,expected_created_at:data.created_at}:{})});toast('Đã lưu thông tin tài khoản Family.');
    });
    $('#vault-field-email').readOnly=!item;
    const select=$('#vault-family-choice');if(select)select.onchange=()=>{selected=choices.find(f=>f.family_id===Number(select.value));$('#vault-field-email').readOnly=!selected;$('#vault-field-email').value=selected?.email||'';$('#vault-edit-trial').textContent=selected?'Ngày trial: '+day(selected.trial_date):'';};
  }
  async function action(event){
    const target=event.target.closest('[data-vault-action]');if(!target||!live())return;const name=target.dataset.vaultAction,id=Number(target.dataset.id),all=projection('',''),item=[...all.rows,...all.unlinked].find(i=>i.id===id);
    try{
      if(name==='lock'){locked();await api('lock','POST',{});return;}
      if(name==='dialog-close'){const current=$('#vault-dialog');current.querySelectorAll('input,textarea').forEach(i=>i.value='');current.close();return;}
      if(name==='form-reveal'||name==='totp-reveal'){const input=$(name==='form-reveal'?'#vault-field-password':'#vault-field-totp');input.type=input.type==='password'?'text':'password';return;}
      if(name==='add'){await edit();return;}
      if(name==='import'){importSheet();return;}
      if(name==='change-password'){dialog('Đổi mật khẩu kho',field('current_password','Mật khẩu kho hiện tại','password','',true)+field('password','Mật khẩu kho mới','password','',true)+field('confirm_password','Nhập lại mật khẩu kho mới','password','',true),'Đổi mật khẩu',async values=>{await api('password','POST',values);toast('Đã đổi mật khẩu kho.');});$('#vault-field-password').minLength=5;$('#vault-field-confirm_password').minLength=5;return;}
      if(!item)return;
      if(name==='family-copy'){await clipboard(item.family_name,'tên Family',id);return;}
      if(name==='trial-copy'){await clipboard(day(item.trial_date),'ngày trial',id);return;}
      if(name==='account-copy'){await clipboard(item.email,'tài khoản',id);return;}
      if(name==='recovery-copy'){await clipboard(item.recovery_email,'mail khôi phục',id);return;}
      if(name==='key-reveal'){if(revealedKeys.has(id))revealedKeys.delete(id);else revealedKeys.add(id);rows();return;}
      if(name==='key-copy'){await clipboard(item.totp_key,'khóa 2FA',id);return;}
      if(name==='note-copy'){await clipboard(item.note,'Note',id);return;}
      if(name==='password-copy'){await clipboardFetch(async()=>{const data=await api('items/'+id);return data.password;},'mật khẩu tài khoản',id);return;}
      if(name==='password-reveal'){if(revealed.has(id))revealed.delete(id);else{const data=await api('items/'+id);revealed.set(id,data.password);}rows();return;}
      if(name==='code-copy'){await clipboardFetch(async()=>{const data=await api('items');offset=data.server_time-Date.now();items=data.items;const latest=items.find(i=>i.id===id);if(!latest?.code||latest.expires_at<=now())throw Error('Mã đang đổi. Chờ mã mới rồi sao chép lại.');rows();return latest.code;},'mã 2FA',id);return;}
      if(name==='edit'){await edit(item);return;}
      if(name==='delete')dialog('Xóa thông tin tài khoản khỏi kho?',`<p>${esc(item.email)}</p><p>Mật khẩu, 2FA và Note sẽ được bỏ khỏi kho. Family và các khách trong nhóm vẫn được giữ. Nhật ký chỉ ghi thao tác, không chứa thông tin bí mật.</p>`,'Xóa tài khoản',async()=>{await api('items/'+id,'DELETE',{revision:item.revision,expected_created_at:item.created_at,...(item.family_id?{expected_family_id:item.family_id,expected_manager_email:item.email}:{})});toast('Đã xóa tài khoản khỏi kho.');});
    }catch(error){if(live()&&unlocked&&$('#vault-error'))$('#vault-error').textContent=error.message;}
  }
  function hidePasswords(){if(!document.hidden)return;revealed.clear();revealedKeys.clear();if(unlocked&&$('#vault-table'))rows();container.querySelectorAll('input[name=password],input[name=totp]').forEach(i=>i.type='password');}
  container.addEventListener('click',action,{signal:controller.signal});document.addEventListener('visibilitychange',hidePasswords);
  container.innerHTML='<section class="card"><p>Đang mở mục kho tài khoản…</p></section>';
  (async()=>{try{const status=await api('status');configured=status.configured;if(status.unlocked)await load();else locked();}catch(error){if(live())container.innerHTML=`<section class="card"><p class="vault-error">${esc(error.message)}</p></section>`;}})();
}
