export function initTransfers(db,{fail,email,log}) {
  const one=(sql,...args)=>db.prepare(sql).get(...args);
  return function transfer(id,data){
    const member=one('SELECT m.*,f.name AS family_name,f.archived_at,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id WHERE m.id=?',id);
    if(!member)fail('Không tìm thấy khách.',404);
    if(!Number.isInteger(data.revision)||!Number.isInteger(data.expected_family_id)||typeof data.expected_email!=='string')fail('Thiếu thông tin khách để chuyển Family.');
    if(member.archived_at||data.revision!==member.renewal_revision||data.expected_family_id!==member.family_id||data.expected_email!==member.email)fail('Hồ sơ khách đã thay đổi. Đóng hộp thoại, tải lại rồi thử lại.',409);
    if(!Number.isSafeInteger(data.family_id)||data.family_id<=0)fail('Chọn Family nhận khách.');
    const family=one('SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',data.family_id);
    if(!family||family.archived_at)fail('Chọn Family đang hoạt động để nhận khách.');
    if(family.email!==email(data.expected_manager_email))fail('Mail chủ Family nhận khách đã thay đổi. Tải lại rồi chọn lại Family.',409);
    if(family.id===member.family_id)fail('Khách đã ở Family này. Chọn Family khác.');
    if(member.email===family.email)fail('Email khách trùng mail chủ Family nhận khách.');
    if(one('SELECT id FROM members WHERE family_id=? AND email=?',family.id,member.email))fail('Email khách đã có trong Family nhận khách.',409);
    db.prepare('UPDATE members SET family_id=?,renewal_revision=renewal_revision+1 WHERE id=?').run(family.id,member.id);
    const removed=Number(db.prepare("DELETE FROM issues WHERE family_id=? AND target_type='member' AND target_id=? AND (subject_email=? OR original_email=?)").run(member.family_id,member.id,member.email,member.email).changes);
    log(`Cá nhân: chuyển khách ${member.email} từ ${member.family_name} (${member.manager_email}) sang ${family.name} (${family.email})${removed?` · xóa ${removed} case lỗi của khách`:""}`);
    return {ok:true,member_id:member.id,family_id:family.id,family_name:family.name,manager_email:family.email,removed_cases:removed};
  };
}
