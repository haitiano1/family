<?php
declare(strict_types=1);
foreach(['core','business','audit','vault','records','issues','sheets','lookup'] as $file)require __DIR__."/$file.php";
ini_set('display_errors','1');
function check(bool $value,string $name): void {if(!$value)throw new RuntimeException($name);}
$c=config();$db=db($c);$GLOBALS['vault_db']=$db;
beginAudit($db,'Dữ liệu giả');$family=saveFamilyRecord($db,null,['name'=>'Gia đình Đặng','manager_email'=>'owner@example.com','trial_date'=>'2026-10-01']);$member=saveMemberRecord($db,null,['family_id'=>$family['id'],'email'=>'guest@example.com','customer_name'=>'Đặng Thị Hồng','joined_at'=>'2026-10-01','expires_at'=>'2026-11-01','amount'=>100000,'plan_months'=>1]);finishAudit();
sheetsPut($db,'config',vaultSeal(json_encode(['url'=>'https://script.google.com/macros/s/test/exec','token'=>str_repeat('t',64)]),sheetsKey($c),'family-sheets-config-v1'));
$peer=new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
$networkCheck=function()use($db,$peer,$c){
    check(!$db->inTransaction(),'no open transaction during Google I/O');
    databaseLock($peer,$c,0);
    try{$duplicate=sheetsSync($peer,$c,'core',[],null,function(){throw new RuntimeException('Duplicate sync must not contact Google.');});check(($duplicate['busy']??false)===true,'separate sync lock skips overlapping tab');}
    finally{databaseUnlock($peer,$c);}
};
$cloud=['core'=>['families'=>[],'members'=>[]],'vault'=>['vault'=>[]]];$loseAck=false;$outage=false;$calls=[];$editDuringRead=null;$editDuringWrite=null;$writes=0;$layout='grouped';$vaultV5=false;$rejectWrite=false;
$send=function($request)use(&$cloud,&$loseAck,&$outage,&$calls,$networkCheck,$peer,$c,&$editDuringRead,&$editDuringWrite,&$writes,&$layout,&$vaultV5,&$rejectWrite){
    $networkCheck();$calls[]=$request['scope'];if($outage)fail('Fake outage',502);$scope=$request['scope'];
    $revision=hash('sha256',json_encode($cloud[$scope]));
    if($request['action']==='read'){
        if($editDuringRead){databaseLock($peer,$c,0);try{q($peer,'UPDATE members SET note=? WHERE id=?',$editDuringRead);}finally{databaseUnlock($peer,$c);}$editDuringRead=null;}
        return [...($vaultV5&&$scope==='vault'?['vault_schema'=>'trial-date-v1','vault_layout'=>'entry','row_locations'=>($cloud[$scope]['vault']?array_combine(array_column($cloud[$scope]['vault'],'id'),range(2,count($cloud[$scope]['vault'])+1)):[])]:[]),'ok'=>true,'data'=>$cloud[$scope],'revision'=>$revision,'sheet_url'=>'https://docs.google.com/spreadsheets/d/test/edit','script_version'=>'family-groups-ddmmyyyy-v2','customer_layout'=>$layout];
    }
    $writes++;check($request['revision']===$revision,'CAS revision mismatch');if($rejectWrite){$rejectWrite=false;fail('Fake rejection before Google writes',502);}
    if($editDuringWrite){databaseLock($peer,$c,0);try{q($peer,'UPDATE members SET note=? WHERE id=?',$editDuringWrite);}finally{databaseUnlock($peer,$c);}$editDuringWrite=null;}
    $cloud[$scope]=$request['data'];if($loseAck){$loseAck=false;fail('Fake lost acknowledgement',502);}
    return [...($vaultV5&&$scope==='vault'?['vault_schema'=>'trial-date-v1','vault_layout'=>'entry']:[]),'ok'=>true,'script_version'=>'family-groups-ddmmyyyy-v2','customer_layout'=>'grouped'];
};
$sync=fn($options=[])=>sheetsSync($db,$c,'core',$options,null,$send);
check($sync()['ok'],'first export');check(count($cloud['core']['members'])===1,'export member');$base=sheetsMeta($db,'base_core');$beforeWrites=$writes;check($sync()['ok'],'repeat export');check($writes===$beforeWrites,'unchanged grouped data does not rewrite Google Sheet');check($base===sheetsMeta($db,'base_core'),'stable fingerprints');
$cloud['core']['members'][0]['note']='Sheet edit';$cloud['core']['members'][0]['amount']='200000';check($sync()['ok'],'Sheet import');check(one($db,'SELECT note,amount FROM members WHERE id=?',[$member['id']])===['note'=>'Sheet edit','amount'=>200000],'imported fields');
$bad=$cloud;$cloud['core']['members'][0]['expires_at']='2026-02-31';try{$sync();throw new RuntimeException('invalid date accepted');}catch(FamilyError $e){check($e->status===400,'date validation');}check(one($db,'SELECT expires_at FROM members WHERE id=?',[$member['id']])['expires_at']==='2026-11-01','invalid import rollback');$cloud=$bad;
q($db,'UPDATE members SET note=? WHERE id=?',['Web edit',$member['id']]);$cloud['core']['members'][0]['note']='Concurrent Sheet edit';$conflict=$sync();check(!$conflict['ok']&&count($conflict['conflicts'])===1,'conflict detected');check(!$sync(['choice'=>'sheet','conflict_token'=>'wrong'])['ok'],'stale resolution refused');check($sync(['choice'=>'web','conflict_token'=>$conflict['conflict_token']])['ok'],'web conflict resolution');check($cloud['core']['members'][0]['note']==='Web edit','resolved web content');
$new=$cloud['core']['members'][0];$new['id']='new:member2';$new['email']='second@example.com';$cloud['core']['members'][]=$new;q($db,'UPDATE members SET note=? WHERE id=?',['Web change requiring a Google write',$member['id']]);$loseAck=true;try{$sync();throw new RuntimeException('missing outage');}catch(FamilyError $e){check($e->status===502,'lost ack raised');}check($sync()['ok'],'retry lost acknowledgement');check((int)one($db,'SELECT COUNT(*) AS n FROM members')['n']===2,'no duplicate on retry');
$cloud['core']['members'][0]['renewal_status']='partial';$cloud['core']['members'][0]['renewal_amount']='50000';$cloud['core']['members'][0]['renewal_paid_at']='2026-10-01';check($sync()['ok'],'renewal payment imported');check(one($db,'SELECT renewal_amount FROM members WHERE id=?',[$member['id']])['renewal_amount']===50000,'renewal payment recorded');check((int)one($db,'SELECT COUNT(*) AS n FROM renewal_history')['n']===0,'Sheet payment does not invent a completed renewal');
// A completed website renewal must export the new purchase/expiry dates.
$current=one($db,'SELECT * FROM members WHERE id=?',[$member['id']]);beginAudit($db,'Gia hạn thử');
renew($db,$member['id'],['revision'=>$current['renewal_revision'],'status'=>'paid','amount'=>165000,'paid_at'=>'2026-10-01','plan_months'=>1,'apply_now'=>true],false);finishAudit();
$beforeRenewalWrites=$writes;check($sync()['ok'],'completed web renewal exported');
$renewed=array_values(array_filter($cloud['core']['members'],fn($row)=>$row['email']==='guest@example.com'))[0];
check($writes===$beforeRenewalWrites+1&&$renewed['joined_at']==='2026-11-01'&&$renewed['expires_at']==='2026-12-01','new renewal dates sent to Google');
check($renewed['amount']==='165000'&&$renewed['renewal_status']==='not_contacted','renewal payment and status exported with new dates');
// Deleting a Sheet row must never delete the website record.
array_pop($cloud['core']['members']);check($sync()['ok'],'missing Sheet row restored');check(count($cloud['core']['members'])===2,'row restored');
$copy=$cloud['core']['families'][0];$copy['id']='new:family2';$copy['name']='Family 2';$copy['manager_email']='owner2@example.com';$cloud['core']['families'][]=$copy;
$new=$cloud['core']['members'][0];$new['id']='new:member3';$new['family_id']='new:family2';$new['email']='third@example.com';$cloud['core']['members'][]=$new;check($sync()['ok'],'new family and member');check((int)one($db,'SELECT COUNT(*) AS n FROM families')['n']===2,'new family saved');
// Website deletion propagates as removal from the active Sheet, with archive intact.
beginAudit($db,'Xóa khách');archiveMember($db,$member['id']);finishAudit();check($sync()['ok'],'web archive export');check(count($cloud['core']['members'])===2,'archived row removed from Sheet');check((int)one($db,'SELECT COUNT(*) AS n FROM archived_customers')['n']===1,'archive retained');
// Vault exports/imports use the existing authorization cookie and encrypt at rest.
$key=random_bytes(32);q($db,"INSERT INTO vault_meta(name,value) VALUES ('config',?)",[json_encode(vaultWrap('fake vault password',$key))]);$expires=(int)floor(microtime(true)*1000)+VAULT_SESSION_MS;
$raw=rtrim(strtr(base64_encode(json_encode(vaultSeal(json_encode(['key'=>base64_encode($key),'expires'=>$expires,'config_hash'=>hash('sha256',vaultMeta($db))]),vaultSessionKey($c),'family-vault-session-v1'))),'+/','-_'),'=');$_COOKIE['fam_vault']=$raw;q($db,'INSERT INTO vault_sessions(token_hash,expires_at) VALUES (?,?)',[hash('sha256',$raw),$expires]);
$v=vaultFields(['email'=>'owner@example.com','password'=>'FAKE_PRIVATE_PASSWORD','totp'=>'JBSWY3DPEHPK3PXP','recovery_email'=>'recovery@example.com']);vaultInsert($db,$v,$key);
$vaultSync=fn($options=[])=>sheetsSync($db,$c,'vault',$options,$key,$send);check($vaultSync()['ok'],'vault export');$index=array_search('owner@example.com',array_column($cloud['vault']['vault'],'email'));check($cloud['vault']['vault'][$index]['password']==='FAKE_PRIVATE_PASSWORD','plain text only in allowed Sheet scope');
$cloud['vault']['vault'][$index]['password']='FAKE_CHANGED_PASSWORD';$cloud['vault']['vault'][$index]['note']='FAKE_PRIVATE_NOTE';check($vaultSync()['ok'],'vault import');$stored=one($db,'SELECT * FROM vault_items WHERE id=1');check(vaultRead($stored,$key)['password']==='FAKE_CHANGED_PASSWORD','vault round trip');check(!str_contains($stored['payload'],'FAKE_CHANGED_PASSWORD'),'encrypted payload');
$metadata=json_encode(all($db,'SELECT * FROM family_sheet_state'));$logs=json_encode(all($db,'SELECT * FROM audit_events'));check(!str_contains($metadata,'FAKE_CHANGED_PASSWORD')&&!str_contains($metadata,'FAKE_PRIVATE_NOTE'),'no secret baseline');check(!str_contains($logs,'FAKE_CHANGED_PASSWORD')&&!str_contains($logs,'FAKE_PRIVATE_NOTE')&&!str_contains($logs,'JBSWY3DPEHPK3PXP'),'no vault secret audit');
$cloud['vault']['vault'][$index]['password']='';check($vaultSync()['ok'],'clear password');check(vaultRead(one($db,'SELECT * FROM vault_items WHERE id=1'),$key)['password']==='','blank explicitly clears password');
$outage=true;try{$sync();throw new RuntimeException('outage accepted');}catch(FamilyError $e){check($e->status===502,'outage refused');}$outage=false;check($sync()['ok'],'outage recovery');
check(count(array_filter($calls,fn($scope)=>$scope==='vault'))>0,'vault transport exercised');
// Updating an endpoint for the same Sheet preserves IDs/baselines and reuses the secret privately.
$beforeBase=sheetsMeta($db,'base_core');$beforeIds=sheetsMeta($db,'ids');$beforeToken=sheetsSettings($db,$c)['token'];
$probe=function($settings)use(&$cloud,$networkCheck){$networkCheck();return ['ok'=>true,'data'=>$cloud['core'],'sheet_url'=>'https://docs.google.com/spreadsheets/d/test/edit','script_version'=>'family-groups-ddmmyyyy-v2','customer_layout'=>'grouped'];};
sheetsSaveSettings($db,$c,['url'=>'https://script.google.com/macros/s/newest/exec','token'=>''],$probe);
check(sheetsSettings($db,$c)['url']==='https://script.google.com/macros/s/newest/exec','endpoint changed');check(sheetsSettings($db,$c)['token']===$beforeToken,'token reused without exposing');check(sheetsMeta($db,'base_core')===$beforeBase&&sheetsMeta($db,'ids')===$beforeIds,'baseline and IDs preserved');check(sheetsMeta($db,'script_version')==='family-groups-ddmmyyyy-v2'&&sheetsMeta($db,'customer_layout')==='grouped','runtime reported');
$other=function($settings)use(&$cloud){return ['ok'=>true,'data'=>$cloud['core'],'sheet_url'=>'https://docs.google.com/spreadsheets/d/DIFFERENT/edit'];};
try{sheetsSaveSettings($db,$c,['url'=>'https://script.google.com/macros/s/other/exec','token'=>''],$other);throw new RuntimeException('cross-Sheet endpoint accepted');}catch(FamilyError $e){check($e->status===409,'cross-Sheet rejected');}
check(sheetsSettings($db,$c)['url']==='https://script.google.com/macros/s/newest/exec','rejected update preserves endpoint');check(sheetsMeta($db,'base_core')===$beforeBase,'rejected update preserves baseline');

