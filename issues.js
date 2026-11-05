import {randomBytes,createHash} from 'node:crypto';
import {today,trialUsageDays} from './domain.js';
export function initIssues(db,{fail,text,email,log,familyStatus=()=>{},ownerReplaced=()=>null}) {
  const one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  // Display preferences stay separate from business rows and vault metadata.
  db.exec('CREATE TABLE IF NOT EXISTS app_meta(name TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const statuses=['todo','doing','done'];
  function preference(status){try{const value=JSON.parse(one('SELECT value FROM app_meta WHERE name=?','issue_order_'+status)?.value||'[]');return Array.isArray(value)?value.filter(entry=>Array.isArray(entry)&&Number.isSafeInteger(entry[0])&&typeof entry[1]==='string'):[];}catch{return [];}}
  function putPreference(status,entries){run('INSERT INTO app_meta(name,value) VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value','issue_order_'+status,JSON.stringify(entries));}
  function ordered(status){
    const rows=db.prepare('SELECT * FROM issues WHERE status=? ORDER BY created_at DESC,id DESC').all(status),saved=preference(status),positions=new Map(saved.map((entry,index)=>[entry[0]+'\0'+entry[1],index]));
    const unsaved=rows.filter(row=>!positions.has(row.id+'\0'+row.created_at)),custom=rows.filter(row=>positions.has(row.id+'\0'+row.created_at)).sort((a,b)=>positions.get(a.id+'\0'+a.created_at)-positions.get(b.id+'\0'+b.created_at));
    const items=[...unsaved,...custom],token=createHash('sha256').update(JSON.stringify(items.map(row=>[row.id,row.created_at,row.revision]))).digest('hex');
    return {items,token,custom:saved.length>0};
  }
  function forgetOrder(id,created){for(const status of statuses){const saved=preference(status),next=saved.filter(entry=>entry[0]!==id||entry[1]!==created);if(next.length!==saved.length)putPreference(status,next);}}
  function reorder(data){
    if(!statuses.includes(data.status)||!Array.isArray(data.expected)||data.expected.length>1000||typeof data.order_token!=='string'||!/^[a-f0-9]{64}$/.test(data.order_token)||(data.reset!==undefined&&typeof data.reset!=='boolean'))fail('Yêu cầu sắp xếp lỗi không hợp lệ.');
    const current=ordered(data.status),snapshot=data.expected;
    if(snapshot.some(row=>!row||typeof row!=='object'||!Number.isSafeInteger(row.id)||row.id<=0||typeof row.created_at!=='string'||!Number.isInteger(row.revision)||row.revision<0)||new Set(snapshot.map(row=>row.id)).size!==snapshot.length)fail('Danh sách case không hợp lệ.');
    if(data.order_token!==current.token||snapshot.length!==current.items.length||snapshot.some((row,index)=>{const item=current.items[index];return row.id!==item.id||row.created_at!==item.created_at||row.revision!==item.revision;}))fail('Thứ tự hoặc dữ liệu case đã thay đổi. Tải lại rồi sắp xếp lại.',409);
    const ids=data.reset?current.items.map(row=>row.id):data.order;
    if(!Array.isArray(ids)||ids.length!==current.items.length||ids.some(id=>!Number.isSafeInteger(id)||id<=0)||new Set(ids).size!==ids.length||ids.some(id=>!current.items.some(row=>row.id===id)))fail('Thứ tự cần chứa đúng mỗi case trong cột một lần.');
    const byId=new Map(current.items.map(row=>[row.id,row]));putPreference(data.status,data.reset?[]:ids.map(id=>[id,byId.get(id).created_at]));
    log('Cá nhân: '+(data.reset?'đặt lại thứ tự lỗi mới nhất':'sắp xếp case lỗi')+' · '+({todo:'Chờ fix',doing:'Đang fix',done:'Đã fix'})[data.status]);
    return {ok:true,status:data.status,order_token:ordered(data.status).token};
  }
  function requireNoOpenIssue(familyId,exceptId=0){
    const open=one("SELECT subject_email,status FROM issues WHERE family_id=? AND status IN ('todo','doing') AND id!=? ORDER BY id DESC LIMIT 1",familyId,exceptId);
    if(open)fail(`Family này đã báo lỗi mail ${open.subject_email} — ${open.status==='doing'?'đang fix':'chờ fix'}. Mở Fix lỗi để xử lý case hiện có.`,409);
  }
  function target(issue){if(!issue.family_id)return null;const f=one('SELECT * FROM families WHERE id=?',issue.family_id);if(!f||f.archived_at)return null;if(issue.target_type==='manager'){const a=f.manager_id===issue.target_id?one('SELECT * FROM accounts WHERE id=?',issue.target_id):null;return a?.email===issue.subject_email?a:null;}const m=one('SELECT * FROM members WHERE id=?',issue.target_id);return m?.family_id===f.id&&m.email===issue.subject_email ? m:null;}
  function reusePreparedOwner(f,replacement,now){
    const account=one('SELECT * FROM accounts WHERE email=?',replacement);if(!account)return null;
    const donor=one('SELECT * FROM families WHERE manager_id=?',account.id);
    if(!donor||donor.archived_at||donor.id===f.id)fail('Mail mới đã tồn tại; kiểm tra Family đang liên kết trước khi thay thế.',409);
    const vault=one('SELECT * FROM vault_items WHERE family_id=?',donor.id);
    if(!vault||one('SELECT id FROM members WHERE family_id=?',donor.id)||one('SELECT id FROM issues WHERE family_id=?',donor.id)||one('SELECT id FROM archived_customers WHERE family_archive_id=?',donor.id))fail('Mail mới đã thuộc Family khác có dữ liệu hoặc chưa có thông tin Kho. Chưa chuyển thông tin; kiểm tra Family nhận trước.',409);
    const oldVault=one('SELECT * FROM vault_items WHERE family_id=?',f.id),trial=donor.trial_date||today(new Date(now));
    const temp=Number(run('INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)','swap-'+randomBytes(12).toString('hex')+'@family.invalid','',now).lastInsertRowid);
    run('UPDATE families SET manager_id=? WHERE id=?',temp,donor.id);
    run('UPDATE families SET manager_id=?,trial_date=? WHERE id=?',account.id,trial,f.id);
    run('UPDATE families SET manager_id=?,name=?,trial_date=?,archived_at=? WHERE id=?',f.manager_id,f.name+' · Mail cũ',f.trial_date,now,donor.id);
    run('DELETE FROM accounts WHERE id=?',temp);
    run('UPDATE vault_items SET family_id=NULL WHERE family_id IN (?,?)',f.id,donor.id);
    run('UPDATE vault_items SET family_id=?,revision=revision+1,updated_at=? WHERE id=?',f.id,now,vault.id);
    if(oldVault)run('UPDATE vault_items SET family_id=?,revision=revision+1,updated_at=? WHERE id=?',donor.id,now,oldVault.id);
    return {trial,donor:donor.id};
  }
  function save(id,data){
    const old=id?one('SELECT * FROM issues WHERE id=?',id):null;if(id&&!old)fail('Không tìm thấy lỗi.',404);
    if(old&&(!Number.isInteger(data.revision)||data.revision!==old.revision))fail('Lỗi đã thay đổi. Tải lại rồi thử lại.',409);
    if(old&&data.expected_created_at!==undefined&&data.expected_created_at!==old.created_at)fail('Case đã thay đổi. Tải lại rồi thử lại.',409);
    // Most cases are a scanned account, so an empty title means "Bị quét".
    const title=text(data.title??old?.title,200)||'Bị quét';const note=text(data.note??old?.note);const status=data.status??old?.status??'todo';if(!['todo','doing','done'].includes(status))fail('Trạng thái lỗi không hợp lệ.');
    const now=new Date().toISOString();
    if(!old){if(status!=='todo')fail('Lỗi mới bắt đầu ở Chờ fix.');const f=one('SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',Number(data.family_id));if(!f||f.archived_at)fail('Chọn Family đang tồn tại.');requireNoOpenIssue(f.id);const type=data.target_type??'manager';if(!['manager','member'].includes(type))fail('Chọn mail gặp lỗi.');const row=type==='manager'?one('SELECT * FROM accounts WHERE id=?',f.manager_id):one('SELECT * FROM members WHERE id=? AND family_id=?',Number(data.target_id),f.id);if(!row)fail('Mail khách không thuộc Family này.');const result=run('INSERT INTO issues(family_id,family_name,target_type,target_id,subject_email,original_email,title,note,created_at,updated_at,trial_date,reported_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',f.id,f.name,type,row.id,row.email,row.email,title,note,now,now,f.trial_date,today(new Date(now)));log(`Cá nhân: báo lỗi ${row.email}: ${title}`);if(type==='manager')familyStatus(f.id,'reported');return {id:Number(result.lastInsertRowid)};}
    if(old.status==='done'&&status!=='done')requireNoOpenIssue(old.family_id,old.id);
    let subject=old.subject_email,resolution=old.resolution,resolutionEmail=old.resolution_email,resolutionNote=old.resolution_note,done=old.done_at,handover=null;
    if(status==='done'&&old.status!=='done'){
      if(!['keep','replace','move'].includes(data.resolution))fail('Chọn Giữ nguyên mail hoặc Đổi sang mail mới.');const current=target(old);resolution=data.resolution;
      if(resolution==='replace'){
        const replacement=email(data.replacement_email);if(!current||current.email!==(data.expected_email??old.subject_email))fail('Mail trong Family đã thay đổi hoặc bị xóa. Tải lại để kiểm tra; chưa đổi mail.',409);if(replacement===current.email)fail('Mail mới cần khác mail hiện tại.');
        const f=one('SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',old.family_id);
        let newTrial='';
        let reused=false;if(old.target_type==='manager'){const inviteCount=data.invite_count??0;if(!Number.isInteger(inviteCount)||inviteCount<0||inviteCount>5)fail('Chọn từ 0 đến 5 mail mời.');if(one('SELECT id FROM members WHERE family_id=? AND email=?',f.id,replacement))fail('Mail mới trùng khách trong Family.',409);const prepared=reusePreparedOwner(f,replacement,now);if(prepared){reused=true;newTrial=prepared.trial;}else{newTrial=today(new Date(now));run('UPDATE accounts SET email=? WHERE id=?',replacement,current.id);run('UPDATE families SET trial_date=? WHERE id=?',newTrial,f.id);run('DELETE FROM vault_items WHERE family_id=?',f.id);}
          // Same Family, new owner: customers re-join through the new owner's links.
          handover=ownerReplaced(f.id,{since:old.created_at,donorId:prepared?.donor??null,count:inviteCount});}
        else{if(replacement===f.manager_email||one('SELECT id FROM members WHERE family_id=? AND email=? AND id!=?',f.id,replacement,current.id))fail('Mail mới đã có trong Family.',409);run('UPDATE members SET email=?,renewal_revision=renewal_revision+1 WHERE id=?',replacement,current.id);}
        resolutionNote=`Đã đổi từ ${current.email} sang ${replacement}.${newTrial?' Ngày trial mới: '+newTrial.split('-').reverse().join('/')+'. '+(reused?'Đã nhận đầy đủ thông tin Kho của mail mới; mail cũ được giữ trong Family lưu trữ.':'Đã để trống thông tin Kho để nhập lại cho mail mới.'):''}`;subject=replacement;
      }else if(resolution==='move'){
        // Customers were moved to another Family; the broken one keeps its status.
        if(old.target_type!=='manager')fail('Chuyển khách sang Family mới chỉ dùng cho lỗi mail quản lý.');
        const next=one("SELECT * FROM families WHERE id=? AND archived_at=''",Number(data.move_family_id));if(!next||next.id===old.family_id)fail('Chọn Family mới đang hoạt động.');
        subject=current?.email||old.subject_email;resolutionNote=`Đã chuyển khách sang ${next.name}.`;
      }else{subject=current?.email||old.subject_email;resolutionNote=`Giữ nguyên mail ${subject}.`;}
      resolutionEmail=subject;done=now;
    }else if(status!=='done'){resolution='';resolutionEmail='';resolutionNote='';done='';}
    if(status!==old.status)forgetOrder(old.id,old.created_at);
    run('UPDATE issues SET title=?,note=?,status=?,subject_email=?,resolution=?,resolution_email=?,resolution_note=?,done_at=?,updated_at=?,revision=revision+1 WHERE id=?',title,note,status,subject,resolution,resolutionEmail,resolutionNote,done,now,id);
    log(`Cá nhân: lỗi #${id} → ${status}${resolutionNote?' · '+resolutionNote:''}`);
    if(old.target_type==='manager'&&(status==='done')!==(old.status==='done')&&!(status==='done'&&resolution==='move'))familyStatus(old.family_id,status==='done'?'resolved':'reported');
    return handover?{ok:true,waiting_customers:handover.waiting,retired_links:handover.retired,...(handover.invite_mails?{invite_mails:handover.invite_mails}:{})}:{ok:true};
  }
  function remove(id,data){const old=one('SELECT * FROM issues WHERE id=?',id);if(!old)fail('Không tìm thấy case lỗi.',404);if(!Number.isInteger(data.revision)||data.revision!==old.revision||data.expected_created_at!==old.created_at)fail('Case đã thay đổi. Tải lại rồi thử lại.',409);if(old.status!=='done')fail('Chỉ xóa case ở cột Đã fix.');forgetOrder(old.id,old.created_at);run('DELETE FROM issues WHERE id=?',id);log(`Cá nhân: xóa case đã fix ${old.subject_email} #${id}`);return {ok:true};}
  function list(){return statuses.flatMap(status=>{const order=ordered(status);return order.items.map((i,index)=>{const row=target(i);const reported=i.reported_on||(i.created_at?today(new Date(i.created_at)):'');return {...i,reported_on:reported,days_used:trialUsageDays(i.trial_date,reported),target_current_email:row?.email||'',target_available:!!row,sort_position:index,order_token:order.token,order_custom:order.custom};});});}
  return {save,list,remove,reorder};
}
