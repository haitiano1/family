<?php
declare(strict_types=1);
// Tra cứu & chuyển nhóm: Family status for customers, invite link pools, bulk moves
// with one invite per customer, and the public lookup page (Gmail + personal code).
// Mirrors lookup.js of the Node build; tables come from lookup.sql via ensureLookupSchema().
const LOOKUP_FAMILY_STATUSES=['active','checking','scanned','disabled'];
const LOOKUP_PROBLEM_STATUSES=['checking','scanned','disabled'];
const LOOKUP_OPEN_STATES=['assigned','opened','failed'];
const LOOKUP_REPORT_REASONS=['twelve_months','invite_used','other_family','other'];
const LOOKUP_BACKUP_TABLES=['family_statuses','family_invites','member_moves','lookup_codes','lookup_settings','invite_mails'];
// Gen mail mời: random tag after "+" on the shop's Gmail, e.g. haihoangrr+k7p2qx@gmail.com.
const LOOKUP_INVITE_MAIL_ALPHABET='abcdefghjkmnpqrstuvwxyz23456789';
const LOOKUP_INVITE_MAIL_MAX=5;
// The shop Gmail that receives every invitation (the Apps Script mailbox).
const LOOKUP_INVITE_MAIL_INBOX='haihoangrr@gmail.com';
const LOOKUP_CODE_ALPHABET='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LOOKUP_SETTING_NAMES=['shop_name','contact_url','contact_label','help_text'];
const LOOKUP_WINDOW_MS=900000,LOOKUP_EMAIL_LIMIT=8,LOOKUP_IP_LIMIT=40,LOOKUP_SESSION_MS=3600000,LOOKUP_MOVE_LIMIT=50;
const LOOKUP_STATUS_LABELS=['active'=>'Đang hoạt động','checking'=>'Đang kiểm tra','scanned'=>'Bị quét','disabled'=>'Bị vô hiệu hoá'];

function lookupNow(): string {return stamp();}
function lookupMs(): int {return (int)floor(microtime(true)*1000);}
function lookupInviteExpiry(string $sent): string {
    if(!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$sent,$p)||!checkdate((int)$p[2],(int)$p[3],(int)$p[1]))return '';
    return (new DateTimeImmutable($sent,new DateTimeZone('UTC')))->modify('+14 days')->format('Y-m-d');
}
// An invite is "used" once a customer joined with it, "assigned" while an open move still holds it
// for a customer who is in the target Family, otherwise it is ready to give out.
function lookupInviteHolder(array $refs): array {
    $joined=null;$open=null;
    foreach($refs as $r){if($r['state']==='joined')$joined=$r;elseif(in_array($r['state'],LOOKUP_OPEN_STATES,true)&&$r['member_family_id']!==null&&(int)$r['member_family_id']===(int)$r['to_family_id'])$open=$r;}
    if($joined)return ['state'=>'used','move'=>$joined];
    return $open?['state'=>'assigned','move'=>$open]:['state'=>'ready','move'=>null];
}
// A ready link the owner ticked as sent by hand is not handed out again.
function lookupInviteState(PDO $db,array $invite): string {$state=lookupInviteHolder(lookupInviteRefs($db,(int)$invite['id']))['state'];return $state==='ready'&&($invite['sent_at']??'')!==''?'sent':$state;}
function lookupInviteRefs(PDO $db,int $inviteId): array {
    return all($db,"SELECT mv.id,mv.state,mv.email,mv.customer_name,mv.to_family_id,mv.member_id,m.family_id AS member_family_id FROM member_moves mv LEFT JOIN members m ON m.id=mv.member_id WHERE mv.invite_id=? AND mv.state<>'cancelled' ORDER BY mv.id",[$inviteId]);
}
function lookupNormalizeCode(mixed $value): string {
    if(!is_string($value))return '';$code=strtoupper(preg_replace('/[\s-]/u','',$value)??'');
    return strlen($code)===6&&strspn($code,LOOKUP_CODE_ALPHABET)===6?$code:'';
}
// Same derivation as derivedCode() in lookup.js, so moving data between builds keeps every code.
function lookupDerivedCode(string $salt,string $address): string {
    $mac=hash_hmac('sha256',"family-lookup-code\0".$address,$salt,true);$code='';
    for($i=0;$i<6;$i++)$code.=LOOKUP_CODE_ALPHABET[ord($mac[$i])%strlen(LOOKUP_CODE_ALPHABET)];
    return $code;
}
function lookupGoogleUrl(string $value): bool {
    if(!preg_match('~^https://~i',$value))return false;$u=parse_url($value);if(!is_array($u)||strtolower($u['scheme']??'')!=='https'||isset($u['user'])||isset($u['pass'])||empty($u['host']))return false;
    $host=strtolower($u['host']);return $host==='google.com'||str_ends_with($host,'.google.com')||str_ends_with($host,'.googleapis.com')||$host==='g.co';
}
function lookupRevision(mixed $value,string $message='Dữ liệu đã thay đổi. Tải lại trang rồi thử lại.'): int {if(!is_int($value))fail($message);return $value;}
function lookupActiveFamily(PDO $db,mixed $id): array|false {
    if(!is_int($id)||$id<=0)return false;
    return one($db,"SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=? AND f.archived_at=''",[$id]);
}
function lookupStatusRow(PDO $db,int $familyId): array {
    return one($db,'SELECT * FROM family_statuses WHERE family_id=?',[$familyId])?:['family_id'=>$familyId,'status'=>'active','note'=>'','updated_at'=>'','revision'=>0];
}