// A second connection can save while Google is reading or writing. The snapshot
// used for acknowledgement must not absorb unsent concurrent web changes.
$active=one($db,'SELECT id FROM members ORDER BY id LIMIT 1');$target=$active['id'];
$editDuringRead=['Edited during Google read',$target];check($sync()['ok'],'concurrent edit during pull');check(one($db,'SELECT note FROM members WHERE id=?',[$target])['note']==='Edited during Google read','pull captures latest local edit');
$recordId=null;foreach(sheetsSnapshot($db,'core')['members'] as $id=>$row)if($row['note']==='Edited during Google read')$recordId=$id;check($recordId!==null,'concurrent record found');
q($db,'UPDATE members SET note=? WHERE id=?',['Snapshot before Google write',$target]);$editDuringWrite=['Edited during Google write',$target];check($sync()['ok'],'concurrent edit during push');check(one($db,'SELECT note FROM members WHERE id=?',[$target])['note']==='Edited during Google write','push preserves later web edit');
$remoteMap=array_column($cloud['core']['members'],null,'id');check($remoteMap[$recordId]['note']==='Snapshot before Google write','Google received frozen snapshot');check(sheetsMeta($db,'base_core')['members'][$recordId]===sheetsHash($remoteMap[$recordId],$c),'baseline acknowledges only sent snapshot');
check($sync()['ok'],'next sync sends later web edit');$remoteMap=array_column($cloud['core']['members'],null,'id');check($remoteMap[$recordId]['note']==='Edited during Google write','later web edit reaches Sheet');
$beforeWrites=$writes;$layout='flat';check($sync()['ok'],'format migration even without data changes');check($writes===$beforeWrites+1,'flat layout is rewritten once');$layout='grouped';
$outage=true;try{$sync();throw new RuntimeException('outage accepted');}catch(FamilyError $e){check($e->status===502,'Google failure reported');}$outage=false;check(databaseOwnsLock($db,$c),'application lock reacquired after network failure');check((int)q($peer,'SELECT GET_LOCK(?,0) AS ok',[sheetsLockName($c)])->fetch()['ok']===1,'sync lock released on failure');q($peer,'SELECT RELEASE_LOCK(?)',[sheetsLockName($c)]);
check($sync()['ok'],'sync recovers after failure');
// New vault-entry capability upgrades old HMAC baselines without erasing secrets.
$trialSnapshot=sheetsSnapshot($db,'vault',$key,true);
$probeId=array_key_first($trialSnapshot['vault']);$probeLocal=['vault'=>[$probeId=>$trialSnapshot['vault'][$probeId]]];$probeRemote=$probeLocal;$probeRemote['vault'][$probeId]['trial_date']='2026-10-30';$oldRow=$probeLocal['vault'][$probeId];unset($oldRow['trial_date']);$oldBase=['vault'=>[$probeId=>sheetsHash($oldRow,$c)]];check(count(sheetsMerge($probeLocal,$probeRemote,sheetsVaultBase($probeLocal,$probeRemote,$oldBase,$c),$c)['conflicts'])===1,'legacy upgrade does not guess differing trial dates');

