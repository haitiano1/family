<?php
declare(strict_types=1);
ini_set('display_errors','0');
const FAMILY_DATA_SCHEMA_VERSION=8;
class FamilyError extends RuntimeException {
    public function __construct(string $message, public int $status=400) {parent::__construct($message);}
}
function fail(string $message,int $status=400): never {throw new FamilyError($message,$status);}
function reply(mixed $data,int $status=200): never {
    if(function_exists('finishAudit'))finishAudit($status<400);
    http_response_code($status);header('Content-Type: application/json; charset=utf-8');header('Cache-Control: no-store');
    echo json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);exit;
}
function config(): array {
    $file=__DIR__.'/config.php';
    if (!is_readable($file)) fail('Chưa cấu hình Family. Điền file family-private/config.php theo hướng dẫn cài đặt.',503);
    $c=require $file;
    if (!is_array($c)) fail('Cấu hình Family không hợp lệ.',503);
    $origin=rtrim((string)($c['public_origin']??''),'/');$url=parse_url($origin);
    $testHttp=($url['scheme']??'')==='http' && getenv('FAMILY_ALLOW_HTTP')==='1' && in_array($url['host']??'', ['127.0.0.1','localhost'],true);
    if (!$url || (($url['scheme']??'')!=='https' && !$testHttp) || !empty($url['path']) || !empty($url['query']) || !empty($url['fragment']) || !empty($url['user']) || !empty($url['pass'])) fail('Địa chỉ ứng dụng cần là HTTPS, không kèm đường dẫn.',503);
    if (!is_string($c['access_password']??null) || strlen($c['access_password'])<7 || str_starts_with($c['access_password'],'YOUR_')) fail('Điền mật khẩu truy cập riêng dài hơn 6 ký tự.',503);
    foreach(['db_name','db_user'] as $field) if (!preg_match('/^[A-Za-z0-9_]+$/D',(string)($c[$field]??'')) || str_starts_with($c[$field],'YOUR_')) fail('Điền tên database và người dùng MySQL đầy đủ do Hostinger cấp.',503);
    $c['public_origin']=$origin;$c['secure']=!$testHttp;
    return $c;
}
function checkRequest(array $c): void {
    $url=parse_url($c['public_origin']);$host=$url['host'].(isset($url['port'])?':'.$url['port']:'');
    if (($_SERVER['HTTP_HOST']??'')!==$host) fail('Địa chỉ truy cập không hợp lệ.',403);
    if (!in_array($_SERVER['REQUEST_METHOD'],['GET','HEAD'],true)) {
        if (isset($_SERVER['HTTP_ORIGIN']) && $_SERVER['HTTP_ORIGIN']!==$c['public_origin']) fail('Nguồn yêu cầu không hợp lệ.',403);
        if (($_SERVER['HTTP_X_FAM_REQUEST']??'')!=='1') fail('Yêu cầu thay đổi không hợp lệ.',403);
    }
}
function accessKey(array $c): string {return hash('sha256',"family-hosting-session\0".$c['access_password'],true);}
function authorized(array $c): bool {
    $token=$_COOKIE['fam_access']??'';
    if (!is_string($token) || !preg_match('/^(\d{13})\.([a-f0-9]{64})$/D',$token,$parts)) return false;
    return (float)$parts[1]>microtime(true)*1000 && hash_equals(hash_hmac('sha256',$parts[1],accessKey($c)),$parts[2]);
}
function accessCookie(array $c,bool $close=false): void {
    $expires=(string)(int)floor(microtime(true)*1000+30*86400000);
    setcookie('fam_access',$close?'':$expires.'.'.hash_hmac('sha256',$expires,accessKey($c)),['expires'=>$close?1:time()+30*86400,'path'=>'/','secure'=>$c['secure'],'httponly'=>true,'samesite'=>'Strict']);
}
function db(array $c): PDO {
    try {$db=new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);}
    catch (PDOException $e) {error_log('Family database connection failed.');fail('Không kết nối được MySQL. Kiểm tra cấu hình database của website Family.',503);}
    databaseLock($db,$c);
    initializeSchema($db);
    ensureLookupSchema($db);
    return $db;
}
// Named locks are connection-scoped; do not recursively acquire the same lock.
function databaseOwnsLock(PDO $db,array $c): bool {
    $row=q($db,'SELECT IS_USED_LOCK(?) AS owner,CONNECTION_ID() AS current_id',['family:'.$c['db_name']])->fetch();
    return $row['owner']!==null&&(string)$row['owner']===(string)$row['current_id'];
}
function databaseLock(PDO $db,array $c,int $wait=10): void {
    if(databaseOwnsLock($db,$c))return;
    if((int)q($db,'SELECT GET_LOCK(?,?) AS ok',['family:'.$c['db_name'],$wait])->fetch()['ok']!==1)fail('Ứng dụng đang xử lý dữ liệu. Thử lại sau ít giây.',503);
}
function databaseUnlock(PDO $db,array $c): void {
    if($db->inTransaction())throw new RuntimeException('Cannot release the application lock during a transaction.');
    if(databaseOwnsLock($db,$c))q($db,'SELECT RELEASE_LOCK(?)',['family:'.$c['db_name']]);
}
function q(PDO $db,string $sql,array $args=[]): PDOStatement {$stmt=$db->prepare($sql);$stmt->execute($args);return $stmt;}
function one(PDO $db,string $sql,array $args=[]): array|false {return q($db,$sql,$args)->fetch();}
function all(PDO $db,string $sql,array $args=[]): array {return q($db,$sql,$args)->fetchAll();}
function stamp(): string {return gmdate('Y-m-d\TH:i:s.000\Z');}
function today(): string {return (new DateTimeImmutable('now',new DateTimeZone('Asia/Ho_Chi_Minh')))->format('Y-m-d');}
function logEntry(PDO $db,string $message): void {if(isset($GLOBALS['audit_scope'])){$GLOBALS['audit_scope']['messages'][]=$message;return;}q($db,'INSERT INTO logs(message,created_at) VALUES (?,?)',[$message,stamp()]);}
function body(int $limit=16384): array {
    if (!preg_match('~^application/json(?:;|$)~i',$_SERVER['CONTENT_TYPE']??'')) fail('Yêu cầu cần Content-Type application/json.',415);
    $stream=fopen('php://input','rb');$raw=stream_get_contents($stream,$limit+1);fclose($stream);
    if (strlen($raw)>$limit) fail('Dữ liệu quá lớn.',413);
    try {$object=json_decode($raw,false,512,JSON_THROW_ON_ERROR);if (!$object instanceof stdClass) fail('Dữ liệu cần là một đối tượng.');return json_decode($raw,true,512,JSON_THROW_ON_ERROR);}
    catch (JsonException $e) {fail('JSON không hợp lệ.');}
}
function text(mixed $value,int $max=1000): string {
    if ($value!==null && !is_string($value)) fail('Dữ liệu văn bản không hợp lệ.');$s=trim($value??'');
    if (!preg_match('//u',$s) || preg_match_all('/./us',$s)>$max) fail("Nội dung không được quá $max ký tự.");return $s;
}
function email(mixed $value): string {$s=strtolower(text($value,254));if (!preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/uD',$s)) fail('Email không hợp lệ.');return $s;}
function calendarDate(mixed $value): string {
    if (!$value) return '';
    if (!is_string($value) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$value,$p) || !checkdate((int)$p[2],(int)$p[3],(int)$p[1])) fail('Ngày không hợp lệ.');return $value;
}
function purchaseExpiry(string $joined,int $months): string {
    calendarDate($joined);if(!$joined||$months<1||$months>120)fail('Nhập ngày mua và gói tháng hợp lệ.');
    $target=(new DateTimeImmutable(substr($joined,0,7).'-01',new DateTimeZone('UTC')))->modify("+$months months");
    return calendarDate($target->format('Y-m-').str_pad((string)min((int)substr($joined,8,2),(int)$target->format('t')),2,'0',STR_PAD_LEFT));
}
function integer(mixed $value,int $min,int $max,string $message): int {
    if ($min===0 && is_string($value) && trim($value)==='') return 0;
    if ((!is_int($value) && !is_float($value) && !is_string($value)) || !is_numeric($value) || (float)$value!=(int)$value || (float)$value<$min || (float)$value>$max) fail($message);return (int)$value;
}
function memberValues(array $d): array {
    $joined=calendarDate($d['joined_at']??'');$expires=calendarDate($d['expires_at']??'');if ($joined && $expires && $expires<$joined) fail('Ngày hết hạn phải từ ngày mua trở đi.');
    $payment=$d['payment_status']??'unpaid';if (!in_array($payment,['unknown','unpaid','partial','paid'],true)) fail('Trạng thái thanh toán không hợp lệ.');
    $membership=$d['membership_status']??'unknown';if (!in_array($membership,['unknown','active','invited','new'],true)) fail('Trạng thái thành viên không hợp lệ.');
    if($membership==='new'&&!$joined)fail('Nhập Ngày mua để ghi nhận khách Mua mới.');
    return [email($d['email']??''),text($d['customer_name']??'',200),text($d['contact']??''),$joined,$expires,$payment,integer($d['amount']??0,0,1000000000,'Số tiền từ 0 đến 1 tỷ VND.'),text($d['note']??''),integer($d['plan_months']??0,0,120,'Gói mua cần từ 1 đến 120 tháng hoặc để chưa đặt.'),$membership];
}
function expiry(string $value): array {
    if (!$value) return ['expiry_status'=>'unknown','days_left'=>null];
    $days=(int)round((strtotime($value.' UTC')-strtotime(today().' UTC'))/86400);
    return ['expiry_status'=>$days<0?'expired':($days<=2?'due_soon':'active'),'days_left'=>$days];
}
function transaction(PDO $db,callable $operation): mixed {
    if($db->inTransaction())return $operation();
    $db->beginTransaction();try {$result=$operation();$db->commit();return $result;}catch (Throwable $e) {if ($db->inTransaction()) $db->rollBack();throw $e;}
}
function initializeSchema(PDO $db): void {
    $tables=array_map(fn($r)=>array_values($r)[0],all($db,'SHOW TABLES'));
    if ($tables && !in_array('app_meta',$tables,true)) fail('Database đang chứa dữ liệu khác. Tạo database trống riêng cho Family.',503);
    if (in_array('app_meta',$tables,true)) {
        $version=one($db,"SELECT value FROM app_meta WHERE name='schema_version'");
        if (($version['value']??'')===(string)FAMILY_DATA_SCHEMA_VERSION) return;
        if ($version && !in_array($version['value'],['1','2','3','4','5','6','7'],true)) fail('Database dùng phiên bản khác. Hãy dùng mã nguồn tương ứng.',503);
    }
    foreach(explode(';',file_get_contents(__DIR__.'/schema.sql')) as $sql) if (trim($sql)) $db->exec($sql);
    foreach(explode(';',file_get_contents(__DIR__.'/features.sql')) as $sql)if(trim($sql))$db->exec($sql);
    foreach(['families'=>['trial_date'],'issues'=>['trial_date','reported_on']]as $table=>$fields){$known=array_column(all($db,"SHOW COLUMNS FROM `$table`"),'Field');foreach($fields as $field)if(!in_array($field,$known,true))$db->exec("ALTER TABLE `$table` ADD COLUMN `$field` VARCHAR(10) NOT NULL DEFAULT ''");}
    foreach(['families'=>['archived_at'=>"VARCHAR(32) NOT NULL DEFAULT ''"],'archived_customers'=>['family_archive_id'=>'BIGINT NULL'],'other_purchases'=>['plan_months'=>'INT NOT NULL DEFAULT 0','purchase_source'=>"VARCHAR(200) NOT NULL DEFAULT ''"]] as $table=>$fields){$known=array_column(all($db,"SHOW COLUMNS FROM `$table`"),'Field');foreach($fields as $field=>$type)if(!in_array($field,$known,true))$db->exec("ALTER TABLE `$table` ADD COLUMN `$field` $type");}
    foreach(explode(';',file_get_contents(__DIR__.'/vault.sql')) as $sql)if(trim($sql))$db->exec($sql);
    if(!in_array('family_id',array_column(all($db,'SHOW COLUMNS FROM vault_items'),'Field'),true))$db->exec('ALTER TABLE vault_items ADD COLUMN family_id INT NULL, ADD UNIQUE KEY vault_family_link(family_id), ADD CONSTRAINT vault_family_fk FOREIGN KEY(family_id) REFERENCES families(id)');
    q($db,"INSERT INTO app_meta(name,value) VALUES ('schema_version',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[(string)FAMILY_DATA_SCHEMA_VERSION]);
}
// Tra cứu & chuyển nhóm tables are additive and created once, without changing the data schema version,
// so the one-click updater still treats this release as compatible. DDL runs outside any transaction.
// 2 (0.23.0): invite_mails for Gen mail mời and family_invites.sent_at.
// 3 (0.26.0): family_invites.retired_at for links of a replaced owner.
const FAMILY_LOOKUP_SCHEMA_VERSION=3;
function ensureLookupSchema(PDO $db): void {
    $row=one($db,"SELECT value FROM app_meta WHERE name='lookup_schema'");
    if(($row['value']??'')===(string)FAMILY_LOOKUP_SCHEMA_VERSION)return;
    foreach(explode(';',file_get_contents(__DIR__.'/lookup.sql')) as $sql)if(trim($sql))$db->exec($sql);
    // 0.23.0: Đã gửi tick on invite links (tables created by 0.21 lack the column).
    if(!in_array('sent_at',array_column(all($db,'SHOW COLUMNS FROM family_invites'),'Field'),true))$db->exec("ALTER TABLE family_invites ADD COLUMN sent_at VARCHAR(32) NOT NULL DEFAULT ''");
    if(!in_array('retired_at',array_column(all($db,'SHOW COLUMNS FROM family_invites'),'Field'),true))$db->exec("ALTER TABLE family_invites ADD COLUMN retired_at VARCHAR(32) NOT NULL DEFAULT ''");
    q($db,"INSERT IGNORE INTO lookup_settings(name,value) VALUES ('code_salt',?)",[bin2hex(random_bytes(32))]);
    q($db,"INSERT INTO app_meta(name,value) VALUES ('lookup_schema',?) ON DUPLICATE KEY UPDATE value=VALUES(value)",[(string)FAMILY_LOOKUP_SCHEMA_VERSION]);
}
function errorReply(Throwable $e): never {
    if ($e instanceof FamilyError) reply(['error'=>$e->getMessage()],$e->status);
    if ($e instanceof PDOException && ($e->errorInfo[1]??0)===1062) reply(['error'=>'Hồ sơ đã tồn tại; một email quản lý chỉ thuộc một Family.'],409);
    error_log('Family request failed: '.get_class($e));reply(['error'=>'Lỗi hệ thống. Kiểm tra cấu hình hoặc nhật ký lỗi của website Family.'],500);
}
