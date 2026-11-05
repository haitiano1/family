<?php
declare(strict_types=1);
// Logic check for family-private/lookup.php on SQLite (MySQL DDL translated), run by test/lookup-php.test.js.
// The MySQL/HTTP path is covered by hosting/php/verify.mjs; this keeps PHP and Node rules in step without Docker.
$root=dirname(__DIR__).'/hosting/php/family-private';
require $root.'/core.php';require $root.'/business.php';require $root.'/lookup.php';
function check(bool $ok,string $message): void {if(!$ok){fwrite(STDERR,"FAIL: $message\n");exit(1);}}
function fails(callable $f,int $status,string $message): FamilyError {try{$f();}catch(FamilyError $e){check($e->status===$status,"$message (status {$e->status}: {$e->getMessage()})");return $e;}check(false,"$message (no error)");exit(1);}
function sqlite(string $sql): string {
    $sql=preg_replace('/\)\s*ENGINE=.*$/s',')',$sql);$sql=preg_replace('/,KEY [a-z_]+\([a-z_]+\)/','',$sql);
    return str_replace('INT PRIMARY KEY AUTO_INCREMENT','INTEGER PRIMARY KEY AUTOINCREMENT',$sql);
}
$db=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);$db->exec('PRAGMA foreign_keys=ON');
foreach([$root.'/schema.sql',$root.'/features.sql',$root.'/vault.sql',$root.'/lookup.sql'] as $file)foreach(explode(';',file_get_contents($file)) as $sql)if(trim($sql))$db->exec(sqlite($sql));
$db->exec("ALTER TABLE families ADD COLUMN trial_date VARCHAR(10) NOT NULL DEFAULT ''");$db->exec("ALTER TABLE families ADD COLUMN archived_at VARCHAR(32) NOT NULL DEFAULT ''");$db->exec('ALTER TABLE vault_items ADD COLUMN family_id INT NULL');
$salt=$argv[1]??str_repeat('a',64);q($db,"INSERT INTO lookup_settings(name,value) VALUES ('code_salt',?)",[$salt]);
$day=fn(int $n)=>(new DateTimeImmutable(today(),new DateTimeZone('UTC')))->modify("$n days")->format('Y-m-d');
$family=function(string $name,string $mail)use($db){q($db,'INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)',[$mail,'',stamp()]);q($db,'INSERT INTO families(name,manager_id,created_at) VALUES (?,?,?)',[$name,(int)$db->lastInsertId(),stamp()]);return (int)$db->lastInsertId();};
$member=function(int $f,string $mail,string $name,string $expires)use($db){q($db,"INSERT INTO members(family_id,email,customer_name,expires_at,plan_months,membership_status) VALUES (?,?,?,?,6,'active')",[$f,$mail,$name,$expires]);return (int)$db->lastInsertId();};
$old=$family('Family 04','owner04@example.com');$new=$family('Family 09','owner09@example.com');
$minh=$member($old,'minhanh@example.com','Minh Anh',$day(38));$huy=$member($old,'giahuy@example.com','Gia Huy',$day(62));$bao=$member($old,'quocbao@example.com','Quốc Bảo',$day(-53));
q($db,"INSERT INTO issues(family_id,family_name,target_type,target_id,subject_email,original_email,title,created_at,updated_at) VALUES (?,?,'member',?,?,?,'Lỗi',?,?)",[$old,'Family 04',$minh,'minhanh@example.com','minhanh@example.com',stamp(),stamp()]);

check(lookupNormalizeCode(' k7p-2qx ')==='K7P2QX'&&lookupNormalizeCode('K7P2Q0')==='','code normalization');
check(lookupGoogleUrl('https://notifications.googleapis.com/email/redirect?t=1')&&!lookupGoogleUrl('https://google.com.evil.example/x')&&!lookupGoogleUrl('http://myaccount.google.com/x')&&!lookupGoogleUrl('javascript:alert(1)'),'invite URL allowlist');
check(lookupInviteExpiry($day(-3))===$day(11)&&lookupInviteExpiry('')==='','invite expiry');

fails(fn()=>lookupSaveStatus($db,$old,['status'=>'broken','revision'=>0]),400,'unknown status');
lookupSaveStatus($db,$old,['status'=>'disabled','note'=>'Tài khoản chủ bị khoá.','revision'=>0]);
fails(fn()=>lookupSaveStatus($db,$old,['status'=>'scanned','revision'=>0]),409,'stale status revision');
fails(fn()=>lookupSaveInvite($db,$new,null,['url'=>'https://example.com/x']),400,'non-Google invite');
$inv=[];for($i=1;$i<=3;$i++)$inv[$i]=lookupSaveInvite($db,$new,null,['label'=>"shop+$i@gmail.com",'url'=>"https://myaccount.google.com/family/join/t$i",'sent_on'=>$day(-3)])['id'];
fails(fn()=>lookupSaveInvite($db,$old,null,['url'=>'https://myaccount.google.com/family/join/t1']),409,'duplicate invite');
$state=lookupAdminState($db);
check(array_column($state['invites'],'holder_state')===['ready','ready','ready'],'invites start ready');
$codes=(array)$state['lookup_codes'];check($codes['minhanh@example.com']===lookupDerivedCode($salt,'minhanh@example.com'),'derived code in state');
echo json_encode(['codes'=>$codes]),"\n";