foreach($cloud['vault']['vault'] as &$item)$item['trial_date']=$trialSnapshot['vault'][$item['id']]['trial_date'];unset($item);$vaultV5=true;
check($vaultSync()['ok'],'old vault baseline upgraded with matching Family trial');
$cookie=$_COOKIE['fam_vault'];unset($_COOKIE['fam_vault']);$beforeCalls=count($calls);try{$vaultSync();throw new RuntimeException('locked vault accepted');}catch(FamilyError $e){check($e->status===423,'locked vault refused');}check(count($calls)===$beforeCalls,'locked vault sends no network request');$_COOKIE['fam_vault']=$cookie;
$newAccount=function(string $id,string $email,string $trial='2026-10-18'): array {return ['id'=>$id,'family_id'=>'','email'=>$email,'password'=>'FAKE_NEW_PRIVATE_PASSWORD','totp'=>'jbsw y3dp ehpk 3pxp','recovery_email'=>'recovery@example.com','label'=>'Family nhập Sheet','note'=>'FAKE_NEW_PRIVATE_NOTE','trial_date'=>$trial];};
$familiesBefore=(int)one($db,'SELECT COUNT(*) AS n FROM families')['n'];$vaultBefore=(int)one($db,'SELECT COUNT(*) AS n FROM vault_items')['n'];
$cloud['vault']['vault'][]=$newAccount('new:account-import-1','sheet-new@example.com');check($vaultSync()['ok'],'create Family and vault from one Sheet row');
$created=vaultFamilyFor($db,'sheet-new@example.com');check($created&&$created['trial_date']==='2026-10-18'&&$created['name']==='Family nhập Sheet','new Family trial and optional name');
$entry=one($db,'SELECT * FROM vault_items WHERE family_id=?',[$created['id']]);check($entry&&vaultRead($entry,$key)['password']==='FAKE_NEW_PRIVATE_PASSWORD','new vault decrypts');check(vaultRead($entry,$key)['totp']['secret']==='JBSWY3DPEHPK3PXP','normalize pasted 2FA');check(!str_contains($entry['payload'],'FAKE_NEW_PRIVATE_PASSWORD'),'new vault encrypted at rest');
check((int)one($db,'SELECT COUNT(*) AS n FROM families')['n']===$familiesBefore+1,'one Family created');check((int)one($db,'SELECT COUNT(*) AS n FROM vault_items')['n']===$vaultBefore+1,'one vault entry created');
$remoteMap=array_column($cloud['vault']['vault'],null,'id');check($remoteMap['new:account-import-1']['family_id']!=='','stable input ID gets Family binding');check($vaultSync()['ok'],'repeated direct-entry sync');
// Simulate successful local commit followed by Google rejecting the write entirely.
$cloud['vault']['vault'][]=$newAccount('new:account-import-2','sheet-retry@example.com');$rejectWrite=true;try{$vaultSync();throw new RuntimeException('missing write rejection');}catch(FamilyError $e){check($e->status===502,'write rejection reported');}
check(vaultFamilyFor($db,'sheet-retry@example.com')!==false,'local import committed before network failure');check($vaultSync()['ok'],'retry resolves pending ID and binding after failed write');
check((int)one($db,'SELECT COUNT(*) AS n FROM families')['n']===$familiesBefore+2,'retry does not duplicate Family');check((int)one($db,'SELECT COUNT(*) AS n FROM vault_items')['n']===$vaultBefore+2,'retry does not duplicate vault');
$cloud['vault']['vault'][]=$newAccount('new:account-import-3','sheet-lost-ack@example.com');$loseAck=true;try{$vaultSync();throw new RuntimeException('missing lost ack');}catch(FamilyError $e){check($e->status===502,'lost ack reported for direct entry');}check($vaultSync()['ok'],'retry after Google already wrote direct-entry account');
// Filling an existing Family with no stored credentials must reuse that Family.
beginAudit($db,'Dữ liệu giả');$empty=saveFamilyRecord($db,null,['name'=>'Family chưa nhập Kho','manager_email'=>'empty-vault@example.com']);finishAudit();$countFamilies=(int)one($db,'SELECT COUNT(*) AS n FROM families')['n'];
$cloud['vault']['vault'][]=$newAccount('new:account-import-4','empty-vault@example.com');check($vaultSync()['ok'],'fill existing Family placeholder from pasted row');check((int)one($db,'SELECT COUNT(*) AS n FROM families')['n']===$countFamilies,'existing Family not duplicated');check((int)one($db,'SELECT COUNT(*) AS n FROM vault_items WHERE family_id=?',[$empty['id']])['n']===1,'existing Family has exactly one vault entry');
// Conflicting date edits are handled through the existing explicit choice flow.
$idx=array_search('sheet-new@example.com',array_column($cloud['vault']['vault'],'email'));q($db,'UPDATE families SET trial_date=? WHERE id=?',['2026-10-19',$created['id']]);$cloud['vault']['vault'][$idx]['trial_date']='2026-10-20';$conflict=$vaultSync();check(!$conflict['ok']&&count($conflict['conflicts'])===1,'trial date conflict detected');check($vaultSync(['choice'=>'web','conflict_token'=>$conflict['conflict_token']])['ok'],'resolve date conflict');check($cloud['vault']['vault'][$idx]['trial_date']==='2026-10-19','chosen trial retained');
// A batch error rolls back earlier Family/vault mutations and the alias map.
$validCloud=$cloud;$cloud['vault']['vault'][]=$newAccount('new:rollback-good','rollback-good@example.com');
beginAudit($db,'Dữ liệu giả');$archived=saveFamilyRecord($db,null,['name'=>'Family lưu trữ','manager_email'=>'archived-sheet@example.com']);finishAudit();q($db,'UPDATE families SET archived_at=? WHERE id=?',[stamp(),$archived['id']]);$cloud['vault']['vault'][]=$newAccount('new:rollback-bad','archived-sheet@example.com');$countFamilies=(int)one($db,'SELECT COUNT(*) AS n FROM families')['n'];$countVault=(int)one($db,'SELECT COUNT(*) AS n FROM vault_items')['n'];$aliases=sheetsMeta($db,'ids');
try{$vaultSync();throw new RuntimeException('archived owner accepted');}catch(FamilyError $e){check($e->status===409,'archived Family cannot be silently recreated');}check((int)one($db,'SELECT COUNT(*) AS n FROM families')['n']===$countFamilies&&vaultFamilyFor($db,'rollback-good@example.com')===false,'Family batch rollback');check((int)one($db,'SELECT COUNT(*) AS n FROM vault_items')['n']===$countVault,'vault batch rollback');check(sheetsMeta($db,'ids')===$aliases,'alias batch rollback');$cloud=$validCloud;
$cloud['vault']['vault'][]=$newAccount('new:duplicate-owner','sheet-new@example.com');try{$vaultSync();throw new RuntimeException('duplicate owner accepted');}catch(FamilyError $e){check($e->status===409,'duplicate existing credential row rejected');}$cloud=$validCloud;
$bad=$newAccount('new:invalid-key','invalid-key@example.com');$bad['totp']='INVALID_KEY_000';$cloud['vault']['vault'][]=$bad;try{$vaultSync();throw new RuntimeException('invalid key accepted');}catch(FamilyError $e){check($e->status===400&&!str_contains($e->getMessage(),'INVALID_KEY_000'),'invalid key rejected without leaking key');check(str_contains($e->getMessage(),'dòng'),'invalid key reports Sheet row');}check(vaultFamilyFor($db,'invalid-key@example.com')===false,'invalid 2FA creates no Family');$cloud=$validCloud;
$bad=$newAccount('new:invalid-date','invalid-date@example.com','2026-02-30');$cloud['vault']['vault'][]=$bad;try{$vaultSync();throw new RuntimeException('invalid trial accepted');}catch(FamilyError $e){check($e->status===400,'invalid date rejected');}$cloud=$validCloud;
check($vaultSync()['ok'],'new account sync recovers after invalid input');check($sync()['ok'],'created Families exported by following core sync');check(in_array('sheet-new@example.com',array_column($cloud['core']['families'],'manager_email'),true),'new Family reaches Family Sheet');
$metadata=json_encode(all($db,'SELECT * FROM family_sheet_state'));$logs=json_encode(all($db,'SELECT * FROM audit_events'));foreach(['FAKE_NEW_PRIVATE_PASSWORD','FAKE_NEW_PRIVATE_NOTE','JBSWY3DPEHPK3PXP'] as $secret)check(!str_contains($metadata,$secret)&&!str_contains($logs,$secret),'no new credential secrets in sync metadata or audit');

