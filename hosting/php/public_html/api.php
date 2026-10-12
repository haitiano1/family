<?php
declare(strict_types=1);
require dirname(__DIR__).'/family-private/core.php';
require dirname(__DIR__).'/family-private/business.php';
require dirname(__DIR__).'/family-private/import.php';
try {
    $c=config();checkRequest($c);$route=parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH);$method=$_SERVER['REQUEST_METHOD'];
    if ($route==='/api/access' && $method==='POST') {
        $d=body();$db=db($c);$r=one($db,"SELECT value FROM app_meta WHERE name='login_attempts'");$attempts=$r?json_decode($r['value'],true):['end'=>0,'count'=>0];if(time()>$attempts['end'])$attempts=['end'=>time()+600,'count'=>0];
        if($attempts['count']>=30)fail('Đã thử quá nhiều lần. Vui lòng đợi 10 phút.',429);
        if(!is_string($d['password']??null)||!hash_equals(hash('sha256',$c['access_password']),hash('sha256',$d['password']))){$attempts['count']++;q($db,"INSERT INTO app_meta(name,value) VALUES ('login_attempts',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[json_encode($attempts)]);fail('Mật khẩu truy cập không đúng.',401);}
        accessCookie($c);reply(['ok'=>true]);
    }
    if(!authorized($c))fail('Nhập mật khẩu truy cập để mở dữ liệu.',401);
    if($route==='/api/access/close'&&$method==='POST'){accessCookie($c,true);reply(['ok'=>true]);}
    $db=db($c);
    if($route==='/api/backup'&&$method==='GET'){header('Content-Disposition: attachment; filename="family-backup-'.today().'.json"');reply(backup($db));}
    if($route==='/api/restore'&&$method==='POST')reply(restoreBackup($db,body(32000000)));
    if($route==='/api/state'&&$method==='GET'){
        sweep($db);$members=array_map(fn($m)=>[...$m,...expiry($m['expires_at'])],all($db,'SELECT m.*,f.name AS family_name,f.service,a.email AS manager_email FROM members m JOIN families f ON f.id=m.family_id JOIN accounts a ON a.id=f.manager_id ORDER BY m.id DESC'));
        $products=array_map(fn($p)=>[...$p,...expiry($p['expires_at'])],all($db,'SELECT * FROM other_purchases ORDER BY id DESC'));$count=fn($rows,$status)=>count(array_filter($rows,fn($r)=>$r['expiry_status']===$status));
        reply(['hosted'=>true,'other_products'=>$products,'other_reminders'=>['due_soon'=>$count($products,'due_soon'),'expired'=>$count($products,'expired')],'accounts'=>all($db,'SELECT a.*,f.id AS family_id,f.name AS family_name,f.service FROM accounts a LEFT JOIN families f ON f.manager_id=a.id ORDER BY a.id DESC'),'families'=>all($db,'SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id ORDER BY f.id DESC'),'members'=>$members,'archives'=>archives($db),'archive_mode'=>'declined','logs'=>all($db,'SELECT * FROM logs ORDER BY id DESC LIMIT 100'),'today'=>today(),'reminders'=>['expired'=>$count($members,'expired'),'due_soon'=>$count($members,'due_soon'),'unpaid'=>count(array_filter($members,fn($m)=>in_array($m['payment_status'],['unpaid','partial'],true))),'renewal_waiting'=>count(array_filter($members,fn($m)=>in_array($m['renewal_status'],['awaiting_payment','partial'],true))),'renewal_paid_pending'=>count(array_filter($members,fn($m)=>$m['renewal_status']==='paid'))]]);
    }
    if(preg_match('~^/api/import/(preview|commit)$~D',$route,$p)&&$method==='POST')reply(importCustomers($db,body(2000000),$p[1]==='commit',$c));
    if(preg_match('~^/api/members/(\d+)/renewal(/apply)?$~D',$route,$p)&&$method===(isset($p[2])?'POST':'PATCH'))reply(renew($db,(int)$p[1],body(),isset($p[2])));
    if(preg_match('~^/api/members/(\d+)/renewal-history$~D',$route,$p)&&$method==='GET'){if(!one($db,'SELECT id FROM members WHERE id=?',[(int)$p[1]]))fail('Không tìm thấy khách.',404);reply(['history'=>all($db,'SELECT * FROM renewal_history WHERE member_id=? ORDER BY id DESC',[(int)$p[1]])]);}
    if(preg_match('~^/api/archives/(\d+)/restore$~D',$route,$p)&&$method==='POST')reply(restoreArchive($db,(int)$p[1],body()));
    if(preg_match('~^/api/archives/(\d+)/history$~D',$route,$p)&&$method==='GET')reply(['history'=>all($db,'SELECT * FROM renewal_history WHERE archive_id=? ORDER BY id DESC',[(int)$p[1]])]);
    if(preg_match('~^/api/other-products(?:/(\d+))?$~D',$route,$p)&&in_array($method,['POST','PATCH','DELETE'],true)){
        $id=isset($p[1])?(int)$p[1]:null;
        if($method==='POST'&&!$id)reply(saveProduct($db,null,body()),201);
        if($method==='PATCH'&&$id)reply(saveProduct($db,$id,body()));
        if($method==='DELETE'&&$id){if(!one($db,'SELECT id FROM other_purchases WHERE id=?',[$id]))fail('Không tìm thấy sản phẩm.',404);q($db,'DELETE FROM other_purchases WHERE id=?',[$id]);logEntry($db,"Cá nhân: xóa sản phẩm khác #$id");reply(['ok'=>true]);}
    }
    if(preg_match('~^/api/accounts(?:/(\d+))?$~D',$route,$p)&&in_array($method,['POST','PATCH'],true)){
        $d=body();$address=email($d['email']??'');$note=text($d['note']??'');$id=isset($p[1])?(int)$p[1]:null;
        if($method==='POST'&&!$id){q($db,'INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)',[$address,$note,stamp()]);$id=(int)$db->lastInsertId();logEntry($db,"Cá nhân: thêm email quản lý $address");reply(['id'=>$id],201);}
        if($method==='PATCH'&&$id){if(!one($db,'SELECT id FROM accounts WHERE id=?',[$id]))fail('Không tìm thấy tài khoản.',404);if(one($db,'SELECT m.id FROM members m JOIN families f ON f.id=m.family_id WHERE f.manager_id=? AND m.email=?',[$id,$address]))fail('Email trùng thành viên của Family.');q($db,'UPDATE accounts SET email=?,note=? WHERE id=?',[$address,$note,$id]);reply(['ok'=>true]);}
    }
    if(preg_match('~^/api/families(?:/(\d+))?$~D',$route,$p)&&in_array($method,['POST','PATCH'],true)){
        $id=isset($p[1])?(int)$p[1]:null;if(($method==='POST'&&$id)||($method==='PATCH'&&!$id))fail('Không tìm thấy.',404);$d=body();$name=text($d['name']??'',200);if(!$name)fail('Tên không được để trống.');$service=$d['service']??'youtube';if(!in_array($service,['youtube','google_one','google_ai','other'],true))fail('Dịch vụ không hợp lệ.');$note=text($d['note']??'');
        $result=transaction($db,function()use($db,$id,$d,$name,$service,$note){
            if($id&&!one($db,'SELECT id FROM families WHERE id=?',[$id]))fail('Không tìm thấy Family.',404);$address=!empty($d['manager_email'])?email($d['manager_email']):null;$manager=$address?one($db,'SELECT * FROM accounts WHERE email=?',[$address]):one($db,'SELECT * FROM accounts WHERE id=?',[(int)($d['manager_id']??0)]);
            if(!$manager&&$address){q($db,'INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)',[$address,'',stamp()]);$manager=['id'=>(int)$db->lastInsertId(),'email'=>$address];}if(!$manager)fail('Nhập email quản lý Family hợp lệ.');
            if($id){if(one($db,'SELECT id FROM members WHERE family_id=? AND email=?',[$id,$manager['email']]))fail('Email quản lý trùng một khách trong nhóm.');q($db,'UPDATE families SET name=?,manager_id=?,service=?,note=? WHERE id=?',[$name,$manager['id'],$service,$note,$id]);logEntry($db,"Cá nhân: sửa Family #$id");return ['ok'=>true];}
            q($db,'INSERT INTO families(name,manager_id,service,note,created_at) VALUES (?,?,?,?,?)',[$name,$manager['id'],$service,$note,stamp()]);$new=(int)$db->lastInsertId();logEntry($db,"Cá nhân: tạo Family $name");return ['id'=>$new];
        });reply($result,$id?200:201);
    }
    if(preg_match('~^/api/members(?:/(\d+))?$~D',$route,$p)&&in_array($method,['POST','PATCH'],true)){
        $id=isset($p[1])?(int)$p[1]:null;if(($method==='POST'&&$id)||($method==='PATCH'&&!$id))fail('Không tìm thấy.',404);$d=body();$v=memberValues($d);$old=$id?one($db,'SELECT * FROM members WHERE id=?',[$id]):null;if($id&&!$old)fail('Không tìm thấy khách.',404);
        $family=one($db,'SELECT f.*,a.email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',[$old['family_id']??(int)($d['family_id']??0)]);if(!$family)fail('Không tìm thấy Family.');if($v[0]===$family['email'])fail('Email khách trùng tài khoản quản lý.');
        if($v[9]!=='invited'&&one($db,"SELECT COUNT(*) AS n FROM members WHERE family_id=? AND id!=? AND membership_status!='invited'",[$family['id'],$id??0])['n']>=5)fail('Family đã đủ 5 khách.');
        if($id){q($db,'UPDATE members SET email=?,customer_name=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=?,plan_months=?,membership_status=?,renewal_revision=renewal_revision+1 WHERE id=?',[...$v,$id]);logEntry($db,"Cá nhân: cập nhật khách #$id");reply(['ok'=>true]);}
        q($db,'INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note,plan_months,membership_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$family['id'],...$v]);$new=(int)$db->lastInsertId();logEntry($db,"Cá nhân: thêm khách {$v[0]}");reply(['id'=>$new],201);
    }
    if(preg_match('~^/api/(accounts|families|members)/(\d+)$~D',$route,$p)&&$method==='DELETE'){
        $table=$p[1];$id=(int)$p[2];if(!one($db,"SELECT id FROM `$table` WHERE id=?",[$id]))fail('Không tìm thấy hồ sơ.',404);if($table==='accounts'&&one($db,'SELECT id FROM families WHERE manager_id=?',[$id]))fail('Hãy xóa hồ sơ Family liên quan trước.');q($db,"DELETE FROM `$table` WHERE id=?",[$id]);logEntry($db,"Cá nhân: xóa hồ sơ $table #$id");reply(['ok'=>true]);
    }
    fail('Không tìm thấy.',404);
}catch(Throwable $e){errorReply($e);}
