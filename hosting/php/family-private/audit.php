<?php
declare(strict_types=1);
const TRACKED_TABLES=['accounts','families','members','archived_customers','renewal_history','other_purchases','issues'];
function snapshot(PDO $db): array {return array_combine(TRACKED_TABLES,array_map(fn($t)=>all($db,"SELECT * FROM `$t` ORDER BY id"),TRACKED_TABLES));}
function beginAudit(PDO $db,string $action,string $actor='Cá nhân'): void {
    $db->beginTransaction();$GLOBALS['audit_scope']=['db'=>$db,'action'=>$action,'actor'=>$actor,'before'=>snapshot($db),'messages'=>[]];
}
function finishAudit(bool $success=true): void {
    $s=$GLOBALS['audit_scope']??null;if(!$s)return;unset($GLOBALS['audit_scope']);$db=$s['db'];
    if(!$success){if($db->inTransaction())$db->rollBack();return;}
    try{
        $after=snapshot($db);$changes=[];$identities=[];
        foreach(TRACKED_TABLES as $t){$beforeMap=array_column($s['before'][$t],null,'id');$afterMap=array_column($after[$t],null,'id');foreach(array_unique([...array_keys($beforeMap),...array_keys($afterMap)])as $id){$before=$beforeMap[$id]??null;$next=$afterMap[$id]??null;if($before!=$next){$changes[]=['table'=>$t,'id'=>$id,'before'=>$before,'after'=>$next];foreach([$before,$next]as $row)if($row){foreach(['email','subject_email','original_email','name','family_name']as $f)if(!empty($row[$f]))$identities[]=$row[$f];if($t==='families')foreach([...$s['before']['accounts'],...$after['accounts']]as $account)if($account['id']===$row['manager_id'])$identities[]=$account['email'];}}}}
        if($changes||$s['messages'])q($db,'INSERT INTO audit_events(action,actor,message,details,created_at) VALUES (?,?,?,?,?)',[$s['action'],$s['actor'],implode(' · ',[$s['action'],...array_unique($identities),...$s['messages']]),json_encode(['changes'=>$changes],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),stamp()]);
        $db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
}
function auditAction(string $method,string $route): string {
    $part=explode('/',$route)[2]??'';$label=['families'=>'Family','members'=>'khách','accounts'=>'email quản lý','other-products'=>'sản phẩm','issues'=>'lỗi','restore'=>'dữ liệu','archives'=>'khách lưu trữ','import'=>'CSV'][$part]??'dữ liệu';
    if(preg_match('~^/api/members/\d+/transfer$~D',$route))return 'Chuyển Family';if($part==='archived-families')return $method==='DELETE'?'Xóa Family lưu trữ':'Khôi phục Family';if(str_contains($route,'/renewal'))return 'Gia hạn khách';if($part==='import')return str_ends_with($route,'commit')?'Nhập CSV':'Xem trước CSV';if($part==='restore')return 'Khôi phục dữ liệu';if($part==='archives')return $method==='DELETE'?'Xóa hồ sơ lưu trữ':'Khôi phục hồ sơ lưu trữ';if($part==='other-products'&&$method==='DELETE')return 'Lưu trữ sản phẩm';return (['POST'=>'Thêm','PATCH'=>'Sửa','DELETE'=>'Xóa'][$method]??'Tự động lưu trữ').' '.$label;
}
function journal(PDO $db): array {
    $page=max(1,min(100000,(int)($_GET['page']??1)));$search=strtolower(text($_GET['search']??'',200));$pattern='%'.str_replace(['!','%','_'],['!!','!%','!_'],$search).'%';$category=$_GET['category']??'all';if($category==='')$category='all';
    if(!is_string($category)||!in_array($category,['all','create','edit','delete','renewal','transfer','restore','import','other'],true))fail('Loại thao tác không hợp lệ.');
    // Use the recorded action; legacy messages without an action stay in Other.
    // Category keys are ASCII identifiers. Binary comparison avoids collation
    // conflicts between UNION literals and PDO native bound parameters on MariaDB.
    $union="SELECT id,'audit' AS kind,action,actor,message,created_at,CASE WHEN action LIKE 'Xóa %' OR action LIKE 'Lưu trữ %' OR action LIKE 'Tự động lưu trữ%' THEN 'delete' WHEN action LIKE 'Sửa %' OR action='Đổi mật khẩu kho' THEN 'edit' WHEN action LIKE 'Thêm %' OR action='Tạo mật khẩu kho' THEN 'create' WHEN action LIKE 'Gia hạn %' THEN 'renewal' WHEN action='Chuyển Family' THEN 'transfer' WHEN action LIKE 'Khôi phục %' THEN 'restore' WHEN action LIKE 'Nhập %' OR action LIKE 'Xem trước CSV%' THEN 'import' ELSE 'other' END AS category FROM audit_events UNION ALL SELECT id,'log' AS kind,'Nhật ký cũ' AS action,'Cá nhân' AS actor,message,created_at,'other' AS category FROM logs";$where=" WHERE LOWER(message) LIKE LOWER(?) ESCAPE '!'".($category==='all'?'':' AND CAST(category AS BINARY)=CAST(? AS BINARY)');$values=$category==='all'?[$pattern]:[$pattern,$category];
    $total=one($db,"SELECT COUNT(*) AS n FROM ($union) j$where",$values)['n'];$offset=($page-1)*50;
    return ['entries'=>all($db,"SELECT * FROM ($union) j$where ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $offset",$values),'total'=>$total,'page'=>$page,'page_size'=>50];
}
function journalEntry(PDO $db,string $kind,int $id): array {
    $table=$kind==='audit'?'audit_events':'logs';$row=one($db,"SELECT * FROM `$table` WHERE id=?",[$id]);if(!$row)fail('Không tìm thấy nhật ký.',404);return [...$row,'kind'=>$kind,'changes'=>$kind==='audit'?json_decode($row['details'],true,512,JSON_THROW_ON_ERROR)['changes']:[]];
}
