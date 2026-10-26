<?php
declare(strict_types=1);
function issueTarget(PDO $db,array $i): array|false {
    if(!$i['family_id'])return false;$f=one($db,'SELECT * FROM families WHERE id=?',[$i['family_id']]);if(!$f||$f['archived_at'])return false;
    if($i['target_type']==='manager'){$row=$f['manager_id']===$i['target_id']?one($db,'SELECT * FROM accounts WHERE id=?',[$i['target_id']]):false;return $row&&$row['email']===$i['subject_email']?$row:false;}
    return one($db,'SELECT * FROM members WHERE id=? AND family_id=? AND email=?',[$i['target_id'],$f['id'],$i['subject_email']]);
}
function issueReportDay(array $i): string {if($i['reported_on'])return $i['reported_on'];if(!$i['created_at'])return '';try{return (new DateTimeImmutable($i['created_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Ho_Chi_Minh'))->format('Y-m-d');}catch(Exception $e){return '';}}
function issueOrderPreference(PDO $db,string $status): array {
    $row=one($db,'SELECT value FROM app_meta WHERE name=?',['issue_order_'.$status]);$value=$row?json_decode($row['value'],true):[];
    if(!is_array($value)||!array_is_list($value))return [];
    return array_values(array_filter($value,fn($entry)=>is_array($entry)&&count($entry)===2&&is_int($entry[0]??null)&&is_string($entry[1]??null)));
}
function issueOrderPut(PDO $db,string $status,array $entries): void {q($db,'INSERT INTO app_meta(name,value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)',['issue_order_'.$status,json_encode($entries,JSON_THROW_ON_ERROR)]);}
function issueOrdered(PDO $db,string $status): array {
    $rows=all($db,'SELECT * FROM issues WHERE status=? ORDER BY created_at DESC,id DESC',[$status]);$saved=issueOrderPreference($db,$status);$positions=[];
    foreach($saved as $index=>$entry)$positions[$entry[0]."\0".$entry[1]]=$index;
    $unsaved=[];$custom=[];foreach($rows as $row){if(array_key_exists($row['id']."\0".$row['created_at'],$positions))$custom[]=$row;else $unsaved[]=$row;}
    usort($custom,fn($a,$b)=>$positions[$a['id']."\0".$a['created_at']]<=>$positions[$b['id']."\0".$b['created_at']]);
    $items=[...$unsaved,...$custom];$token=hash('sha256',json_encode(array_map(fn($row)=>[$row['id'],$row['created_at'],$row['revision']],$items),JSON_THROW_ON_ERROR));
    return ['items'=>$items,'token'=>$token,'custom'=>(bool)$saved];
}
function issueOrderForget(PDO $db,int $id,string $created): void {foreach(['todo','doing','done'] as $status){$saved=issueOrderPreference($db,$status);$next=array_values(array_filter($saved,fn($entry)=>$entry[0]!==$id||$entry[1]!==$created));if(count($next)!==count($saved))issueOrderPut($db,$status,$next);}}
function reorderIssues(PDO $db,array $d): array {
    $status=$d['status']??null;$expected=$d['expected']??null;$token=$d['order_token']??null;
    if(!in_array($status,['todo','doing','done'],true)||!is_array($expected)||!array_is_list($expected)||count($expected)>1000||!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token)||(array_key_exists('reset',$d)&&!is_bool($d['reset'])))fail('Yêu cầu sắp xếp lỗi không hợp lệ.');
    $order=issueOrdered($db,$status);$seen=[];
    foreach($expected as $row){if(!is_array($row)||!is_int($row['id']??null)||$row['id']<=0||!is_string($row['created_at']??null)||!is_int($row['revision']??null)||$row['revision']<0||isset($seen[$row['id']]))fail('Danh sách case không hợp lệ.');$seen[$row['id']]=true;}
    if(!hash_equals($order['token'],$token)||count($expected)!==count($order['items']))fail('Thứ tự hoặc dữ liệu case đã thay đổi. Tải lại rồi sắp xếp lại.',409);
    foreach($expected as $index=>$row){$current=$order['items'][$index];if($row['id']!==$current['id']||$row['created_at']!==$current['created_at']||$row['revision']!==$current['revision'])fail('Thứ tự hoặc dữ liệu case đã thay đổi. Tải lại rồi sắp xếp lại.',409);}
    $reset=$d['reset']??false;$ids=$reset?array_column($order['items'],'id'):($d['order']??null);
    if(!is_array($ids)||!array_is_list($ids)||count($ids)!==count($order['items']))fail('Thứ tự cần chứa đúng mỗi case trong cột một lần.');
    $byId=array_column($order['items'],null,'id');$seen=[];$entries=[];
    foreach($ids as $id){if(!is_int($id)||$id<=0||!isset($byId[$id])||isset($seen[$id]))fail('Thứ tự cần chứa đúng mỗi case trong cột một lần.');$seen[$id]=true;$entries[]=[$id,$byId[$id]['created_at']];}
    issueOrderPut($db,$status,$reset?[]:$entries);logEntry($db,'Cá nhân: '.($reset?'đặt lại thứ tự lỗi mới nhất':'sắp xếp case lỗi').' · '.['todo'=>'Chờ fix','doing'=>'Đang fix','done'=>'Đã fix'][$status]);
    return ['ok'=>true,'status'=>$status,'order_token'=>issueOrdered($db,$status)['token']];
}
function issueList(PDO $db): array {
    $result=[];foreach(['todo','doing','done'] as $status){$order=issueOrdered($db,$status);foreach($order['items'] as $index=>$i){$target=issueTarget($db,$i);$reported=issueReportDay($i);$days=$i['trial_date']&&$reported?(int)round((strtotime($reported.' UTC')-strtotime($i['trial_date'].' UTC'))/86400):null;$result[]=[...$i,'reported_on'=>$reported,'days_used'=>$days!==null&&$days>=0?$days:null,'target_current_email'=>$target['email']??'','target_available'=>(bool)$target,'sort_position'=>$index,'order_token'=>$order['token'],'order_custom'=>$order['custom']];}}return $result;
}
function requireNoOpenIssue(PDO $db,?int $familyId,int $exceptId=0): void {
    $open=one($db,"SELECT subject_email,status FROM issues WHERE family_id=? AND status IN ('todo','doing') AND id!=? ORDER BY id DESC LIMIT 1",[$familyId,$exceptId]);
    if($open)fail("Family này đã báo lỗi mail {$open['subject_email']} — ".($open['status']==='doing'?'đang fix':'chờ fix').'. Mở Fix lỗi để xử lý case hiện có.',409);
}
// Reuse a prefilled Sheet account without decrypting or copying its credentials.
function issueReusePreparedOwner(PDO $db,array $family,string $replacement,string $now): ?array {
    $account=one($db,'SELECT * FROM accounts WHERE email=?',[$replacement]);if(!$account)return null;
    $donor=one($db,"SELECT * FROM families WHERE manager_id=?",[$account['id']]);
    if(!$donor||$donor['archived_at']||$donor['id']===$family['id'])fail('Mail mới đã tồn tại; kiểm tra Family đang liên kết trước khi thay thế.',409);
    $vault=one($db,'SELECT * FROM vault_items WHERE family_id=?',[$donor['id']]);
    if(!$vault||one($db,'SELECT id FROM members WHERE family_id=?',[$donor['id']])||one($db,'SELECT id FROM issues WHERE family_id=?',[$donor['id']])||one($db,'SELECT id FROM archived_customers WHERE family_archive_id=?',[$donor['id']]))fail('Mail mới đã thuộc Family khác có dữ liệu hoặc chưa có thông tin Kho. Chưa chuyển thông tin; kiểm tra Family nhận trước.',409);
    // Keep the replaced account and its encrypted vault in an archived Family.
    // A temporary account permits swapping UNIQUE manager links transactionally.
    q($db,'INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)',['swap-'.bin2hex(random_bytes(12)).'@family.invalid','',$now]);$temporary=(int)$db->lastInsertId();
    q($db,'UPDATE families SET manager_id=? WHERE id=?',[$temporary,$donor['id']]);
    q($db,'UPDATE families SET manager_id=?,trial_date=? WHERE id=?',[$account['id'],$donor['trial_date']?:today(),$family['id']]);
    q($db,'UPDATE families SET manager_id=?,name=?,trial_date=?,archived_at=? WHERE id=?',[$family['manager_id'],$family['name'].' · Mail cũ',$family['trial_date'],$now,$donor['id']]);
    q($db,'DELETE FROM accounts WHERE id=?',[$temporary]);
    $oldVault=one($db,'SELECT * FROM vault_items WHERE family_id=?',[$family['id']]);
    q($db,'UPDATE vault_items SET family_id=NULL WHERE family_id IN (?,?)',[$family['id'],$donor['id']]);
    q($db,'UPDATE vault_items SET family_id=?,revision=revision+1,updated_at=? WHERE id=?',[$family['id'],$now,$vault['id']]);
    // Any old A record still has its original encrypted email and stable ID.
    if($oldVault)q($db,'UPDATE vault_items SET family_id=?,revision=revision+1,updated_at=? WHERE id=?',[$donor['id'],$now,$oldVault['id']]);
    return ['trial'=>$donor['trial_date']?:today()];
}
function saveIssue(PDO $db,?int $id,array $d): array {
    $old=$id?one($db,'SELECT * FROM issues WHERE id=?',[$id]):null;if($id&&!$old)fail('Không tìm thấy lỗi.',404);
    if($old&&(!is_int($d['revision']??null)||$d['revision']!==$old['revision']))fail('Lỗi đã thay đổi. Tải lại rồi thử lại.',409);
    if($old&&array_key_exists('expected_created_at',$d)&&$d['expected_created_at']!==$old['created_at'])fail('Case đã thay đổi. Tải lại rồi thử lại.',409);
    $title=text($d['title']??$old['title']??'',200);if(!$title)fail('Nhập nội dung lỗi.');$note=text($d['note']??$old['note']??'');$status=$d['status']??$old['status']??'todo';if(!in_array($status,['todo','doing','done'],true))fail('Trạng thái lỗi không hợp lệ.');$now=stamp();
    if(!$old){
        if($status!=='todo')fail('Lỗi mới bắt đầu ở Chờ fix.');$f=one($db,'SELECT * FROM families WHERE id=?',[(int)($d['family_id']??0)]);if(!$f||$f['archived_at'])fail('Chọn Family đang tồn tại.');requireNoOpenIssue($db,$f['id']);$type=$d['target_type']??'manager';if(!in_array($type,['manager','member'],true))fail('Chọn mail gặp lỗi.');
        $target=$type==='manager'?one($db,'SELECT * FROM accounts WHERE id=?',[$f['manager_id']]):one($db,'SELECT * FROM members WHERE id=? AND family_id=?',[(int)($d['target_id']??0),$f['id']]);if(!$target)fail('Mail khách không thuộc Family này.');
        q($db,'INSERT INTO issues(family_id,family_name,target_type,target_id,subject_email,original_email,title,note,created_at,updated_at,trial_date,reported_on) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',[$f['id'],$f['name'],$type,$target['id'],$target['email'],$target['email'],$title,$note,$now,$now,$f['trial_date'],today()]);$new=(int)$db->lastInsertId();logEntry($db,"Cá nhân: báo lỗi {$target['email']}: $title");return ['id'=>$new];
    }
    if($old['status']==='done'&&$status!=='done')requireNoOpenIssue($db,$old['family_id'],$old['id']);
    $subject=$old['subject_email'];$resolution=$old['resolution'];$resolved=$old['resolution_email'];$resolutionNote=$old['resolution_note'];$done=$old['done_at'];
    if($status==='done'&&$old['status']!=='done'){
        if(!in_array($d['resolution']??'', ['keep','replace'],true))fail('Chọn Giữ nguyên mail hoặc Đổi sang mail mới.');$resolution=$d['resolution'];$target=issueTarget($db,$old);
        if($resolution==='replace'){
            $replacement=email($d['replacement_email']??'');if(!$target||$target['email']!==($d['expected_email']??$old['subject_email']))fail('Mail trong Family đã thay đổi hoặc bị xóa. Tải lại để kiểm tra; chưa đổi mail.',409);if($replacement===$target['email'])fail('Mail mới cần khác mail hiện tại.');
            $f=one($db,'SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',[$old['family_id']]);
            $newTrial='';
            if($old['target_type']==='manager'){if(one($db,'SELECT id FROM members WHERE family_id=? AND email=?',[$f['id'],$replacement]))fail('Mail mới trùng khách trong Family.',409);$reuse=issueReusePreparedOwner($db,$f,$replacement,$now);if($reuse){$newTrial=$reuse['trial'];}else{$newTrial=(new DateTimeImmutable($now))->setTimezone(new DateTimeZone('Asia/Ho_Chi_Minh'))->format('Y-m-d');q($db,'UPDATE accounts SET email=? WHERE id=?',[$replacement,$target['id']]);q($db,'UPDATE families SET trial_date=? WHERE id=?',[$newTrial,$f['id']]);q($db,'DELETE FROM vault_items WHERE family_id=?',[$f['id']]);}}
            else{if($replacement===$f['manager_email']||one($db,'SELECT id FROM members WHERE family_id=? AND email=? AND id!=?',[$f['id'],$replacement,$target['id']]))fail('Mail mới đã có trong Family.',409);q($db,'UPDATE members SET email=?,renewal_revision=renewal_revision+1 WHERE id=?',[$replacement,$target['id']]);}
            $resolutionNote="Đã đổi từ {$target['email']} sang $replacement.".($newTrial?' Ngày trial mới: '.implode('/',array_reverse(explode('-',$newTrial))).'. '.(!empty($reuse)?'Đã nhận đầy đủ thông tin Kho của mail mới; mail cũ được giữ trong Family lưu trữ.':'Đã để trống thông tin Kho để nhập lại cho mail mới.'):'');$subject=$replacement;
        }else{$subject=$target['email']??$old['subject_email'];$resolutionNote="Giữ nguyên mail $subject.";}
        $resolved=$subject;$done=$now;
    }elseif($status!=='done'){$resolution='';$resolved='';$resolutionNote='';$done='';}
    if($status!==$old['status'])issueOrderForget($db,$old['id'],$old['created_at']);
    q($db,'UPDATE issues SET title=?,note=?,status=?,subject_email=?,resolution=?,resolution_email=?,resolution_note=?,done_at=?,updated_at=?,revision=revision+1 WHERE id=?',[$title,$note,$status,$subject,$resolution,$resolved,$resolutionNote,$done,$now,$id]);logEntry($db,"Cá nhân: lỗi #$id → $status".($resolutionNote?' · '.$resolutionNote:''));return ['ok'=>true];
}
function deleteIssue(PDO $db,int $id,array $d): array {
    $old=one($db,'SELECT * FROM issues WHERE id=?',[$id]);if(!$old)fail('Không tìm thấy case lỗi.',404);if(!is_int($d['revision']??null)||$d['revision']!==$old['revision']||($d['expected_created_at']??null)!==$old['created_at'])fail('Case đã thay đổi. Tải lại rồi thử lại.',409);if($old['status']!=='done')fail('Chỉ xóa case ở cột Đã fix.');issueOrderForget($db,$old['id'],$old['created_at']);q($db,'DELETE FROM issues WHERE id=?',[$id]);logEntry($db,"Cá nhân: xóa case đã fix {$old['subject_email']} #$id");return ['ok'=>true];
}