function lookupSettings(PDO $db): array {
    $saved=array_column(all($db,'SELECT name,value FROM lookup_settings'),'value','name');$out=[];
    foreach(LOOKUP_SETTING_NAMES as $name)$out[$name]=(string)($saved[$name]??'');return $out;
}
function lookupContactUrl(mixed $value): string {
    $url=text($value,500);if($url==='')return '';$u=parse_url($url);
    if(!is_array($u)||!in_array(strtolower($u['scheme']??''),['http','https'],true)||empty($u['host'])||isset($u['user'])||isset($u['pass']))fail('Link liên hệ cần bắt đầu bằng https:// hoặc http://');
    return $url;
}
function lookupSaveSettings(PDO $db,array $d): array {
    $values=['shop_name'=>text($d['shop_name']??'',100),'contact_url'=>lookupContactUrl($d['contact_url']??''),'contact_label'=>text($d['contact_label']??'',60),'help_text'=>text($d['help_text']??'',500)];
    return transaction($db,function()use($db,$values){
        foreach($values as $name=>$value){if(one($db,'SELECT id FROM lookup_settings WHERE name=?',[$name]))q($db,'UPDATE lookup_settings SET value=? WHERE name=?',[$value,$name]);else q($db,'INSERT INTO lookup_settings(name,value) VALUES (?,?)',[$name,$value]);}
        logEntry($db,'Cá nhân: sửa thông tin trang tra cứu');return ['ok'=>true,'settings'=>lookupSettings($db)];
    });
}
function lookupSalt(PDO $db): string {
    $row=one($db,"SELECT value FROM lookup_settings WHERE name='code_salt'");
    if($row&&preg_match('/^[a-f0-9]{64}$/D',$row['value']))return $row['value'];
    // Normally created by ensureLookupSchema(); recreate rather than lock the admin out if it went missing.
    $value=bin2hex(random_bytes(32));
    if($row)q($db,"UPDATE lookup_settings SET value=? WHERE name='code_salt'",[$value]);else q($db,"INSERT INTO lookup_settings(name,value) VALUES ('code_salt',?)",[$value]);
    return $value;
}
function lookupCodeFor(PDO $db,string $address,?string $salt=null): string {
    $row=one($db,'SELECT code FROM lookup_codes WHERE email=?',[$address]);return $row?$row['code']:lookupDerivedCode($salt??lookupSalt($db),$address);
}
function lookupNewCode(): string {$code='';for($i=0;$i<6;$i++)$code.=LOOKUP_CODE_ALPHABET[random_int(0,strlen(LOOKUP_CODE_ALPHABET)-1)];return $code;}
function lookupRotateCode(PDO $db,array $d): array {
    $address=email($d['email']??'');
    if(!one($db,"SELECT m.id FROM members m JOIN families f ON f.id=m.family_id WHERE m.email=? AND f.archived_at=''",[$address]))fail('Không tìm thấy khách đang hoạt động với Gmail này.',404);
    return transaction($db,function()use($db,$address){
        $code=lookupNewCode();while($code===lookupCodeFor($db,$address))$code=lookupNewCode();
        if(one($db,'SELECT id FROM lookup_codes WHERE email=?',[$address]))q($db,'UPDATE lookup_codes SET code=?,created_at=? WHERE email=?',[$code,lookupNow(),$address]);
        else q($db,'INSERT INTO lookup_codes(email,code,created_at) VALUES (?,?,?)',[$address,$code,lookupNow()]);
        q($db,'DELETE FROM lookup_sessions WHERE email=?',[$address]);
        logEntry($db,"Cá nhân: đổi mã tra cứu của $address");return ['ok'=>true,'email'=>$address,'code'=>$code];
    });
}

// Fix lỗi drives the status customers see: reporting the owner Gmail marks an active Family
// "Bị quét"; completing the case (or keeping the mail) puts it back to "Đang hoạt động".
function lookupAutoScannedNote(string $name): string {return "$name bị Google quét nên một số thành viên có thể mất Premium. Shop đang xử lý và sẽ cập nhật tại đây; hạn dùng của bạn giữ nguyên.";}
function lookupIssueStatus(PDO $db,int $familyId,string $event): void {
    $f=lookupActiveFamily($db,$familyId);if(!$f)return;
    $old=one($db,'SELECT * FROM family_statuses WHERE family_id=?',[$f['id']]);$current=$old['status']??'active';
    if($event==='reported'?$current!=='active':$current==='active')return;
    $next=$event==='reported'?'scanned':'active';$note=$event==='reported'?lookupAutoScannedNote($f['name']):'';
    if($old)q($db,'UPDATE family_statuses SET status=?,note=?,updated_at=?,revision=revision+1 WHERE family_id=?',[$next,$note,lookupNow(),$f['id']]);
    else q($db,'INSERT INTO family_statuses(family_id,status,note,updated_at,revision) VALUES (?,?,?,?,1)',[$f['id'],$next,$note,lookupNow()]);
    logEntry($db,'Tự động: đặt trạng thái '.$f['name'].' là '.LOOKUP_STATUS_LABELS[$next].($event==='reported'?' khi báo lỗi mail quản lý':' khi hoàn tất Fix lỗi'));
}
function lookupInviteMailBase(string $address): string {
    $at=strrpos($address,'@');if($at===false||$at===0)return '';$local=explode('+',substr($address,0,$at))[0];return $local===''?'':$local.substr($address,$at);
}
// Every generated address is remembered, so a tag is never handed out twice, and no
// address collides with a label already in an invite pool.
function lookupGenerateInviteMails(PDO $db,int $familyId,array $d): array {
    $f=lookupActiveFamily($db,$familyId);if(!$f)fail('Không tìm thấy Family đang hoạt động.',404);
    $count=$d['count']??null;if(!is_int($count)||$count<1||$count>LOOKUP_INVITE_MAIL_MAX)fail('Chọn từ 1 đến 5 mail mời.');
    $base=($d['base_email']??'')!==''?lookupInviteMailBase(email($d['base_email'])):LOOKUP_INVITE_MAIL_INBOX;if($base==='')fail('Gmail nhận lời mời không hợp lệ.');
    if($base===lookupInviteMailBase($f['manager_email']))fail('Gmail nhận lời mời phải khác mail chủ của Family này.');
    return transaction($db,function()use($db,$f,$count,$base){
        $taken=array_fill_keys(array_column(all($db,'SELECT email FROM invite_mails'),'email'),true);foreach(all($db,'SELECT label FROM family_invites') as $r)$taken[strtolower($r['label'])]=true;
        $at=strrpos($base,'@');$mails=[];
        while(count($mails)<$count){
            $tag='';for($i=0;$i<6;$i++)$tag.=LOOKUP_INVITE_MAIL_ALPHABET[random_int(0,strlen(LOOKUP_INVITE_MAIL_ALPHABET)-1)];
            $address=substr($base,0,$at).'+'.$tag.substr($base,$at);if(isset($taken[$address]))continue;$taken[$address]=true;$mails[]=$address;
        }
        $time=lookupNow();foreach($mails as $address)q($db,'INSERT INTO invite_mails(family_id,email,created_at) VALUES (?,?,?)',[$f['id'],$address,$time]);
        logEntry($db,"Cá nhân: tạo $count mail mời cho {$f['name']}: ".implode(', ',$mails));
        return ['ok'=>true,'family_id'=>(int)$f['id'],'family_name'=>$f['name'],'base_email'=>$base,'mails'=>$mails];
    });
}

function lookupSaveStatus(PDO $db,int $familyId,array $d): array {
    $f=lookupActiveFamily($db,$familyId);if(!$f)fail('Không tìm thấy Family đang hoạt động.',404);
    $status=$d['status']??null;if(!in_array($status,LOOKUP_FAMILY_STATUSES,true))fail('Trạng thái nhóm không hợp lệ.');
    $note=text($d['note']??'',1000);$expected=lookupRevision($d['revision']??null,'Thiếu phiên bản trạng thái. Tải lại trang.');
    $old=one($db,'SELECT * FROM family_statuses WHERE family_id=?',[$f['id']]);
    if((int)($old['revision']??0)!==$expected)fail('Trạng thái nhóm vừa được sửa ở nơi khác. Tải lại rồi thử lại.',409);
    if($old)q($db,'UPDATE family_statuses SET status=?,note=?,updated_at=?,revision=revision+1 WHERE family_id=?',[$status,$note,lookupNow(),$f['id']]);
    else q($db,'INSERT INTO family_statuses(family_id,status,note,updated_at,revision) VALUES (?,?,?,?,1)',[$f['id'],$status,$note,lookupNow()]);
    logEntry($db,"Cá nhân: đặt trạng thái {$f['name']} là ".LOOKUP_STATUS_LABELS[$status]);
    return ['ok'=>true];
}

