<?php
declare(strict_types=1);
function pendingPayment(array $m): bool {return !in_array($m['renewal_status'],['paid','declined'],true)&&(in_array($m['renewal_status'],['awaiting_payment','partial'],true)||$m['expiry_status']==='expired');}
function renew(PDO $db,int $id,array $d,bool $apply): array {
    return transaction($db,function()use($db,$id,$d,$apply){
        $m=one($db,'SELECT m.*,f.name AS family_name FROM members m JOIN families f ON f.id=m.family_id WHERE m.id=?',[$id]);if (!$m) fail('Không tìm thấy khách.',404);
        if (!is_int($d['revision']??null) || $d['revision']!==$m['renewal_revision']) fail('Thông tin gia hạn đã thay đổi. Đóng hộp thoại, tải lại trang rồi thử lại.',409);
        if (isset($d['apply_now']) && !is_bool($d['apply_now'])) fail('Tùy chọn cập nhật hạn không hợp lệ.');
        $p=['status'=>$m['renewal_status'],'amount'=>$m['renewal_amount'],'paid_at'=>$m['renewal_paid_at'],'note'=>$m['renewal_note']];
        if (!$apply) {
            if (!in_array($d['status']??'', ['not_contacted','reminded','awaiting_payment','partial','paid','declined'],true)) fail('Trạng thái gia hạn không hợp lệ.');
            $p=['status'=>$d['status'],'amount'=>integer($d['amount']??0,0,1000000000,'Số tiền gia hạn từ 0 đến 1 tỷ VND.'),'paid_at'=>calendarDate($d['paid_at']??''),'note'=>text($d['note']??'')];
            if (in_array($p['status'],['paid','partial'],true) && (!$p['paid_at'] || !$p['amount'])) fail('Cần số tiền đã nhận lớn hơn 0 và ngày nhận tiền.');
            if ($p['paid_at'] && $p['paid_at']>today()) fail('Ngày đã nhận tiền không được ở tương lai.');
        }
        if ($apply || ($d['apply_now']??false)) {
            if ($p['status']!=='paid') fail('Cần ghi nhận đã thanh toán đủ tiền gia hạn trước.');
            $plan=integer($d['plan_months']??0,1,120,'Chọn gói gia hạn từ 1 đến 120 tháng.');
            if (!$m['expires_at']) fail('Khách chưa có ngày hết hạn. Bổ sung hạn hiện tại trước khi gia hạn.');
            $base=calendarDate($m['expires_at']);calendarDate($p['paid_at']);
            $target=(new DateTimeImmutable(substr($base,0,7).'-01',new DateTimeZone('UTC')))->modify("+$plan months");
            $end=$target->format('Y-m-').str_pad((string)min((int)substr($base,8,2),(int)$target->format('t')),2,'0',STR_PAD_LEFT);calendarDate($end);
            if ($m['joined_at'] && $base<$m['joined_at']) fail('Ngày mua mới không được trước ngày mua hiện tại.');
            if (!empty($d['expires_at']) && calendarDate($d['expires_at'])!==$end) fail('Ngày hết hạn tự tính đã thay đổi. Hãy tải lại hộp thoại.');
            q($db,'INSERT INTO renewal_history(member_id,email,customer_name,family_name,old_expires_at,new_expires_at,plan_months,amount,paid_at,note,created_at,created_by,old_purchase_at,new_purchase_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[$id,$m['email'],$m['customer_name'],$m['family_name'],$base,$end,$plan,$p['amount'],$p['paid_at'],$p['note'],stamp(),'Cá nhân',$m['joined_at'],$base]);$history=(int)$db->lastInsertId();
            q($db,"UPDATE members SET joined_at=?,expires_at=?,plan_months=?,payment_status='paid',amount=?,renewal_status='not_contacted',renewal_amount=0,renewal_paid_at='',renewal_note='',declined_at='',renewal_revision=renewal_revision+1 WHERE id=?",[$base,$end,$plan,$p['amount'],$id]);
            logEntry($db,"Cá nhân: gia hạn khách #$id, kỳ $base → $end");return ['ok'=>true,'applied'=>true,'history_id'=>$history,'purchase_date'=>$base,'base_date'=>$base,'expires_at'=>$end];
        }
        q($db,'UPDATE members SET renewal_status=?,renewal_amount=?,renewal_paid_at=?,renewal_note=?,declined_at=?,renewal_revision=renewal_revision+1 WHERE id=?',[$p['status'],$p['amount'],$p['paid_at'],$p['note'],$p['status']==='declined'?($m['declined_at']?:stamp()):'',$id]);
        logEntry($db,"Cá nhân: cập nhật gia hạn khách #$id: {$p['status']}");if($p['status']==='declined'){sweep($db);$record=one($db,'SELECT id FROM archived_customers WHERE original_member_id=? AND restored_at IS NULL ORDER BY id DESC LIMIT 1',[$id]);return ['ok'=>true,'applied'=>false,'archived'=>true,'archive_id'=>$record['id']];}return ['ok'=>true,'applied'=>false];
    });
}
function sweep(PDO $db): void {
    transaction($db,function()use($db){
        foreach(all($db,"SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id WHERE m.renewal_status='declined'") as $m) {
            q($db,'INSERT INTO archived_customers(original_member_id,email,customer_name,family_name,manager_email,snapshot,archived_at,reason) VALUES (?,?,?,?,?,?,?,?)',[$m['id'],$m['email'],$m['customer_name'],$m['family_name'],$m['manager_email'],json_encode($m,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),stamp(),'Khách chọn Không gia hạn.']);$archive=(int)$db->lastInsertId();
            q($db,'UPDATE renewal_history SET archive_id=? WHERE member_id=?',[$archive,$m['id']]);q($db,'DELETE FROM members WHERE id=?',[$m['id']]);logEntry($db,"Hệ thống: chuyển khách #{$m['id']} vào lưu trữ #$archive");
        }
    });
}
function archives(PDO $db): array {
    return array_map(fn($r)=>['id'=>$r['id'],'email'=>$r['email'],'customer_name'=>$r['customer_name'],'family_name'=>$r['family_name'],'manager_email'=>$r['manager_email'],'archived_at'=>$r['archived_at'],'reason'=>$r['reason'],'member'=>json_decode($r['snapshot'],true,512,JSON_THROW_ON_ERROR)],all($db,'SELECT * FROM archived_customers WHERE restored_at IS NULL ORDER BY id DESC'));
}
function restoreArchive(PDO $db,int $id,array $d): array {
    return transaction($db,function()use($db,$id,$d){
        $r=one($db,'SELECT * FROM archived_customers WHERE id=?',[$id]);if (!$r) fail('Không tìm thấy khách lưu trữ.',404);if ($r['restored_at']) fail('Khách đã được khôi phục.',409);
        $m=json_decode($r['snapshot'],true,512,JSON_THROW_ON_ERROR);$family=one($db,'SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',[(int)($d['family_id']??0)]);if (!$family) fail('Chọn Family đang tồn tại để khôi phục.');
        if ($family['email']===$m['email']) fail('Email khách trùng tài khoản quản lý.');if (one($db,'SELECT id FROM members WHERE family_id=? AND email=?',[$family['id'],$m['email']])) fail('Email khách đã có trong Family này.',409);
        if (($m['membership_status']??'unknown')!=='invited' && one($db,"SELECT COUNT(*) AS n FROM members WHERE family_id=? AND membership_status!='invited'",[$family['id']])['n']>=5) fail('Family đã đủ 5 khách.');
        q($db,"INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note,plan_months,membership_status,renewal_revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",[$family['id'],...memberValues($m),$m['renewal_revision']+1]);$new=(int)$db->lastInsertId();
        q($db,'UPDATE archived_customers SET restored_at=?,restored_by=?,restored_member_id=? WHERE id=?',[stamp(),'Cá nhân',$new,$id]);q($db,'UPDATE renewal_history SET member_id=? WHERE archive_id=?',[$new,$id]);logEntry($db,"Cá nhân: khôi phục khách lưu trữ #$id vào Family #{$family['id']}");return ['ok'=>true,'member_id'=>$new];
    });
}
const BASE_BACKUP_TABLES=['accounts','families','members','archived_customers','renewal_history','other_purchases','logs'];
const BACKUP_TABLES=[...BASE_BACKUP_TABLES,'issues','audit_events'];
function backup(PDO $db): array {return ['format'=>'family-customer-backup','version'=>3,'created_at'=>stamp(),'tables'=>array_combine(BACKUP_TABLES,array_map(fn($t)=>all($db,"SELECT * FROM `$t` ORDER BY id"),BACKUP_TABLES))];}
function restoreBackup(PDO $db,array $d): array {
    if (($d['format']??'')!=='family-customer-backup' || !in_array($d['version']??null,[1,2,3],true) || !is_array($d['tables']??null)) fail('File sao lưu khách hàng không hợp lệ.');
    if($d['version']===1){$d['tables']['issues']=$d['tables']['issues']??[];$d['tables']['audit_events']=$d['tables']['audit_events']??[];}
    foreach(BACKUP_TABLES as $t) {if (!is_array($d['tables'][$t]??null) || !array_is_list($d['tables'][$t])) fail('File sao lưu thiếu bảng dữ liệu.');if (!in_array($t,['logs','audit_events'],true) && one($db,"SELECT COUNT(*) AS n FROM `$t`")['n']) fail('Chỉ khôi phục vào ứng dụng đang trống để không ghi đè dữ liệu hiện có.',409);}
    try {return transaction($db,function()use($db,$d){

        foreach(BACKUP_TABLES as $t) {
            $columns=array_column(all($db,"SHOW COLUMNS FROM `$t`"),'Field');if(in_array($t,['logs','audit_events'],true)&&one($db,"SELECT COUNT(*) AS n FROM `$t`")['n'])$columns=array_values(array_filter($columns,fn($c)=>$c!=='id'));$sql="INSERT INTO `$t` (`".implode('`,`',$columns).'`) VALUES ('.implode(',',array_fill(0,count($columns),'?')).')';
            foreach($d['tables'][$t] as $row) {
                if (!is_array($row)) fail('Dữ liệu sao lưu sai định dạng.');
                if($d['version']<3)$row=[...($t==='families'?['trial_date'=>'']:($t==='issues'?['trial_date'=>'','reported_on'=>'']:[])),...$row];
                foreach($columns as $c) if (!array_key_exists($c,$row) || (!is_null($row[$c]) && !is_string($row[$c]) && !is_int($row[$c]) && !is_float($row[$c]))) fail('Dữ liệu sao lưu thiếu trường hoặc sai định dạng.');
                if ($t==='archived_customers') {json_decode($row['snapshot'],true,512,JSON_THROW_ON_ERROR);}
                q($db,$sql,array_map(fn($c)=>$row[$c],$columns));
            }
        }
        return ['ok'=>true,'customers'=>count($d['tables']['members']),'families'=>count($d['tables']['families']),'other_products'=>count($d['tables']['other_purchases'])];
    });}catch(FamilyError $e){throw $e;}catch(Throwable $e){fail('Không thể khôi phục file này. Dữ liệu hiện có được giữ nguyên.');}
}
function saveProduct(PDO $db,?int $id,array $d): array {
    $product=text($d['product']??'',100);if (!$product) fail('Nhập tên sản phẩm.');$name=text($d['customer_name']??'',200);$address=!empty($d['email'])?email($d['email']):'';if (!$name && !$address) fail('Nhập tên khách hoặc email khách.');
    $joined=calendarDate($d['joined_at']??'');$expires=calendarDate($d['expires_at']??'');if ($joined && $expires && $expires<$joined) fail('Ngày hết hạn phải từ ngày mua trở đi.');$payment=$d['payment_status']??'unknown';if (!in_array($payment,['unknown','unpaid','partial','paid'],true)) fail('Trạng thái thanh toán không hợp lệ.');
    $v=[$product,$name,$address,text($d['contact']??''),$joined,$expires,$payment,integer($d['amount']??0,0,1000000000,'Số tiền từ 0 đến 1 tỷ VND.'),text($d['note']??'')];
    if ($id) {if (!one($db,'SELECT id FROM other_purchases WHERE id=?',[$id])) fail('Không tìm thấy sản phẩm đã bán.',404);q($db,'UPDATE other_purchases SET product=?,customer_name=?,email=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=? WHERE id=?',[...$v,$id]);logEntry($db,"Cá nhân: cập nhật sản phẩm khác #$id");return ['ok'=>true];}
    q($db,'INSERT INTO other_purchases(product,customer_name,email,contact,joined_at,expires_at,payment_status,amount,note,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',[...$v,stamp()]);$new=(int)$db->lastInsertId();logEntry($db,"Cá nhân: ghi nhận bán sản phẩm $product");return ['id'=>$new];
}
