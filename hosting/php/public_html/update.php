<?php
declare(strict_types=1);
ini_set('display_errors','0');
// Stable recovery entry: never overwritten by a remote release package.
require dirname(__DIR__).'/family-private/updater.php';
header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');header('X-Content-Type-Options: nosniff');
try{
    $file=dirname(__DIR__).'/family-private/config.php';$c=is_file($file)?require $file:null;
    if(!is_array($c)||!is_string($c['access_password']??null)||!is_string($c['public_origin']??null))throw new FamilyUpdateError('Chưa đọc được cấu hình website.',503);
    $c['public_origin']=rtrim($c['public_origin'],'/');$origin=parse_url($c['public_origin']);
    $test=($origin['scheme']??'')==='http'&&getenv('FAMILY_ALLOW_HTTP')==='1'&&in_array($origin['host']??'',['127.0.0.1','localhost'],true);
    if(!$origin||(($origin['scheme']??'')!=='https'&&!$test)||isset($origin['user'])||isset($origin['pass'])||isset($origin['query'])||isset($origin['fragment'])||!empty($origin['path']))throw new FamilyUpdateError('Địa chỉ website chưa hợp lệ.',503);
    $host=$origin['host'].(isset($origin['port'])?':'.$origin['port']:'');if(($_SERVER['HTTP_HOST']??'')!==$host)throw new FamilyUpdateError('Địa chỉ truy cập không hợp lệ.',403);
    $method=$_SERVER['REQUEST_METHOD'];$action=$_GET['action']??'status';
    if($method==='POST'){
        if(($_SERVER['HTTP_X_FAM_REQUEST']??'')!=='1'||(isset($_SERVER['HTTP_ORIGIN'])&&$_SERVER['HTTP_ORIGIN']!==$c['public_origin']))throw new FamilyUpdateError('Nguồn yêu cầu không hợp lệ.',403);
        if(!preg_match('~^application/json(?:;|$)~i',$_SERVER['CONTENT_TYPE']??''))throw new FamilyUpdateError('Yêu cầu cần JSON.',415);
    }
    if($action==='unlock'&&$method==='POST'){
        $raw=file_get_contents('php://input',false,null,0,16385);$data=strlen($raw)<=16384?json_decode($raw,true):null;
        if(!is_array($data)||!is_string($data['password']??null))throw new FamilyUpdateError('Nhập mật khẩu truy cập website.');
        $updater=new FamilyUpdater(dirname(__DIR__).'/family-private',__DIR__,$c);$updater->unlock($data['password']);
        $expiry=(string)(int)(microtime(true)*1000+30*86400000);$cookie=$expiry.'.'.hash_hmac('sha256',$expiry,hash('sha256',"family-hosting-session\0".$c['access_password'],true));
        setcookie('fam_access',$cookie,['expires'=>time()+30*86400,'path'=>'/','secure'=>!$test,'httponly'=>true,'samesite'=>'Strict']);
        $updater->status();echo json_encode(['ok'=>true]);exit;
    }
    $cookie=$_COOKIE['fam_access']??'';$parts=[];
    if(!is_string($cookie)||!preg_match('/^(\d{13})\.([a-f0-9]{64})$/D',$cookie,$parts)||(float)$parts[1]<=microtime(true)*1000||!hash_equals(hash_hmac('sha256',$parts[1],hash('sha256',"family-hosting-session\0".$c['access_password'],true)),$parts[2]))throw new FamilyUpdateError('Mở khóa website để cập nhật.',401);
    $updater=new FamilyUpdater(dirname(__DIR__).'/family-private',__DIR__,$c);
    if($action==='health'&&$method==='GET'){
        if(!$updater->probeAllowed($_SERVER['HTTP_X_FAMILY_UPDATE_PROBE']??''))throw new FamilyUpdateError('Không tìm thấy.',404);
        foreach(['core','business','statistics','import','audit','issues','vault','records','sheets'] as $part)require dirname(__DIR__).'/family-private/'.$part.'.php';
        $build=require dirname(__DIR__).'/family-private/version.php';$verified=config();
        // A boot probe must never run schema migrations. The declared schema,
        // actual application requirement and existing database must all agree.
        if(!defined('FAMILY_DATA_SCHEMA_VERSION')||FAMILY_DATA_SCHEMA_VERSION!==($build['schema']??null))throw new FamilyUpdateError('Mã mới và cấu trúc dữ liệu khai báo chưa khớp.',503);
        $db=new PDO('mysql:host='.$verified['db_host'].';port='.($verified['db_port']??3306).';dbname='.$verified['db_name'].';charset=utf8mb4',$verified['db_user'],$verified['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
        $schema=(int)$db->query("SELECT value FROM app_meta WHERE name='schema_version'")->fetchColumn();
        echo json_encode(['ok'=>$schema===FAMILY_DATA_SCHEMA_VERSION,'version'=>$build['version'],'schema'=>$schema]);exit;
    }
    if($action==='status'&&$method==='GET')$result=$updater->status();
    elseif($action==='check'&&$method==='POST')$result=$updater->check();
    elseif($action==='apply'&&$method==='POST'){
        $raw=file_get_contents('php://input',false,null,0,16385);if(strlen($raw)>16384)throw new FamilyUpdateError('Yêu cầu quá lớn.',413);
        $data=json_decode($raw,true);if(!is_array($data)||!is_string($data['version']??null)||!is_string($data['token']??null))throw new FamilyUpdateError('Yêu cầu cập nhật không hợp lệ.');
        ignore_user_abort(true);@set_time_limit(180);$result=$updater->apply($data['version'],$data['token']);
    }elseif($action==='backup'&&$method==='GET'){
        $path=$updater->backupFile();if(!$path)throw new FamilyUpdateError('Chưa có bản sao trước cập nhật.',404);
        header('Content-Type: application/gzip');header('Content-Disposition: attachment; filename="family-before-update.json.gz"');readfile($path);exit;
    }else throw new FamilyUpdateError('Không tìm thấy.',404);
    echo json_encode($result,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);
}catch(Throwable $error){
    http_response_code($error instanceof FamilyUpdateError?$error->status:503);
    echo json_encode(['error'=>$error instanceof FamilyUpdateError?$error->getMessage():'Chưa thể kiểm tra cập nhật. Website giữ bản hiện tại; thử lại sau.'],JSON_UNESCAPED_UNICODE);
}
