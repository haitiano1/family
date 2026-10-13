<?php
declare(strict_types=1);
function pendingPayment(array $m): bool {return !in_array($m['renewal_status'],['paid','declined'],true)&&(in_array($m['renewal_status'],['awaiting_payment','partial'],true)||$m['expiry_status']==='expired');}
function recentRenewals(PDO $db,array $members,array $archives,?DateTimeImmutable $now=null,int $days=14): array {
    $now=$now??new DateTimeImmutable('now',new DateTimeZone('UTC'));$now=$now->setTimezone(new DateTimeZone('UTC'));
    $end=$now->format('Y-m-d\TH:i:s.v\Z');$start=$now->modify("-$days days")->format('Y-m-d\TH:i:s.v\Z');
    $live=[];$stored=[];foreach($members as $m)$live[$m['id']]=$m;foreach($archives as $a)$stored[$a['id']]=$a['member'];$seen=[];$rows=[];
    foreach(all($db,'SELECT * FROM renewal_history WHERE created_at>? AND created_at<=? ORDER BY created_at DESC,id DESC',[$start,$end]) as $h){
        $key=$h['member_id']!==null?'member:'.$h['member_id']:($h['archive_id']!==null?'archive:'.$h['archive_id']:'history:'.$h['id']);if(isset($seen[$key]))continue;$seen[$key]=true;
        $customer=$live[$h['member_id']]??$stored[$h['archive_id']]??['email'=>$h['email'],'customer_name'=>$h['customer_name'],'contact'=>'','family_name'=>$h['family_name']];
        $rows[]=[...$h,'customer'=>$customer,'renewed_at'=>$h['created_at']];
    }
    return $rows;
}
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
function archiveMemberRow(PDO $db,array $m,string $reason,?int $familyArchive=null): int {
    q($db,'INSERT INTO archived_customers(original_member_id,email,customer_name,family_name,manager_email,snapshot,archived_at,reason,family_archive_id) VALUES (?,?,?,?,?,?,?,?,?)',[$m['id'],$m['email'],$m['customer_name'],$m['family_name'],$m['manager_email'],json_encode($m,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),stamp(),$reason,$familyArchive]);$archive=(int)$db->lastInsertId();
    q($db,'UPDATE renewal_history SET archive_id=? WHERE member_id=?',[$archive,$m['id']]);q($db,'DELETE FROM members WHERE id=?',[$m['id']]);logEntry($db,"Chuyển khách #{$m['id']} vào lưu trữ #$archive: $reason");return $archive;
}
function archiveMember(PDO $db,int $id): array {
    $m=one($db,'SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id WHERE m.id=?',[$id]);if(!$m)fail('Không tìm thấy khách.',404);
    return ['ok'=>true,'archived'=>true,'archive_id'=>archiveMemberRow($db,$m,'Chọn Xóa hồ sơ khách.')];
}
function archiveProduct(PDO $db,int $id): array {
    return transaction($db,function()use($db,$id){
        $p=one($db,'SELECT * FROM other_purchases WHERE id=?',[$id]);if(!$p)fail('Không tìm thấy sản phẩm.',404);
        q($db,'INSERT INTO archived_customers(original_member_id,email,customer_name,family_name,manager_email,snapshot,archived_at,reason) VALUES (?,?,?,?,?,?,?,?)',[$p['id'],$p['email'],$p['customer_name'],'Sản phẩm khác','',json_encode([...$p,'record_type'=>'other_product'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),stamp(),'Chọn Xóa hồ sơ sản phẩm khác.']);$archive=(int)$db->lastInsertId();
        q($db,'DELETE FROM other_purchases WHERE id=?',[$id]);logEntry($db,"Cá nhân: chuyển sản phẩm {$p['product']} #$id vào lưu trữ #$archive; giữ hồ sơ khách và hạn");return ['ok'=>true,'archived'=>true,'archive_id'=>$archive];
    });
}
function archiveFamily(PDO $db,int $id): array {
    return transaction($db,function()use($db,$id){
        $f=one($db,'SELECT * FROM families WHERE id=?',[$id]);if(!$f)fail('Không tìm thấy Family.',404);if($f['archived_at'])fail('Family đã được lưu trữ.',409);
        $members=all($db,'SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',[$id]);foreach($members as $m)archiveMemberRow($db,$m,'Chọn Xóa hồ sơ Family.',$id);
        q($db,'UPDATE families SET archived_at=? WHERE id=?',[stamp(),$id]);logEntry($db,"Lưu trữ Family #$id và ".count($members).' khách; giữ email quản lý và ngày trial.');return ['ok'=>true,'archived'=>true,'customers'=>count($members)];
    });
}
function archivedFamilies(PDO $db): array {return all($db,"SELECT f.*,a.email AS manager_email,(SELECT COUNT(*) FROM archived_customers c WHERE c.family_archive_id=f.id AND c.restored_at IS NULL) AS customers FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at!='' ORDER BY f.archived_at DESC,f.id DESC");}
function restoreFamily(PDO $db,int $id): array {
    return transaction($db,function()use($db,$id){
        if(!one($db,"SELECT id FROM families WHERE id=? AND archived_at!=''",[$id]))fail('Không tìm thấy Family lưu trữ.',404);
        q($db,"UPDATE families SET archived_at='' WHERE id=?",[$id]);$customers=all($db,'SELECT id FROM archived_customers WHERE family_archive_id=? AND restored_at IS NULL ORDER BY id',[$id]);foreach($customers as $c)restoreArchive($db,$c['id'],['family_id'=>$id],true);
        logEntry($db,"Khôi phục Family #$id và ".count($customers).' khách.');return ['ok'=>true,'customers'=>count($customers)];
    });
}
function sweep(PDO $db): void {
    transaction($db,function()use($db){foreach(all($db,"SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id WHERE m.renewal_status='declined'") as $m)archiveMemberRow($db,$m,'Khách chọn Không gia hạn.');});
}
function archives(PDO $db): array {
    return array_map(function($r){$m=json_decode($r['snapshot'],true,512,JSON_THROW_ON_ERROR);return ['id'=>$r['id'],'email'=>$r['email'],'customer_name'=>$r['customer_name'],'family_name'=>$r['family_name'],'manager_email'=>$r['manager_email'],'archived_at'=>$r['archived_at'],'reason'=>$r['reason'],'record_type'=>$m['record_type']??'member','member'=>$m];},all($db,'SELECT * FROM archived_customers WHERE restored_at IS NULL ORDER BY id DESC'));
}
function deleteArchive(PDO $db,int $id,array $d): array {
    return transaction($db,function()use($db,$id,$d){
        $r=one($db,'SELECT * FROM archived_customers WHERE id=?',[$id]);if(!$r)fail('Không tìm thấy khách lưu trữ.',404);
        if($r['restored_at'])fail('Khách đã được khôi phục. Tải lại danh sách trước khi xóa.',409);
        if(!is_string($d['expected_archived_at']??null)||!is_string($d['expected_email']??null))fail('Thiếu thông tin xác nhận hồ sơ cần xóa. Tải lại danh sách.');
        if($d['expected_archived_at']!==$r['archived_at']||$d['expected_email']!==$r['email'])fail('Hồ sơ lưu trữ đã thay đổi. Tải lại danh sách trước khi xóa.',409);
        q($db,'UPDATE renewal_history SET archive_id=NULL WHERE archive_id=?',[$id]);q($db,'DELETE FROM archived_customers WHERE id=?',[$id]);
        logEntry($db,"Cá nhân: xóa khách lưu trữ #$id ({$r['email']}); giữ lịch sử gia hạn và nhật ký trước xóa");return ['ok'=>true];
    });
}
function restoreArchive(PDO $db,int $id,array $d,bool $wholeFamily=false): array {
    return transaction($db,function()use($db,$id,$d,$wholeFamily){
        $r=one($db,'SELECT * FROM archived_customers WHERE id=?',[$id]);if (!$r) fail('Không tìm thấy khách lưu trữ.',404);if ($r['restored_at']) fail('Khách đã được khôi phục.',409);
        $m=json_decode($r['snapshot'],true,512,JSON_THROW_ON_ERROR);
        if(($m['record_type']??'member')==='other_product'){
            q($db,'INSERT INTO other_purchases(product,customer_name,email,contact,joined_at,expires_at,payment_status,amount,note,created_at,plan_months) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$m['product'],$m['customer_name'],$m['email'],$m['contact'],$m['joined_at'],$m['expires_at'],$m['payment_status'],$m['amount'],$m['note'],$m['created_at'],$m['plan_months']??0]);$new=(int)$db->lastInsertId();
            q($db,'UPDATE archived_customers SET restored_at=?,restored_by=?,restored_member_id=? WHERE id=?',[stamp(),'Cá nhân',$new,$id]);logEntry($db,"Cá nhân: khôi phục sản phẩm lưu trữ #$id vào Sản phẩm khác #$new");return ['ok'=>true,'product_id'=>$new];
        }
        $family=one($db,'SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',[(int)($d['family_id']??0)]);if (!$family || $family['archived_at']) fail('Chọn Family đang tồn tại để khôi phục.');
        if ($family['email']===$m['email']) fail('Email khách trùng tài khoản quản lý.');if (one($db,'SELECT id FROM members WHERE family_id=? AND email=?',[$family['id'],$m['email']])) fail('Email khách đã có trong Family này.',409);
        if (!$wholeFamily && ($m['membership_status']??'unknown')!=='invited' && one($db,"SELECT COUNT(*) AS n FROM members WHERE family_id=? AND membership_status!='invited'",[$family['id']])['n']>=5) fail('Family đã đủ 5 khách.');
        q($db,"INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note,plan_months,membership_status,renewal_revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",[$family['id'],...memberValues($m),$m['renewal_revision']+1]);$new=(int)$db->lastInsertId();
        if($m['renewal_status']!=='declined')q($db,'UPDATE members SET renewal_status=?,renewal_amount=?,renewal_paid_at=?,renewal_note=?,declined_at=? WHERE id=?',[$m['renewal_status'],$m['renewal_amount'],$m['renewal_paid_at'],$m['renewal_note'],$m['declined_at'],$new]);
        q($db,"UPDATE issues SET family_id=?,family_name=?,target_id=?,revision=revision+1 WHERE family_id=? AND target_type='member' AND target_id=? AND subject_email=? AND created_at<=?",[$family['id'],$family['name'],$new,$m['family_id'],$m['id'],$m['email'],$r['archived_at']]);
        q($db,'UPDATE archived_customers SET restored_at=?,restored_by=?,restored_member_id=? WHERE id=?',[stamp(),'Cá nhân',$new,$id]);q($db,'UPDATE renewal_history SET member_id=? WHERE archive_id=?',[$new,$id]);logEntry($db,"Cá nhân: khôi phục khách lưu trữ #$id vào Family #{$family['id']}");return ['ok'=>true,'member_id'=>$new];
    });
}
const BASE_BACKUP_TABLES=['accounts','families','members','archived_customers','renewal_history','other_purchases','logs'];
const BACKUP_TABLES=[...BASE_BACKUP_TABLES,'issues','audit_events'];
function backup(PDO $db): array {return ['format'=>'family-customer-backup','version'=>5,'created_at'=>stamp(),'tables'=>array_combine(BACKUP_TABLES,array_map(fn($t)=>all($db,"SELECT * FROM `$t` ORDER BY id"),BACKUP_TABLES))];}
function restoreBackup(PDO $db,array $d): array {
    if (($d['format']??'')!=='family-customer-backup' || !in_array($d['version']??null,[1,2,3,4,5],true) || !is_array($d['tables']??null)) fail('File sao lưu khách hàng không hợp lệ.');
    if($d['version']===1){$d['tables']['issues']=$d['tables']['issues']??[];$d['tables']['audit_events']=$d['tables']['audit_events']??[];}
    foreach(BACKUP_TABLES as $t) {if (!is_array($d['tables'][$t]??null) || !array_is_list($d['tables'][$t])) fail('File sao lưu thiếu bảng dữ liệu.');if (!in_array($t,['logs','audit_events'],true) && one($db,"SELECT COUNT(*) AS n FROM `$t`")['n']) fail('Chỉ khôi phục vào ứng dụng đang trống để không ghi đè dữ liệu hiện có.',409);}
    try {return transaction($db,function()use($db,$d){

        foreach(BACKUP_TABLES as $t) {
            $columns=array_column(all($db,"SHOW COLUMNS FROM `$t`"),'Field');if(in_array($t,['logs','audit_events'],true)&&one($db,"SELECT COUNT(*) AS n FROM `$t`")['n'])$columns=array_values(array_filter($columns,fn($c)=>$c!=='id'));$sql="INSERT INTO `$t` (`".implode('`,`',$columns).'`) VALUES ('.implode(',',array_fill(0,count($columns),'?')).')';
            foreach($d['tables'][$t] as $row) {
                if (!is_array($row)) fail('Dữ liệu sao lưu sai định dạng.');
                if($d['version']<3)$row=[...($t==='families'?['trial_date'=>'']:($t==='issues'?['trial_date'=>'','reported_on'=>'']:[])),...$row];
                if($d['version']<4)$row=[...($t==='families'?['archived_at'=>'']:($t==='other_purchases'?['plan_months'=>0]:($t==='archived_customers'?['family_archive_id'=>null]:[]))),...$row];
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
    $plan=integer($d['plan_months']??0,0,120,'Gói mua cần từ 1 đến 120 tháng hoặc để chưa đặt.');$joined=calendarDate($d['joined_at']??'');$expires=calendarDate($d['expires_at']??'');if(!$id&&!$expires&&$joined&&$plan)$expires=purchaseExpiry($joined,$plan);if ($joined && $expires && $expires<$joined) fail('Ngày hết hạn phải từ ngày mua trở đi.');$payment=$d['payment_status']??'unknown';if (!in_array($payment,['unknown','unpaid','partial','paid'],true)) fail('Trạng thái thanh toán không hợp lệ.');
    $v=[$product,$name,$address,text($d['contact']??''),$joined,$expires,$payment,integer($d['amount']??0,0,1000000000,'Số tiền từ 0 đến 1 tỷ VND.'),text($d['note']??''),$plan];
    if ($id) {if (!one($db,'SELECT id FROM other_purchases WHERE id=?',[$id])) fail('Không tìm thấy sản phẩm đã bán.',404);q($db,'UPDATE other_purchases SET product=?,customer_name=?,email=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=?,plan_months=? WHERE id=?',[...$v,$id]);logEntry($db,"Cá nhân: cập nhật sản phẩm khác #$id");return ['ok'=>true];}
    q($db,'INSERT INTO other_purchases(product,customer_name,email,contact,joined_at,expires_at,payment_status,amount,note,plan_months,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[...$v,stamp()]);$new=(int)$db->lastInsertId();logEntry($db,"Cá nhân: ghi nhận bán sản phẩm $product");return ['id'=>$new];
}
