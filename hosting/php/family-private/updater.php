<?php
declare(strict_types=1);
// Stable bootstrap. It stays outside the files a release may replace so that
// interrupted installations remain recoverable even if application PHP fails.
class FamilyUpdateError extends RuntimeException {
    public function __construct(string $message,public int $status=400){parent::__construct($message);}
}
final class FamilyUpdater {
    public const REPOSITORY='haitiano1/family';
    public const LIMIT=25165824;
    private string $work;
    private mixed $operation=null;
    private mixed $runtime=null;
    private string $probeNote='';
    public function __construct(private string $private,private string $public,private array $config,private mixed $fetch=null,private mixed $probe=null){
        $this->private=realpath($private)?:$private;$this->public=realpath($public)?:$public;$this->work=$this->private.'/.updates';
        if($this->private===$this->public||str_starts_with($this->private,$this->public.'/'))$this->error('family-private cần nằm ngoài thư mục public_html.',503);
        if(!is_dir($this->work)&&!@mkdir($this->work,0700,true))$this->error('PHP chưa có quyền tạo thư mục cập nhật trong family-private.',503);
        if(is_link($this->work))$this->error('Thư mục cập nhật không hợp lệ.',503);
        @chmod($this->work,0700);
    }
    private function error(string $message,int $status=400): never {throw new FamilyUpdateError($message,$status);}
    private function read(string $path): ?array {
        if(!is_file($path)||filesize($path)>1048576)return null;
        $data=json_decode((string)@file_get_contents($path),true);return is_array($data)?$data:null;
    }
    private function json(string $path,array $data): void {$this->write($path,json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR),0600);}
    private function write(string $path,string $bytes,int $mode=0644): void {
        if(is_link($path)||!is_dir(dirname($path)))$this->error('Đường dẫn cập nhật không hợp lệ.',503);
        $tmp=dirname($path).'/.family-'.bin2hex(random_bytes(8)).'.tmp';
        try{if(@file_put_contents($tmp,$bytes,LOCK_EX)!==strlen($bytes)||!@chmod($tmp,$mode)||!@rename($tmp,$path))$this->error('Không ghi được file cập nhật. Đã dừng để giữ mã hiện tại.',503);}
        finally{if(is_file($tmp))@unlink($tmp);}
        if(str_ends_with($path,'.php')&&function_exists('opcache_invalidate')){
            $ok=@opcache_invalidate($path,true);
            if(!$ok&&function_exists('opcache_is_script_cached')&&@opcache_is_script_cached($path))$this->error('PHP chưa xóa được bộ nhớ đệm mã. Kiểm tra cấu hình OPcache.',503);
        }
    }
    public function current(): array {
        $current=$this->read($this->private.'/version.json');
        if(!$current||!$this->version($current['version']??null)||!is_int($current['schema']??null))$this->error('Chưa xác định được phiên bản đang cài. Cài đầy đủ gói kích hoạt cập nhật.',503);
        return $current;
    }
    public function unlock(string $password): void {
        $lock=@fopen($this->work.'/login.lock','c+');if(!$lock||!flock($lock,LOCK_EX))$this->error('Chưa mở được khóa truy cập. Thử lại sau.',503);
        try{
            $attempts=$this->read($this->work.'/login-attempts.json')??['until'=>time()+600,'count'=>0];
            if(($attempts['until']??0)<time())$attempts=['until'=>time()+600,'count'=>0];
            if(($attempts['count']??0)>=10)$this->error('Đã thử mật khẩu quá nhiều lần. Chờ 10 phút rồi thử lại.',429);
            if(!hash_equals(hash('sha256',$this->config['access_password']),hash('sha256',$password))){$attempts['count']++;$this->json($this->work.'/login-attempts.json',$attempts);$this->error('Mật khẩu truy cập không đúng.',401);}
        }finally{flock($lock,LOCK_UN);fclose($lock);}
    }
    private function version(mixed $value): bool {return is_string($value)&&preg_match('/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/D',$value)===1;}
    private function target(string $name): string {
        if(!preg_match('~^(family-private/[a-zA-Z0-9_-]+\.(?:php|sql|json)|public_html/[a-zA-Z0-9_.-]+\.(?:php|js|html|css|json|webmanifest|png))$~D',$name))$this->error('Gói chứa đường dẫn không được phép.');
        if(in_array($name,['family-private/config.php','family-private/updater.php','family-private/runtime.php','public_html/update.php'],true))$this->error('Gói cố thay cấu hình hoặc bộ khôi phục. Đã từ chối.');
        [$root,$file]=explode('/',$name,2);$base=$root==='family-private'?$this->private:$this->public;$path=$base.'/'.$file;
        if(is_link($path)||realpath(dirname($path))!==$base)$this->error('Gói chứa đường dẫn liên kết không được phép.');
        return $path;
    }
    private function url(string $url,bool $redirect=false): void {
        $parts=parse_url($url);$hosts=$redirect?['api.github.com','github.com','release-assets.githubusercontent.com','objects.githubusercontent.com']:['api.github.com','github.com'];
        if(!$parts||($parts['scheme']??'')!=='https'||!in_array(strtolower($parts['host']??''),$hosts,true)||isset($parts['user'])||isset($parts['pass'])||isset($parts['fragment'])||(isset($parts['port'])&&$parts['port']!==443))$this->error('Nguồn tải bản cập nhật không hợp lệ.',502);
    }
    private function download(string $url,int $limit): string {
        $this->url($url);
        if($this->fetch){$value=($this->fetch)($url,$limit);if(!is_string($value)||strlen($value)>$limit)$this->error('Bản cập nhật vượt giới hạn tải.',502);return $value;}
        if(!function_exists('curl_init'))$this->error('Bật extension cURL của PHP để tải cập nhật.',503);
        for($i=0;$i<6;$i++){
            $this->url($url,true);$body='';$location='';$tooLarge=false;$ch=curl_init($url);
            curl_setopt_array($ch,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>60,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>['Accept: application/json, application/octet-stream','User-Agent: Family-Hostinger-Updater/1'],CURLOPT_HEADERFUNCTION=>function($ch,$line)use(&$location){if(stripos($line,'Location:')===0)$location=trim(substr($line,9));return strlen($line);},CURLOPT_WRITEFUNCTION=>function($ch,$chunk)use(&$body,&$tooLarge,$limit){if(strlen($body)+strlen($chunk)>$limit){$tooLarge=true;return 0;}$body.=$chunk;return strlen($chunk);}]);
            $ok=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);
            if(!$ok)$this->error($tooLarge?'Gói vượt giới hạn tải.':'Chưa kết nối được GitHub. Website vẫn giữ bản hiện tại.',502);
            if(in_array($status,[301,302,303,307,308],true)&&$location!==''&&strlen($location)<=8192){$url=$location;continue;}
            if($status===404)$this->error('GitHub chưa có bản phát hành công khai kèm gói cập nhật.',404);
            if($status!==200)$this->error('GitHub chưa cho phép tải bản phát hành. Thử lại sau.',502);
            return $body;
        }
        $this->error('GitHub chuyển hướng quá nhiều lần.',502);
    }
    private function manifest(mixed $data): array {
        if(!is_array($data)||($data['format']??'')!=='family-php-release'||($data['protocol']??0)!==1||!$this->version($data['version']??null)||!$this->version($data['min_php']??null)||!is_int($data['schema']??null)||!is_int($data['size']??null)||$data['size']<1||$data['size']>self::LIMIT||!is_string($data['sha256']??null)||!preg_match('/^[a-f0-9]{64}$/D',$data['sha256']))$this->error('Thông tin bản phát hành không hợp lệ.',502);
        $expected='https://github.com/'.self::REPOSITORY.'/releases/download/v'.$data['version'].'/family-php-release.zip';
        if(($data['url']??'')!==$expected)$this->error('Gói cập nhật không thuộc bản phát hành của dự án.',502);
        return array_intersect_key($data,array_flip(['format','protocol','version','min_php','schema','size','sha256','url']));
    }
    private function requirements(): array {
        $missing=[];if(!class_exists('PharData'))$missing[]='Bật extension Phar của PHP.';if(!function_exists('curl_init')&&!$this->fetch)$missing[]='Bật extension cURL của PHP.';
        if(!function_exists('token_get_all'))$missing[]='Bật extension tokenizer của PHP.';if(!function_exists('gzencode'))$missing[]='Bật extension zlib của PHP.';
        if(!is_writable($this->private)||!is_writable($this->public))$missing[]='PHP cần quyền ghi vào family-private và public_html.';
        if(!is_writable($this->work))$missing[]='PHP cần quyền ghi vào thư mục cập nhật riêng.';
        if(filter_var(ini_get('opcache.enable'),FILTER_VALIDATE_BOOLEAN)&&!function_exists('opcache_invalidate'))$missing[]='Cho phép opcache_invalidate để áp dụng mã PHP mới.';
        return $missing;
    }
    private function lockOperation(): bool {
        $this->operation=@fopen($this->work.'/updater.lock','c+');
        return $this->operation&&flock($this->operation,LOCK_EX|LOCK_NB);
    }
    private function lockRuntime(): void {
        $this->runtime=@fopen($this->work.'/runtime.lock','c+');$until=microtime(true)+10;
        if(!$this->runtime)$this->error('Không mở được khóa cập nhật.',503);
        do{if(flock($this->runtime,LOCK_EX|LOCK_NB))return;usleep(100000);}while(microtime(true)<$until);
        $this->error('Có thao tác đang chạy. Chờ hoàn tất rồi cập nhật lại.',409);
    }
    private function unlockRuntime(): void {if(is_resource($this->runtime)){flock($this->runtime,LOCK_UN);fclose($this->runtime);}$this->runtime=null;}
    private function unlockOperation(): void {if(is_resource($this->operation)){flock($this->operation,LOCK_UN);fclose($this->operation);}$this->operation=null;}
    private function token(array $candidate,array $current,int $checked): string {return hash_hmac('sha256',json_encode([$candidate,$current,$checked]),hash('sha256','family-update-v1'.$this->config['access_password']));}
    public function status(): array {
        $recovered='';
        if($this->lockOperation()){
            try{if($this->read($this->work.'/transaction.json')){$this->lockRuntime();try{$recovered=$this->recover();}finally{$this->unlockRuntime();}}}finally{$this->unlockOperation();}
        }else{$this->unlockOperation();return ['current'=>$this->current()['version'],'busy'=>true,'message'=>'Đang cập nhật. Giữ cửa sổ này mở.'];}
        $current=$this->current();$cache=$this->read($this->work.'/latest.json');$candidate=null;$available=false;$token=null;$notice='';
        if($cache&&is_int($cache['checked']??null)&&time()-$cache['checked']<=900){
            $candidate=$this->manifest($cache['release']??null);$available=version_compare($candidate['version'],$current['version'],'>');$token=$this->token($candidate,$current,$cache['checked']);
            if($candidate['schema']!==$current['schema']){$available=false;$notice='Bản này cần nâng cấp dữ liệu riêng. Chưa tự thay mã để tránh không tương thích.';}
            if(version_compare(PHP_VERSION,$candidate['min_php'],'<')){$available=false;$notice='Bản mới cần PHP '.$candidate['min_php'].' trở lên.';}
        }
        return ['current'=>$current['version'],'latest'=>$candidate['version']??null,'available'=>$available,'token'=>$token,'requirements'=>$this->requirements(),'message'=>$recovered==='committed'?'Đã hoàn tất lượt cập nhật trước.':($recovered?'Đã khôi phục mã sau lượt cập nhật bị gián đoạn.':$notice),'notes'=>$cache['notes']??'','checked_at'=>$cache['checked']??null,'backup_available'=>is_file($this->work.'/last-backup.json'),'busy'=>false];
    }
    public function check(): array {
        $release=json_decode($this->download('https://api.github.com/repos/'.self::REPOSITORY.'/releases/latest',1048576),true);
        if(!is_array($release)||($release['draft']??true)||($release['prerelease']??true)||!is_array($release['assets']??null))$this->error('Chưa có bản phát hành ổn định hợp lệ.',502);
        $assets=[];foreach($release['assets'] as $asset)if(is_array($asset)&&is_string($asset['name']??null))$assets[$asset['name']]=$asset['browser_download_url']??'';
        if(!isset($assets['family-latest.json'],$assets['family-php-release.zip']))$this->error('Bản phát hành thiếu gói cập nhật tự động.',404);
        $tag=$release['tag_name']??'';if(!is_string($tag)||!$this->version(substr($tag,1))||$tag[0]!=='v')$this->error('Tên bản phát hành không hợp lệ.',502);
        $base='https://github.com/'.self::REPOSITORY.'/releases/download/'.$tag.'/';
        if($assets['family-latest.json']!==$base.'family-latest.json'||$assets['family-php-release.zip']!==$base.'family-php-release.zip')$this->error('Đường dẫn phát hành không thuộc dự án.',502);
        $manifest=$this->manifest(json_decode($this->download($assets['family-latest.json'],65536),true));
        if($tag!=='v'.$manifest['version']||$assets['family-php-release.zip']!==$manifest['url'])$this->error('Phiên bản và gói phát hành chưa khớp.',502);
        preg_match('/\A.{0,4000}/us',is_string($release['body']??null)?$release['body']:'',$notes);
        $this->json($this->work.'/latest.json',['release'=>$manifest,'checked'=>time(),'notes'=>$notes[0]??'']);
        return $this->status();
    }
    private function stage(array $candidate,string $dir): array {
        $bytes=$this->download($candidate['url'],self::LIMIT);
        if(strlen($bytes)!==$candidate['size']||!hash_equals($candidate['sha256'],hash('sha256',$bytes)))$this->error('Gói tải về không khớp mã kiểm tra. Chưa thay file nào.',502);
        $zip=$dir.'/release.zip';$this->write($zip,$bytes,0600);
        try{
            $archive=new PharData($zip);if($archive['family-package.json']->getSize()>262144)$this->error('Thông tin gói vượt giới hạn.');$meta=json_decode($archive['family-package.json']->getContent(),true);
            if(!is_array($meta)||($meta['format']??'')!=='family-php-package'||($meta['version']??'')!==$candidate['version']||($meta['schema']??null)!==$candidate['schema']||($meta['protocol']??null)!==1||!is_array($meta['files']??null)||count($meta['files'])>200)$this->error('Cấu trúc gói cập nhật không hợp lệ.');
            $seen=[];$total=0;
            foreach(new RecursiveIteratorIterator($archive) as $entry){if($entry->isDir())continue;$name=substr($entry->getPathname(),strlen('phar://'.$zip.'/'));if($entry->isLink()||isset($seen[$name]))$this->error('Gói chứa file trùng hoặc liên kết không hợp lệ.');$seen[$name]=true;if($name!=='family-package.json'&&!array_key_exists($name,$meta['files']))$this->error('Gói chứa file ngoài danh sách đã kiểm tra.');}
            if(count($seen)!==count($meta['files'])+1)$this->error('Gói cập nhật thiếu file.');
            foreach(['family-private/core.php','family-private/version.json','family-private/version.php','public_html/api.php','public_html/app.js'] as $required)if(!isset($meta['files'][$required]))$this->error('Gói cập nhật thiếu thành phần bắt buộc.');
            $files=[];
            foreach($meta['files'] as $name=>$spec){
                $this->target($name);
                if(!is_array($spec)||!is_int($spec['size']??null)||$spec['size']<0||$spec['size']>4194304||!is_string($spec['sha256']??null)||!preg_match('/^[a-f0-9]{64}$/D',$spec['sha256']))$this->error('Thông tin file trong gói không hợp lệ.');
                $total+=$spec['size'];if($total>self::LIMIT*2)$this->error('Gói giải nén vượt giới hạn.');
                $entry=$archive[$name];if($entry->getSize()!==$spec['size'])$this->error('Kích thước file cập nhật chưa khớp.');$content=$entry->getContent();
                if(strlen($content)!==$spec['size']||!hash_equals($spec['sha256'],hash('sha256',$content)))$this->error('Nội dung file cập nhật không khớp mã kiểm tra.');
                if(str_ends_with($name,'.php')){try{token_get_all($content,TOKEN_PARSE);}catch(ParseError $e){$this->error('Gói chứa mã PHP không chạy được trên phiên bản hiện tại.');}}
                $files[$name]=$content;
            }
            $version=json_decode($files['family-private/version.json'],true);if(!is_array($version)||($version['version']??'')!==$candidate['version']||($version['schema']??null)!==$candidate['schema'])$this->error('File phiên bản không khớp gói cập nhật.');
            return $files;
        }catch(FamilyUpdateError $e){throw $e;}catch(Throwable $e){$this->error('Không đọc được ZIP cập nhật. Chưa thay file nào.');}
    }
    private function databaseBackup(string $dir): void {
        $c=$this->config;
        $db=new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
        $schema=$db->query("SELECT value FROM app_meta WHERE name='schema_version'")->fetchColumn();if((int)$schema!==$this->current()['schema'])$this->error('Phiên bản dữ liệu chưa khớp mã hiện tại. Chưa cập nhật.',409);
        $tables=['accounts','families','members','archived_customers','renewal_history','other_purchases','logs','issues','audit_events','vault_meta','vault_items','new_purchase_history'];$rows=[];
        $db->beginTransaction();try{foreach($tables as $table)$rows[$table]=$db->query('SELECT * FROM `'.$table.'` ORDER BY '.($table==='vault_meta'?'name':'id'))->fetchAll();$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
        $snapshot=['format'=>'family-customer-backup','version'=>9,'created_at'=>gmdate('c'),'tables'=>$rows];
        $this->write($dir.'/database.json.gz',gzencode(json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)),0600);
    }
    private function recover(): string {
        $journal=$this->read($this->work.'/transaction.json');if(!$journal)return '';
        if(!is_string($journal['id']??null)||!preg_match('/^[a-f0-9]{24}$/D',$journal['id'])||!is_array($journal['files']??null))$this->error('Thông tin khôi phục chưa hợp lệ. Giữ bản sao và kiểm tra cài đặt.',503);
        $dir=$this->work.'/'.$journal['id'];
        // The fresh PHP health check already succeeded. A process interrupted
        // during final cleanup must finish the commit, rather than roll it back.
        if(($journal['committed']??false)===true){
            $this->json($this->work.'/last-backup.json',['id'=>$journal['id'],'from'=>$journal['from'],'to'=>$journal['to'],'created_at'=>$journal['created_at']]);
            @unlink($this->work.'/maintenance.json');@unlink($this->work.'/transaction.json');return 'committed';
        }
        foreach($journal['files'] as $name=>$entry){
            $target=$this->target($name);
            if(($entry['existed']??false)===true){$backup=$dir.'/before/'.str_replace('/','__',$name);$bytes=@file_get_contents($backup);if($bytes===false||!hash_equals($entry['sha256']??'',hash('sha256',$bytes)))$this->error('Bản sao mã chưa đầy đủ. Giữ chế độ bảo trì để kiểm tra.',503);$this->write($target,$bytes);}
            elseif(is_file($target)&&!@unlink($target))$this->error('Không khôi phục được file mới. Giữ chế độ bảo trì để kiểm tra.',503);
        }
        @unlink($this->work.'/maintenance.json');@unlink($this->work.'/transaction.json');return 'rolled_back';
    }
    public function apply(string $version,string $token): array {
        if(!$this->lockOperation()){$this->unlockOperation();$this->error('Một lượt cập nhật đang chạy.',409);}
        try{
            if($this->read($this->work.'/transaction.json')){$this->lockRuntime();try{$this->recover();}finally{$this->unlockRuntime();}}
            $cache=$this->read($this->work.'/latest.json');$current=$this->current();$candidate=$this->manifest($cache['release']??null);$checked=$cache['checked']??0;
            if(!is_int($checked)||time()-$checked>900||$version!==$candidate['version']||!hash_equals($this->token($candidate,$current,$checked),$token))$this->error('Thông tin cập nhật đã thay đổi. Kiểm tra phiên bản lại.',409);
            if(!version_compare($candidate['version'],$current['version'],'>'))$this->error('Website đã ở phiên bản này hoặc mới hơn.',409);
            if($candidate['schema']!==$current['schema'])$this->error('Bản này cần quy trình nâng cấp dữ liệu riêng. Chưa thay mã.',409);
            if(version_compare(PHP_VERSION,$candidate['min_php'],'<'))$this->error('PHP chưa đáp ứng bản cập nhật.',409);
            $missing=$this->requirements();if($missing)$this->error(implode(' ',$missing),503);
            $id=bin2hex(random_bytes(12));$dir=$this->work.'/'.$id;if(!@mkdir($dir,0700)||!@mkdir($dir.'/before',0700))$this->error('Không tạo được bản sao cập nhật.',503);
            $files=$this->stage($candidate,$dir);$entries=[];
            foreach($files as $name=>$bytes){$target=$this->target($name);if(!is_writable(dirname($target))||(is_file($target)&&!is_readable($target)))$this->error('PHP chưa có quyền thay các file ứng dụng.',503);}
            $this->lockRuntime();
            $this->databaseBackup($dir);
            foreach($files as $name=>$bytes){$target=$this->target($name);$existed=is_file($target);$before=$existed?@file_get_contents($target):'';if($before===false)$this->error('Không sao lưu được mã đang chạy.',503);if($existed)$this->write($dir.'/before/'.str_replace('/','__',$name),$before,0600);$entries[$name]=['existed'=>$existed,'sha256'=>hash('sha256',$before)];}
            $nonce=bin2hex(random_bytes(32));$journal=['id'=>$id,'from'=>$current['version'],'to'=>$candidate['version'],'files'=>$entries,'nonce'=>$nonce,'created_at'=>gmdate('c')];
            $this->json($this->work.'/transaction.json',$journal);$this->json($this->work.'/maintenance.json',['since'=>time()]);
            foreach($files as $name=>$bytes)$this->write($this->target($name),$bytes);
            $this->unlockRuntime();
            $healthy=$this->probe?($this->probe)($candidate,$nonce):$this->health($candidate,$nonce);
            $this->lockRuntime();if($healthy!==true)$this->error('Bản mới chưa vượt kiểm tra khởi động.',502);
            $journal['committed']=true;$this->json($this->work.'/transaction.json',$journal);$this->recover();
            return ['ok'=>true,'version'=>$candidate['version'],'message'=>'Đã cập nhật thành công. Tải lại website để dùng bản mới.'];
        }catch(Throwable $e){
            if($this->read($this->work.'/transaction.json')){
                try{$this->unlockRuntime();$this->lockRuntime();$recovered=$this->recover();}catch(Throwable $rollback){$this->error('Cập nhật bị gián đoạn và chưa khôi phục xong. Giữ bản sao trong family-private/.updates và mở lại mục Cập nhật để thử khôi phục.',503);}
                if($recovered==='committed')return ['ok'=>true,'version'=>$candidate['version'],'message'=>'Đã hoàn tất cập nhật. Tải lại website để dùng bản mới.'];
                $this->error('Bản cập nhật không khởi động được. Đã khôi phục mã trước; dữ liệu vẫn được giữ.'.($this->probeNote!==''?' Lý do kiểm tra: '.$this->probeNote.'.':''),502);
            }
            if($e instanceof FamilyUpdateError)throw $e;
            $this->error('Chưa thể hoàn tất cập nhật. Mã hiện tại và dữ liệu được giữ; kiểm tra quyền ghi và thử lại.',503);
        }finally{$this->unlockRuntime();$this->unlockOperation();}
    }
    private function health(array $candidate,string $nonce): bool {
        // A unique address and no-cache headers keep a CDN or server cache from answering with an older probe.
        $url=$this->config['public_origin'].'/update.php?action=health&probe='.substr(hash('sha256',$nonce),0,16).'-'.time();$ch=curl_init($url);$body='';
        curl_setopt_array($ch,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>30,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS|(getenv('FAMILY_ALLOW_HTTP')==='1'?CURLPROTO_HTTP:0),CURLOPT_HTTPHEADER=>['X-Family-Update-Probe: '.$nonce,'Cookie: fam_access='.($_COOKIE['fam_access']??''),'Cache-Control: no-cache','Pragma: no-cache'],CURLOPT_WRITEFUNCTION=>function($ch,$chunk)use(&$body){if(strlen($body)+strlen($chunk)>65536)return 0;$body.=$chunk;return strlen($chunk);}]);
        $ok=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);$curlError=$ok===false?curl_error($ch):'';curl_close($ch);$value=json_decode($body,true);
        $healthy=$ok&&$status===200&&is_array($value)&&($value['ok']??false)===true&&($value['version']??'')===$candidate['version']&&($value['schema']??null)===$candidate['schema'];
        // Why the probe failed, shown with the rollback message (no secrets: status, versions, curl error).
        if(!$healthy)$this->probeNote=$ok===false?'không gọi được '.parse_url($this->config['public_origin'],PHP_URL_HOST).' ('.substr($curlError,0,120).')':($status!==200?'máy chủ trả HTTP '.$status:(!is_array($value)?'phản hồi không phải JSON (có thể bị cache, CDN hoặc thông báo lỗi PHP chen vào)':'bản trả về '.(is_string($value['version']??null)?substr($value['version'],0,20):'?').' / dữ liệu '.(is_int($value['schema']??null)?$value['schema']:'?').', cần '.$candidate['version'].' / '.$candidate['schema'].(($value['version']??'')!==$candidate['version']?' (có thể bị cache hoặc CDN trả bản cũ)':'')));
        return $healthy;
    }
    public function probeAllowed(string $nonce): bool {$journal=$this->read($this->work.'/transaction.json');return $nonce!==''&&is_string($journal['nonce']??null)&&hash_equals($journal['nonce'],$nonce);}
    public function backupFile(): ?string {$saved=$this->read($this->work.'/last-backup.json');$id=$saved['id']??'';return is_string($id)&&preg_match('/^[a-f0-9]{24}$/D',$id)&&is_file($this->work.'/'.$id.'/database.json.gz')?$this->work.'/'.$id.'/database.json.gz':null;}
}
