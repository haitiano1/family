<?php
declare(strict_types=1);
// Logic check for the Mã tra cứu tab and Gmail invite import (sheets.php + lookup.php), run by test/sheets-lookup.test.js.
// It drives the real sheetsSync() on SQLite with a fake Apps Script; MySQL-only SQL (named locks,
// upserts, row locks) is translated. hosting/php/verify.mjs runs the same flow on MySQL.
$root=dirname(__DIR__).'/hosting/php/family-private';
foreach(['core','business','audit','vault','records','issues','sheets','lookup'] as $file)require "$root/$file.php";
function check(bool $ok,string $message): void {if(!$ok){fwrite(STDERR,"FAIL: $message\n");exit(1);}}
function fails(callable $f,int $status,string $message): FamilyError {try{$f();}catch(FamilyError $e){check($e->status===$status,"$message (status {$e->status}: {$e->getMessage()})");return $e;}check(false,"$message (no error)");throw new RuntimeException('unreachable');}
final class SqliteAsMysql extends PDO {
    public static function sql(string $sql): string {
        $sql=preg_replace('/\)\s*ENGINE=.*$/s',')',$sql);$sql=preg_replace('/,\s*(?:UNIQUE )?KEY [a-z_]+\([a-z_, ]+\)/','',$sql);
        $sql=str_replace(['INT PRIMARY KEY AUTO_INCREMENT','BIGINT PRIMARY KEY AUTO_INCREMENT',' FOR UPDATE','INSERT IGNORE'],['INTEGER PRIMARY KEY AUTOINCREMENT','INTEGER PRIMARY KEY AUTOINCREMENT','','INSERT OR IGNORE'],$sql);
        return str_replace('ON DUPLICATE KEY UPDATE value=VALUES(value)','ON CONFLICT(name) DO UPDATE SET value=excluded.value',$sql);
    }
    public function prepare(string $query,array $options=[]): PDOStatement|false {return parent::prepare(self::sql($query),$options);}
    public function exec(string $statement): int|false {return parent::exec(self::sql($statement));}
}
$db=new SqliteAsMysql('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$locks=[];
$db->sqliteCreateFunction('CONNECTION_ID',fn()=>1,0);
$db->sqliteCreateFunction('IS_USED_LOCK',function($name)use(&$locks){return $locks[$name]??null;},1);
$db->sqliteCreateFunction('GET_LOCK',function($name,$wait)use(&$locks){$locks[$name]=1;return 1;},2);
$db->sqliteCreateFunction('RELEASE_LOCK',function($name)use(&$locks){$held=isset($locks[$name]);unset($locks[$name]);return $held?1:null;},1);
foreach(['schema.sql','features.sql','vault.sql','lookup.sql'] as $file)foreach(explode(';',file_get_contents("$root/$file")) as $sql)if(trim($sql))$db->exec($sql);
$db->exec("ALTER TABLE families ADD COLUMN trial_date VARCHAR(10) NOT NULL DEFAULT ''");$db->exec("ALTER TABLE families ADD COLUMN archived_at VARCHAR(32) NOT NULL DEFAULT ''");$db->exec('ALTER TABLE vault_items ADD COLUMN family_id INT NULL');$db->exec("ALTER TABLE issues ADD COLUMN trial_date VARCHAR(10) NOT NULL DEFAULT ''");$db->exec("ALTER TABLE issues ADD COLUMN reported_on VARCHAR(10) NOT NULL DEFAULT ''");$db->exec('ALTER TABLE archived_customers ADD COLUMN family_archive_id BIGINT NULL');
q($db,"INSERT INTO lookup_settings(name,value) VALUES ('code_salt',?)",[str_repeat('5a',32)]);
$c=['db_name'=>'family_test','db_password'=>'fake-db-password','access_password'=>'fake-access-password','db_host'=>'localhost'];
sheetsPut($db,'config',vaultSeal(json_encode(['url'=>'https://script.google.com/macros/s/test/exec','token'=>str_repeat('t',64)]),sheetsKey($c),'family-sheets-config-v1'));

beginAudit($db,'Dữ liệu giả');
$a=saveFamilyRecord($db,null,['name'=>'Family 04','manager_email'=>'owner04@example.com'])['id'];$b=saveFamilyRecord($db,null,['name'=>'Family 09','manager_email'=>'owner09@example.com'])['id'];
saveMemberRecord($db,null,['family_id'=>$a,'email'=>'minhanh@example.com','customer_name'=>'Minh Anh']);saveMemberRecord($db,null,['family_id'=>$a,'email'=>'giahuy@example.com','customer_name'=>'']);
saveMemberRecord($db,null,['family_id'=>$b,'email'=>'giahuy@example.com','customer_name'=>'Gia Huy']);saveMemberRecord($db,null,['family_id'=>$b,'email'=>'hoangnam@example.com','customer_name'=>'Hoàng Nam']);
finishAudit();

// Fake Apps Script: v5.8 reports lookup_codes and returns codes only once the tab exists.
$cloud=['families'=>[],'members'=>[]];$script='v5.8';$writes=[];
$send=function(array $request)use(&$cloud,&$script,&$writes){
    $revision=hash('sha256',json_encode($cloud));$flag=$script==='v5.8'?['lookup_codes'=>'v1']:[];
    if($request['action']==='read')return ['ok'=>true,'data'=>$cloud,'revision'=>$revision,'script_version'=>'family-ma-tra-cuu-'.$script,'customer_layout'=>'grouped',...$flag];
    check($request['revision']===$revision,'CAS revision');$writes[]=$request['data'];
    $cloud=['families'=>$request['data']['families'],'members'=>$request['data']['members'],...(array_key_exists('codes',$request['data'])?['codes'=>$request['data']['codes']]:(isset($cloud['codes'])?['codes'=>$cloud['codes']]:[]))];
    return ['ok'=>true,'script_version'=>'family-ma-tra-cuu-'.$script,'customer_layout'=>'grouped',...$flag];
};
$sync=fn(array $options=[])=>sheetsSync($db,$c,'core',$options,null,$send);
$row=function(string $address)use(&$cloud){foreach($cloud['codes']??[] as $i=>$r)if($r['email']===$address)return $i;return null;};
$code=fn(string $address)=>lookupCodeFor($db,$address);

// An older Apps Script never receives codes.
$script='v5.7';check($sync()['ok'],'sync with v5.7');check(!array_key_exists('codes',end($writes)),'no codes sent to v5.7');check(sheetsMeta($db,'lookup_codes',null)===false,'runtime reports no codes tab');
// After updating Code.gs the website writes the tab: one row per Gmail, customer-tab order, codes as on the web.
$script='v5.8';$result=$sync();check($result['ok'],'first codes export');check(sheetsMeta($db,'lookup_codes',null)===true,'runtime reports codes tab');
check(array_map(fn($r)=>[$r['customer_name'],$r['email'],$r['code']],$cloud['codes'])===[['Minh Anh','minhanh@example.com',$code('minhanh@example.com')],['Gia Huy','giahuy@example.com',$code('giahuy@example.com')],['Hoàng Nam','hoangnam@example.com',$code('hoangnam@example.com')]],'rows, names, order and codes');
check($cloud['codes'][0]['id']===sheetsCodeId('minhanh@example.com')&&preg_match('/^L[a-f0-9]{24}$/D',$cloud['codes'][0]['id'])===1,'stable Gmail-derived ID');
check(($result['sync_report']['counts']['web_to_sheet']['codes']['added']??null)===3,'history counts the new codes');
$count=count($writes);check($sync()['ok'],'repeat');check(count($writes)===$count,'unchanged codes are not rewritten');

// Đổi mã tra cứu on the web reaches the Sheet.
$old=$code('giahuy@example.com');$rotated=lookupRotateCode($db,['email'=>'giahuy@example.com'])['code'];check($rotated!==$old,'rotated');
check($sync()['ok'],'export rotation');check($cloud['codes'][$row('giahuy@example.com')]['code']===$rotated,'rotation on Sheet');

// A code typed on the Sheet becomes the customer's code and signs out open lookup sessions.
q($db,'INSERT INTO lookup_sessions(token_hash,email,expires_at) VALUES (?,?,?)',[str_repeat('a',64),'minhanh@example.com',PHP_INT_MAX]);
$cloud['codes'][$row('minhanh@example.com')]['code']='k7p 2qz';check($sync()['ok'],'import typed code');
check($code('minhanh@example.com')==='K7P2QZ','typed code saved normalized');check(!one($db,'SELECT token_hash FROM lookup_sessions WHERE email=?',['minhanh@example.com']),'sessions revoked');
check($cloud['codes'][$row('minhanh@example.com')]['code']==='K7P2QZ','normalized code written back');
check(str_contains(json_encode(all($db,'SELECT message FROM audit_events'),JSON_UNESCAPED_UNICODE),'đổi mã tra cứu của minhanh@example.com từ Sheet'),'journal entry');
check(lookupVerify($db,['email'=>'minhanh@example.com','code'=>'K7P2QZ'],'1.1.1.1')['result']['email']==='minhanh@example.com','customer signs in with the Sheet code');

// Name and Gmail cells are read-only: edits are reverted, never applied to customers.
$i=$row('hoangnam@example.com');$cloud['codes'][$i]['customer_name']='Tên sai';$cloud['codes'][$i]['email']='other@example.com';$before=$code('hoangnam@example.com');
check($sync()['ok'],'name/email edit');check(one($db,'SELECT customer_name FROM members WHERE email=?',['hoangnam@example.com'])['customer_name']==='Hoàng Nam'&&!one($db,'SELECT id FROM members WHERE email=?',['other@example.com']),'customers untouched');
check($cloud['codes'][$i]===['id'=>sheetsCodeId('hoangnam@example.com'),'customer_name'=>'Hoàng Nam','email'=>'hoangnam@example.com','code'=>$before],'row restored from the web');
// A blank code cell keeps the code; a deleted row comes back; an unknown row is dropped.
$cloud['codes'][$i]['code']='';check($sync()['ok'],'blank code');check($code('hoangnam@example.com')===$before&&$cloud['codes'][$row('hoangnam@example.com')]['code']===$before,'blank keeps code');
array_splice($cloud['codes'],$row('hoangnam@example.com'),1);check($sync()['ok'],'deleted row');check($row('hoangnam@example.com')!==null,'deleted row restored');
$cloud['codes'][]=['id'=>'Lfake','customer_name'=>'Khách lạ','email'=>'stranger@example.com','code'=>'AAAAAA'];check($sync()['ok'],'unknown row');check($row('stranger@example.com')===null&&!one($db,'SELECT id FROM lookup_codes WHERE email=?',['stranger@example.com']),'unknown row dropped');

// An invalid code stops the sync with the Gmail named and changes nothing.
$valid=$cloud;$cloud['codes'][$row('giahuy@example.com')]['code']='GIAHUY1';
$error=fails($sync,409,'invalid code');check(str_contains($error->getMessage(),'giahuy@example.com')&&str_contains($error->getMessage(),'FamilySync_MaTraCuu'),'error names the row');check($code('giahuy@example.com')===$rotated,'invalid code not saved');
$cloud=$valid;check($sync()['ok'],'recovers once fixed');

// Both sides changing one code asks which version to keep.
$web=lookupRotateCode($db,['email'=>'giahuy@example.com'])['code'];$cloud['codes'][$row('giahuy@example.com')]['code']='HX4N9T';
$conflict=$sync();check(!$conflict['ok']&&count($conflict['conflicts'])===1&&$conflict['conflicts'][0]['tab']==='codes'&&$conflict['conflicts'][0]['label']==='Gia Huy','conflict shown with the customer name');
check($sync(['choice'=>'sheet','conflict_token'=>$conflict['conflict_token']])['ok'],'keep Sheet');check($code('giahuy@example.com')==='HX4N9T'&&$web!=='HX4N9T','Sheet version kept');

// Customer changes on the web update the tab.
beginAudit($db,'Dữ liệu giả');saveMemberRecord($db,null,['family_id'=>$b,'email'=>'quocbao@example.com','customer_name'=>'Quốc Bảo']);
$nam=one($db,'SELECT id,family_id FROM members WHERE email=?',['hoangnam@example.com']);saveMemberRecord($db,(int)$nam['id'],['email'=>'hoangnam@example.com','customer_name'=>'Hoàng Nam VIP']);finishAudit();
check($sync()['ok'],'web customer changes');check($cloud['codes'][$row('quocbao@example.com')]['code']===$code('quocbao@example.com')&&$cloud['codes'][$row('hoangnam@example.com')]['customer_name']==='Hoàng Nam VIP','new customer and new name on Sheet');
q($db,'UPDATE families SET archived_at=? WHERE id=?',[stamp(),$a]);check($sync()['ok'],'archived Family');check($row('minhanh@example.com')===null&&$row('giahuy@example.com')!==null,'only customers of active Families listed');
// Going back to an older Apps Script stops sending codes without touching them.
$script='v5.7';$count=count($writes);beginAudit($db,'Dữ liệu giả');saveMemberRecord($db,(int)$nam['id'],['email'=>'hoangnam@example.com','customer_name'=>'Hoàng Nam']);finishAudit();
check($sync()['ok'],'downgrade');check(count($writes)===$count+1&&!array_key_exists('codes',end($writes)),'no codes to v5.7');check(sheetsMeta($db,'lookup_codes',null)===false,'runtime updated');

// ---- Lấy link mời từ Gmail ----
check(lookupAdminState($db)['gmail_import']===true,'Gmail import offered once the Sheet is connected');
beginAudit($db,'Dữ liệu giả');$ten=saveFamilyRecord($db,null,['name'=>'Family 10','manager_email'=>'owner10@example.com'])['id'];finishAudit();
$gmailReply=['ok'=>true,'invites'=>[]];$gmailSend=function(array $request)use(&$gmailReply){check($request===['action'=>'read','scope'=>'invites'],'read-only Gmail request');return $gmailReply;};
$gmail=fn()=>sheetsGmailInvites($db,$c,$gmailSend);
$mail=fn(string $to,string $url,array $emails,string $at)=>['id'=>md5($to.$url),'to'=>$to,'date'=>substr($at,0,10),'sent_at'=>$at,'url'=>$url,'emails'=>$emails];
$invite=fn(int $family,string $label)=>one($db,'SELECT * FROM family_invites WHERE family_id=? AND label=? ORDER BY id DESC LIMIT 1',[$family,$label]);
$gmailReply=['ok'=>false,'code'=>'request'];check(str_contains(fails($gmail,409,'old Apps Script')->getMessage(),'capQuyenGmail'),'old script asks for the new Code.gs');
$gmailReply=['ok'=>false,'code'=>'gmail_permission'];check(str_contains(fails($gmail,502,'no Gmail permission')->getMessage(),'capQuyenGmail'),'permission hint');
$gmailReply=['ok'=>false,'code'=>'gmail_service'];check(str_contains(fails($gmail,502,'no Gmail API')->getMessage(),'Gmail API'),'service hint');
$gmailReply=['ok'=>true,'invites'=>[
    $mail('shop+f09s1@gmail.com','https://families.google.com/join/promo/a1',['owner09@example.com'],'2026-11-03T09:00:00.000Z'),
    $mail('shop+f09s1@gmail.com','https://families.google.com/join/promo/a0',['owner09@example.com'],'2026-11-01T09:00:00.000Z'),
    $mail('Shop+F10s1@gmail.com','https://families.google.com/join/promo/b1',['member@example.com','owner10@example.com'],'2026-11-02T09:00:00.000Z'),
    $mail('shop+f99s1@gmail.com','https://families.google.com/join/promo/c1',['stranger@example.com'],'2026-11-02T09:00:00.000Z'),
    $mail('shop+f04s1@gmail.com','https://families.google.com/join/promo/d1',['owner04@example.com'],'2026-11-02T09:00:00.000Z'),
    $mail('shop+f09s2@gmail.com','https://evil.example/join',['owner09@example.com'],'2026-11-02T09:00:00.000Z'),
    ['to'=>'broken'],
]];
$r=$gmail();check($r['found']===5&&$r['added']===2&&$r['updated']===0&&$r['families']===['Family 09','Family 10'],'two links filed: '.json_encode($r));
check($r['unmatched']===['shop+f99s1@gmail.com','shop+f04s1@gmail.com']&&$r['unmatched_count']===2,'unknown and archived owners reported');
$i1=$invite($b,'shop+f09s1@gmail.com');check($i1['url']==='https://families.google.com/join/promo/a1'&&$i1['sent_on']==='2026-11-03','newest mail per Gmail wins');check($invite($ten,'shop+f10s1@gmail.com')['url']==='https://families.google.com/join/promo/b1','filed under the inviting owner');
check(!one($db,"SELECT id FROM family_invites WHERE url LIKE '%evil%' OR url LIKE '%/c1' OR url LIKE '%/d1'"),'nothing else stored');
check(str_contains(json_encode(all($db,'SELECT action,message FROM audit_events'),JSON_UNESCAPED_UNICODE),'Lấy link mời từ Gmail'),'journal');
$r=$gmail();check($r['added']===0&&$r['updated']===0&&$r['unchanged']===2,'repeat import changes nothing');
// Google sent a new invitation to the same Gmail: the unused link is replaced in place.
$gmailReply['invites'][]=$mail('shop+f09s1@gmail.com','https://families.google.com/join/promo/a2',['owner09@example.com'],'2026-11-04T08:00:00.000Z');
$r=$gmail();check($r['updated']===1&&$r['added']===0,'newer mail updates the ready link');$i2=$invite($b,'shop+f09s1@gmail.com');check($i2['id']===$i1['id']&&$i2['url']==='https://families.google.com/join/promo/a2'&&(int)$i2['revision']===(int)$i1['revision']+1&&$i2['sent_on']==='2026-11-04','same invite, new link');
// A link a customer joined with stays; the new mail becomes another link. An assigned link is replaced so the customer sees it.
$moveTo=function(int $member,int $inviteId)use($db,$b,$ten){$m=one($db,'SELECT * FROM members WHERE id=?',[$member]);$i=one($db,'SELECT revision FROM family_invites WHERE id=?',[$inviteId]);return lookupBulkMove($db,['from_family_id'=>$b,'to_family_id'=>$ten,'expected_manager_email'=>'owner10@example.com','assignments'=>[['member_id'=>$member,'revision'=>(int)$m['renewal_revision'],'expected_email'=>$m['email'],'invite_id'=>$inviteId,'invite_revision'=>(int)$i['revision']]]]);};
$bao=(int)one($db,'SELECT id FROM members WHERE email=?',['quocbao@example.com'])['id'];$used=$invite($ten,'shop+f10s1@gmail.com');$moveTo($bao,(int)$used['id']);
$move=one($db,'SELECT id FROM member_moves WHERE member_id=?',[$bao]);lookupCustomerJoined($db,'quocbao@example.com',['move_id'=>(int)$move['id']]);
$gmailReply['invites'][]=$mail('shop+f10s1@gmail.com','https://families.google.com/join/promo/b2',['owner10@example.com'],'2026-11-04T09:00:00.000Z');
$r=$gmail();check($r['added']===1&&$r['updated']===0,'used link kept, new one added');check(one($db,'SELECT url FROM family_invites WHERE id=?',[$used['id']])['url']==='https://families.google.com/join/promo/b1','used link untouched');
$fresh=$invite($ten,'shop+f10s1@gmail.com');check($fresh['url']==='https://families.google.com/join/promo/b2'&&(int)$fresh['id']!==(int)$used['id'],'second link for the same Gmail');
$nam=(int)one($db,'SELECT id FROM members WHERE email=?',['hoangnam@example.com'])['id'];$moveTo($nam,(int)$fresh['id']);
$gmailReply['invites'][]=$mail('shop+f10s1@gmail.com','https://families.google.com/join/promo/b3',['owner10@example.com'],'2026-11-04T10:00:00.000Z');
$r=$gmail();check($r['updated']===1,'assigned link replaced');$item=lookupResult($db,'hoangnam@example.com')['items'][0];check($item['move']['invite_url']==='https://families.google.com/join/promo/b3','customer sees the new link');
// A link pasted by hand with a later date is not overwritten by an older mail.
beginAudit($db,'Dữ liệu giả');lookupSaveInvite($db,$b,null,['label'=>'shop+f09s3@gmail.com','url'=>'https://families.google.com/join/promo/manual','sent_on'=>'2026-11-04']);finishAudit();
$gmailReply['invites'][]=$mail('shop+f09s3@gmail.com','https://families.google.com/join/promo/older',['owner09@example.com'],'2026-11-02T09:00:00.000Z');
$r=$gmail();check($r['updated']===0&&$invite($b,'shop+f09s3@gmail.com')['url']==='https://families.google.com/join/promo/manual','newer manual link kept');
$gmailReply=['ok'=>true,'invites'=>'oops'];fails($gmail,502,'malformed reply');
// Gen mail mời: a generated address files its link under its Family even when the mail
// lacks the owner Gmail; an owner match elsewhere wins (that is the group the link joins).
$gen=lookupGenerateInviteMails($db,$ten,['count'=>2,'base_email'=>'hai@gmail.com'])['mails'];
$gmailReply=['ok'=>true,'mailbox'=>'Hai@gmail.com','invites'=>[
    $mail($gen[0],'https://families.google.com/join/promo/g1',[],'2026-11-05T01:00:00.000Z'),
    $mail($gen[1],'https://families.google.com/join/promo/g2',['owner09@example.com'],'2026-11-05T01:01:00.000Z'),
]];
$r=$gmail();check($r['added']===2&&$r['mailbox']==='hai@gmail.com','generated addresses filed: '.json_encode($r));
check($invite($ten,$gen[0])['url']==='https://families.google.com/join/promo/g1','alias decides when the owner is not in the mail');
check($invite($b,$gen[1])['url']==='https://families.google.com/join/promo/g2'&&!$invite($ten,$gen[1]),'owner decides when it disagrees');
check($r['mismatched']===[['email'=>$gen[1],'generated_for'=>'Family 10','invited_by'=>'Family 09']],'mismatch reported');
$state=lookupAdminState($db);check($state['gmail_mailbox']==='hai@gmail.com'&&$state['invite_base_email']==='haihoangrr@gmail.com','mailbox remembered, inbox fixed');
$fixed=lookupGenerateInviteMails($db,$ten,['count'=>1])['mails'][0];check(preg_match('/^haihoangrr\+[a-hj-km-np-z2-9]{6}@gmail\.com$/D',$fixed)===1,'default inbox haihoangrr@gmail.com');
// A link ticked Đã gửi is kept when Google sends a newer invitation to the same address.
$g1=$invite($ten,$gen[0]);lookupMarkInviteSent($db,(int)$g1['id'],['sent'=>true,'revision'=>(int)$g1['revision']]);
$gmailReply['invites'][]=$mail($gen[0],'https://families.google.com/join/promo/g1-new',[],'2026-11-05T02:00:00.000Z');
$r=$gmail();check($r['added']===1&&$r['updated']===0,'sent link kept, new link added');check(one($db,'SELECT url FROM family_invites WHERE id=?',[$g1['id']])['url']==='https://families.google.com/join/promo/g1','sent link unchanged');
// Fix lỗi drives the Family status: owner mail reported → Bị quét; case done → Đang hoạt động.
$statusOf=fn(int $f)=>lookupStatusRow($db,$f)['status'];
check($statusOf($ten)==='active','starts active');
beginAudit($db,'Báo lỗi thử');$case=saveIssue($db,null,['family_id'=>$ten,'target_type'=>'manager','title'=>'Mail chủ bị quét']);finishAudit();
check($statusOf($ten)==='scanned'&&str_contains(lookupStatusRow($db,$ten)['note'],'Nhóm Youtube của bạn bị Google quét'),'owner mail report marks Bị quét');
$issue=one($db,'SELECT * FROM issues WHERE id=?',[$case['id']]);
beginAudit($db,'Fix thử');saveIssue($db,$case['id'],['revision'=>(int)$issue['revision'],'status'=>'done','resolution'=>'replace','replacement_email'=>'owner10-new@example.com','expected_email'=>'owner10@example.com']);finishAudit();
check($statusOf($ten)==='active'&&lookupStatusRow($db,$ten)['note']==='','done case puts the Family back to Đang hoạt động');
check(str_contains(json_encode(all($db,'SELECT message FROM audit_events'),JSON_UNESCAPED_UNICODE),'Tự động: đặt trạng thái Family 10 là Bị quét'),'journal');
$customer=(int)one($db,'SELECT id FROM members WHERE family_id=? LIMIT 1',[$b])['id'];
beginAudit($db,'Báo lỗi khách');saveIssue($db,null,['family_id'=>$b,'target_type'=>'member','target_id'=>$customer,'title'=>'Mail khách lỗi']);finishAudit();check($statusOf($b)==='active','a customer mail report leaves the Family status');
lookupSaveStatus($db,$ten,['status'=>'disabled','note'=>'Tự đặt','revision'=>(int)lookupStatusRow($db,$ten)['revision']]);
beginAudit($db,'Báo lỗi thử');saveIssue($db,null,['family_id'=>$ten,'target_type'=>'manager','title'=>'Lỗi tiếp']);finishAudit();check($statusOf($ten)==='disabled'&&lookupStatusRow($db,$ten)['note']==='Tự đặt','an existing incident status is kept');
// A link held for a customer (handed out on lookup) takes Google's newer link for the same Gmail.
$heldMail=lookupGenerateInviteMails($db,$ten,['count'=>1])['mails'][0];
$gmailReply=['ok'=>true,'invites'=>[$mail($heldMail,'https://families.google.com/join/promo/h1',['owner10-new@example.com'],'2026-11-05T03:00:00.000Z')]];check($gmail()['added']===1,'held link imported');
q($db,"INSERT INTO members(family_id,email,customer_name,expires_at,plan_months,membership_status) VALUES (?,?,?,?,1,'invited')",[$ten,'newbie@example.com','Newbie',(new DateTimeImmutable(today()))->modify('+60 days')->format('Y-m-d')]);
lookupSaveStatus($db,$ten,['status'=>'active','note'=>'','revision'=>(int)lookupStatusRow($db,$ten)['revision']]);
foreach(all($db,"SELECT id FROM family_invites WHERE family_id=? AND sent_at='' AND url<>?",[$ten,'https://families.google.com/join/promo/h1']) as $other)q($db,'UPDATE family_invites SET sent_at=? WHERE id=?',[stamp(),$other['id']]);
$first=lookupResult($db,'newbie@example.com')['items'][0]['move'];check($first['kind']==='join'&&$first['invite_url']==='https://families.google.com/join/promo/h1','customer holds the generated link');
$gmailReply['invites'][]=$mail($heldMail,'https://families.google.com/join/promo/h2',['owner10-new@example.com'],'2026-11-05T04:00:00.000Z');
$r=$gmail();check($r['updated']===1&&$r['added']===0,'held link updated in place');
$again=lookupResult($db,'newbie@example.com')['items'][0]['move'];check($again['id']===$first['id']&&$again['invite_url']==='https://families.google.com/join/promo/h2','same slot, newer link for the same customer');
// Đã fix · Chuyển khách sang Family mới: the case closes and the broken Family stays Bị quét.
beginAudit($db,'Dữ liệu giả');$b=saveFamilyRecord($db,null,['name'=>'Family 15','manager_email'=>'owner15@example.com'])['id'];finishAudit();
beginAudit($db,'Báo lỗi thử');$moving=saveIssue($db,null,['family_id'=>$b,'target_type'=>'manager','title'=>'Bị quét']);finishAudit();check($statusOf($b)==='scanned','reported');
$open=one($db,'SELECT * FROM issues WHERE id=?',[$moving['id']]);
try{beginAudit($db,'Fix thử');saveIssue($db,$moving['id'],['revision'=>(int)$open['revision'],'status'=>'done','resolution'=>'move','move_family_id'=>$b]);finishAudit();check(false,'same Family refused');}catch(FamilyError $e){finishAudit(false);check($e->status===400,'same Family refused');}
q($db,"INSERT INTO members(family_id,email,customer_name,expires_at,plan_months,membership_status) VALUES (?,?,?,?,1,'active')",[$b,'old1@example.com','Khách cũ','2099-01-01']);q($db,"INSERT INTO members(family_id,email,customer_name,expires_at,plan_months,membership_status) VALUES (?,?,?,?,1,'active')",[$ten,'old1@example.com','Bản trùng','2026-01-01']);
$tenOwner=lookupActiveFamily($db,$ten)['manager_email'];
$over=lookupHandOver($db,$b,['to_family_id'=>$ten,'expected_manager_email'=>$tenOwner]);check($over['moved']===1&&$over['replaced']===1,'hand-over with overwrite');
$moved=all($db,'SELECT * FROM members WHERE email=?',['old1@example.com']);check(count($moved)===1&&(int)$moved[0]['family_id']===$ten&&$moved[0]['customer_name']==='Khách cũ'&&$moved[0]['membership_status']==='active','old record wins, member status kept');
$wait=one($db,"SELECT * FROM member_moves WHERE member_id=? AND to_family_id=? AND state='assigned'",[$moved[0]['id'],$ten]);check($wait&&$wait['invite_id']===null&&$wait['from_family_name']==='Family 15'&&(int)$wait['from_family_id']===$b,'hand-over leaves the customer waiting for a link');
try{lookupHandOver($db,$b,['to_family_id'=>$ten,'expected_manager_email'=>$tenOwner]);check(false,'empty Family refused');}catch(FamilyError $e){check($e->status===409,'empty Family refused');}
beginAudit($db,'Fix thử');saveIssue($db,$moving['id'],['revision'=>(int)$open['revision'],'status'=>'done','resolution'=>'move','move_family_id'=>$ten]);finishAudit();
check(one($db,'SELECT resolution_note FROM issues WHERE id=?',[$moving['id']])['resolution_note']==='Đã chuyển khách sang Family 10.'&&$statusOf($b)==='scanned','move keeps Bị quét');
// ---- Đã fix · Đổi sang mail mới keeps customers in the same Family ----
beginAudit($db,'Dữ liệu giả');$s16=saveFamilyRecord($db,null,['name'=>'Family 16','manager_email'=>'owner16@example.com'])['id'];finishAudit();
foreach(['p1@example.com'=>'active','p2@example.com'=>'invited'] as $address=>$state)q($db,"INSERT INTO members(family_id,email,customer_name,expires_at,plan_months,membership_status) VALUES (?,?,?,?,1,?)",[$s16,$address,'Khách '.$address,'2020-01-01',$state]);
beginAudit($db,'Dữ liệu giả');$oldLink=lookupSaveInvite($db,$s16,null,['label'=>'shop+f16old@gmail.com','url'=>'https://families.google.com/join/promo/f16old','sent_on'=>'2026-11-01'])['id'];finishAudit();
sleep(1);beginAudit($db,'Báo lỗi thử');$c16=saveIssue($db,null,['family_id'=>$s16,'target_type'=>'manager','title'=>'  '])['id'];finishAudit();sleep(1);check(one($db,'SELECT title FROM issues WHERE id=?',[$c16])['title']==='Bị quét','an empty title means Bị quét');
$o16=one($db,'SELECT * FROM issues WHERE id=?',[$c16]);
try{beginAudit($db,'Fix thử');saveIssue($db,$c16,['revision'=>(int)$o16['revision'],'status'=>'done','resolution'=>'replace','replacement_email'=>'owner16-new@example.com','expected_email'=>'owner16@example.com','invite_count'=>6]);finishAudit();check(false,'six mails refused');}catch(FamilyError $e){finishAudit(false);check($e->status===400,'six mails refused');}
beginAudit($db,'Fix thử');$r16=saveIssue($db,$c16,['revision'=>(int)$o16['revision'],'status'=>'done','resolution'=>'replace','replacement_email'=>'owner16-new@example.com','expected_email'=>'owner16@example.com','invite_count'=>2]);finishAudit();
check($r16['waiting_customers']===2&&$r16['retired_links']===1&&count($r16['invite_mails']['mails'])===2,'owner change result: '.json_encode($r16));
check(array_column(all($db,'SELECT membership_status FROM members WHERE family_id=? ORDER BY id',[$s16]),'membership_status')===['active','invited'],'member statuses kept');
check(one($db,'SELECT retired_at FROM family_invites WHERE id=?',[$oldLink])['retired_at']!==''&&$statusOf($s16)==='active','old link retired, Family active');
check(count(all($db,"SELECT id FROM member_moves WHERE to_family_id=? AND state='assigned' AND invite_id IS NULL AND from_status='scanned'",[$s16]))===2,'both customers wait for a link');
$held=array_values(array_filter(lookupAdminState($db)['invites'],fn($i)=>(int)$i['id']===$oldLink));check($held[0]['holder_state']==='retired','admin sees the link as retired');
// Lấy link mời never brings the old link back; a new link of the new owner goes in, even for an old label.
$gmailReply=['ok'=>true,'invites'=>[
    $mail('shop+f16old@gmail.com','https://families.google.com/join/promo/f16old',['owner16@example.com'],'2026-11-01T09:00:00.000Z'),
    $mail('shop+f16old@gmail.com','https://families.google.com/join/promo/f16again',['owner16-new@example.com'],'2026-11-05T09:00:00.000Z'),
    $mail($r16['invite_mails']['mails'][0],'https://families.google.com/join/promo/f16new',['owner16-new@example.com'],'2026-11-05T09:01:00.000Z'),
]];
$r=$gmail();check($r['added']===2&&$r['updated']===0,'new owner links filed: '.json_encode($r));
check(count(all($db,"SELECT id FROM family_invites WHERE family_id=? AND retired_at=''",[$s16]))===2&&one($db,'SELECT url FROM family_invites WHERE id=?',[$oldLink])['url']==='https://families.google.com/join/promo/f16old','retired row untouched');
$code16=(array)lookupAdminState($db)['lookup_codes'];
$p1=lookupVerify($db,['email'=>'p1@example.com','code'=>$code16['p1@example.com']],'1.1.6.1')['result']['items'][0];
check($p1['view']==='move'&&$p1['move']['kind']==='move'&&$p1['move']['from_family_name']==='Family 16'&&in_array($p1['move']['invite_url'],['https://families.google.com/join/promo/f16again','https://families.google.com/join/promo/f16new'],true),'expired customer gets a new owner link: '.json_encode($p1['move']));
$p2=lookupVerify($db,['email'=>'p2@example.com','code'=>$code16['p2@example.com']],'1.1.6.2')['result']['items'][0];
check($p2['move']['invite_url']!==''&&$p2['move']['invite_url']!==$p1['move']['invite_url'],'second customer, second link');
// A prepared Family of the new owner hands over its links and Gen mail.
beginAudit($db,'Dữ liệu giả');$s17=saveFamilyRecord($db,null,['name'=>'Family 17','manager_email'=>'owner17@example.com'])['id'];$s18=saveFamilyRecord($db,null,['name'=>'Family 18','manager_email'=>'owner18@example.com'])['id'];finishAudit();
q($db,"INSERT INTO members(family_id,email,customer_name,expires_at,plan_months,membership_status) VALUES (?,?,?,?,1,'active')",[$s17,'p3@example.com','Khách 3','2099-01-01']);
q($db,"INSERT INTO vault_items(payload,revision,created_at,updated_at,family_id) VALUES ('opaque',0,?,?,?)",[stamp(),stamp(),$s18]);
beginAudit($db,'Dữ liệu giả');$donorLink=lookupSaveInvite($db,$s18,null,['label'=>'shop+f18a@gmail.com','url'=>'https://families.google.com/join/promo/f18a','sent_on'=>'2026-11-05'])['id'];lookupGenerateInviteMails($db,$s18,['count'=>1]);finishAudit();
sleep(1);beginAudit($db,'Báo lỗi thử');$c17=saveIssue($db,null,['family_id'=>$s17,'target_type'=>'manager','title'=>'Bị quét'])['id'];finishAudit();
$o17=one($db,'SELECT * FROM issues WHERE id=?',[$c17]);
beginAudit($db,'Fix thử');$r17=saveIssue($db,$c17,['revision'=>(int)$o17['revision'],'status'=>'done','resolution'=>'replace','replacement_email'=>'owner18@example.com','expected_email'=>'owner17@example.com']);finishAudit();
check($r17['waiting_customers']===1&&!isset($r17['invite_mails'])&&(int)one($db,'SELECT family_id FROM family_invites WHERE id=?',[$donorLink])['family_id']===$s17&&(int)one($db,'SELECT COUNT(*) AS n FROM invite_mails WHERE family_id=?',[$s17])['n']===1,'donor links and Gen mail come along');
$p3=lookupVerify($db,['email'=>'p3@example.com','code'=>((array)lookupAdminState($db)['lookup_codes'])['p3@example.com']],'1.1.6.3')['result']['items'][0];check($p3['move']['invite_url']==='https://families.google.com/join/promo/f18a','customer gets the prepared link');
// ---- Khách báo mất Premium + Telegram ----
$tg=[];$tgUpdates=[];$GLOBALS['family_telegram_transport']=function(string $method,array $params,string $token)use(&$tg,&$tgUpdates){$tg[]=[$method,$params];if($token!=='123456789:AAEgoodtokengoodtokengoodtoken12')return [401,'{"ok":false,"description":"Unauthorized"}'];return [200,json_encode(['ok'=>true,'result'=>$method==='getMe'?['username'=>'haishop_bot']:($method==='getUpdates'?$tgUpdates:[])])];};
try{lookupConnectTelegram($db,['token'=>'bad']);check(false,'bad token');}catch(FamilyError $e){check($e->status===400,'bad token refused');}
try{lookupConnectTelegram($db,['token'=>'123456789:AAEgoodtokengoodtokengoodtoken12']);check(false,'no start');}catch(FamilyError $e){check($e->status===409&&str_contains($e->getMessage(),'@haishop_bot'),'asks for /start');}
$tgUpdates=[['update_id'=>1,'message'=>['chat'=>['id'=>777,'first_name'=>'Hải'],'text'=>'/start']]];
beginAudit($db,'Telegram');$on=lookupConnectTelegram($db,['token'=>'123456789:AAEgoodtokengoodtokengoodtoken12']);finishAudit();
check($on['telegram']===['enabled'=>true,'bot'=>'haishop_bot','chat'=>'Hải']&&end($tg)[0]==='sendMessage'&&end($tg)[1]['chat_id']===777,'connected with a test message');
check(!str_contains(json_encode(lookupAdminState($db)),'AAEgoodtoken')&&!str_contains(json_encode(lookupSettings($db)),'AAEgoodtoken'),'token stays on the server');
beginAudit($db,'Dữ liệu giả');$s40=saveFamilyRecord($db,null,['name'=>'Family 40','manager_email'=>'owner40@example.com'])['id'];finishAudit();
q($db,"INSERT INTO members(family_id,email,customer_name,expires_at,plan_months,membership_status) VALUES (?,?,?,?,1,'active')",[$s40,'lan40@example.com','Lan','2099-01-01']);
$code40=((array)lookupAdminState($db)['lookup_codes'])['lan40@example.com'];
$lan=lookupVerify($db,['email'=>'lan40@example.com','code'=>$code40],'1.1.4.0')['result']['items'][0];check($lan['view']==='normal'&&$lan['problem']===null&&is_int($lan['member_ref']),'normal before the report');
try{lookupCustomerProblem($db,'lan40@example.com',['member'=>$lan['member_ref']+999,'reason'=>'lost_premium']);check(false,'other member');}catch(FamilyError $e){check($e->status===404,'other member refused');}
beginAudit($db,'Khách báo mất Premium','Khách tra cứu');$after=lookupCustomerProblem($db,'lan40@example.com',['member'=>$lan['member_ref'],'reason'=>'lost_premium','note'=>'Mất từ sáng'])['items'][0];finishAudit();
check($after['view']==='reported'&&$after['problem']['state']==='open','reported view');
check(str_contains(end($tg)[1]['text'],"Khách báo mất Premium\nGmail: lan40@example.com\nFamily: Family 40 (owner40@example.com)")&&str_contains(end($tg)[1]['text'],'Ghi chú: Mất từ sáng'),'Telegram message: '.json_encode(end($tg)));
try{lookupCustomerProblem($db,'lan40@example.com',['member'=>$lan['member_ref'],'reason'=>'other']);check(false,'twice');}catch(FamilyError $e){check($e->status===409,'one open report');}
$rep=array_values(array_filter(lookupAdminState($db)['customer_reports'],fn($r)=>$r['email']==='lan40@example.com'))[0];
try{lookupHandleReport($db,$rep['id'],['revision'=>$rep['revision']+1]);check(false,'stale');}catch(FamilyError $e){check($e->status===409,'stale revision refused');}
beginAudit($db,'Xử lý');lookupHandleReport($db,$rep['id'],['revision'=>$rep['revision'],'note'=>'Đã mời lại']);finishAudit();
$lan=lookupResult($db,'lan40@example.com')['items'][0];check($lan['view']==='normal'&&$lan['problem']['handled_note']==='Đã mời lại','handled with a note');
beginAudit($db,'Khách báo mất Premium','Khách tra cứu');lookupCustomerProblem($db,'lan40@example.com',['member'=>$lan['member_ref'],'reason'=>'left_family']);finishAudit();
beginAudit($db,'Báo lỗi thử');saveIssue($db,null,['family_id'=>$s40,'target_type'=>'manager']);finishAudit();
$lan=lookupResult($db,'lan40@example.com')['items'][0];check($lan['view']==='incident'&&$lan['problem']['state']==='handled','incident closes the report');
beginAudit($db,'Telegram');lookupDisconnectTelegram($db);finishAudit();check(lookupTelegramState($db)['enabled']===false,'Telegram off');
$GLOBALS['family_telegram_transport']=function(){check(false,'nothing sent after off');};lookupTelegramNotify($db,'x');
check(count(all($db,'SELECT id FROM customer_reports WHERE email=?',['lan40@example.com']))===2,'both reports kept');
// ---- A waiting customer's lookup reads Gmail by itself ----
beginAudit($db,'Dữ liệu giả');$s50=saveFamilyRecord($db,null,['name'=>'Family 50','manager_email'=>'owner50@example.com'])['id'];finishAudit();
q($db,"INSERT INTO members(family_id,email,customer_name,expires_at,plan_months,membership_status) VALUES (?,?,?,?,1,'invited')",[$s50,'wait50@example.com','Chờ','2099-01-01']);
$code50=((array)lookupAdminState($db)['lookup_codes'])['wait50@example.com'];
$GLOBALS['family_gmail_transport']=function()use(&$gmailReply){return $gmailReply;};$gmailReply=['ok'=>true,'invites'=>[]];
q($db,"DELETE FROM lookup_settings WHERE name='gmail_auto_at'");
$w=lookupWithFreshLinks($db,$c,lookupVerify($db,['email'=>'wait50@example.com','code'=>$code50],'1.1.5.0')['result']);check($w['items'][0]['view']==='waiting','no invitation yet');
$gmailReply=['ok'=>true,'invites'=>[$mail('shop+f50a@gmail.com','https://families.google.com/join/promo/f50a',['owner50@example.com'],'2026-11-05T10:00:00.000Z')]];
$w=lookupWithFreshLinks($db,$c,lookupResult($db,'wait50@example.com'));check($w['items'][0]['view']==='waiting','throttled for a minute');
q($db,"UPDATE lookup_settings SET value='0' WHERE name='gmail_auto_at'");
$w=lookupWithFreshLinks($db,$c,lookupResult($db,'wait50@example.com'));check($w['items'][0]['view']==='move'&&$w['items'][0]['move']['invite_url']==='https://families.google.com/join/promo/f50a','link read from Gmail on lookup: '.json_encode($w['items'][0]));
unset($GLOBALS['family_gmail_transport']);
check(lookupShortDomain('HaiPre.vn/')==='https://haipre.vn','short domain normalised');check(lookupShortDomain('beeflix.vn/haiytb/')==='https://beeflix.vn/haiytb','path kept');try{lookupShortDomain('beeflix.vn/a/b');check(false,'two paths');}catch(FamilyError $e){check($e->status===400,'two-level path refused');}
echo "Sheet codes and Gmail invite checks passed\n";
