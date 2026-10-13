export function archiveDue(m) {return m.renewal_status==='declined';}
export function initArchive(db, { fail, log }) {
  function move(m,reason,familyArchiveId=null) {
    const result=db.prepare('INSERT INTO archived_customers(original_member_id,email,customer_name,family_name,manager_email,snapshot,archived_at,reason,family_archive_id) VALUES (?,?,?,?,?,?,?,?,?)').run(m.id,m.email,m.customer_name,m.family_name,m.manager_email,JSON.stringify(m),new Date().toISOString(),reason,familyArchiveId);
    const archiveId=Number(result.lastInsertRowid);
    db.prepare('UPDATE renewal_history SET archive_id=? WHERE member_id=?').run(archiveId,m.id);
    db.prepare('DELETE FROM members WHERE id=?').run(m.id);
    log(`Chuyển khách #${m.id} vào lưu trữ #${archiveId}: ${reason}`);return archiveId;
  }
  function removeMember(id) {
    const m=db.prepare('SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id WHERE m.id=?').get(id);
    if(!m)fail('Không tìm thấy khách.',404);
    return {ok:true,archived:true,archive_id:move(m,'Chọn Xóa hồ sơ khách.')};
  }
  function removeProduct(id,user) {
    const p=db.prepare('SELECT * FROM other_purchases WHERE id=?').get(id);if(!p)fail('Không tìm thấy sản phẩm.',404);
    db.exec('SAVEPOINT archive_product');try{
      const record=db.prepare('INSERT INTO archived_customers(original_member_id,email,customer_name,family_name,manager_email,snapshot,archived_at,reason) VALUES (?,?,?,?,?,?,?,?)').run(p.id,p.email,p.customer_name,'Sản phẩm khác','',JSON.stringify({...p,record_type:'other_product'}),new Date().toISOString(),'Chọn Xóa hồ sơ sản phẩm khác.');
      db.prepare('DELETE FROM other_purchases WHERE id=?').run(id);
      log(`${user.username}: chuyển sản phẩm ${p.product} #${id} vào lưu trữ #${record.lastInsertRowid}; giữ hồ sơ khách và hạn`);
      db.exec('RELEASE archive_product');return {ok:true,archived:true,archive_id:Number(record.lastInsertRowid)};
    }catch(error){db.exec('ROLLBACK TO archive_product; RELEASE archive_product');throw error;}
  }
  function removeFamily(id) {
    const f=db.prepare('SELECT * FROM families WHERE id=?').get(id);if(!f)fail('Không tìm thấy Family.',404);if(f.archived_at)fail('Family đã được lưu trữ.',409);
    db.exec('SAVEPOINT archive_family');try{
      const members=db.prepare('SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id WHERE f.id=?').all(id);
      for(const m of members)move(m,'Chọn Xóa hồ sơ Family.',id);
      db.prepare('UPDATE families SET archived_at=? WHERE id=?').run(new Date().toISOString(),id);
      log(`Lưu trữ Family #${id} và ${members.length} khách; giữ email quản lý và ngày trial.`);
      db.exec('RELEASE archive_family');return {ok:true,archived:true,customers:members.length};
    }catch(error){db.exec('ROLLBACK TO archive_family; RELEASE archive_family');throw error;}
  }
  function familyList(){return db.prepare("SELECT f.*,a.email AS manager_email,(SELECT COUNT(*) FROM archived_customers c WHERE c.family_archive_id=f.id AND c.restored_at IS NULL) AS customers FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at!='' ORDER BY f.archived_at DESC,f.id DESC").all();}
  function restoreFamily(id,user) {
    const f=db.prepare("SELECT * FROM families WHERE id=? AND archived_at!=''").get(id);if(!f)fail('Không tìm thấy Family lưu trữ.',404);
    db.exec('SAVEPOINT archive_family');try{
      db.prepare("UPDATE families SET archived_at='' WHERE id=?").run(id);
      const customers=db.prepare('SELECT id FROM archived_customers WHERE family_archive_id=? AND restored_at IS NULL ORDER BY id').all(id);
      for(const c of customers)restore(c.id,id,user,true);
      log(`Khôi phục Family #${id} và ${customers.length} khách.`);db.exec('RELEASE archive_family');return {ok:true,customers:customers.length};
    }catch(error){db.exec('ROLLBACK TO archive_family; RELEASE archive_family');throw error;}
  }
  function sweep() {
    db.exec('SAVEPOINT archive_save');
    try {
      const members = db.prepare('SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id').all().filter(archiveDue);
      for (const m of members) {
        move(m,'Khách chọn Không gia hạn.');
      }
      db.exec('RELEASE archive_save'); return members.length;
    } catch (error) { db.exec('ROLLBACK TO archive_save; RELEASE archive_save'); throw error; }
  }
  function list() {
    return db.prepare('SELECT * FROM archived_customers WHERE restored_at IS NULL ORDER BY id DESC').all().map(r => {
      const m = JSON.parse(r.snapshot);
      return { id:r.id,email:r.email,customer_name:r.customer_name,family_name:r.family_name,manager_email:r.manager_email,archived_at:r.archived_at,reason:r.reason,record_type:m.record_type||'member',member:m };
    });
  }
  function remove(id,data,user) {
    const row=db.prepare('SELECT * FROM archived_customers WHERE id=?').get(id);
    if(!row)fail('Không tìm thấy khách lưu trữ.',404);
    if(row.restored_at)fail('Khách đã được khôi phục. Tải lại danh sách trước khi xóa.',409);
    if(typeof data.expected_archived_at!=='string'||typeof data.expected_email!=='string')fail('Thiếu thông tin xác nhận hồ sơ cần xóa. Tải lại danh sách.');
    if(data.expected_archived_at!==row.archived_at||data.expected_email!==row.email)fail('Hồ sơ lưu trữ đã thay đổi. Tải lại danh sách trước khi xóa.',409);
    db.exec('SAVEPOINT archive_delete');try{
      db.prepare('UPDATE renewal_history SET archive_id=NULL WHERE archive_id=?').run(id);
      db.prepare('DELETE FROM archived_customers WHERE id=?').run(id);
      log(`${user.username}: xóa khách lưu trữ #${id} (${row.email}); giữ lịch sử gia hạn và nhật ký trước xóa`);
      db.exec('RELEASE archive_delete');return {ok:true};
    }catch(error){db.exec('ROLLBACK TO archive_delete; RELEASE archive_delete');throw error;}
  }
  function restore(id, familyId, user,wholeFamily=false) {
    db.exec('SAVEPOINT archive_save');
    try {
      const row = db.prepare('SELECT * FROM archived_customers WHERE id=?').get(id);
      if (!row) fail('Không tìm thấy khách lưu trữ.',404); if (row.restored_at) fail('Khách đã được khôi phục.',409);
      const m = JSON.parse(row.snapshot);
      if(m.record_type==='other_product'){
        const restoredId=Number(db.prepare('INSERT INTO other_purchases(product,customer_name,email,contact,joined_at,expires_at,payment_status,amount,note,created_at,plan_months) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(m.product,m.customer_name,m.email,m.contact,m.joined_at,m.expires_at,m.payment_status,m.amount,m.note,m.created_at,m.plan_months||0).lastInsertRowid);
        db.prepare('UPDATE archived_customers SET restored_at=?,restored_by=?,restored_member_id=? WHERE id=?').run(new Date().toISOString(),user.username,restoredId,id);
        log(`${user.username}: khôi phục sản phẩm lưu trữ #${id} vào Sản phẩm khác #${restoredId}`);
        db.exec('RELEASE archive_save');return {ok:true,product_id:restoredId};
      }
      const family = db.prepare("SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=? AND f.archived_at=''").get(Number(familyId));
      if (!family) fail('Chọn Family đang tồn tại để khôi phục.');
      if (family.email === m.email) fail('Email khách trùng tài khoản quản lý.');
      if (db.prepare('SELECT id FROM members WHERE family_id=? AND email=?').get(family.id,m.email)) fail('Email khách đã có trong Family này.',409);
      if (!wholeFamily && (m.membership_status || 'unknown') !== 'invited' && db.prepare("SELECT COUNT(*) AS n FROM members WHERE family_id=? AND membership_status!='invited'").get(family.id).n >= 5) fail('Family đã đủ 5 khách.');
      const restoredId = Number(db.prepare("INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note,plan_months,renewal_status,renewal_amount,renewal_paid_at,renewal_note,renewal_revision,declined_at,membership_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(family.id,m.email,m.customer_name,m.contact,m.joined_at,m.expires_at,m.payment_status,m.amount,m.note,m.plan_months,'not_contacted',0,'','',m.renewal_revision+1,'',m.membership_status || 'unknown').lastInsertRowid);
      if(m.renewal_status!=='declined')db.prepare('UPDATE members SET renewal_status=?,renewal_amount=?,renewal_paid_at=?,renewal_note=?,declined_at=? WHERE id=?').run(m.renewal_status,m.renewal_amount,m.renewal_paid_at,m.renewal_note,m.declined_at,restoredId);
      db.prepare("UPDATE issues SET family_id=?,family_name=?,target_id=?,revision=revision+1 WHERE family_id=? AND target_type='member' AND target_id=? AND subject_email=? AND created_at<=?").run(family.id,family.name,restoredId,m.family_id,m.id,m.email,row.archived_at);
      db.prepare('UPDATE archived_customers SET restored_at=?,restored_by=?,restored_member_id=? WHERE id=?').run(new Date().toISOString(),user.username,restoredId,id);
      db.prepare('UPDATE renewal_history SET member_id=? WHERE archive_id=?').run(restoredId,id);
      log(`${user.username}: khôi phục khách lưu trữ #${id} vào Family #${family.id}; giữ hồ sơ và lịch sử`);
      db.exec('RELEASE archive_save'); return { ok:true,member_id:restoredId };
    } catch (error) { db.exec('ROLLBACK TO archive_save; RELEASE archive_save'); throw error; }
  }
  return { sweep,list,restore,remove,removeMember,removeProduct,removeFamily,familyList,restoreFamily,mode:'immediate' };
}
