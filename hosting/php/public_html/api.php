<?php
declare(strict_types=1);
require dirname(__DIR__).'/family-private/runtime.php';
if(is_file(dirname(__DIR__).'/family-private/.updates/maintenance.json')&&($_SERVER['REQUEST_METHOD']??'')==='POST'&&parse_url($_SERVER['REQUEST_URI']??'',PHP_URL_PATH)==='/api/access'){$_GET['action']='unlock';require __DIR__.'/update.php';exit;}
familyRuntimeEnter();
require dirname(__DIR__).'/family-private/core.php';
require dirname(__DIR__).'/family-private/business.php';
require dirname(__DIR__).'/family-private/statistics.php';
require dirname(__DIR__).'/family-private/import.php';
require dirname(__DIR__).'/family-private/audit.php';
require dirname(__DIR__).'/family-private/issues.php';
require dirname(__DIR__).'/family-private/vault.php';
require dirname(__DIR__).'/family-private/records.php';
require dirname(__DIR__).'/family-private/product-import.php';
require dirname(__DIR__).'/family-private/sheets.php';
require dirname(__DIR__).'/family-private/lookup.php';
try {
    $c=config();checkRequest($c);$route=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);$method=$_SERVER['REQUEST_METHOD'];
    if ($route==='/api/access' && $method==='POST') {
        $d=body();$db=db($c);$r=one($db,"SELECT value FROM app_meta WHERE name='login_attempts'");$attempts=$r?json_decode($r['value'],true):['end'=>0,'count'=>0];if(time()>$attempts['end'])$attempts=['end'=>time()+600,'count'=>0];
        if($attempts['count']>=30)fail('Đã thử quá nhiều lần. Vui lòng đợi 10 phút.',429);
        if(!is_string($d['password']??null)||!hash_equals(hash('sha256',$c['access_password']),hash('sha256',$d['password']))){$attempts['count']++;q($db,"INSERT INTO app_meta(name,value) VALUES ('login_attempts',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[json_encode($attempts)]);fail('Mật khẩu truy cập không đúng.',401);}
        accessCookie($c);reply(['ok'=>true]);
    }
    if(isset(LOOKUP_GUIDE_VIDEOS[$route])&&in_array($method,['GET','HEAD'],true))lookupGuideVideo(LOOKUP_GUIDE_VIDEOS[$route]);
    if(str_starts_with($route,'/api/lookup/'))lookupRequest(db($c),$c,$route,$method);
    if(!authorized($c))fail('Nhập mật khẩu truy cập để mở dữ liệu.',401);
    if($route==='/api/access/close'&&$method==='POST'){accessCookie($c,true);reply(['ok'=>true]);}
    $db=db($c);
    if(str_starts_with($route,'/api/sheets'))sheetsRequest($db,$c,$route,$method);
    if($route==='/api/vault/sheets-sync'&&$method==='POST')sheetsVaultRequest($db,$c);
    if(str_starts_with($route,'/api/vault/'))vaultRequest($db,$c,$route,$method);
    if($route==='/api/state'||(!in_array($method,['GET','HEAD'],true)))beginAudit($db,auditAction($method,$route),$route==='/api/state'?'Hệ thống':'Cá nhân');
    lookupAdminRequest($db,$route,$method);
    if($route==='/api/statistics'&&$method==='GET')reply(renewalStatistics($db,$_GET));
    if($route==='/api/journal'&&$method==='GET')reply(journal($db));
    if(preg_match('~^/api/journal/(audit|log)/(\d+)$~D',$route,$p)&&$method==='GET')reply(journalEntry($db,$p[1],(int)$p[2]));
    if($route==='/api/issues/order'&&$method==='POST')reply(reorderIssues($db,body(262144)));
    if($route==='/api/other-products/import/preview'&&$method==='POST')reply(productImportPreview($db,body(2000000)));
    if($route==='/api/other-products/import/confirm'&&$method==='POST')reply(productImportConfirm($db,body(2000000)));
    if(preg_match('~^/api/issues(?:/(\d+))?$~D',$route,$p)&&in_array($method,['POST','PATCH'],true)){
        $id=isset($p[1])?(int)$p[1]:null;if(($method==='POST'&&$id)||($method==='PATCH'&&!$id))fail('Không tìm thấy.',404);reply(saveIssue($db,$id,body()),$id?200:201);
    }
    if(preg_match('~^/api/issues/(\d+)$~D',$route,$p)&&$method==='DELETE')reply(deleteIssue($db,(int)$p[1],body()));
    if($route==='/api/backup'&&$method==='GET'){header('Content-Disposition: attachment; filename="family-backup-'.today().'.json"');reply(backup($db));}
    if($route==='/api/restore'&&$method==='POST')reply(restoreBackup($db,body(32000000)));
    if($route==='/api/state'&&$method==='GET'){
        sweep($db);$members=array_map(fn($m)=>[...$m,...expiry($m['expires_at'])],all($db,'SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id ORDER BY (CHAR_LENGTH(m.expires_at)=0) ASC,m.expires_at ASC,m.id ASC'));
        $products=array_map(fn($p)=>[...$p,...expiry($p['expires_at'])],all($db,'SELECT * FROM other_purchases ORDER BY id DESC'));$count=fn($rows,$status)=>count(array_filter($rows,fn($r)=>$r['expiry_status']===$status));
        $archives=archives($db);
        reply(['hosted'=>true,'sheets_supported'=>true,'updates_supported'=>true,...lookupAdminState($db),'issues'=>issueList($db),'other_products'=>$products,'other_reminders'=>['due_soon'=>$count($products,'due_soon'),'expired'=>$count($products,'expired')],'accounts'=>all($db,"SELECT a.*,f.id AS family_id,f.name AS family_name,f.service FROM accounts a LEFT JOIN families f ON f.manager_id=a.id AND f.archived_at='' ORDER BY a.id DESC"),'families'=>all($db,"SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at='' ORDER BY (CHAR_LENGTH(f.trial_date)=0),f.trial_date,f.id DESC"),'archived_families'=>archivedFamilies($db),'members'=>$members,'archives'=>$archives,'archive_mode'=>'immediate','logs'=>all($db,'SELECT * FROM logs ORDER BY id DESC LIMIT 100'),'today'=>today(),'reminders'=>['confirmed_pending'=>count(array_filter($members,'pendingPayment')),'expired'=>$count($members,'expired'),'due_soon'=>$count($members,'due_soon'),'unpaid'=>count(array_filter($members,fn($m)=>in_array($m['payment_status'],['unpaid','partial'],true))),'renewal_waiting'=>count(array_filter($members,fn($m)=>in_array($m['renewal_status'],['awaiting_payment','partial'],true))),'renewal_paid_pending'=>count(array_filter($members,fn($m)=>$m['renewal_status']==='paid'))]]);
    }
    if(preg_match('~^/api/import/(preview|commit)$~D',$route,$p)&&$method==='POST')reply(importCustomers($db,body(2000000),$p[1]==='commit',$c));
    if(preg_match('~^/api/members/(\d+)/transfer$~D',$route,$p)&&$method==='POST'){$r=transferMember($db,(int)$p[1],body());$moved=one($db,'SELECT family_id FROM members WHERE id=?',[(int)$p[1]]);if($moved)lookupAutoAssign($db,(int)$moved['family_id']);reply($r);}
    if(preg_match('~^/api/members/(\d+)/renewal(/apply)?$~D',$route,$p)&&$method===(isset($p[2])?'POST':'PATCH'))reply(renew($db,(int)$p[1],body(),isset($p[2])));
    if(preg_match('~^/api/members/(\d+)/renewal-history$~D',$route,$p)&&$method==='GET'){if(!one($db,'SELECT id FROM members WHERE id=?',[(int)$p[1]]))fail('Không tìm thấy khách.',404);reply(['history'=>all($db,'SELECT * FROM renewal_history WHERE member_id=? ORDER BY id DESC',[(int)$p[1]])]);}
    if(preg_match('~^/api/archived-families/(\d+)$~D',$route,$p)&&$method==='DELETE')reply(deleteArchivedFamily($db,(int)$p[1],body()));
    if(preg_match('~^/api/archived-families/(\d+)/restore$~D',$route,$p)&&$method==='POST')reply(restoreFamily($db,(int)$p[1]));
    if(preg_match('~^/api/archives/(\d+)$~D',$route,$p)&&$method==='DELETE')reply(deleteArchive($db,(int)$p[1],body()));
    if(preg_match('~^/api/archives/(\d+)/restore$~D',$route,$p)&&$method==='POST')reply(restoreArchive($db,(int)$p[1],body()));
    if(preg_match('~^/api/archives/(\d+)/history$~D',$route,$p)&&$method==='GET')reply(['history'=>all($db,'SELECT * FROM renewal_history WHERE archive_id=? ORDER BY id DESC',[(int)$p[1]])]);
    if(preg_match('~^/api/other-products(?:/(\d+))?$~D',$route,$p)&&in_array($method,['POST','PATCH','DELETE'],true)){
        $id=isset($p[1])?(int)$p[1]:null;
        if($method==='POST'&&!$id)reply(saveProduct($db,null,body()),201);
        if($method==='PATCH'&&$id)reply(saveProduct($db,$id,body()));
        if($method==='DELETE'&&$id)reply(archiveProduct($db,$id));
    }
    if(preg_match('~^/api/accounts(?:/(\d+))?$~D',$route,$p)&&in_array($method,['POST','PATCH'],true)){
        $d=body();$address=email($d['email']??'');$note=text($d['note']??'');$id=isset($p[1])?(int)$p[1]:null;
        if($method==='POST'&&!$id){q($db,'INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)',[$address,$note,stamp()]);$id=(int)$db->lastInsertId();logEntry($db,"Cá nhân: thêm email quản lý $address");reply(['id'=>$id],201);}
        if($method==='PATCH'&&$id){if(!one($db,'SELECT id FROM accounts WHERE id=?',[$id]))fail('Không tìm thấy tài khoản.',404);if(one($db,'SELECT m.id FROM members m JOIN families f ON f.id=m.family_id WHERE f.manager_id=? AND m.email=?',[$id,$address]))fail('Email trùng thành viên của Family.');q($db,'UPDATE accounts SET email=?,note=? WHERE id=?',[$address,$note,$id]);reply(['ok'=>true]);}
    }
    if(preg_match('~^/api/families(?:/(\d+))?$~D',$route,$p)&&in_array($method,['POST','PATCH'],true)){
        $id=isset($p[1])?(int)$p[1]:null;if(($method==='POST'&&$id)||($method==='PATCH'&&!$id))fail('Không tìm thấy.',404);reply(saveFamilyRecord($db,$id,body()),$id?200:201);
    }
    if(preg_match('~^/api/members(?:/(\d+))?$~D',$route,$p)&&in_array($method,['POST','PATCH'],true)){
        $id=isset($p[1])?(int)$p[1]:null;if(($method==='POST'&&$id)||($method==='PATCH'&&!$id))fail('Không tìm thấy.',404);reply(saveMemberRecord($db,$id,body()),$id?200:201);
    }
    if(preg_match('~^/api/(accounts|families|members)/(\d+)$~D',$route,$p)&&$method==='DELETE'){
        $table=$p[1];$id=(int)$p[2];if(!one($db,"SELECT id FROM `$table` WHERE id=?",[$id]))fail('Không tìm thấy hồ sơ.',404);if($table==='accounts'&&one($db,'SELECT id FROM families WHERE manager_id=?',[$id]))fail('Hãy xóa hồ sơ Family liên quan trước.');if($table==='members')reply(archiveMember($db,$id));if($table==='families')reply(archiveFamily($db,$id));q($db,"DELETE FROM `$table` WHERE id=?",[$id]);logEntry($db,"Cá nhân: xóa hồ sơ $table #$id");reply(['ok'=>true]);
    }
    fail('Không tìm thấy.',404);
}catch(Throwable $e){errorReply($e);}