$a=fn(int $m,int $i)=>['member_id'=>$m,'revision'=>(int)one($db,'SELECT renewal_revision FROM members WHERE id=?',[$m])['renewal_revision'],'expected_email'=>one($db,'SELECT email FROM members WHERE id=?',[$m])['email'],'invite_id'=>$i,'invite_revision'=>(int)one($db,'SELECT revision FROM family_invites WHERE id=?',[$i])['revision']];
$base=['from_family_id'=>$old,'to_family_id'=>$new,'expected_manager_email'=>'owner09@example.com'];
fails(fn()=>lookupBulkMove($db,[...$base,'assignments'=>[$a($minh,$inv[1]),$a($huy,$inv[1])]]),400,'same invite twice');
fails(fn()=>lookupBulkMove($db,[...$base,'expected_manager_email'=>'x@example.com','assignments'=>[$a($minh,$inv[1])]]),409,'changed target owner');
$moved=lookupBulkMove($db,[...$base,'assignments'=>[$a($minh,$inv[1]),$a($huy,$inv[2])]]);
check($moved['moved']===2,'two moved');
check(one($db,'SELECT family_id,membership_status FROM members WHERE id=?',[$minh])===['family_id'=>$new,'membership_status'=>'invited'],'member moved as invited');
check((int)one($db,'SELECT COUNT(*) AS n FROM issues')['n']===0,'customer case removed');
check(array_column(lookupAdminState($db)['invites'],'holder_state')===['assigned','assigned','ready'],'invites assigned');
fails(fn()=>lookupBulkMove($db,[...$base,'assignments'=>[$a($bao,$inv[1])]]),409,'assigned invite cannot be reused');

fails(fn()=>lookupVerify($db,['email'=>'minhanh@example.com','code'=>'AAAAAA'],'1.1.1.1'),401,'wrong code');
fails(fn()=>lookupVerify($db,['email'=>'minhanh@example.com','code'=>'12'],'1.1.1.1'),400,'short code');
$v=lookupVerify($db,['email'=>' MinhAnh@Example.com ','code'=>strtolower($codes['minhanh@example.com'])],'1.1.1.1');
check(lookupSessionEmail($db,$v['token'])==='minhanh@example.com','session');
$item=$v['result']['items'][0];
check($item['view']==='move'&&$item['family_name']==='Family 09'&&$item['move']['from_status']==='disabled'&&$item['move']['invite_url']==='https://myaccount.google.com/family/join/t1'&&$item['move']['invite_expires_on']===$day(11),'move view');
check(!str_contains(json_encode($v['result']),'owner0')&&!str_contains(json_encode($v['result']),'giahuy'),'no other emails');
lookupCustomerOpen($db,'minhanh@example.com',['move_id'=>$item['move']['id']]);
check(one($db,'SELECT state FROM member_moves WHERE id=?',[$item['move']['id']])['state']==='opened','opened');
fails(fn()=>lookupCustomerReport($db,'minhanh@example.com',['move_id'=>$item['move']['id'],'reason'=>'x']),400,'bad reason');
$r=lookupCustomerReport($db,'minhanh@example.com',['move_id'=>$item['move']['id'],'reason'=>'twelve_months','note'=>'12 tháng']);
check($r['items'][0]['move']['state']==='failed'&&$r['items'][0]['view']==='move','reported');
fails(fn()=>lookupCustomerOpen($db,'giahuy@example.com',['move_id'=>$item['move']['id']]),404,'other customer cannot touch the move');
$r=lookupCustomerJoined($db,'minhanh@example.com',['move_id'=>$item['move']['id']]);
check($r['items'][0]['view']==='normal'&&$r['items'][0]['move']['state']==='joined'&&$r['items'][0]['move']['invite_url']==='','joined view');
check(one($db,'SELECT membership_status FROM members WHERE id=?',[$minh])['membership_status']==='active','member active');
check(array_column(lookupAdminState($db)['invites'],'holder_state')===['used','assigned','ready'],'invite used');

$expired=lookupVerify($db,['email'=>'quocbao@example.com','code'=>$codes['quocbao@example.com']],'1.1.1.2')['result']['items'][0];
check($expired['view']==='incident'&&$expired['status']==='disabled'&&$expired['move']===null,'past expiry still sees the incident');