// Local failures must identify their stage without leaking exception text or
// advancing success metadata. Failed imports still roll back before retry.
$previousSync=sheetsMeta($db,'last_core');$previousBase=sheetsMeta($db,'base_core');
try{sheetsSync($db,$c,'core',[],null,static function(array $request): array {throw new TypeError('FAKE_DIAGNOSTIC_PRIVATE');});throw new RuntimeException('missing local diagnostic');}
catch(FamilyError $e){check(str_contains($e->getMessage(),'[read_remote]')&&str_contains($e->getMessage(),'[type]')&&!str_contains($e->getMessage(),'FAKE_DIAGNOSTIC_PRIVATE'),'local read stage safely reported');}
check(sheetsMeta($db,'last_core')===$previousSync&&sheetsMeta($db,'base_core')===$previousBase,'failed read never advances sync baseline');
$previousMember=one($db,'SELECT * FROM members ORDER BY id LIMIT 1');$idx=array_search($previousMember['email'],array_column($cloud['core']['members'],'email'));check($idx!==false,'active diagnostic member found');$cloud['core']['members'][$idx]['note']='Remote note to retry';
$db->exec("CREATE TRIGGER reject_sheet_diagnostic BEFORE UPDATE ON members FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='FAKE_DIAGNOSTIC_PRIVATE'");
try{try{$sync();throw new RuntimeException('missing SQL diagnostic');}catch(FamilyError $e){check(str_contains($e->getMessage(),'[apply_core]')&&str_contains($e->getMessage(),'[database]')&&!str_contains($e->getMessage(),'FAKE_DIAGNOSTIC_PRIVATE'),'local import stage safely reported');}}
finally{$db->exec('DROP TRIGGER reject_sheet_diagnostic');}
check(one($db,'SELECT * FROM members WHERE id=?',[$previousMember['id']])===$previousMember,'failed import restores member');check(sheetsMeta($db,'last_core')===$previousSync&&sheetsMeta($db,'base_core')===$previousBase,'failed import never advances sync baseline');
check($sync()['ok'],'retry succeeds after local diagnostic');check(one($db,'SELECT note FROM members WHERE id=?',[$previousMember['id']])['note']==='Remote note to retry','retry imports the pending edit');

