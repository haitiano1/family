<?php
declare(strict_types=1);
// Shared validators and mutations for HTTP forms and Sheet imports.
function saveFamilyRecord(PDO $db,?int $id,array $d): array {
$name=text($d['name']??'',200);if(!$name)fail('Tên không được để trống.');$service=$d['service']??'youtube';if(!in_array($service,['youtube','google_one','google_ai','other'],true))fail('Dịch vụ không hợp lệ.');$note=text($d['note']??'');
        return transaction($db,function()use($db,$id,$d,$name,$service,$note){
            $old=$id?one($db,'SELECT * FROM families WHERE id=?',[$id]):null;if($id&&(!$old||$old['archived_at']))fail('Không tìm thấy Family đang hoạt động.',404);$trial=calendarDate($d['trial_date']??$old['trial_date']??'');$address=!empty($d['manager_email'])?email($d['manager_email']):null;$manager=$address?one($db,'SELECT * FROM accounts WHERE email=?',[$address]):one($db,'SELECT * FROM accounts WHERE id=?',[(int)($d['manager_id']??0)]);
            if(!$manager&&$address){q($db,'INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)',[$address,'',stamp()]);$manager=['id'=>(int)$db->lastInsertId(),'email'=>$address];}if(!$manager)fail('Nhập email quản lý Family hợp lệ.');
            if($id){if(one($db,'SELECT id FROM members WHERE family_id=? AND email=?',[$id,$manager['email']]))fail('Email quản lý trùng một khách trong nhóm.');q($db,'UPDATE families SET name=?,manager_id=?,service=?,note=?,trial_date=? WHERE id=?',[$name,$manager['id'],$service,$note,$trial,$id]);$oldMail=one($db,'SELECT email FROM accounts WHERE id=?',[$old['manager_id']])['email'];if($oldMail!==$manager['email'])logEntry($db,"Cá nhân: đổi mail Family #$id từ $oldMail sang {$manager['email']}");logEntry($db,"Cá nhân: sửa Family #$id");return ['ok'=>true];}
            q($db,'INSERT INTO families(name,manager_id,service,note,created_at,trial_date) VALUES (?,?,?,?,?,?)',[$name,$manager['id'],$service,$note,stamp(),$trial]);$new=(int)$db->lastInsertId();logEntry($db,"Cá nhân: tạo Family $name");return ['id'=>$new];
        });
}
function saveMemberRecord(PDO $db,?int $id,array $d): array {
$v=memberValues($d);if(!$id&&!$v[4]&&$v[3]&&$v[8])$v[4]=purchaseExpiry($v[3],$v[8]);$old=$id?one($db,'SELECT * FROM members WHERE id=?',[$id]):null;if($id&&!$old)fail('Không tìm thấy khách.',404);
        $family=one($db,'SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',[$old['family_id']??(int)($d['family_id']??0)]);if(!$family||$family['archived_at'])fail('Không tìm thấy Family đang hoạt động.');if($v[0]===$family['email'])fail('Email khách trùng tài khoản quản lý.');
        if($v[9]!=='invited'&&(!$old||$old['membership_status']==='invited')&&one($db,"SELECT COUNT(*) AS n FROM members WHERE family_id=? AND id!=? AND membership_status!='invited'",[$family['id'],$id??0])['n']>=5)fail('Family đã đủ 5 khách.');
        if($id){q($db,'UPDATE members SET email=?,customer_name=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=?,plan_months=?,membership_status=?,renewal_revision=renewal_revision+1 WHERE id=?',[...$v,$id]);recordNewPurchase($db,$id);logEntry($db,"Cá nhân: cập nhật khách #$id");return ['ok'=>true];}
        q($db,'INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note,plan_months,membership_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$family['id'],...$v]);$new=(int)$db->lastInsertId();recordNewPurchase($db,$new);logEntry($db,"Cá nhân: thêm khách {$v[0]}");return ['id'=>$new];
}