$moves=lookupAdminState($db)['moves'];$huyMove=array_values(array_filter($moves,fn($m)=>$m['email']==='giahuy@example.com'))[0];
fails(fn()=>lookupUpdateMove($db,(int)$huyMove['id'],['action'=>'dismiss','revision'=>(int)$huyMove['revision']]),409,'cannot hide an open move');
lookupUpdateMove($db,(int)$huyMove['id'],['action'=>'reassign','invite_id'=>$inv[3],'invite_revision'=>(int)one($db,'SELECT revision FROM family_invites WHERE id=?',[$inv[3]])['revision'],'revision'=>(int)$huyMove['revision']]);
check(array_column(lookupAdminState($db)['invites'],'holder_state')===['used','ready','assigned'],'reassigned');
fails(fn()=>lookupDeleteInvite($db,$inv[3],['revision'=>(int)one($db,'SELECT revision FROM family_invites WHERE id=?',[$inv[3]])['revision']]),409,'assigned invite cannot be deleted');
$huyMove=one($db,'SELECT * FROM member_moves WHERE id=?',[$huyMove['id']]);
lookupUpdateMove($db,(int)$huyMove['id'],['action'=>'release','revision'=>(int)$huyMove['revision']]);
check(array_column(lookupAdminState($db)['invites'],'holder_state')===['used','ready','ready'],'released');

for($i=0;$i<8;$i++)fails(fn()=>lookupVerify($db,['email'=>'giahuy@example.com','code'=>$codes['giahuy@example.com']==='AAAAAA'?'BBBBBB':'AAAAAA'],'9.9.9.9'),401,'wrong attempt');
fails(fn()=>lookupVerify($db,['email'=>'giahuy@example.com','code'=>$codes['giahuy@example.com']],'9.9.9.9'),429,'rate limited');
$rotated=lookupRotateCode($db,['email'=>'minhanh@example.com']);
check($rotated['code']!==$codes['minhanh@example.com']&&lookupSessionEmail($db,$v['token'])===null,'rotated code revokes sessions');
fails(fn()=>lookupVerify($db,['email'=>'minhanh@example.com','code'=>$codes['minhanh@example.com']],'1.1.1.3'),401,'old code refused');
lookupVerify($db,['email'=>'minhanh@example.com','code'=>$rotated['code']],'1.1.1.3');

