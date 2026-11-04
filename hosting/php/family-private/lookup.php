<?php
declare(strict_types=1);
// Tra cứu & chuyển nhóm: Family status for customers, invite link pools, bulk moves
// with one invite per customer, and the public lookup page (Gmail + personal code).
// Mirrors lookup.js of the Node build; tables come from lookup.sql via ensureLookupSchema().
const LOOKUP_FAMILY_STATUSES=['active','checking','scanned','disabled'];
const LOOKUP_PROBLEM_STATUSES=['checking','scanned','disabled'];
const LOOKUP_OPEN_STATES=['assigned','opened','failed'];
const LOOKUP_REPORT_REASONS=['twelve_months','invite_used','other_family','other'];
const LOOKUP_BACKUP_TABLES=['family_statuses','family_invites','member_moves','lookup_codes','lookup_settings'];
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
        if(lookupInviteHolder(lookupInviteRefs($db,(int)$i['id']))['state']!=='ready')fail('Link '.($i['label']?:'#'.$i['id']).' đã được giao hoặc đã dùng. Chọn link khác.',409);
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
            if($mv['invite_id']!==null)q($db,'UPDATE family_invites SET revision=revision+1,updated_at=? WHERE id=?',[$now,$mv['invite_id']]);
            logEntry($db,"Cá nhân: thu hồi link {$mv['invite_label']} của {$mv['email']}, trả về kho {$mv['to_family_name']}");
        }elseif($action==='reassign'){
            if(!$open||!$live)fail('Chỉ đổi link cho khách đang chờ vào Family mới.',409);
            $i=is_int($d['invite_id']??null)?one($db,'SELECT * FROM family_invites WHERE id=?',[$d['invite_id']]):false;
            if(!$i||(int)$i['family_id']!==(int)$mv['to_family_id']||!is_int($d['invite_revision']??null)||(int)$i['revision']!==$d['invite_revision'])fail('Link mời đã thay đổi. Tải lại rồi chọn lại.',409);
            if($mv['invite_id']!==null&&(int)$i['id']===(int)$mv['invite_id'])fail('Chọn link khác link hiện tại.');
            if(lookupInviteHolder(lookupInviteRefs($db,(int)$i['id']))['state']!=='ready')fail('Link mời đã được giao hoặc đã dùng. Chọn link khác.',409);
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
    $invites=array_map(function($i)use($byInvite){$h=lookupInviteHolder($byInvite[(int)$i['id']]??[]);return [...$i,'expires_on'=>lookupInviteExpiry($i['sent_on']),'holder_state'=>$h['state'],'holder_move_id'=>$h['move']?(int)$h['move']['id']:null,'holder_email'=>$h['move']['email']??'','holder_name'=>$h['move']['customer_name']??''];},all($db,'SELECT * FROM family_invites ORDER BY family_id,id'));
    $moves=array_map(function($mv){$live=$mv['member_family_id']!==null&&$mv['to_family_id']!==null&&(int)$mv['member_family_id']===(int)$mv['to_family_id'];return [...$mv,'live'=>$live,'effective_state'=>in_array($mv['state'],LOOKUP_OPEN_STATES,true)&&!$live?'stale':$mv['state']];},all($db,"SELECT mv.*,m.family_id AS member_family_id FROM member_moves mv LEFT JOIN members m ON m.id=mv.member_id WHERE mv.dismissed_at='' ORDER BY mv.id DESC LIMIT 500"));
    $codes=[];foreach(all($db,'SELECT DISTINCT email FROM members') as $r)$codes[$r['email']]=lookupCodeFor($db,$r['email'],$salt);
    return ['lookup_supported'=>true,'lookup_settings'=>lookupSettings($db),'family_statuses'=>all($db,'SELECT family_id,status,note,updated_at,revision FROM family_statuses'),'invites'=>$invites,'moves'=>$moves,'lookup_codes'=>(object)$codes];
}

// ---- Public lookup (customer) ----
function lookupResult(PDO $db,string $address): array {
    $items=[];
    foreach(all($db,"SELECT m.*,f.name AS family_name FROM members m JOIN families f ON f.id=m.family_id WHERE m.email=? AND f.archived_at='' ORDER BY m.id",[$address]) as $m){
        $status=lookupStatusRow($db,(int)$m['family_id']);$period=expiry($m['expires_at']);
        $latest=one($db,"SELECT * FROM member_moves WHERE member_id=? AND state<>'cancelled' AND dismissed_at='' ORDER BY id DESC LIMIT 1",[$m['id']]);$move=null;
        if($latest&&$latest['to_family_id']!==null&&(int)$latest['to_family_id']===(int)$m['family_id']){
            $open=in_array($latest['state'],LOOKUP_OPEN_STATES,true);$invite=$open&&$latest['invite_id']!==null?one($db,'SELECT * FROM family_invites WHERE id=?',[$latest['invite_id']]):false;
            $source=$latest['from_family_id']!==null&&lookupActiveFamily($db,(int)$latest['from_family_id'])?lookupStatusRow($db,(int)$latest['from_family_id']):null;
            $move=['id'=>(int)$latest['id'],'state'=>$latest['state'],'from_family_name'=>$latest['from_family_name'],'from_status'=>$source?$source['status']:$latest['from_status'],'from_note'=>$source?$source['note']:$latest['from_note'],'invite_url'=>$invite?$invite['url']:'','invite_expires_on'=>$invite?lookupInviteExpiry($invite['sent_on']):'','report_reason'=>$latest['report_reason'],'reported_at'=>$latest['reported_at'],'opened_at'=>$latest['opened_at'],'joined_at'=>$latest['joined_at']];
        }
        $view=$move&&in_array($move['state'],LOOKUP_OPEN_STATES,true)?'move':(in_array($status['status'],LOOKUP_PROBLEM_STATUSES,true)?($period['expiry_status']==='expired'?'expired':'incident'):($period['expiry_status']==='expired'?'expired':'normal'));
        $items[]=['customer_name'=>$m['customer_name'],'family_name'=>$m['family_name'],'plan_months'=>(int)$m['plan_months'],'expires_at'=>$m['expires_at'],...$period,'membership_status'=>$m['membership_status'],'status'=>$status['status'],'status_note'=>$status['note'],'status_updated_at'=>$status['updated_at'],'view'=>$view,'move'=>$move];
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
    if(preg_match('~^/api/invites/\d+$~D',$route))return $method==='DELETE'?'Xóa link mời':'Sửa link mời';
    if($route==='/api/moves')return 'Chuyển Family';
    if(preg_match('~^/api/moves/\d+$~D',$route))return 'Sửa chuyển nhóm';
    if($route==='/api/lookup-settings')return 'Sửa trang tra cứu';
    if($route==='/api/lookup-codes')return 'Sửa mã tra cứu';
    return '';
}
