const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let context,panel,state,busy=false,notice='',poll,finished=false,pendingVersion;
async function request(action,body){
  const response=await fetch('/update.php?action='+action,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Fam-Request':'1'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
  let data;try{data=await response.json();}catch{throw Error('Chưa nhận được kết quả cập nhật. Mở lại mục này để kiểm tra hoặc khôi phục.');}
  if(!response.ok)throw Error(data.error||'Chưa thể thực hiện cập nhật.');return data;
}
function render(){
  const requirements=state?.requirements||[];
  panel.innerHTML=`<div class="dialog-heading"><h2 id="updater-title">Cập nhật một chạm</h2><button class="icon-button" data-update="close" aria-label="Đóng" ${busy?'disabled':''}>×</button></div><p>Phiên bản đang dùng: <strong>${escape(state?.current||'Đang kiểm tra…')}</strong></p><p>Nguồn: bản phát hành GitHub <strong>haitiano1/family</strong>.</p>${state?.latest?`<p>Bản phát hành mới nhất: <strong>${escape(state.latest)}</strong></p>`:''}<p>Tự sao lưu trước khi thay mã. Cấu hình, dữ liệu và kết nối Sheet được giữ lại.</p>${requirements.length?`<div class="notice"><p>Cần hoàn tất trước khi cập nhật:</p><ul>${requirements.map(item=>`<li>${escape(item)}</li>`).join('')}</ul></div>`:''}<p class="update-message" role="status">${escape(notice||state?.message||'')}</p>${state?.notes?`<details><summary>Nội dung bản phát hành</summary><p class="update-release-notes">${escape(state.notes)}</p></details>`:''}<div class="actions">${finished?'<button class="primary" data-update="reload">Tải lại website</button>':state?.available?`<button class="primary" data-update="apply" ${busy||requirements.length?'disabled':''}>${busy?'Đang sao lưu và cập nhật…':'Cập nhật lên '+escape(state.latest)}</button>`:''}<button class="secondary" data-update="check" ${busy?'disabled':''}>${busy?'Đang xử lý…':'Kiểm tra bản mới'}</button></div>${state?.backup_available?'<p><a class="email-link" href="/update.php?action=backup">Tải bản sao dữ liệu trước cập nhật</a></p>':''}`;
}
async function status(){state=await request('status');if(state.busy){notice=state.message;clearTimeout(poll);poll=setTimeout(()=>status().then(render).catch(error=>{notice=error.message;render();}),2500);}else if(pendingVersion&&state.current===pendingVersion){finished=true;notice='Đã cập nhật lên '+state.current+'. Tải lại website để dùng bản mới.';}else if(!busy)notice=state.message||'';}
async function check(){busy=true;notice='Đang kiểm tra bản phát hành…';render();try{state=await request('check',{});notice=state.message||(state.available?'Có bản cập nhật để cài.':'Chưa có bản phát hành mới hơn để cài.');}catch(error){notice=error.message;}finally{busy=false;render();}}
export function startUpdater(ctx){
  if(context)return;context=ctx;panel=document.createElement('dialog');panel.id='updater-dialog';panel.setAttribute('aria-labelledby','updater-title');document.body.append(panel);
  document.addEventListener('click',async event=>{if(!event.target.closest('[data-action="updates-open"]'))return;finished=false;notice='';render();panel.showModal();try{await status();render();if(!state.busy&&!finished)await check();}catch(error){notice=error.message;render();}});
  panel.addEventListener('close',()=>clearTimeout(poll));
  panel.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  panel.addEventListener('click',async event=>{
    const button=event.target.closest('[data-update]');if(!button)return;const action=button.dataset.update;
    if(action==='close'&&!busy){panel.close();return;}if(action==='reload'){location.reload();return;}if(busy)return;
    if(action==='check'){await check();return;}
    if(action==='apply'&&state?.available){
      pendingVersion=state.latest;busy=true;notice='Đang tải gói, sao lưu và cập nhật. Giữ cửa sổ này mở.';render();
      try{const result=await request('apply',{version:state.latest,token:state.token});finished=true;notice=result.message;state={...state,current:result.version,available:false,backup_available:true};context.toast('Đã cập nhật lên '+result.version+'. Tải lại website để dùng bản mới.');}
      catch(error){notice=error.message;try{const errorNotice=notice;await status();if(!finished&&!state.busy)notice=errorNotice+(state.message?' '+state.message:'');}catch{}}
      finally{busy=false;render();}
    }
  });
}
