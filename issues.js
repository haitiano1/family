import {today,trialUsageDays} from './domain.js';
export function initIssues(db,{fail,text,email,log}) {
  const one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args);
  function requireNoOpenIssue(familyId,exceptId=0){
    const open=one("SELECT subject_email,status FROM issues WHERE family_id=? AND status IN ('todo','doing') AND id!=? ORDER BY id DESC LIMIT 1",familyId,exceptId);
    if(open)fail(`Family này đã báo lỗi mail ${open.subject_email} — ${open.status==='doing'?'đang fix':'chờ fix'}. Mở Fix lỗi để xử lý case hiện có.`,409);
  }
  function target(issue){if(!issue.family_id)return null;const f=one('SELECT * FROM families WHERE id=?',issue.family_id);if(!f||f.archived_at)return null;if(issue.target_type==='manager'){const a=f.manager_id===issue.target_id?one('SELECT * FROM accounts WHERE id=?',issue.target_id):null;return a?.email===issue.subject_email?a:null;}const m=one('SELECT * FROM members WHERE id=?',issue.target_id);return m?.family_id===f.id&&m.email===issue.subject_email ? m:null;}
  function save(id,data){
    const old=id?one('SELECT * FROM issues WHERE id=?',id):null;if(id&&!old)fail('Không tìm thấy lỗi.',404);
    if(old&&(!Number.isInteger(data.revision)||data.revision!==old.revision))fail('Lỗi đã thay đổi. Tải lại rồi thử lại.',409);
    if(old&&data.expected_created_at!==undefined&&data.expected_created_at!==old.created_at)fail('Case đã thay đổi. Tải lại rồi thử lại.',409);
    const title=text(data.title??old?.title,200);if(!title)fail('Nhập nội dung lỗi.');const note=text(data.note??old?.note);const status=data.status??old?.status??'todo';if(!['todo','doing','done'].includes(status))fail('Trạng thái lỗi không hợp lệ.');
    const now=new Date().toISOString();
    if(!old){if(status!=='todo')fail('Lỗi mới bắt đầu ở Chờ fix.');const f=one('SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',Number(data.family_id));if(!f||f.archived_at)fail('Chọn Family đang tồn tại.');requireNoOpenIssue(f.id);const type=data.target_type??'manager';if(!['manager','member'].includes(type))fail('Chọn mail gặp lỗi.');const row=type==='manager'?one('SELECT * FROM accounts WHERE id=?',f.manager_id):one('SELECT * FROM members WHERE id=? AND family_id=?',Number(data.target_id),f.id);if(!row)fail('Mail khách không thuộc Family này.');const result=run('INSERT INTO issues(family_id,family_name,target_type,target_id,subject_email,original_email,title,note,created_at,updated_at,trial_date,reported_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',f.id,f.name,type,row.id,row.email,row.email,title,note,now,now,f.trial_date,today(new Date(now)));log(`Cá nhân: báo lỗi ${row.email}: ${title}`);return {id:Number(result.lastInsertRowid)};}
    if(old.status==='done'&&status!=='done')requireNoOpenIssue(old.family_id,old.id);
    let subject=old.subject_email,resolution=old.resolution,resolutionEmail=old.resolution_email,resolutionNote=old.resolution_note,done=old.done_at;
    if(status==='done'&&old.status!=='done'){
      if(!['keep','replace'].includes(data.resolution))fail('Chọn Giữ nguyên mail hoặc Đổi sang mail mới.');const current=target(old);resolution=data.resolution;
      if(resolution==='replace'){
        const replacement=email(data.replacement_email);if(!current||current.email!==(data.expected_email??old.subject_email))fail('Mail trong Family đã thay đổi hoặc bị xóa. Tải lại để kiểm tra; chưa đổi mail.',409);if(replacement===current.email)fail('Mail mới cần khác mail hiện tại.');
        const f=one('SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',old.family_id);
        let newTrial='';
        if(old.target_type==='manager'){if(one('SELECT id FROM accounts WHERE email=? AND id!=?',replacement,current.id)||one('SELECT id FROM members WHERE family_id=? AND email=?',f.id,replacement))fail('Mail mới đã tồn tại hoặc trùng khách trong Family.',409);newTrial=today(new Date(now));run('UPDATE accounts SET email=? WHERE id=?',replacement,current.id);run('UPDATE families SET trial_date=? WHERE id=?',newTrial,f.id);}
        else{if(replacement===f.manager_email||one('SELECT id FROM members WHERE family_id=? AND email=? AND id!=?',f.id,replacement,current.id))fail('Mail mới đã có trong Family.',409);run('UPDATE members SET email=?,renewal_revision=renewal_revision+1 WHERE id=?',replacement,current.id);}
        resolutionNote=`Đã đổi từ ${current.email} sang ${replacement}.${newTrial?' Ngày trial mới: '+newTrial.split('-').reverse().join('/')+'.':''}`;subject=replacement;
      }else{subject=current?.email||old.subject_email;resolutionNote=`Giữ nguyên mail ${subject}.`;}
      resolutionEmail=subject;done=now;
    }else if(status!=='done'){resolution='';resolutionEmail='';resolutionNote='';done='';}
    run('UPDATE issues SET title=?,note=?,status=?,subject_email=?,resolution=?,resolution_email=?,resolution_note=?,done_at=?,updated_at=?,revision=revision+1 WHERE id=?',title,note,status,subject,resolution,resolutionEmail,resolutionNote,done,now,id);
    log(`Cá nhân: lỗi #${id} → ${status}${resolutionNote?' · '+resolutionNote:''}`);return {ok:true};
  }
  function remove(id,data){const old=one('SELECT * FROM issues WHERE id=?',id);if(!old)fail('Không tìm thấy case lỗi.',404);if(!Number.isInteger(data.revision)||data.revision!==old.revision||data.expected_created_at!==old.created_at)fail('Case đã thay đổi. Tải lại rồi thử lại.',409);if(old.status!=='done')fail('Chỉ xóa case ở cột Đã fix.');run('DELETE FROM issues WHERE id=?',id);log(`Cá nhân: xóa case đã fix ${old.subject_email} #${id}`);return {ok:true};}
  function list(){return db.prepare('SELECT * FROM issues ORDER BY id DESC').all().map(i=>{const row=target(i);const reported=i.reported_on||(i.created_at?today(new Date(i.created_at)):'');return {...i,reported_on:reported,days_used:trialUsageDays(i.trial_date,reported),target_current_email:row?.email||'',target_available:!!row};});}
  return {save,list,remove};
}
