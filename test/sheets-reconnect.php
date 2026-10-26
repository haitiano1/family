<?php
declare(strict_types=1);
foreach(['core','business','audit','vault','records','sheets'] as $file)require __DIR__."/$file.php";
ini_set('display_errors','1');
function ensureSync(bool $ok,string $message): void {if(!$ok)throw new RuntimeException($message);}
$c=config();$db=db($c);
$connect=fn()=>new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);
$peer=$connect();beginAudit($db,'Dữ liệu giả');$family=saveFamilyRecord($db,null,['name'=>'Reconnect test','manager_email'=>'reconnect-owner@example.com']);$member=saveMemberRecord($db,null,['family_id'=>$family['id'],'email'=>'reconnect-guest@example.com','expires_at'=>'2027-01-01']);finishAudit();
sheetsPut($db,'config',vaultSeal(json_encode(['url'=>'https://script.google.com/macros/s/test/exec','token'=>str_repeat('t',64)]),sheetsKey($c),'family-sheets-config-v1'));
$cloud=['families'=>[],'members'=>[]];$fault='idle_read';$reads=0;$writes=0;$intercept=null;
$send=function(array $request)use(&$cloud,&$fault,&$reads,&$writes,&$intercept,$peer,$c): array {
    $owner=(int)q($peer,'SELECT IS_USED_LOCK(?) AS id',[sheetsLockName($c)])->fetch()['id'];ensureSync($owner>0,'transport requires sync lock');
    if($request['action']==='read'){
        $reads++;$snapshot=$cloud;
        if($fault==='idle_read'){$fault='';usleep(1600000);}
        elseif(in_array($fault,['kill_read','busy_read','always_kill','always_change_guard'],true)){
            $kind=$fault;if(!in_array($kind,['always_kill','always_change_guard'],true))$fault='';$peer->exec('KILL CONNECTION '.$owner);
            if($kind==='busy_read'){ensureSync(sheetsTryLock($peer,$c),'another sync can obtain released lock');}
            if($kind==='always_change_guard')sheetsPut($peer,'ids',[...sheetsMeta($peer,'ids'),'test:guard'=>(string)$reads]);
        }
        if($intercept){$callback=$intercept;$intercept=null;$callback();}
        return ['ok'=>true,'data'=>$snapshot,'revision'=>hash('sha256',json_encode($snapshot)),'customer_layout'=>'grouped'];
    }
    ensureSync($request['revision']===hash('sha256',json_encode($cloud)),'write must use latest revision');$writes++;
    if($fault==='kill_write_before'){$fault='';$peer->exec('KILL CONNECTION '.$owner);throw new FamilyError('Fake Google rejection',502);}
    $cloud=$request['data'];if($fault==='kill_write_after'||$fault==='always_kill'){if($fault!=='always_kill')$fault='';$peer->exec('KILL CONNECTION '.$owner);}
    return ['ok'=>true,'customer_layout'=>'grouped'];
};
q($db,'SET SESSION wait_timeout=1');$result=sheetsSync($db,$c,'core',[],null,$send);
ensureSync($result['ok']&&$reads===1&&count($cloud['members'])===1,'idle connection reconnects without repeating acknowledged read');
$fresh=function()use(&$db,$c): void {$db=null;unset($GLOBALS['vault_db']);$db=db($c);};
$fresh();$fault='kill_read';$beforeReads=$reads;
$intercept=function()use($peer,$member){q($peer,'UPDATE members SET note=? WHERE id=?',['Concurrent web edit',$member['id']]);};
ensureSync(sheetsSync($db,$c,'core',[],null,$send)['ok'],'killed read recovers');ensureSync($reads===$beforeReads+1&&$cloud['members'][0]['note']==='Concurrent web edit','reconnect rebuilds local snapshot');
$fresh();$fault='kill_read';$beforeReads=$reads;$intercept=function()use(&$cloud,$peer,$c,$member){
    databaseLock($peer,$c);ensureSync(sheetsTryLock($peer,$c),'concurrent sync owns guard');$cloud['members'][0]['contact']='Concurrent Sheet contact';q($peer,'UPDATE members SET contact=? WHERE id=?',['Concurrent Sheet contact',$member['id']]);sheetsPut($peer,'base_core',sheetsFingerprints(sheetsSnapshot($peer,'core'),$c));sheetsReleaseLock($peer,$c);databaseUnlock($peer,$c);
};
ensureSync(sheetsSync($db,$c,'core',[],null,$send)['ok'],'stale remote snapshot is reread');ensureSync(one($peer,'SELECT contact FROM members WHERE id=?',[$member['id']])['contact']==='Concurrent Sheet contact','reconnect imports the latest remote edit');
ensureSync($reads===$beforeReads+2,'baseline change forces a new remote read');
$fresh();q($db,'UPDATE members SET note=? WHERE id=?',['Write acknowledgement test',$member['id']]);$fault='kill_write_after';$beforeWrites=$writes;
ensureSync(sheetsSync($db,$c,'core',[],null,$send)['ok'],'lost connection after acknowledged write recovers');ensureSync($writes===$beforeWrites+1,'retry must not duplicate acknowledged Google write');
ensureSync($cloud['members'][0]['note']==='Write acknowledgement test','acknowledged data retained');
$fresh();$fault='busy_read';$beforeWrites=$writes;
try{sheetsSync($db,$c,'core',[],null,$send);throw new RuntimeException('concurrent guard accepted');}catch(FamilyError $e){ensureSync($e->status===409&&$writes===$beforeWrites,'reconnect respects another sync owner');}sheetsReleaseLock($peer,$c);
$fresh();$fault='always_kill';$beforeReads=$reads;$beforeWrites=$writes;q($db,'UPDATE members SET note=? WHERE id=?',['Every network call disconnects',$member['id']]);
ensureSync(sheetsSync($db,$c,'core',[],null,$send)['ok'],'both read and write can disconnect on every request');ensureSync($reads===$beforeReads+1&&$writes===$beforeWrites+1,'persistent idle policy does not cause repeated Google calls');
$fresh();$fault='always_change_guard';$beforeReads=$reads;
try{sheetsSync($db,$c,'core',[],null,$send);throw new RuntimeException('unbounded retry accepted');}catch(FamilyError $e){ensureSync($e->status===409&&str_contains($e->getMessage(),'[sync_changed]'),'repeated competing sync returns retryable error');}
ensureSync($reads===$beforeReads+2,'baseline retry is bounded');
$fresh();$fault='kill_write_before';q($db,'UPDATE members SET note=? WHERE id=?',['Keep Google error',$member['id']]);
try{sheetsSync($db,$c,'core',[],null,$send);throw new RuntimeException('Google failure accepted');}catch(FamilyError $e){ensureSync($e->getMessage()==='Fake Google rejection','connection cleanup must preserve Google error');}
$fresh();$fault='';ensureSync(sheetsSync($db,$c,'core',[],null,$send)['ok'],'next request can retry failed write');ensureSync($cloud['members'][0]['note']==='Keep Google error','retry exports pending web change');
$fresh();$probe=function(array $settings)use($peer,$c,&$cloud): array {
    $owner=(int)q($peer,'SELECT IS_USED_LOCK(?) AS id',[sheetsLockName($c)])->fetch()['id'];$peer->exec('KILL CONNECTION '.$owner);
    return ['ok'=>true,'data'=>$cloud,'sheet_url'=>'https://docs.google.com/spreadsheets/d/test/edit','customer_layout'=>'grouped'];
};
sheetsSaveSettings($db,$c,['url'=>'https://script.google.com/macros/s/test/exec','token'=>''],$probe);ensureSync(sheetsSettings($peer,$c)['token']===str_repeat('t',64),'configuration probe can reconnect without changing the token');
$fresh();$key=random_bytes(32);q($db,"INSERT INTO vault_meta(name,value) VALUES ('config',?)",[json_encode(vaultWrap('fake reconnect password',$key))]);$expires=(int)floor(microtime(true)*1000)+VAULT_SESSION_MS;
$cookie=rtrim(strtr(base64_encode(json_encode(vaultSeal(json_encode(['key'=>base64_encode($key),'expires'=>$expires,'config_hash'=>hash('sha256',vaultMeta($db))]),vaultSessionKey($c),'family-vault-session-v1'))),'+/','-_'),'=');$_COOKIE['fam_vault']=$cookie;q($db,'INSERT INTO vault_sessions(token_hash,expires_at) VALUES (?,?)',[hash('sha256',$cookie),$expires]);
vaultInsert($db,vaultFields(['email'=>'reconnect-owner@example.com','password'=>'FAKE_RECONNECT_PRIVATE_PASSWORD']),$key);
$vaultCloud=['vault'=>[]];$vaultReads=0;$revoke=false;
$vaultSend=function(array $request)use($peer,$c,&$vaultCloud,&$vaultReads,&$revoke): array {
    if($request['action']==='read'){
        if(++$vaultReads===1){$owner=(int)q($peer,'SELECT IS_USED_LOCK(?) AS id',[sheetsLockName($c)])->fetch()['id'];$peer->exec('KILL CONNECTION '.$owner);}
        if($revoke)$peer->exec('DELETE FROM vault_sessions');
        return ['ok'=>true,'data'=>$vaultCloud,'revision'=>hash('sha256',json_encode($vaultCloud)),'vault_schema'=>'trial-date-v1','vault_layout'=>'entry'];
    }
    ensureSync($request['revision']===hash('sha256',json_encode($vaultCloud)),'vault revision stays current');$vaultCloud=$request['data'];return ['ok'=>true];
};
ensureSync(sheetsSync($db,$c,'vault',[],$key,$vaultSend)['ok']&&$vaultReads===1,'vault reconnect preserves authorization');ensureSync($vaultCloud['vault'][0]['password']==='FAKE_RECONNECT_PRIVATE_PASSWORD','vault reconnect exports the intended credential');
ensureSync(!str_contains(json_encode(all($peer,'SELECT * FROM family_sheet_state')),'FAKE_RECONNECT_PRIVATE_PASSWORD'),'reconnect metadata contains no plaintext credentials');
$fresh();$vaultReads=0;$revoke=true;$beforeVault=$vaultCloud;
try{sheetsSync($db,$c,'vault',[],$key,$vaultSend);throw new RuntimeException('revoked vault accepted');}catch(FamilyError $e){ensureSync($e->status===423,'reconnection rechecks vault session');}
ensureSync($vaultCloud===$beforeVault,'revoked session exports no credentials');
echo "Sheet reconnection checks passed\n";
