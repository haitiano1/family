<?php
declare(strict_types=1);
require __DIR__.'/core.php';require __DIR__.'/updater.php';
ini_set('display_errors','1');
$c=config();$private=__DIR__;$public='/var/www/html';$count=0;
function verifyUpdate(bool $ok,string $name): void {global $count;if(!$ok)throw new RuntimeException('Updater fixture: '.$name);$count++;}
function rejectedUpdate(callable $operation,string $expected): void {try{$operation();throw new RuntimeException('Unexpected accepted update.');}catch(FamilyUpdateError $error){verifyUpdate(str_contains($error->getMessage(),$expected),'expected rejection');}}
$base=__DIR__.'/.updates/test-inputs';if(!is_dir($base))mkdir($base,0700,true);
$baselineConfig=file_get_contents(__DIR__.'/config.php');$baselineApp=file_get_contents($public.'/app.js');$baselineVersion=json_decode(file_get_contents(__DIR__.'/version.json'),true)['version'];
$parts=explode('.',$baselineVersion);$next=$parts[0].'.'.$parts[1].'.'.((int)$parts[2]+1);$after=$parts[0].'.'.$parts[1].'.'.((int)$parts[2]+2);
$template=new PharData(__DIR__.'/release-artifact.zip');$templateMeta=json_decode($template['family-package.json']->getContent(),true);$templateFiles=[];foreach($templateMeta['files'] as $name=>$spec)$templateFiles[$name]=$template[$name]->getContent();
$input=null;$calls=[];$probe=true;
$fetch=function($url,$limit)use(&$input,&$calls){$calls[]=$url;
    if(str_ends_with($url,'/releases/latest'))return json_encode(['draft'=>false,'prerelease'=>false,'tag_name'=>'v'.$input['version'],'body'=>"Bản kiểm thử cập nhật.\nKhông có dữ liệu thật.",'assets'=>[['name'=>'family-latest.json','browser_download_url'=>'https://github.com/haitiano1/family/releases/download/v'.$input['version'].'/family-latest.json'],['name'=>'family-php-release.zip','browser_download_url'=>$input['manifest']['url']]]]);
    if(str_ends_with($url,'family-latest.json'))return json_encode($input['manifest']);
    if(str_ends_with($url,'family-php-release.zip'))return file_get_contents($input['zip']);
    throw new RuntimeException('Unexpected source URL.');
};
$cookieExpires=(string)(int)(microtime(true)*1000+600000);$cookie=$cookieExpires.'.'.hash_hmac('sha256',$cookieExpires,accessKey($c));
$http=function($path,array $headers=[])use($c,$cookie){$ch=curl_init('http://127.0.0.1'.$path);curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>8,CURLOPT_HTTPHEADER=>['Host: '.parse_url($c['public_origin'],PHP_URL_HOST).':'.parse_url($c['public_origin'],PHP_URL_PORT),'Cookie: fam_access='.$cookie,...$headers]]);$text=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);return [$status,json_decode($text?:'',true)];};
$health=function($candidate,$nonce)use(&$probe,$http){
    [$status]=$http('/api/state');verifyUpdate($status===503,'ordinary API blocked during activation');
    if(!$probe)return false;
    [$status,$data]=$http('/update.php?action=health',['X-Family-Update-Probe: '.$nonce]);
    verifyUpdate($status===200&&($data['version']??'')===$candidate['version'],'fresh PHP process reads installed version');return $status===200&&($data['schema']??null)===$candidate['schema'];
};
$make=function($version,array $change=[],array $manifestChange=[])use($base,$private,$public,$templateFiles){
    $files=$templateFiles;
    $files['family-private/version.json']=json_encode(['version'=>$version,'schema'=>8,'protocol'=>1]);
    $files['family-private/version.php']="<?php return ['version'=>'".$version."','schema'=>8,'protocol'=>1];";
    $files['public_html/app.js'].="\n// update fixture ".$version."\n";
    $files=[...$files,...$change];$spec=[];foreach($files as $name=>$value)$spec[$name]=['size'=>strlen($value),'sha256'=>hash('sha256',$value)];
    $zip=$base.'/'.bin2hex(random_bytes(8)).'.zip';$archive=new PharData($zip,0,null,Phar::ZIP);foreach($files as $name=>$value)$archive[$name]=$value;$archive['family-package.json']=json_encode(['format'=>'family-php-package','version'=>$version,'schema'=>8,'protocol'=>1,'files'=>$spec]);unset($archive);
    return ['version'=>$version,'zip'=>$zip,'manifest'=>[...['format'=>'family-php-release','protocol'=>1,'version'=>$version,'schema'=>8,'min_php'=>'8.2.0','size'=>filesize($zip),'sha256'=>hash_file('sha256',$zip),'url'=>'https://github.com/haitiano1/family/releases/download/v'.$version.'/family-php-release.zip'],...$manifestChange]];
};
$engine=fn()=>new FamilyUpdater($private,$public,$c,$fetch,$health);
$input=$make($next);$u=$engine();$status=$u->check();verifyUpdate($status['available']&&$status['current']===$baselineVersion,'new release offered');
rejectedUpdate(fn()=>$u->apply($next,'bad-token'),'thay đổi');verifyUpdate(file_get_contents($public.'/app.js')===$baselineApp,'invalid challenge leaves files intact');
$result=$u->apply($next,$status['token']);verifyUpdate($result['ok']&&$u->current()['version']===$next,'successful update');verifyUpdate(file_get_contents(__DIR__.'/config.php')===$baselineConfig,'configuration never replaced');
[$code]=$http('/api/state');verifyUpdate($code===200,'API resumes after successful update');
$backup=$u->backupFile();$snapshot=json_decode(gzdecode(file_get_contents($backup)),true);verifyUpdate($snapshot['format']==='family-customer-backup'&&$snapshot['version']===9&&count($snapshot['tables']['members'])===1,'private data snapshot taken');verifyUpdate(!str_contains(gzdecode(file_get_contents($backup)),$c['access_password']),'backup does not contain access configuration');
$installedApp=file_get_contents($public.'/app.js');
rejectedUpdate(fn()=>$u->apply($next,$status['token']),'thay đổi');
$input=$make($after,[],['sha256'=>str_repeat('0',64)]);$status=$u->check();rejectedUpdate(fn()=>$u->apply($after,$status['token']),'mã kiểm tra');verifyUpdate(file_get_contents($public.'/app.js')===$installedApp,'checksum failure preserves running version');
$input=$make($after,['family-private/config.php'=>"<?php return []; "]);$status=$u->check();rejectedUpdate(fn()=>$u->apply($after,$status['token']),'cấu hình');verifyUpdate(file_get_contents(__DIR__.'/config.php')===$baselineConfig,'config overwrite rejected before activation');
$input=$make($after,['family-private/core.php'=>'<?php function (']);$status=$u->check();rejectedUpdate(fn()=>$u->apply($after,$status['token']),'mã PHP');verifyUpdate(file_get_contents($public.'/app.js')===$installedApp,'PHP syntax failure never activates');
$input=$make($after);$input['zip']=__DIR__.'/traversal.zip';$input['manifest']['size']=filesize($input['zip']);$input['manifest']['sha256']=hash_file('sha256',$input['zip']);$status=$u->check();rejectedUpdate(fn()=>$u->apply($after,$status['token']),'');verifyUpdate(!is_file(dirname($private).'/escape.php'),'path traversal does not escape');
$input=$make($after,[],['url'=>'https://example.com/evil.zip']);rejectedUpdate(fn()=>$u->check(),'không thuộc');
$input=$make($after,[],['schema'=>9]);$status=$u->check();verifyUpdate(!$status['available'],'incompatible database update is not offered');rejectedUpdate(fn()=>$u->apply($after,$status['token']),'dữ liệu');
$input=$make($after,[],['min_php'=>'99.0.0']);$status=$u->check();verifyUpdate(!$status['available'],'unsupported PHP update is not offered');
$wrongSchemaCore=str_replace('const FAMILY_DATA_SCHEMA_VERSION=8;','const FAMILY_DATA_SCHEMA_VERSION=9;',$templateFiles['family-private/core.php']);$wrongSchemaCore=str_replace("['1','2','3','4','5','6']","['1','2','3','4','5','6','7']",$wrongSchemaCore);
$input=$make($after,['family-private/core.php'=>$wrongSchemaCore]);$status=$u->check();rejectedUpdate(fn()=>$u->apply($after,$status['token']),'khôi phục mã trước');$db=new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password']);verifyUpdate((int)$db->query("SELECT value FROM app_meta WHERE name='schema_version'")->fetchColumn()===8,'boot probe never runs a mismatched migration');unset($db);
rejectedUpdate(fn()=>new FamilyUpdater($public,$public,$c),'ngoài');
$outside=$base.'/outside.txt';file_put_contents($outside,'unchanged outside data');symlink($outside,$public.'/outside-link.js');$input=$make($after,['public_html/outside-link.js'=>'must not escape']);$status=$u->check();rejectedUpdate(fn()=>$u->apply($after,$status['token']),'liên kết');verifyUpdate(file_get_contents($outside)==='unchanged outside data','symlink target cannot be overwritten');unlink($public.'/outside-link.js');
$input=$make($after,['public_html/only-new.js'=>'// remove on rollback']);$status=$u->check();$probe=false;rejectedUpdate(fn()=>$u->apply($after,$status['token']),'khôi phục mã trước');$probe=true;verifyUpdate($u->current()['version']===$next&&file_get_contents($public.'/app.js')===$installedApp&&!is_file($public.'/only-new.js'),'failed boot restores original files and removes added file');
verifyUpdate(file_get_contents(__DIR__.'/config.php')===$baselineConfig,'configuration unchanged after rollback');
// Simulate a terminated process after its durable journal, with no installer lock.
$id=str_repeat('a',24);$dir=__DIR__.'/.updates/'.$id;mkdir($dir.'/before',0700,true);file_put_contents($dir.'/before/public_html__app.js',$installedApp);file_put_contents($public.'/app.js','partial activation');file_put_contents(__DIR__.'/.updates/maintenance.json','{}');file_put_contents(__DIR__.'/.updates/transaction.json',json_encode(['id'=>$id,'files'=>['public_html/app.js'=>['existed'=>true,'sha256'=>hash('sha256',$installedApp)]]]));
$lock=fopen(__DIR__.'/.updates/updater.lock','c+');flock($lock,LOCK_EX);verifyUpdate($engine()->status()['busy']===true&&file_get_contents($public.'/app.js')==='partial activation','active installer is not disturbed by status');flock($lock,LOCK_UN);fclose($lock);
$status=$engine()->status();verifyUpdate(str_contains($status['message'],'khôi phục')&&file_get_contents($public.'/app.js')===$installedApp,'interrupted activation recovers through stable entry');
[$code]=$http('/api/state');verifyUpdate($code===200,'API resumes after recovery');
verifyUpdate(file_get_contents(__DIR__.'/config.php')===$baselineConfig,'configuration unchanged after crash recovery');
// Cleanup interrupted after the commit marker must not revert healthy code.
$last=json_decode(file_get_contents(__DIR__.'/.updates/last-backup.json'),true);file_put_contents(__DIR__.'/.updates/maintenance.json','{}');file_put_contents(__DIR__.'/.updates/transaction.json',json_encode([...$last,'files'=>[],'committed'=>true]));
$status=$engine()->status();verifyUpdate(str_contains($status['message'],'hoàn tất')&&file_get_contents($public.'/app.js')===$installedApp&&!is_file(__DIR__.'/.updates/maintenance.json'),'interrupted commit cleanup finishes without rollback');
// Authentication and recovery remain possible with broken application PHP and
// no browser cookie: the maintenance login uses the stable recovery endpoint.
$id=str_repeat('b',24);$dir=__DIR__.'/.updates/'.$id;mkdir($dir.'/before',0700,true);$oldCore=file_get_contents(__DIR__.'/core.php');file_put_contents($dir.'/before/family-private__core.php',$oldCore);file_put_contents(__DIR__.'/.updates/transaction.json',json_encode(['id'=>$id,'files'=>['family-private/core.php'=>['existed'=>true,'sha256'=>hash('sha256',$oldCore)]]]));file_put_contents(__DIR__.'/.updates/maintenance.json','{}');file_put_contents(__DIR__.'/core.php','<?php function (');
$ch=curl_init('http://127.0.0.1/api/access');curl_setopt_array($ch,[CURLOPT_POST=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>8,CURLOPT_HTTPHEADER=>['Host: '.parse_url($c['public_origin'],PHP_URL_HOST).':'.parse_url($c['public_origin'],PHP_URL_PORT),'Content-Type: application/json','X-Fam-Request: 1'],CURLOPT_POSTFIELDS=>json_encode(['password'=>$c['access_password']])]);$reply=curl_exec($ch);$code=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);verifyUpdate($code===200&&(json_decode($reply,true)['ok']??false)===true&&file_get_contents(__DIR__.'/core.php')===$oldCore,'logged-out user can unlock and recover while application code is broken');

foreach($calls as $url)verifyUpdate(str_starts_with($url,'https://api.github.com/repos/haitiano1/family/')||str_starts_with($url,'https://github.com/haitiano1/family/releases/download/'),'only pinned repository is contacted');
echo 'Updater lifecycle checks passed: '.$count."\n";