function lookupInviteUrl(mixed $value): string {
    $url=text($value,2000);if($url==='')fail('Dán link mời vào nhóm.');
    if(!lookupGoogleUrl($url))fail('Link mời cần là link https của Google, ví dụ myaccount.google.com hoặc notifications.googleapis.com.');
    return $url;
}
function lookupSaveInvite(PDO $db,?int $familyId,?int $id,array $d): array {
    $old=null;
    if($id){$old=one($db,'SELECT * FROM family_invites WHERE id=?',[$id]);if(!$old)fail('Không tìm thấy link mời.',404);if(lookupRevision($d['revision']??null)!==(int)$old['revision'])fail('Link mời vừa được sửa ở nơi khác. Tải lại rồi thử lại.',409);$familyId=(int)$old['family_id'];}
    $f=lookupActiveFamily($db,$familyId);if(!$f)fail('Không tìm thấy Family đang hoạt động.',404);
    $label=text($d['label']??'',200);$url=lookupInviteUrl($d['url']??'');$sent=calendarDate($d['sent_on']??'');
    $duplicate=one($db,'SELECT i.id,f.name FROM family_invites i JOIN families f ON f.id=i.family_id WHERE i.url=? AND i.id<>?',[$url,$id??0]);
    if($duplicate)fail("Link này đã có trong kho của {$duplicate['name']}.",409);
    if($old){
        q($db,'UPDATE family_invites SET label=?,url=?,sent_on=?,revision=revision+1,updated_at=? WHERE id=?',[$label,$url,$sent,lookupNow(),$id]);
        logEntry($db,'Cá nhân: sửa link mời '.($label?:'#'.$id)." của {$f['name']}".($old['url']!==$url?' (đổi link mới)':''));
        return ['ok'=>true,'id'=>$id];
    }
    q($db,'INSERT INTO family_invites(family_id,label,url,sent_on,revision,created_at,updated_at) VALUES (?,?,?,?,0,?,?)',[$f['id'],$label,$url,$sent,lookupNow(),lookupNow()]);$new=(int)$db->lastInsertId();
    logEntry($db,'Cá nhân: thêm link mời '.($label?:'#'.$new)." cho {$f['name']}");
    return ['ok'=>true,'id'=>$new];
}
// Invite mails read from Gmail by Apps Script. Each link is filed under the active Family whose
// owner Gmail appears in the mail (the group the link really joins), otherwise under the Family a
// generated address (Gen mail mời) belongs to, and labelled with the Gmail that received it. The newest
// mail per address wins: a link already in a pool is left alone, and a newer link replaces one nobody has used.
function lookupImportInvites(PDO $db,array $items): array {
    $owners=[];foreach(all($db,"SELECT f.id,f.name,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at=''") as $f)$owners[$f['email']]=$f;
    $aliases=[];foreach(all($db,"SELECT i.email AS alias,f.id,f.name,a.email FROM invite_mails i JOIN families f ON f.id=i.family_id JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at=''") as $r)$aliases[$r['alias']]=['id'=>$r['id'],'name'=>$r['name'],'email'=>$r['email']];
    $mails=[];
    foreach($items as $item){
        if(!is_array($item))continue;
        $url=is_string($item['url']??null)?trim($item['url']):'';$to=is_string($item['to']??null)?strtolower(trim($item['to'])):'';$date=is_string($item['date']??null)?$item['date']:'';
        if($url===''||strlen($url)>2000||!lookupGoogleUrl($url)||strlen($to)>200||!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/uD',$to)||!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$date,$p)||!checkdate((int)$p[2],(int)$p[3],(int)$p[1]))continue;
        $owner=null;foreach(is_array($item['emails']??null)?array_slice($item['emails'],0,20):[] as $address)if(is_string($address)&&isset($owners[strtolower(trim($address))])){$owner=$owners[strtolower(trim($address))];break;}
        $alias=$aliases[$to]??null;
        $at=is_string($item['sent_at']??null)&&strlen($item['sent_at'])<=40?$item['sent_at']:$date;
        $mails[]=['url'=>$url,'to'=>$to,'date'=>$date,'at'=>$at,'family'=>$owner??$alias,'moved'=>$owner&&$alias&&(int)$owner['id']!==(int)$alias['id']?$alias['name']:''];
    }
    usort($mails,fn($a,$b)=>strcmp($b['at'],$a['at']));
    $out=['found'=>count($mails),'added'=>0,'updated'=>0,'unchanged'=>0];$unmatched=[];$families=[];$seen=[];$mismatched=[];
    foreach($mails as $m){
        $f=$m['family'];if(!$f){$unmatched[$m['to']]=true;continue;}
        $key=$f['id']."\0".$m['to'];if(isset($seen[$key]))continue;$seen[$key]=true;
        if($m['moved']!=='')$mismatched[$m['to']]=['email'=>$m['to'],'generated_for'=>$m['moved'],'invited_by'=>$f['name']];
        if(one($db,'SELECT id FROM family_invites WHERE url=?',[$m['url']])){$out['unchanged']++;continue;}
        $old=one($db,'SELECT * FROM family_invites WHERE family_id=? AND label=? ORDER BY id DESC LIMIT 1',[$f['id'],$m['to']]);
        // A link someone joined with, or one ticked as sent by hand, is kept as it is. A link held
        // for a customer (handed out on lookup or by a move) takes the newer link, so that customer
        // keeps the same slot and sees a working link until they move to another group.
        $holder=$old?lookupInviteHolder(lookupInviteRefs($db,(int)$old['id']))['state']:'';
        if($old&&$holder!=='used'&&($holder==='assigned'||$old['sent_at']==='')){
            if($old['sent_on']!==''&&$old['sent_on']>$m['date']){$out['unchanged']++;continue;}
            q($db,'UPDATE family_invites SET url=?,sent_on=?,revision=revision+1,updated_at=? WHERE id=?',[$m['url'],$m['date'],lookupNow(),$old['id']]);
            logEntry($db,"Cá nhân: đổi link mời {$m['to']} của {$f['name']} theo thư mới trong Gmail");$out['updated']++;
        }else{
            q($db,'INSERT INTO family_invites(family_id,label,url,sent_on,revision,created_at,updated_at) VALUES (?,?,?,?,0,?,?)',[$f['id'],$m['to'],$m['url'],$m['date'],lookupNow(),lookupNow()]);
            logEntry($db,"Cá nhân: thêm link mời {$m['to']} cho {$f['name']} từ Gmail");$out['added']++;
        }
        $families[$f['name']]=true;
    }
    foreach($seen as $key=>$_)unset($unmatched[explode("\0",$key,2)[1]]);
    return [...$out,'families'=>array_keys($families),'unmatched'=>array_slice(array_keys($unmatched),0,20),'unmatched_count'=>count($unmatched),'mismatched'=>array_values($mismatched)];
}
// Remove addresses made by mistake. Only addresses still waiting for their link can go;
// one that already has a link is managed in the invite table.
function lookupDeleteInviteMails(PDO $db,int $familyId,array $d): array {
    $f=lookupActiveFamily($db,$familyId);if(!$f)fail('Không tìm thấy Family đang hoạt động.',404);
    $ids=$d['ids']??null;if(!is_array($ids)||!$ids||!array_is_list($ids)||count($ids)>50||array_filter($ids,fn($id)=>!is_int($id)))fail('Chọn mail mời cần xóa.');
    $rows=array_map(fn($id)=>one($db,'SELECT * FROM invite_mails WHERE id=? AND family_id=?',[$id,$f['id']]),$ids);
    if(in_array(false,$rows,true))fail('Mail mời đã thay đổi. Tải lại trang rồi thử lại.',409);
    foreach($rows as $row)if(one($db,'SELECT id FROM family_invites WHERE LOWER(label)=?',[$row['email']]))fail($row['email'].' đã có link mời. Xóa link đó trong bảng link mời nếu không dùng.',409);
    return transaction($db,function()use($db,$f,$rows){
        foreach($rows as $row)q($db,'DELETE FROM invite_mails WHERE id=?',[$row['id']]);
        logEntry($db,'Cá nhân: xóa '.count($rows).' mail mời của '.$f['name'].': '.implode(', ',array_column($rows,'email')));
        return ['ok'=>true,'deleted'=>count($rows)];
    });
}
// Cho khách vào: every customer of the old Family, with all their details, moves into the new
// Family as "Đã mời, chưa vào" (they then get their own link on lookup). A record of the same
// Gmail already in the new Family is replaced by the old Family's record.
function lookupHandOver(PDO $db,int $fromId,array $d): array {
    $from=lookupActiveFamily($db,$fromId);if(!$from)fail('Không tìm thấy Family cũ đang hoạt động.',404);
    $to=lookupActiveFamily($db,$d['to_family_id']??null);if(!$to||(int)$to['id']===(int)$from['id'])fail('Chọn Family mới đang hoạt động.');
    if($to['manager_email']!==email($d['expected_manager_email']??''))fail('Mail chủ Family mới đã thay đổi. Tải lại rồi chọn lại.',409);
    $members=all($db,'SELECT * FROM members WHERE family_id=? ORDER BY id',[$from['id']]);
    if(!$members)fail("{$from['name']} không còn khách để chuyển.",409);
    foreach($members as $m)if($m['email']===$to['manager_email'])fail("Email {$m['email']} trùng mail chủ {$to['name']}.",409);
    return transaction($db,function()use($db,$from,$to,$members){
        $time=lookupNow();$replaced=0;
        foreach($members as $m){
            $duplicate=one($db,'SELECT id FROM members WHERE family_id=? AND email=?',[$to['id'],$m['email']]);
            if($duplicate){foreach(['member_moves','renewal_history','new_purchase_history'] as $t)q($db,"UPDATE `$t` SET member_id=NULL WHERE member_id=?",[$duplicate['id']]);q($db,"DELETE FROM issues WHERE family_id=? AND target_type='member' AND target_id=?",[$to['id'],$duplicate['id']]);q($db,'DELETE FROM members WHERE id=?',[$duplicate['id']]);$replaced++;}
            q($db,"UPDATE member_moves SET state='cancelled',updated_at=?,revision=revision+1 WHERE member_id=? AND state IN ('assigned','opened','failed')",[$time,$m['id']]);
            q($db,"UPDATE members SET family_id=?,membership_status='invited',renewal_revision=renewal_revision+1 WHERE id=?",[$to['id'],$m['id']]);
            q($db,"DELETE FROM issues WHERE family_id=? AND target_type='member' AND target_id=?",[$from['id'],$m['id']]);
        }
        logEntry($db,'Cá nhân: cho '.count($members)." khách của {$from['name']} ({$from['manager_email']}) vào {$to['name']} ({$to['manager_email']})".($replaced?", ghi đè $replaced hồ sơ trùng Gmail":'').': '.implode(', ',array_column($members,'email')));
        return ['ok'=>true,'moved'=>count($members),'replaced'=>$replaced,'family_id'=>(int)$to['id'],'family_name'=>$to['name']];
    });
}
function lookupMarkInviteSent(PDO $db,int $id,array $d): array {
    $i=one($db,'SELECT * FROM family_invites WHERE id=?',[$id]);if(!$i)fail('Không tìm thấy link mời.',404);
    $f=lookupActiveFamily($db,(int)$i['family_id']);if(!$f)fail('Không tìm thấy Family đang hoạt động.',404);
    if(lookupRevision($d['revision']??null)!==(int)$i['revision'])fail('Link mời vừa được sửa ở nơi khác. Tải lại rồi thử lại.',409);
    if(!is_bool($d['sent']??null))fail('Thiếu trạng thái đã gửi.');
    $state=lookupInviteHolder(lookupInviteRefs($db,$id))['state'];
    if($d['sent']&&$state!=='ready')fail($state==='used'?'Link này đã có khách dùng.':'Link đang giao cho khách trong lượt chuyển nhóm.',409);
    q($db,'UPDATE family_invites SET sent_at=?,revision=revision+1,updated_at=? WHERE id=?',[$d['sent']?lookupNow():'',lookupNow(),$id]);
    logEntry($db,'Cá nhân: '.($d['sent']?'đánh dấu đã gửi':'bỏ đánh dấu đã gửi').' link mời '.($i['label']?:'#'.$id)." của {$f['name']}");
    return ['ok'=>true];
}
function lookupDeleteInvite(PDO $db,int $id,array $d): array {
    $old=one($db,'SELECT i.*,f.name AS family_name FROM family_invites i JOIN families f ON f.id=i.family_id WHERE i.id=?',[$id]);if(!$old)fail('Không tìm thấy link mời.',404);
    if(lookupRevision($d['revision']??null)!==(int)$old['revision'])fail('Link mời vừa được sửa ở nơi khác. Tải lại rồi thử lại.',409);
    if(lookupInviteHolder(lookupInviteRefs($db,$id))['state']==='assigned')fail('Link đang giao cho khách. Thu hồi link trước khi xóa.',409);
    q($db,'DELETE FROM family_invites WHERE id=?',[$id]);
    logEntry($db,'Cá nhân: xóa link mời '.($old['label']?:'#'.$id)." của {$old['family_name']}");
    return ['ok'=>true];
}

function lookupBulkMove(PDO $db,array $d): array {
    $from=lookupActiveFamily($db,$d['from_family_id']??null);if(!$from)fail('Không tìm thấy Family cũ đang hoạt động.',404);
    $to=lookupActiveFamily($db,$d['to_family_id']??null);if(!$to)fail('Chọn Family mới đang hoạt động.');
    if((int)$to['id']===(int)$from['id'])fail('Chọn Family mới khác Family cũ.');
    if($to['manager_email']!==email($d['expected_manager_email']??''))fail('Mail chủ Family mới đã thay đổi. Tải lại rồi chọn lại.',409);
    $assignments=$d['assignments']??null;
    if(!is_array($assignments)||!array_is_list($assignments)||!$assignments)fail('Chọn ít nhất một khách và một link mời.');
    if(count($assignments)>LOOKUP_MOVE_LIMIT)fail('Mỗi lần chuyển tối đa '.LOOKUP_MOVE_LIMIT.' khách.');
    $members=[];$invites=[];$checked=[];
    foreach($assignments as $a){
        if(!is_array($a)||!is_int($a['member_id']??null)||!is_int($a['invite_id']??null)||!is_int($a['revision']??null)||!is_int($a['invite_revision']??null)||!is_string($a['expected_email']??null))fail('Thông tin chuyển nhóm không hợp lệ. Tải lại rồi thử lại.');
        if(isset($members[$a['member_id']]))fail('Mỗi khách chỉ chọn một lần.');if(isset($invites[$a['invite_id']]))fail('Mỗi link mời chỉ giao cho một khách.');
        $members[$a['member_id']]=true;$invites[$a['invite_id']]=true;
        $m=one($db,'SELECT * FROM members WHERE id=?',[$a['member_id']]);
        if(!$m||(int)$m['family_id']!==(int)$from['id']||(int)$m['renewal_revision']!==$a['revision']||$m['email']!==$a['expected_email'])fail('Hồ sơ khách đã thay đổi. Đóng hộp thoại, tải lại rồi thử lại.',409);
        if($m['email']===$to['manager_email'])fail("Email {$m['email']} trùng mail chủ Family mới.");
        if(one($db,'SELECT id FROM members WHERE family_id=? AND email=?',[$to['id'],$m['email']]))fail("Email {$m['email']} đã có trong Family mới.",409);
        $i=one($db,'SELECT * FROM family_invites WHERE id=?',[$a['invite_id']]);
        if(!$i||(int)$i['family_id']!==(int)$to['id']||(int)$i['revision']!==$a['invite_revision'])fail('Link mời đã thay đổi. Tải lại rồi chọn lại.',409);
        if(lookupInviteState($db,$i)!=='ready')fail('Link '.($i['label']?:'#'.$i['id']).' đã được giao, đã gửi hoặc đã dùng. Chọn link khác.',409);
        $checked[]=[$m,$i];
    }
    $source=lookupStatusRow($db,(int)$from['id']);
    return transaction($db,function()use($db,$checked,$from,$to,$source){
        $moved=[];
        foreach($checked as [$m,$i]){
            $now=lookupNow();
            // A customer moved again keeps only the newest move open.
            q($db,"UPDATE member_moves SET state='cancelled',updated_at=?,revision=revision+1 WHERE member_id=? AND state IN ('assigned','opened','failed')",[$now,$m['id']]);
            q($db,"UPDATE members SET family_id=?,membership_status='invited',renewal_revision=renewal_revision+1 WHERE id=?",[$to['id'],$m['id']]);
            $removed=q($db,"DELETE FROM issues WHERE family_id=? AND target_type='member' AND target_id=? AND (subject_email=? OR original_email=?)",[$from['id'],$m['id'],$m['email'],$m['email']])->rowCount();
            q($db,'UPDATE family_invites SET revision=revision+1,updated_at=? WHERE id=?',[$now,$i['id']]);
            q($db,"INSERT INTO member_moves(member_id,email,customer_name,from_family_id,from_family_name,from_status,from_note,to_family_id,to_family_name,invite_id,invite_label,state,created_at,updated_at,revision) VALUES (?,?,?,?,?,?,?,?,?,?,?,'assigned',?,?,0)",[$m['id'],$m['email'],$m['customer_name'],$from['id'],$from['name'],$source['status'],$source['note'],$to['id'],$to['name'],$i['id'],$i['label'],$now,$now]);
            $moved[]=['member_id'=>(int)$m['id'],'move_id'=>(int)$db->lastInsertId()];
            logEntry($db,"Cá nhân: chuyển khách {$m['email']} từ {$from['name']} ({$from['manager_email']}) sang {$to['name']} ({$to['manager_email']}), giao link ".($i['label']?:'#'.$i['id']).($removed?" · xóa $removed case lỗi của khách":''));
        }
        return ['ok'=>true,'moved'=>count($moved),'moves'=>$moved,'family_id'=>(int)$to['id'],'family_name'=>$to['name']];
    });
}

function lookupUpdateMove(PDO $db,int $id,array $d): array {
    $mv=one($db,'SELECT * FROM member_moves WHERE id=?',[$id]);if(!$mv)fail('Không tìm thấy lượt chuyển nhóm.',404);
    if(lookupRevision($d['revision']??null)!==(int)$mv['revision'])fail('Lượt chuyển nhóm vừa thay đổi. Tải lại rồi thử lại.',409);
    $m=$mv['member_id']!==null?one($db,'SELECT * FROM members WHERE id=?',[$mv['member_id']]):false;
    $live=$m&&$mv['to_family_id']!==null&&(int)$m['family_id']===(int)$mv['to_family_id'];$open=in_array($mv['state'],LOOKUP_OPEN_STATES,true);$now=lookupNow();$action=$d['action']??'';
    return transaction($db,function()use($db,$id,$d,$mv,$m,$live,$open,$now,$action){
        if($action==='joined'){
            if(!$live)fail('Khách không còn ở Family mới. Tải lại trang.',409);if(!$open)fail('Lượt chuyển này đã xong hoặc đã hủy.',409);
            q($db,"UPDATE member_moves SET state='joined',joined_at=?,updated_at=?,revision=revision+1 WHERE id=?",[$now,$now,$id]);
            q($db,"UPDATE members SET membership_status='active',renewal_revision=renewal_revision+1 WHERE id=?",[$m['id']]);
            logEntry($db,"Cá nhân: ghi nhận {$mv['email']} đã vào {$mv['to_family_name']}");
        }elseif($action==='release'){
            if(!$open)fail('Chỉ thu hồi được link chưa dùng.',409);
            q($db,"UPDATE member_moves SET state='cancelled',updated_at=?,revision=revision+1 WHERE id=?",[$now,$id]);
            if($mv['invite_id']!==null)q($db,"UPDATE family_invites SET sent_at='',revision=revision+1,updated_at=? WHERE id=?",[$now,$mv['invite_id']]);
            logEntry($db,"Cá nhân: thu hồi link {$mv['invite_label']} của {$mv['email']}, trả về kho {$mv['to_family_name']}");
        }elseif($action==='reassign'){
            if(!$open||!$live)fail('Chỉ đổi link cho khách đang chờ vào Family mới.',409);
            $i=is_int($d['invite_id']??null)?one($db,'SELECT * FROM family_invites WHERE id=?',[$d['invite_id']]):false;
            if(!$i||(int)$i['family_id']!==(int)$mv['to_family_id']||!is_int($d['invite_revision']??null)||(int)$i['revision']!==$d['invite_revision'])fail('Link mời đã thay đổi. Tải lại rồi chọn lại.',409);
            if($mv['invite_id']!==null&&(int)$i['id']===(int)$mv['invite_id'])fail('Chọn link khác link hiện tại.');
            if(lookupInviteState($db,$i)!=='ready')fail('Link mời đã được giao, đã gửi hoặc đã dùng. Chọn link khác.',409);
            if($mv['invite_id']!==null)q($db,'UPDATE family_invites SET revision=revision+1,updated_at=? WHERE id=?',[$now,$mv['invite_id']]);
            q($db,'UPDATE family_invites SET revision=revision+1,updated_at=? WHERE id=?',[$now,$i['id']]);
            q($db,"UPDATE member_moves SET invite_id=?,invite_label=?,state='assigned',report_reason='',report_note='',reported_at='',opened_at='',updated_at=?,revision=revision+1 WHERE id=?",[$i['id'],$i['label'],$now,$id]);
            logEntry($db,"Cá nhân: đổi link của {$mv['email']} sang ".($i['label']?:'#'.$i['id']));
        }elseif($action==='dismiss'){
            if($open&&$live)fail('Khách đang chờ vào nhóm. Ghi nhận đã vào hoặc thu hồi link trước khi ẩn.',409);
            q($db,'UPDATE member_moves SET dismissed_at=?,updated_at=?,revision=revision+1 WHERE id=?',[$now,$now,$id]);
        }else fail('Thao tác chuyển nhóm không hợp lệ.');
        return ['ok'=>true];
    });
}

function lookupAdminState(PDO $db): array {
    $salt=lookupSalt($db);
    $refs=all($db,"SELECT mv.id,mv.invite_id,mv.state,mv.email,mv.customer_name,mv.to_family_id,mv.member_id,m.family_id AS member_family_id FROM member_moves mv LEFT JOIN members m ON m.id=mv.member_id WHERE mv.invite_id IS NOT NULL AND mv.state<>'cancelled' ORDER BY mv.id");
    $byInvite=[];foreach($refs as $r)$byInvite[(int)$r['invite_id']][]=$r;
    $invites=array_map(function($i)use($byInvite){$h=lookupInviteHolder($byInvite[(int)$i['id']]??[]);return [...$i,'expires_on'=>lookupInviteExpiry($i['sent_on']),'holder_state'=>$h['state']==='ready'&&$i['sent_at']!==''?'sent':$h['state'],'holder_move_id'=>$h['move']?(int)$h['move']['id']:null,'holder_email'=>$h['move']['email']??'','holder_name'=>$h['move']['customer_name']??''];},all($db,'SELECT * FROM family_invites ORDER BY family_id,id'));
    $moves=array_map(function($mv){$live=$mv['member_family_id']!==null&&$mv['to_family_id']!==null&&(int)$mv['member_family_id']===(int)$mv['to_family_id'];return [...$mv,'live'=>$live,'effective_state'=>in_array($mv['state'],LOOKUP_OPEN_STATES,true)&&!$live?'stale':$mv['state']];},all($db,"SELECT mv.*,m.family_id AS member_family_id FROM member_moves mv LEFT JOIN members m ON m.id=mv.member_id WHERE mv.dismissed_at='' ORDER BY mv.id DESC LIMIT 500"));
    $codes=[];foreach(all($db,'SELECT DISTINCT email FROM members') as $r)$codes[$r['email']]=lookupCodeFor($db,$r['email'],$salt);
    // Gmail import needs the Google Sheet connection (same Apps Script). Plain query: no DDL inside the state audit.
    $gmail=false;$mailbox='';try{$gmail=(bool)one($db,"SELECT name FROM family_sheet_state WHERE name='config'");$row=one($db,"SELECT value FROM family_sheet_state WHERE name='gmail_mailbox'");$mailbox=$row?(string)json_decode($row['value'],true):'';}catch(Throwable $e){}
    return ['lookup_supported'=>true,'gmail_import'=>$gmail,'gmail_mailbox'=>$mailbox,'invite_base_email'=>LOOKUP_INVITE_MAIL_INBOX,'invite_mails'=>array_map(fn($r)=>[...$r,'id'=>(int)$r['id'],'family_id'=>(int)$r['family_id']],all($db,'SELECT id,family_id,email,created_at FROM invite_mails ORDER BY id')),'lookup_settings'=>lookupSettings($db),'family_statuses'=>all($db,'SELECT family_id,status,note,updated_at,revision FROM family_statuses'),'invites'=>$invites,'moves'=>$moves,'lookup_codes'=>(object)$codes];
}

// ---- Public lookup (customer) ----
// A customer of this Family who has not joined yet ("Đã mời, chưa vào" or "Mua mới") gets one
// ready link of the Family's own pool the first time they look up their Gmail. The link is
// held for them (never handed to anyone else) and ticked Đã gửi.
function lookupJoinable(array $m): bool {return in_array($m['membership_status'],['invited','new'],true);}
function lookupAllocateJoin(PDO $db,array $m,array $status,array $period): bool {
    if(!lookupJoinable($m)||$status['status']!=='active'||$period['expiry_status']==='expired')return false;
    if(one($db,"SELECT id FROM member_moves WHERE member_id=? AND to_family_id=? AND state<>'cancelled'",[$m['id'],$m['family_id']]))return false;
    $f=lookupActiveFamily($db,(int)$m['family_id']);if(!$f)return false;$today=today();$invite=null;
    foreach(all($db,"SELECT * FROM family_invites WHERE family_id=? AND sent_at='' ORDER BY CASE WHEN sent_on='' THEN 1 ELSE 0 END,sent_on,id",[$f['id']]) as $i)if(lookupInviteHolder(lookupInviteRefs($db,(int)$i['id']))['state']==='ready'&&($i['sent_on']===''||lookupInviteExpiry($i['sent_on'])>=$today)){$invite=$i;break;}
    if(!$invite)return false;
    $time=lookupNow();
    q($db,"INSERT INTO member_moves(member_id,email,customer_name,from_family_id,from_family_name,from_status,from_note,to_family_id,to_family_name,invite_id,invite_label,state,created_at,updated_at) VALUES (?,?,?,NULL,'','active','',?,?,?,?,'assigned',?,?)",[$m['id'],$m['email'],$m['customer_name'],$f['id'],$f['name'],$invite['id'],$invite['label'],$time,$time]);
    q($db,'UPDATE family_invites SET sent_at=?,revision=revision+1,updated_at=? WHERE id=?',[$time,$time,$invite['id']]);
    logEntry($db,'Tự động: giao link mời '.($invite['label']?:'#'.$invite['id'])." của {$f['name']} cho {$m['email']} khi khách tra cứu");
    return true;
}
function lookupResult(PDO $db,string $address): array {
    $items=[];
    foreach(all($db,"SELECT m.*,f.name AS family_name FROM members m JOIN families f ON f.id=m.family_id WHERE m.email=? AND f.archived_at='' ORDER BY m.id",[$address]) as $m){
        $status=lookupStatusRow($db,(int)$m['family_id']);$period=expiry($m['expires_at']);$allocated=lookupAllocateJoin($db,$m,$status,$period);
        $latest=one($db,"SELECT * FROM member_moves WHERE member_id=? AND state<>'cancelled' AND dismissed_at='' ORDER BY id DESC LIMIT 1",[$m['id']]);$move=null;
        if($latest&&$latest['to_family_id']!==null&&(int)$latest['to_family_id']===(int)$m['family_id']){
            $open=in_array($latest['state'],LOOKUP_OPEN_STATES,true);$invite=$open&&$latest['invite_id']!==null?one($db,'SELECT * FROM family_invites WHERE id=?',[$latest['invite_id']]):false;
            // A link shown to its customer is ticked Đã gửi, so it is never handed to someone else.
            if($invite&&$invite['sent_at']==='')q($db,'UPDATE family_invites SET sent_at=?,revision=revision+1,updated_at=? WHERE id=?',[lookupNow(),lookupNow(),$invite['id']]);
            $source=$latest['from_family_id']!==null&&lookupActiveFamily($db,(int)$latest['from_family_id'])?lookupStatusRow($db,(int)$latest['from_family_id']):null;
            $move=['id'=>(int)$latest['id'],'kind'=>$latest['from_family_id']===null&&$latest['from_family_name']===''?'join':'move','state'=>$latest['state'],'from_family_name'=>$latest['from_family_name'],'from_status'=>$source?$source['status']:$latest['from_status'],'from_note'=>$source?$source['note']:$latest['from_note'],'invite_url'=>$invite?$invite['url']:'','invite_expires_on'=>$invite?lookupInviteExpiry($invite['sent_on']):'','report_reason'=>$latest['report_reason'],'reported_at'=>$latest['reported_at'],'opened_at'=>$latest['opened_at'],'joined_at'=>$latest['joined_at']];
        }
        $waiting=!$allocated&&!$move&&lookupJoinable($m)&&$status['status']==='active'&&$period['expiry_status']!=='expired';
        $view=$move&&in_array($move['state'],LOOKUP_OPEN_STATES,true)?'move':(in_array($status['status'],LOOKUP_PROBLEM_STATUSES,true)?($period['expiry_status']==='expired'?'expired':'incident'):($period['expiry_status']==='expired'?'expired':($waiting?'waiting':'normal')));
        $items[]=['family_name'=>$m['family_name'],'plan_months'=>(int)$m['plan_months'],'expires_at'=>$m['expires_at'],...$period,'membership_status'=>$m['membership_status'],'status'=>$status['status'],'status_note'=>$status['note'],'status_updated_at'=>$status['updated_at'],'view'=>$view,'move'=>$move];
    }
    return ['email'=>$address,'today'=>today(),'shop'=>lookupSettings($db),'items'=>$items];
}
function lookupBlocked(PDO $db,string $name,int $limit): bool {$r=one($db,'SELECT * FROM lookup_attempts WHERE name=?',[$name]);return $r&&(int)$r['window_end']>lookupMs()&&(int)$r['count']>=$limit;}
function lookupBump(PDO $db,string $name): void {
    $r=one($db,'SELECT * FROM lookup_attempts WHERE name=?',[$name]);$t=lookupMs();
    if(!$r)q($db,'INSERT INTO lookup_attempts(name,window_end,count) VALUES (?,?,1)',[$name,$t+LOOKUP_WINDOW_MS]);
    elseif((int)$r['window_end']<=$t)q($db,'UPDATE lookup_attempts SET window_end=?,count=1 WHERE name=?',[$t+LOOKUP_WINDOW_MS,$name]);
    else q($db,'UPDATE lookup_attempts SET count=count+1 WHERE name=?',[$name]);
}
function lookupVerify(PDO $db,array $d,string $ip): array {
    $t=lookupMs();q($db,'DELETE FROM lookup_sessions WHERE expires_at<=?',[$t]);q($db,'DELETE FROM lookup_attempts WHERE window_end<=?',[$t]);
    $address=email($d['email']??'');$code=lookupNormalizeCode($d['code']??'');
    if($code==='')fail('Mã tra cứu gồm 6 ký tự chữ và số trong tin nhắn shop gửi bạn.');
    $keys=[['ip:'.substr($ip!==''?$ip:'unknown',0,100),LOOKUP_IP_LIMIT],['email:'.$address,LOOKUP_EMAIL_LIMIT]];
    foreach($keys as [$name,$limit])if(lookupBlocked($db,$name,$limit))fail('Bạn đã thử quá nhiều lần. Đợi 15 phút rồi thử lại.',429);
    $active=one($db,"SELECT m.id FROM members m JOIN families f ON f.id=m.family_id WHERE m.email=? AND f.archived_at='' LIMIT 1",[$address]);
    if(!$active||!hash_equals(lookupCodeFor($db,$address),$code)){foreach($keys as [$name])lookupBump($db,$name);fail('Gmail hoặc mã tra cứu không đúng. Kiểm tra lại tin nhắn shop gửi bạn.',401);}
    q($db,'DELETE FROM lookup_attempts WHERE name=?',['email:'.$address]);
    $token=bin2hex(random_bytes(32));q($db,'INSERT INTO lookup_sessions(token_hash,email,expires_at) VALUES (?,?,?)',[hash('sha256',$token),$address,$t+LOOKUP_SESSION_MS]);
    return ['token'=>$token,'result'=>lookupResult($db,$address)];
}
function lookupSessionEmail(PDO $db,mixed $token): ?string {
    if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))return null;
    $r=one($db,'SELECT * FROM lookup_sessions WHERE token_hash=?',[hash('sha256',$token)]);return $r&&(int)$r['expires_at']>lookupMs()?$r['email']:null;
}
function lookupCustomerMove(PDO $db,string $address,array $d): array {
    if(!is_int($d['move_id']??null))fail('Thiếu thông tin lượt chuyển nhóm.');
    $mv=one($db,'SELECT mv.* FROM member_moves mv JOIN members m ON m.id=mv.member_id WHERE mv.id=? AND m.email=? AND m.family_id=mv.to_family_id',[$d['move_id'],$address]);
    if(!$mv)fail('Không tìm thấy lượt chuyển nhóm của bạn. Tải lại trang.',404);return $mv;
}
function lookupCustomerOpen(PDO $db,string $address,array $d): array {
    $mv=lookupCustomerMove($db,$address,$d);
    if($mv['state']==='assigned'){q($db,"UPDATE member_moves SET state='opened',opened_at=?,updated_at=?,revision=revision+1 WHERE id=?",[lookupNow(),lookupNow(),$mv['id']]);logEntry($db,"Khách $address mở link vào {$mv['to_family_name']}");}
    return ['ok'=>true];
}
function lookupCustomerJoined(PDO $db,string $address,array $d): array {
    $mv=lookupCustomerMove($db,$address,$d);
    if(in_array($mv['state'],LOOKUP_OPEN_STATES,true))transaction($db,function()use($db,$mv,$address){
        q($db,"UPDATE member_moves SET state='joined',joined_at=?,updated_at=?,revision=revision+1 WHERE id=?",[lookupNow(),lookupNow(),$mv['id']]);
        q($db,"UPDATE members SET membership_status='active',renewal_revision=renewal_revision+1 WHERE id=?",[$mv['member_id']]);
        logEntry($db,"Khách $address xác nhận đã vào {$mv['to_family_name']}");
    });
    return lookupResult($db,$address);
}
function lookupCustomerReport(PDO $db,string $address,array $d): array {
    $mv=lookupCustomerMove($db,$address,$d);
    if(!in_array($mv['state'],LOOKUP_OPEN_STATES,true))fail('Lượt chuyển nhóm này đã xong. Tải lại trang.',409);
    $reason=$d['reason']??null;if(!in_array($reason,LOOKUP_REPORT_REASONS,true))fail('Chọn lỗi Google báo.');$note=text($d['note']??'',500);
    q($db,"UPDATE member_moves SET state='failed',report_reason=?,report_note=?,reported_at=?,updated_at=?,revision=revision+1 WHERE id=?",[$reason,$note,lookupNow(),lookupNow(),$mv['id']]);
    logEntry($db,"Khách $address báo không vào được {$mv['to_family_name']}: $reason".($note!==''?" · $note":''));
    return lookupResult($db,$address);
}
function lookupCookie(array $c,string $token,int $age): void {
    setcookie('fam_lookup',$token,['expires'=>$age>0?time()+$age:1,'path'=>'/api/lookup','secure'=>$c['secure'],'httponly'=>true,'samesite'=>'Strict']);
}
// Public routes run before the access-password check. Sign-in is outside the audit
// transaction so its attempt counter survives an error answer.
function lookupRequest(PDO $db,array $c,string $route,string $method): never {
    if($route==='/api/lookup/info'&&$method==='GET')reply(['shop'=>lookupSettings($db)]);
    if($route==='/api/lookup/verify'&&$method==='POST'){$r=lookupVerify($db,body(),(string)($_SERVER['REMOTE_ADDR']??''));lookupCookie($c,$r['token'],3600);reply($r['result']);}
    $token=$_COOKIE['fam_lookup']??'';
    if($route==='/api/lookup/logout'&&$method==='POST'){if(is_string($token)&&preg_match('/^[a-f0-9]{64}$/D',$token))q($db,'DELETE FROM lookup_sessions WHERE token_hash=?',[hash('sha256',$token)]);lookupCookie($c,'',0);reply(['ok'=>true]);}
    $address=lookupSessionEmail($db,$token);
    if($route==='/api/lookup/me'&&$method==='GET')reply($address?lookupResult($db,$address):['signed_in'=>false]);
    if(!$address)fail('Phiên tra cứu đã hết. Nhập lại Gmail và mã tra cứu.',401);
    $actions=['/api/lookup/open'=>['Khách mở link mời','lookupCustomerOpen'],'/api/lookup/joined'=>['Khách xác nhận vào nhóm','lookupCustomerJoined'],'/api/lookup/report'=>['Khách báo lỗi vào nhóm','lookupCustomerReport']];
    if(isset($actions[$route])&&$method==='POST'){$d=body();beginAudit($db,$actions[$route][0],'Khách tra cứu');reply($actions[$route][1]($db,$address,$d));}
    fail('Không tìm thấy.',404);
}
// Admin routes; called after the access-password check inside the request audit scope.
function lookupAdminRequest(PDO $db,string $route,string $method): void {
    if(preg_match('~^/api/families/(\d+)/status$~D',$route,$p)&&$method==='PATCH')reply(lookupSaveStatus($db,(int)$p[1],body()));
    if(preg_match('~^/api/invites/(\d+)/sent$~D',$route,$p)&&$method==='PATCH')reply(lookupMarkInviteSent($db,(int)$p[1],body()));
    if(preg_match('~^/api/families/(\d+)/hand-over$~D',$route,$p)&&$method==='POST')reply(lookupHandOver($db,(int)$p[1],body()));
    if(preg_match('~^/api/families/(\d+)/invite-mails$~D',$route,$p)&&$method==='DELETE')reply(lookupDeleteInviteMails($db,(int)$p[1],body()));
    if(preg_match('~^/api/families/(\d+)/invite-mails$~D',$route,$p)&&$method==='POST')reply(lookupGenerateInviteMails($db,(int)$p[1],body()),201);
    if(preg_match('~^/api/families/(\d+)/invites$~D',$route,$p)&&$method==='POST')reply(lookupSaveInvite($db,(int)$p[1],null,body()),201);
    if(preg_match('~^/api/invites/(\d+)$~D',$route,$p)&&$method==='PATCH')reply(lookupSaveInvite($db,null,(int)$p[1],body()));
    if(preg_match('~^/api/invites/(\d+)$~D',$route,$p)&&$method==='DELETE')reply(lookupDeleteInvite($db,(int)$p[1],body()));
    if($route==='/api/moves'&&$method==='POST')reply(lookupBulkMove($db,body()));
    if(preg_match('~^/api/moves/(\d+)$~D',$route,$p)&&$method==='PATCH')reply(lookupUpdateMove($db,(int)$p[1],body()));
    if($route==='/api/lookup-settings'&&$method==='PATCH')reply(lookupSaveSettings($db,body()));
    if($route==='/api/lookup-codes'&&$method==='POST')reply(lookupRotateCode($db,body()));
}
function lookupAuditAction(string $method,string $route): string {
    if(preg_match('~^/api/families/\d+/status$~D',$route))return 'Sửa trạng thái Family';
    if(preg_match('~^/api/families/\d+/invites$~D',$route))return 'Thêm link mời';
    if(preg_match('~^/api/families/\d+/invite-mails$~D',$route))return $method==='DELETE'?'Xóa mail mời':'Tạo mail mời';
    if(preg_match('~^/api/invites/\d+/sent$~D',$route))return 'Đánh dấu link đã gửi';
    if(preg_match('~^/api/families/\d+/hand-over$~D',$route))return 'Cho khách vào Family mới';
    if(preg_match('~^/api/invites/\d+$~D',$route))return $method==='DELETE'?'Xóa link mời':'Sửa link mời';
    if($route==='/api/moves')return 'Chuyển Family';
    if(preg_match('~^/api/moves/\d+$~D',$route))return 'Sửa chuyển nhóm';
    if($route==='/api/lookup-settings')return 'Sửa trang tra cứu';
    if($route==='/api/lookup-codes')return 'Sửa mã tra cứu';
    return '';
}