$sheetNew=$cloud['core']['members'][0];$sheetNew['id']='new:new-purchase-sheet';$sheetNew['email']='new-purchase-sheet@example.com';$sheetNew['membership_status']='new';$sheetNew['joined_at']='2026-08-10';$sheetNew['expires_at']='2026-09-10';$sheetNew['payment_status']='paid';$sheetNew['amount']='75000';$sheetNew['plan_months']='1';$sheetNew['renewal_status']='not_contacted';$sheetNew['renewal_amount']='0';$sheetNew['renewal_paid_at']='';$sheetNew['renewal_note']='';$cloud['core']['members'][]=$sheetNew;
check($sync()['ok'],'new membership status imported from Sheet');$purchase=one($db,'SELECT * FROM new_purchase_history WHERE email=?',['new-purchase-sheet@example.com']);check($purchase&&$purchase['joined_at']==='2026-08-10'&&$purchase['amount']===75000,'Sheet import records original new purchase');check($sync()['ok'],'repeated new purchase Sheet sync');check((int)one($db,'SELECT COUNT(*) AS n FROM new_purchase_history WHERE email=?',['new-purchase-sheet@example.com'])['n']===1,'Sheet retry does not duplicate new purchase');
// Issue replacement must export the new owner without restoring the retired
// credentials, for both ordinary web IDs and IDs originally assigned by Sheet.
foreach(['web','sheet'] as $origin){
    $oldEmail='issue-'.$origin.'-old@example.com';$newEmail='issue-'.$origin.'-new@example.com';
    if($origin==='web'){
        beginAudit($db,'Dữ liệu giả');saveFamilyRecord($db,null,['name'=>'Issue replacement web','manager_email'=>$oldEmail,'trial_date'=>'2026-10-01']);vaultInsert($db,vaultFields($newAccount('unused',$oldEmail)),$key);finishAudit();
    }else $cloud['vault']['vault'][]=$newAccount('new:issue-replacement',$oldEmail);
    check($vaultSync()['ok'],'establish owner credential baseline before issue replacement');check($sync()['ok'],'establish Family baseline before issue replacement');
    $target=vaultFamilyFor($db,$oldEmail);$beforeVault=$cloud['vault']['vault'];
    beginAudit($db,'Sửa lỗi thử');$issue=saveIssue($db,null,['family_id'=>$target['id'],'title'=>'Replace owner test']);saveIssue($db,$issue['id'],['revision'=>0,'status'=>'done','resolution'=>'replace','replacement_email'=>$newEmail]);finishAudit();
    check(!one($db,'SELECT id FROM vault_items WHERE family_id=?',[$target['id']]),'replacement removes retired local credentials');
    check($sync()['ok'],'replacement Family email exported');check(in_array($newEmail,array_column($cloud['core']['families'],'manager_email'),true),'Family Sheet receives replacement email');
    check($vaultSync()['ok'],'replacement vault email exported');$matching=array_values(array_filter($cloud['vault']['vault'],fn($row)=>$row['email']===$newEmail));
    check(count($matching)===1&&!in_array($oldEmail,array_column($cloud['vault']['vault'],'email'),true),'one replacement row and no retired owner row');
    foreach(['password','totp','recovery_email','label','note'] as $field)check($matching[0][$field]==='','retired credential fields cleared on Sheet');
    $others=fn($rows,$excluded)=>array_values(array_filter($rows,fn($row)=>$row['email']!==$excluded));check($others($beforeVault,$oldEmail)===$others($cloud['vault']['vault'],$newEmail),'other Sheet accounts unchanged by replacement');
    check($vaultSync()['ok'],'replacement sync can repeat');check(!one($db,'SELECT id FROM vault_items WHERE family_id=?',[$target['id']]),'retry never recreates retired credentials');
    beginAudit($db,'Dữ liệu giả');$number=vaultInsert($db,vaultFields($newAccount('unused',$newEmail,today())),$key);finishAudit();
    check($vaultSync()['ok'],'fresh replacement credentials exported');$matching=array_values(array_filter($cloud['vault']['vault'],fn($row)=>$row['email']===$newEmail));check(count($matching)===1&&$matching[0]['password']==='FAKE_NEW_PRIVATE_PASSWORD','new credentials replace the placeholder exactly once');
    check(vaultRead(one($db,'SELECT * FROM vault_items WHERE id=?',[$number]),$key)['email']===$newEmail,'fresh vault retains replacement email');
}
// A transfer may exceed five occupied places; later Sheet edits must still
// update that existing customer without treating the edit as a new slot.
beginAudit($db,'Dữ liệu giả');$crowded=saveFamilyRecord($db,null,['name'=>'Crowded Family','manager_email'=>'crowded-owner@example.com']);
for($n=1;$n<=5;$n++)saveMemberRecord($db,null,['family_id'=>$crowded['id'],'email'=>'crowded'.$n.'@example.com']);
$moving=saveMemberRecord($db,null,['family_id'=>$family['id'],'email'=>'moving-to-crowded@example.com']);$profile=one($db,'SELECT * FROM members WHERE id=?',[$moving['id']]);transferMember($db,$moving['id'],['revision'=>$profile['renewal_revision'],'expected_family_id'=>$family['id'],'expected_email'=>$profile['email'],'family_id'=>$crowded['id'],'expected_manager_email'=>'crowded-owner@example.com']);finishAudit();
check($sync()['ok'],'export over-capacity transfer');$idx=array_search('moving-to-crowded@example.com',array_column($cloud['core']['members'],'email'));check($idx!==false,'transferred customer reaches Sheet');$cloud['core']['members'][$idx]['note']='Sheet edit above five';
check($sync()['ok'],'Sheet can edit an existing transferred customer above five');check(one($db,'SELECT note FROM members WHERE id=?',[$moving['id']])['note']==='Sheet edit above five','over-capacity Sheet edit retained');
// Apps Script v5.8 adds the Mã tra cứu tab: web codes go out, a typed code comes back.
$codeCloud=$cloud['core'];$codeSend=function($request)use(&$codeCloud){
    $revision=hash('sha256',json_encode($codeCloud));
    if($request['action']==='read')return ['ok'=>true,'data'=>$codeCloud,'revision'=>$revision,'script_version'=>'family-ma-tra-cuu-v5.8','customer_layout'=>'grouped','lookup_codes'=>'v1'];
    check($request['revision']===$revision,'codes CAS revision');$codeCloud=$request['data'];return ['ok'=>true,'script_version'=>'family-ma-tra-cuu-v5.8','customer_layout'=>'grouped','lookup_codes'=>'v1'];
};
check(sheetsSync($db,$c,'core',[],null,$codeSend)['ok'],'codes tab export');$emails=array_column(all($db,"SELECT DISTINCT m.email FROM members m JOIN families f ON f.id=m.family_id WHERE f.archived_at=''"),'email');
check(count($codeCloud['codes'])===count($emails)&&!array_diff($emails,array_column($codeCloud['codes'],'email')),'one codes row per active Gmail');
foreach($codeCloud['codes'] as $r)check($r['code']===lookupCodeFor($db,$r['email']),'web code exported');
$codeCloud['codes'][0]['code']='hx4n 9t';check(sheetsSync($db,$c,'core',[],null,$codeSend)['ok'],'typed code imported');check(lookupCodeFor($db,$codeCloud['codes'][0]['email'])==='HX4N9T'&&$codeCloud['codes'][0]['code']==='HX4N9T','typed code saved on MySQL');
$codeCloud['codes'][0]['code']='OOOOOO';try{sheetsSync($db,$c,'core',[],null,$codeSend);throw new RuntimeException('invalid code accepted');}catch(FamilyError $e){check($e->status===409,'invalid code refused');}check(lookupCodeFor($db,$codeCloud['codes'][0]['email'])==='HX4N9T','invalid code rolled back');
// Gmail invite links are filed by the receiving address under the Family whose owner sent them.
$owner=one($db,"SELECT a.email,f.name FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at='' ORDER BY f.id LIMIT 1");
$gmailSend=fn($request)=>['ok'=>true,'gmail_invites'=>'v1','invites'=>[['id'=>'m1','to'=>'Hai+1@gmail.com','date'=>'2026-11-03','sent_at'=>'2026-11-03T09:00:00.000Z','url'=>'https://families.google.com/join/promo/mysql1','emails'=>[$owner['email']]],['id'=>'m2','to'=>'hai+2@gmail.com','date'=>'2026-11-03','sent_at'=>'2026-11-03T09:05:00.000Z','url'=>'https://families.google.com/join/promo/mysql2','emails'=>['nobody@example.com']]]];
$r=sheetsGmailInvites($db,$c,$gmailSend);check($r['added']===1&&$r['unmatched']===['hai+2@gmail.com'],'Gmail invite filed on MySQL');
$filed=one($db,'SELECT i.label,f.name FROM family_invites i JOIN families f ON f.id=i.family_id WHERE i.url=?',['https://families.google.com/join/promo/mysql1']);check($filed['label']==='hai+1@gmail.com'&&$filed['name']===$owner['name'],'labelled by the receiving Gmail under the inviting owner');
$r=sheetsGmailInvites($db,$c,$gmailSend);check($r['unchanged']===1&&$r['added']===0,'repeat Gmail import changes nothing');
echo "Sheet PHP/MySQL integration checks passed\n";
