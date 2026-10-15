<?php
declare(strict_types=1);
function issueTarget(PDO $db,array $i): array|false {
    if(!$i['family_id'])return false;$f=one($db,'SELECT * FROM families WHERE id=?',[$i['family_id']]);if(!$f||$f['archived_at'])return false;
    if($i['target_type']==='manager'){$row=$f['manager_id']===$i['target_id']?one($db,'SELECT * FROM accounts WHERE id=?',[$i['target_id']]):false;return $row&&$row['email']===$i['subject_email']?$row:false;}
    return one($db,'SELECT * FROM members WHERE id=? AND family_id=? AND email=?',[$i['target_id'],$f['id'],$i['subject_email']]);
}
function issueReportDay(array $i): string {if($i['reported_on'])return $i['reported_on'];if(!$i['created_at'])return '';try{return (new DateTimeImmutable($i['created_at'],new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Ho_Chi_Minh'))->format('Y-m-d');}catch(Exception $e){return '';}}
function issueList(PDO $db): array {return array_map(function($i)use($db){$target=issueTarget($db,$i);$reported=issueReportDay($i);$days=$i['trial_date']&&$reported?(int)round((strtotime($reported.' UTC')-strtotime($i['trial_date'].' UTC'))/86400):null;return [...$i,'reported_on'=>$reported,'days_used'=>$days!==null&&$days>=0?$days:null,'target_current_email'=>$target['email']??'','target_available'=>(bool)$target];},all($db,'SELECT * FROM issues ORDER BY id DESC'));}
function requireNoOpenIssue(PDO $db,?int $familyId,int $exceptId=0): void {
    $open=one($db,"SELECT subject_email,status FROM issues WHERE family_id=? AND status IN ('todo','doing') AND id!=? ORDER BY id DESC LIMIT 1",[$familyId,$exceptId]);
    if($open)fail("Family này đã báo lỗi mail {$open['subject_email']} — ".($open['status']==='doing'?'đang fix':'chờ fix').'. Mở Fix lỗi để xử lý case hiện có.',409);
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
            if($old['target_type']==='manager'){if(one($db,'SELECT id FROM accounts WHERE email=? AND id!=?',[$replacement,$target['id']])||one($db,'SELECT id FROM members WHERE family_id=? AND email=?',[$f['id'],$replacement]))fail('Mail mới đã tồn tại hoặc trùng khách trong Family.',409);$newTrial=(new DateTimeImmutable($now))->setTimezone(new DateTimeZone('Asia/Ho_Chi_Minh'))->format('Y-m-d');q($db,'UPDATE accounts SET email=? WHERE id=?',[$replacement,$target['id']]);q($db,'UPDATE families SET trial_date=? WHERE id=?',[$newTrial,$f['id']]);}
            else{if($replacement===$f['manager_email']||one($db,'SELECT id FROM members WHERE family_id=? AND email=? AND id!=?',[$f['id'],$replacement,$target['id']]))fail('Mail mới đã có trong Family.',409);q($db,'UPDATE members SET email=?,renewal_revision=renewal_revision+1 WHERE id=?',[$replacement,$target['id']]);}
            $resolutionNote="Đã đổi từ {$target['email']} sang $replacement.".($newTrial?' Ngày trial mới: '.implode('/',array_reverse(explode('-',$newTrial))).'.':'');$subject=$replacement;
        }else{$subject=$target['email']??$old['subject_email'];$resolutionNote="Giữ nguyên mail $subject.";}
        $resolved=$subject;$done=$now;
    }elseif($status!=='done'){$resolution='';$resolved='';$resolutionNote='';$done='';}
    q($db,'UPDATE issues SET title=?,note=?,status=?,subject_email=?,resolution=?,resolution_email=?,resolution_note=?,done_at=?,updated_at=?,revision=revision+1 WHERE id=?',[$title,$note,$status,$subject,$resolution,$resolved,$resolutionNote,$done,$now,$id]);logEntry($db,"Cá nhân: lỗi #$id → $status".($resolutionNote?' · '.$resolutionNote:''));return ['ok'=>true];
}
function deleteIssue(PDO $db,int $id,array $d): array {
    $old=one($db,'SELECT * FROM issues WHERE id=?',[$id]);if(!$old)fail('Không tìm thấy case lỗi.',404);if(!is_int($d['revision']??null)||$d['revision']!==$old['revision']||($d['expected_created_at']??null)!==$old['created_at'])fail('Case đã thay đổi. Tải lại rồi thử lại.',409);if($old['status']!=='done')fail('Chỉ xóa case ở cột Đã fix.');q($db,'DELETE FROM issues WHERE id=?',[$id]);logEntry($db,"Cá nhân: xóa case đã fix {$old['subject_email']} #$id");return ['ok'=>true];
}