lookupSaveSettings($db,['shop_name'=>'Shop','contact_url'=>'https://m.me/shop','contact_label'=>'Nhắn','help_text'=>'8h–22h']);
fails(fn()=>lookupSaveSettings($db,['contact_url'=>'javascript:alert(1)']),400,'contact URL');
check(lookupSettings($db)===['shop_name'=>'Shop','contact_url'=>'https://m.me/shop','contact_label'=>'Nhắn','help_text'=>'8h–22h'],'settings without salt');
// Gen mail mời: same address shape as the Node build, never repeated, owner Gmail refused.
$made=lookupGenerateInviteMails($db,$new,['count'=>3,'base_email'=>' HaiHoangrr+x@Gmail.com ']);
check(count($made['mails'])===3&&count(array_unique($made['mails']))===3&&$made['base_email']==='haihoangrr@gmail.com','generated addresses');
foreach($made['mails'] as $x)check(preg_match('/^haihoangrr\+[a-hj-km-np-z2-9]{6}@gmail\.com$/D',$x)===1,'address shape '.$x);
fails(fn()=>lookupGenerateInviteMails($db,$new,['count'=>6,'base_email'=>'a@gmail.com']),400,'at most 5');
fails(fn()=>lookupGenerateInviteMails($db,$new,['count'=>'2','base_email'=>'a@gmail.com']),400,'integer count');
fails(fn()=>lookupGenerateInviteMails($db,$new,['count'=>1,'base_email'=>'owner09+z@example.com']),400,'owner Gmail refused');
$all=$made['mails'];for($i=0;$i<10;$i++)$all=[...$all,...lookupGenerateInviteMails($db,$old,['count'=>5,'base_email'=>'haihoangrr@gmail.com'])['mails']];check(count(array_unique($all))===53,'never generated twice');
$state=lookupAdminState($db);check(array_slice(array_column($state['invite_mails'],'email'),0,3)===$made['mails']&&$state['invite_mails'][0]['family_id']===$new&&$state['invite_base_email']==='haihoangrr@gmail.com','state lists generated addresses');
// Đã gửi: a ready link ticked as sent is not handed out until unticked; a used link cannot be ticked.
$rev=fn(int $i)=>(int)one($db,'SELECT revision FROM family_invites WHERE id=?',[$i])['revision'];
fails(fn()=>lookupMarkInviteSent($db,$inv[1],['sent'=>true,'revision'=>$rev($inv[1])]),409,'used link cannot be ticked');
lookupMarkInviteSent($db,$inv[3],['sent'=>true,'revision'=>$rev($inv[3])]);
check(array_column(lookupAdminState($db)['invites'],'holder_state')===['used','ready','sent'],'sent state');
check(str_contains(fails(fn()=>lookupBulkMove($db,[...$base,'assignments'=>[$a($bao,$inv[3])]]),409,'sent link not moved')->getMessage(),'đã gửi'),'refused because it was sent');
lookupMarkInviteSent($db,$inv[3],['sent'=>false,'revision'=>$rev($inv[3])]);check(array_column(lookupAdminState($db)['invites'],'holder_state')===['used','ready','ready'],'unticked');
$backup=backup($db);check($backup['version']===10&&count($backup['tables']['member_moves'])===2&&count($backup['tables']['family_invites'])===3&&count($backup['tables']['invite_mails'])===53,'backup v10 tables');
check(lookupAuditAction('POST','/api/moves')==='Chuyển Family'&&auditActionLabel('PATCH','/api/families/3/status')==='Sửa trạng thái Family','audit labels');
// New customers ("Đã mời, chưa vào" / "Mua mới") get one link of their own Family on lookup.
$f12=$family('Family 12','vicakarl2@example.com');
$join=function(string $mail,string $status,int $days)use($db,$f12,$day){q($db,'INSERT INTO members(family_id,email,customer_name,expires_at,plan_months,membership_status,joined_at) VALUES (?,?,?,?,1,?,?)',[$f12,$mail,$mail,$day($days),$status,$day(0)]);return (int)$db->lastInsertId();};
$an=$join('an@example.com','invited',90);$join('binh@example.com','new',90);$join('chi@example.com','active',90);$join('em@example.com','invited',90);
lookupSaveInvite($db,$f12,null,['label'=>'cu','url'=>'https://families.google.com/join/promo/p0','sent_on'=>$day(-20)]);
$p1=lookupSaveInvite($db,$f12,null,['label'=>'a','url'=>'https://families.google.com/join/promo/p1','sent_on'=>$day(-2)])['id'];
lookupSaveInvite($db,$f12,null,['label'=>'b','url'=>'https://families.google.com/join/promo/p2','sent_on'=>$day(-1)]);
$item=lookupResult($db,'an@example.com')['items'][0];check($item['view']==='move'&&$item['move']['kind']==='join'&&$item['move']['invite_url']==='https://families.google.com/join/promo/p1','oldest valid link handed out');
check(lookupResult($db,'an@example.com')['items'][0]['move']['invite_url']==='https://families.google.com/join/promo/p1','same link on every lookup');
check(lookupResult($db,'binh@example.com')['items'][0]['move']['invite_url']==='https://families.google.com/join/promo/p2','Mua mới gets the next link');
check(lookupResult($db,'chi@example.com')['items'][0]['view']==='normal','customer in the group gets nothing');
check(lookupResult($db,'em@example.com')['items'][0]['view']==='waiting','pool used up');
check(one($db,'SELECT sent_at FROM family_invites WHERE id=?',[$p1])['sent_at']!==''&&(int)one($db,'SELECT COUNT(*) AS n FROM member_moves WHERE invite_id=?',[$p1])['n']===1,'ticked and held once');
lookupCustomerJoined($db,'an@example.com',['move_id'=>$item['move']['id']]);check(one($db,'SELECT membership_status FROM members WHERE id=?',[$an])['membership_status']==='active','joined');
// Deleting addresses made by mistake: only those still waiting for a link, only in their Family.
$mistake=lookupGenerateInviteMails($db,$f12,['count'=>2])['mails'];$mid=fn(string $x)=>(int)one($db,'SELECT id FROM invite_mails WHERE email=?',[$x])['id'];
fails(fn()=>lookupDeleteInviteMails($db,$f12,['ids'=>[]]),400,'ids required');fails(fn()=>lookupDeleteInviteMails($db,$new,['ids'=>[$mid($mistake[0])]]),409,'other Family');
lookupSaveInvite($db,$f12,null,['label'=>$mistake[1],'url'=>'https://families.google.com/join/promo/del','sent_on'=>$day(0)]);fails(fn()=>lookupDeleteInviteMails($db,$f12,['ids'=>[$mid($mistake[1])]]),409,'address with a link stays');
check(lookupDeleteInviteMails($db,$f12,['ids'=>[$mid($mistake[0])]])===['ok'=>true,'deleted'=>1]&&!one($db,'SELECT id FROM invite_mails WHERE email=?',[$mistake[0]]),'deleted');
echo "ok\n";
function auditActionLabel(string $m,string $r): string {require_once dirname(__DIR__).'/hosting/php/family-private/audit.php';return auditAction($m,$r);}
