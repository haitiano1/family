<?php
declare(strict_types=1);
// Only explicitly projected business fields leave the website. Vault values are
// requested separately, under the existing /api/vault cookie and session guard.
function sheetsStore(PDO $db): void {
    static $ready=[];$id=spl_object_id($db);if(isset($ready[$id]))return;
    q($db,"CREATE TABLE IF NOT EXISTS family_sheet_state(name VARCHAR(100) PRIMARY KEY,value LONGTEXT NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin");$ready[$id]=true;
}
function sheetsMeta(PDO $db,string $name,mixed $fallback=[]): mixed {
    sheetsStore($db);$row=one($db,'SELECT value FROM family_sheet_state WHERE name=?',[$name]);
    return $row?json_decode($row['value'],true,512,JSON_THROW_ON_ERROR):$fallback;
}
function sheetsPut(PDO $db,string $name,mixed $value): void {
    sheetsStore($db);q($db,'INSERT INTO family_sheet_state(name,value) VALUES (?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)',[$name,json_encode($value,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);
}
function sheetsKey(array $c): string {return hash('sha256',"family-sheets-v1\0".$c['db_password']."\0".accessKey($c),true);}
function sheetsSettings(PDO $db,array $c): array {
    $encrypted=sheetsMeta($db,'config',null);if(!$encrypted)return [];
    try{return json_decode(vaultOpen($encrypted,sheetsKey($c),'family-sheets-config-v1'),true,512,JSON_THROW_ON_ERROR);}catch(Throwable $e){fail('Không đọc được kết nối Sheet. Kết nối lại sau khi đổi cấu hình website.',503);}
}
function sheetsSchema(string $scope,bool $withTrial=false,bool $withCodes=false): array {
    return $scope==='core'?[
        'families'=>['id','name','manager_email','trial_date','service','note'],
        'members'=>['id','family_id','email','customer_name','contact','joined_at','expires_at','payment_status','amount','plan_months','membership_status','note','renewal_status','renewal_amount','renewal_paid_at','renewal_note'],
        ...($withCodes?['codes'=>['id','customer_name','email','code']]:[]),
    ]:['vault'=>array_merge(['id','family_id','email','password','totp','recovery_email','label','note'],$withTrial?['trial_date']:[])];
}
// Mã tra cứu tab (Apps Script v5.8+): one row per customer Gmail in an active Family,
// in the same order as the customer tab. The row ID is derived from the Gmail.
function sheetsCodeId(string $address): string {return 'L'.substr(hash('sha256',"family-lookup-row\0".$address),0,24);}
function sheetsCodeRows(PDO $db): array {
    $salt=lookupSalt($db);$overrides=array_column(all($db,'SELECT email,code FROM lookup_codes'),'code','email');$rows=[];
    foreach(all($db,"SELECT m.email,m.customer_name FROM members m JOIN families f ON f.id=m.family_id WHERE f.archived_at='' ORDER BY f.id,m.id") as $m){
        $id=sheetsCodeId($m['email']);
        if(isset($rows[$id])){if($rows[$id]['customer_name']==='')$rows[$id]['customer_name']=(string)$m['customer_name'];continue;}
        $rows[$id]=['id'=>$id,'customer_name'=>(string)$m['customer_name'],'email'=>$m['email'],'code'=>$overrides[$m['email']]??lookupDerivedCode($salt,$m['email'])];
    }return $rows;
}
// Only the code cell is read back. Name and Gmail always come from the website by the
// hidden ID; a blank cell keeps the current code and unknown rows are dropped on write.
function sheetsApplyCodes(PDO $db,array $local,array $merged): void {
    foreach($merged as $id=>$data){
        $current=$local[$id]??null;if(!$current||$data===$current||trim($data['code'])==='')continue;
        $address=$current['email'];$code=lookupNormalizeCode($data['code']);
        if($code==='')fail('Mã tra cứu của '.$address.' trong tab FamilySync_MaTraCuu cần đúng 6 ký tự: chữ A–Z trừ I, L, O và số 2–9. Sửa ô Mã tra cứu rồi đồng bộ lại.',409);
        if($code===$current['code'])continue;
        if(one($db,'SELECT id FROM lookup_codes WHERE email=?',[$address]))q($db,'UPDATE lookup_codes SET code=?,created_at=? WHERE email=?',[$code,stamp(),$address]);
        else q($db,'INSERT INTO lookup_codes(email,code,created_at) VALUES (?,?,?)',[$address,$code,stamp()]);
        q($db,'DELETE FROM lookup_sessions WHERE email=?',[$address]);
        logEntry($db,"Cá nhân: đổi mã tra cứu của $address từ Sheet");
    }
}
function sheetsCanonical(array $data): string {ksort($data);return json_encode($data,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);}
function sheetsHash(?array $row,array $c): ?string {return $row===null?null:hash_hmac('sha256',sheetsCanonical($row),sheetsKey($c));}
function sheetsBirth(string $type,array $row): string {return $type.':'.$row['id'].':'.($row['created_at']??'');}
function sheetsId(string $type,array $row,array $ids): string {return $ids[sheetsBirth($type,$row)]??strtoupper(substr($type,0,1)).$row['id'].'_'.substr(hash('sha256',(string)($row['created_at']??$type)),0,12);}
function sheetsProject(array $row,array $fields): array {return array_combine($fields,array_map(fn($f)=>(string)($row[$f]??''),$fields));}
function sheetsSnapshot(PDO $db,string $scope,?string $key=null,bool $withTrial=false,bool $withCodes=false): array {
    $ids=sheetsMeta($db,'ids');$schema=sheetsSchema($scope,$withTrial);$families=all($db,"SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at='' ORDER BY f.id");
    $familyIds=[];$trials=[];foreach($families as $f){$familyIds[$f['id']]=sheetsId('family',$f,$ids);$trials[$f['id']]=$f['trial_date'];}
    if($scope==='core'){
        $result=['families'=>[],'members'=>[]];
        foreach($families as $f){$id=$familyIds[$f['id']];$result['families'][$id]=sheetsProject([...$f,'id'=>$id],$schema['families']);}
        foreach(all($db,'SELECT * FROM members ORDER BY id') as $m){if(!isset($familyIds[$m['family_id']]))continue;$id=sheetsId('member',$m,$ids);$result['members'][$id]=sheetsProject([...$m,'id'=>$id,'family_id'=>$familyIds[$m['family_id']]],$schema['members']);}
        if($withCodes)$result['codes']=sheetsCodeRows($db);
        return $result;
    }
    $GLOBALS['vault_db']=$db;$result=['vault'=>[]];$bound=[];
    foreach(all($db,'SELECT * FROM vault_items ORDER BY id') as $v){
        $item=vaultRead($v,$key);$family=$familyIds[$v['family_id']]??'';
        // Archived Family records remain encrypted locally; do not resurrect old credentials.
        if($v['family_id']&&!$family)continue;
        $id=$ids[sheetsBirth('vault',$v)]??($family?'K_'.$family:sheetsId('vault',$v,$ids));$bound[$family]=true;
        $result['vault'][$id]=sheetsProject([...$item,'id'=>$id,'family_id'=>$family,'trial_date'=>$trials[$v['family_id']]??'','totp'=>vaultTotpText($item['totp'],$item['email'])],$schema['vault']);
    }
    foreach($families as $f){$fid=$familyIds[$f['id']];if(isset($bound[$fid]))continue;$id='K_'.$fid;$result['vault'][$id]=sheetsProject(['id'=>$id,'family_id'=>$fid,'email'=>$f['manager_email'],'trial_date'=>$f['trial_date']],$schema['vault']);}
    return $result;
}
function sheetsValidateRemote(mixed $data,string $scope,bool $withTrial=false,bool $withCodes=false): array {
    if(!is_array($data))fail('Phản hồi Sheet không hợp lệ.',502);$out=[];
    // A Sheet without the Mã tra cứu tab yet reports no codes; the next write creates it.
    if($withCodes&&!array_key_exists('codes',$data))$data['codes']=[];
    foreach(sheetsSchema($scope,$withTrial,$withCodes) as $tab=>$fields){
        $rows=$data[$tab]??null;if(!is_array($rows)||!array_is_list($rows)||count($rows)>10000)fail('Sheet vượt giới hạn hoặc sai định dạng.',502);$out[$tab]=[];
        foreach($rows as $row){
            if(!is_array($row)||count($row)!==count($fields))fail('Cột Sheet không đúng mẫu.',502);
            foreach($fields as $f)if(!array_key_exists($f,$row)||!is_string($row[$f])||strlen($row[$f])>12000)fail('Giá trị ô Sheet không đúng định dạng.',502);
            $id=$row['id'];if(!preg_match('/^[A-Za-z0-9_:-]{1,140}$/D',$id)||isset($out[$tab][$id]))fail('ID trong Sheet trống hoặc trùng. Khôi phục cột ID trước khi đồng bộ.',409);
            $out[$tab][$id]=$row;
        }
    }return $out;
}
function sheetsFingerprints(array $data,array $c): array {$out=[];foreach($data as $tab=>$rows){$out[$tab]=[];foreach($rows as $id=>$row)$out[$tab][$id]=sheetsHash($row,$c);ksort($out[$tab]);}return $out;}
function sheetsMerge(array $local,array $remote,array $base,array $c,?string $choice=null): array {
    $merged=[];$conflicts=[];
    foreach($local as $tab=>$rows){$merged[$tab]=[];foreach(array_unique([...array_keys($rows),...array_keys($remote[$tab])]) as $id){
        $l=$rows[$id]??null;$r=$remote[$tab][$id]??null;$lh=sheetsHash($l,$c);$rh=sheetsHash($r,$c);$b=$base[$tab][$id]??null;
        if($lh===$rh)$value=$l;
        elseif($r===null&&$l!==null)$value=$l; // Removing a Sheet row never deletes website data.
        elseif($lh===$b)$value=$r;
        elseif($rh===$b)$value=$l;
        else{if(!$choice){$display=$l??$r;$conflicts[]=['tab'=>$tab,'id'=>$id,'label'=>$display['customer_name']??$display['name']??$display['email']??$id];continue;}$value=$choice==='web'?$l:$r;}
        if($value!==null)$merged[$tab][$id]=$value;
    }}return ['data'=>$merged,'conflicts'=>$conflicts];
}
function sheetsCheckRemoteReply(mixed $result): void {
    if(is_array($result)&&($result['ok']??false)===true)return;
    // Only fixed, recognized diagnostics leave this boundary. Never forward
    // Google's exception text, arbitrary response fields or account values.
    $code=is_array($result)?($result['code']??null):null;
    $location=is_array($result)?($result['location']??null):null;$at='';
    if(is_array($location)&&($location['tab']??'')==='FamilySync_Kho'&&is_int($location['row']??null)&&$location['row']>0&&$location['row']<=10001&&is_int($location['column']??null)&&$location['column']>0&&$location['column']<=9)$at=' FamilySync_Kho, dòng '.$location['row'].', cột '.$location['column'].'.';
    if($code==='stale')fail('Sheet vừa thay đổi trong lúc đồng bộ. Thử lại để đọc bản mới.',409);
    if($code==='auth')fail('Apps Script báo sai mã kết nối [auth]. Kiểm tra FAMILY_TOKEN trong đúng dự án của URL /exec đang dùng.',502);
    if($code==='unavailable'){
        $diagnostic=is_array($result['diagnostic']??null)?$result['diagnostic']:[];
        $stages=['wait_lock'=>'chờ khóa đồng bộ','open_book'=>'mở file Sheet','read_families'=>'đọc Family','read_members'=>'đọc Khách','read_codes'=>'đọc Mã tra cứu','read_vault'=>'đọc Kho','revision'=>'đối chiếu phiên bản dữ liệu','validate_output'=>'kiểm tra dữ liệu gửi sang Sheet','write_families'=>'ghi Family','write_members'=>'ghi Khách','write_codes'=>'ghi Mã tra cứu','write_vault'=>'ghi Kho','prepare_members'=>'chuẩn bị nhóm Khách','resize_members'=>'điều chỉnh số hàng/cột Khách','write_member_cells'=>'ghi ô dữ liệu Khách','style_members'=>'định dạng Khách','freeze_members'=>'cố định hàng Khách','style_member_rows'=>'định dạng ngày và dòng Khách','resize_member_columns'=>'chỉnh độ rộng/ẩn cột Khách','flush_write'=>'Google áp dụng các lệnh ghi/định dạng trước đó','verify_vault'=>'xác nhận bố cục Kho','response_metadata'=>'đọc thông tin bố cục sau xử lý'];
        $reasons=['table_column'=>'Google báo thao tác không phù hợp kiểu cột của bảng.','table'=>'Lỗi Google có nhắc tới bảng; cần kiểm tra cấu trúc Google Table.','protected'=>'Google báo vùng được bảo vệ.','permission'=>'Google báo thiếu quyền truy cập hoặc cấp phép.','quota'=>'Google báo giới hạn dịch vụ.','lock'=>'Không lấy được khóa đồng bộ; có thể đang có lượt khác chạy.'];
        $stage=$diagnostic['stage']??null;$reason=$diagnostic['reason']??null;$line=$diagnostic['line']??null;
        $detail=is_string($stage)&&isset($stages[$stage])?' Bước: '.$stages[$stage].' ['.$stage.'].':'';
        if(is_string($reason)&&isset($reasons[$reason]))$detail.=' '.$reasons[$reason];
        if(is_int($line)&&$line>0&&$line<=100000)$detail.=' Dòng script: '.$line.'.';
        fail('Apps Script gặp lỗi xử lý Sheet [unavailable].'.($detail?:' Kiểm tra quyền đọc/ghi file, bảng Google Table, vùng được bảo vệ hoặc lượt chạy đang bận.').' Đây không phải phản hồi sai token.',502);
    }
    if($code==='request')fail('Apps Script không nhận dạng yêu cầu đồng bộ [request]. Kiểm tra URL /exec và phiên bản đang triển khai.',502);
    if($code==='gmail_permission')fail('Apps Script chưa được cấp quyền đọc Gmail [gmail_permission]. Mở dự án Apps Script, chọn hàm capQuyenGmail, bấm Chạy và cho phép, rồi thử lại.',502);
    if($code==='gmail_service')fail('Apps Script chưa bật Gmail API [gmail_service]. Dán appsscript.json mới (hoặc Dịch vụ + → Gmail API → Thêm), chạy capQuyenGmail rồi triển khai New version.',502);
    if($code==='gmail_unavailable')fail('Google chưa đọc được Gmail lúc này [gmail_unavailable]. Thử lại sau ít phút.',502);
    if($code==='limit')fail('Dữ liệu vượt giới hạn đồng bộ [limit]. Kiểm tra số dòng và độ dài nội dung ô.',409);
    if($code==='data')fail('Apps Script báo dữ liệu đồng bộ không hợp lệ [data]. Kiểm tra ngày, gói mua và liên kết Family của khách.',409);
    if($code==='vault_date')fail('Ngày trial cần đủ ngày/tháng/năm (dd/mm/yyyy).'.$at,409);
    if($code==='vault_email')fail('Email Kho thiếu, không hợp lệ hoặc trùng với dòng khác.'.$at,409);
    if(in_array($code,['schema','formula','id','vault_id'],true))fail('Kiểm tra tiêu đề cột, ID và công thức trong tab đồng bộ.'.$at,409);
    fail('Apps Script trả phản hồi đồng bộ không hợp lệ [unknown]. Kiểm tra đúng URL /exec và phiên bản triển khai.',502);
}
function sheetsRemote(array $settings,array $payload): array {
    $url=$settings['url']??'';if(!preg_match('~^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$~D',$url))fail('Đường dẫn Apps Script không hợp lệ. Dùng URL triển khai /exec.',503);
    if(!function_exists('curl_init'))fail('Bật extension cURL trong PHP Configuration để kết nối Google.',503);
    $raw=json_encode([...$payload,'token'=>$settings['token']],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);$location='';$bytes='';
    for($attempt=0;$attempt<2;$attempt++){
        $ch=curl_init($url);$location='';$bytes='';$tooLarge=false;
        curl_setopt_array($ch,[CURLOPT_POST=>$attempt===0,CURLOPT_RETURNTRANSFER=>false,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>25,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_HTTPHEADER=>['Content-Type: application/json'],CURLOPT_HEADERFUNCTION=>function($ch,$line)use(&$location){if(stripos($line,'Location:')===0)$location=trim(substr($line,9));return strlen($line);},CURLOPT_WRITEFUNCTION=>function($ch,$chunk)use(&$bytes,&$tooLarge){if(strlen($bytes)+strlen($chunk)>8000000){$tooLarge=true;return 0;}$bytes.=$chunk;return strlen($chunk);}]);
        if($attempt===0)curl_setopt($ch,CURLOPT_POSTFIELDS,$raw);
        $ok=curl_exec($ch);$status=curl_getinfo($ch,CURLINFO_RESPONSE_CODE);curl_close($ch);
        if($ok===false)fail($tooLarge?'Sheet vượt giới hạn phản hồi.':'Chưa kết nối được Google. Dữ liệu web được giữ; thử lại sau.',502);
        if($attempt===0&&in_array($status,[301,302,303],true)&&preg_match('~^https://script\.googleusercontent\.com/[^\s]+$~D',$location)){$url=$location;continue;}
        if($status!==200)fail('Google trả HTTP '.$status.'. Kiểm tra URL /exec, bản triển khai và quyền truy cập Bất kỳ ai.',502);
        try{$result=json_decode($bytes,true,512,JSON_THROW_ON_ERROR);}catch(Throwable $e){fail('Google trả về trang đăng nhập. Kiểm tra quyền truy cập bản triển khai Apps Script.',502);}
        sheetsCheckRemoteReply($result);
        return $result;
    }fail('Google chuyển hướng không hợp lệ.',502);
}
function sheetsApplyCore(PDO $db,array $local,array $merged): void {
    $ids=sheetsMeta($db,'ids');$families=[];$members=[];
    foreach(all($db,"SELECT * FROM families WHERE archived_at='' ORDER BY id") as $row)$families[sheetsId('family',$row,$ids)]=$row;
    foreach(all($db,'SELECT * FROM members ORDER BY id') as $row)$members[sheetsId('member',$row,$ids)]=$row;
    foreach($merged['families'] as $id=>$data){
        if(($local['families'][$id]??null)===$data)continue;
        if(!isset($families[$id])&&!str_starts_with($id,'new:'))fail('Family đã lưu trữ trên web hoặc ID bị đổi. Khôi phục trên web trước khi chọn bản Sheet.',409);
        $result=saveFamilyRecord($db,$families[$id]['id']??null,$data);$number=$families[$id]['id']??$result['id'];$row=one($db,'SELECT * FROM families WHERE id=?',[$number]);$ids[sheetsBirth('family',$row)]=$id;$families[$id]=$row;
    }
    foreach($merged['members'] as $id=>$data){
        if(($local['members'][$id]??null)===$data)continue;
        if(!isset($members[$id])&&!str_starts_with($id,'new:'))fail('Khách đã lưu trữ trên web hoặc ID bị đổi. Khôi phục trên web trước khi chọn bản Sheet.',409);
        $f=$families[$data['family_id']]??null;if(!$f)fail('ID Family của khách không hợp lệ.',409);
        $old=$members[$id]??null;
        if($old&&$old['family_id']!==$f['id'])transferMember($db,$old['id'],['revision'=>$old['renewal_revision'],'expected_family_id'=>$old['family_id'],'expected_email'=>$old['email'],'family_id'=>$f['id'],'expected_manager_email'=>one($db,'SELECT email FROM accounts WHERE id=?',[$f['manager_id']])['email']]);
        $result=saveMemberRecord($db,$old['id']??null,[...$data,'family_id'=>$f['id']]);$number=$old['id']??$result['id'];$row=one($db,'SELECT * FROM members WHERE id=?',[$number]);$ids[sheetsBirth('member',$row)]=$id;
        $changed=false;foreach(['renewal_status','renewal_amount','renewal_paid_at','renewal_note'] as $field)if((string)$row[$field]!==$data[$field])$changed=true;
        if($changed)renew($db,$number,['revision'=>$row['renewal_revision'],'status'=>$data['renewal_status'],'amount'=>$data['renewal_amount'],'paid_at'=>$data['renewal_paid_at'],'note'=>$data['renewal_note'],'apply_now'=>false],false);
    }
    if(isset($merged['codes']))sheetsApplyCodes($db,$local['codes']??[],$merged['codes']);
    sheetsPut($db,'ids',$ids);
}
// Upgrade legacy vault fingerprints only when the newly introduced date agrees.
// A differing date requires an explicit conflict choice, rather than guessing.
function sheetsVaultBase(array $local,array $remote,array $base,array $c): array {
    foreach($base['vault']??[] as $id=>$hash){
        $l=$local['vault'][$id]??null;$r=$remote['vault'][$id]??null;
        if(!$l||!$r||!array_key_exists('trial_date',$l)||($l['trial_date']!==$r['trial_date']))continue;
        foreach([$l,$r] as $row){$old=$row;unset($old['trial_date']);if(sheetsHash($old,$c)===$hash){$base['vault'][$id]=sheetsHash($row,$c);break;}}
    }return $base;
}
function sheetsApplyVault(PDO $db,array $local,array $merged,string $key,bool $withTrial=false): void {
    $ids=sheetsMeta($db,'ids');$familyRows=[];$vaultRows=[];$seen=[];$duplicates=[];
    $GLOBALS['vault_db']=$db;
    foreach(all($db,"SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at='' ORDER BY f.id") as $row)$familyRows[sheetsId('family',$row,$ids)]=$row;
    foreach(all($db,'SELECT * FROM vault_items ORDER BY id') as $row){$family=null;foreach($familyRows as $k=>$f)if($f['id']===$row['family_id']){$family=$k;break;}$vaultRows[$ids[sheetsBirth('vault',$row)]??($family?'K_'.$family:sheetsId('vault',$row,$ids))]=$row;}
    // Two input rows with the same normalized email must never update each other.
    foreach($merged['vault'] as $id=>$data){$address=email($data['email']);if(isset($seen[$address])){
        // A new row may fill a Family placeholder that has no stored credentials.
        $other=$seen[$address];$placeholder=fn($k)=>!isset($vaultRows[$k])&&($local['vault'][$k]??null)===($merged['vault'][$k]??null)&&!str_starts_with($k,'new:');
        if(isset($duplicates[$address])||!$withTrial||!($placeholder($id)&&str_starts_with($other,'new:')||$placeholder($other)&&str_starts_with($id,'new:')))fail('Email bị trùng trong Kho. Sửa dòng đã có; không thêm lại cùng tài khoản.',409);$duplicates[$address]=true;
    }else $seen[$address]=$id;}
    foreach($merged['vault'] as $id=>$data){
        if(($local['vault'][$id]??null)===$data)continue;
        $old=$vaultRows[$id]??null;$family=$data['family_id']!==''?($familyRows[$data['family_id']]??null):null;$isNew=str_starts_with($id,'new:');
        if($data['family_id']!==''&&(!$family||($id!=='K_'.$data['family_id']&&(!$old||$old['family_id']!==$family['id']))))fail('Không sửa ID hoặc ID Family trong tab Kho.',409);
        if($family&&$data['email']!==$family['manager_email'])fail('Đổi mail chủ trong tab Family trước; không đổi mail trong tab Kho.',409);
        if(!$old&&!$family&&!$isNew)fail('Hồ sơ Kho không còn tồn tại. Không sửa cột ID.',409);
        $item=vaultFields($data);$other=vaultFamilyFor($db,$item['email']);
        foreach($vaultRows as $otherId=>$row)if($otherId!==$id&&vaultRead($row,$key)['email']===$item['email'])fail('Email đã có trong Kho. Sửa dòng tài khoản cũ thay vì thêm dòng mới.',409);
        $trial=$withTrial?calendarDate($data['trial_date']):null;
        if($withTrial&&$isNew&&!$old&&!$family){
            if($other){$fid=sheetsId('family',$other,$ids);$family=$familyRows[$fid];}
            else{
                if(one($db,'SELECT f.id FROM families f JOIN accounts a ON a.id=f.manager_id WHERE a.email=?',[$item['email']]))fail('Email thuộc Family đã lưu trữ. Khôi phục Family trên web trước.',409);
                $name=$item['label']?:'Family '.implode('',array_slice(preg_split('//u',$item['email'],-1,PREG_SPLIT_NO_EMPTY),0,180));
                $result=saveFamilyRecord($db,null,['name'=>$name,'manager_email'=>$item['email'],'trial_date'=>$trial,'service'=>'youtube']);
                $family=one($db,'SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.id=?',[$result['id']]);$fid=sheetsId('family',$family,$ids);$familyRows[$fid]=$family;
            }
        }elseif($other&&(!$family||$other['id']!==$family['id']))fail('Email Kho đã thuộc Family khác.',409);
        if($withTrial&&$family&&$family['trial_date']!==$trial){q($db,'UPDATE families SET trial_date=? WHERE id=?',[$trial,$family['id']]);logEntry($db,'Cá nhân: sửa ngày trial Family #'.$family['id'].' từ Sheet');}
        if($old){q($db,'UPDATE vault_items SET payload=?,updated_at=?,revision=revision+1 WHERE id=?',[json_encode(vaultSeal(json_encode($item,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$key,'family-vault-item-v1:'.$old['id']),JSON_THROW_ON_ERROR),stamp(),$old['id']]);}
        elseif(($withTrial&&$isNew)||$item['password']!==''||$item['totp']['secret']!==''||$item['note']!==''||$item['recovery_email']!==''||$item['label']!==''){$number=vaultInsert($db,$item,$key);$row=one($db,'SELECT * FROM vault_items WHERE id=?',[$number]);if(!$family||$isNew)$ids[sheetsBirth('vault',$row)]=$id;$vaultRows[$id]=$row;}
        if($old)$vaultRows[$id]=one($db,'SELECT * FROM vault_items WHERE id=?',[$old['id']]);
    }
    sheetsPut($db,'ids',$ids); // No plaintext vault fields or snapshots are persisted here.
}
function sheetsLockName(array $c): string {return 'family-sync:'.substr(hash('sha256',$c['db_name']),0,40);}
function sheetsTryLock(PDO $db,array $c): bool {return (int)q($db,'SELECT GET_LOCK(?,0) AS ok',[sheetsLockName($c)])->fetch()['ok']===1;}
function sheetsDisconnected(Throwable $error): bool {return $error instanceof PDOException&&in_array($error->errorInfo[1]??null,[2006,2013],true);}
class FamilySheetReconnect extends FamilyError {
    public function __construct(string $message='MySQL bị ngắt kết nối khi chờ Google [db_connection]. Chưa xác nhận đồng bộ hoàn tất; thử lại sau ít giây.',int $status=503){parent::__construct($message,$status);}
}
class FamilySheetRestart extends FamilySheetReconnect {
    public function __construct(){parent::__construct('Trạng thái đồng bộ vừa thay đổi trong lúc nối lại MySQL [sync_changed]. Thử lại sau ít giây.',409);}
}
function sheetsConnection(array $c): PDO {
    try{return new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);}
    catch(PDOException $error){throw new FamilySheetReconnect();}
}
function sheetsConnectionGuard(PDO $db): string {
    $state=[];foreach(['config','ids','base_core','base_vault'] as $name)$state[$name]=sheetsMeta($db,$name,null);return hash('sha256',sheetsCanonical($state));
}
function sheetsReleaseLock(PDO $db,array $c): void {
    try{q($db,'SELECT RELEASE_LOCK(?)',[sheetsLockName($c)]);}
    catch(PDOException $error){if(!sheetsDisconnected($error))throw $error;}
    // MySQL releases named locks when the broken session closes. A fresh
    // session must acquire them again before touching synchronization data.
}
function sheetsWaitForGoogle(PDO &$db,array $c,callable $operation): mixed {
    // Only short local transactions hold the application lock. The separate
    // sync lock remains owned while Google is contacted, so other tabs skip.
    if($db->inTransaction())throw new RuntimeException('Cannot contact Google during a transaction.');
    try{
        $owned=databaseOwnsLock($db,$c);$guard=sheetsConnectionGuard($db);
        $syncOwner=one($db,'SELECT IS_USED_LOCK(?) AS owner,CONNECTION_ID() AS current_id',[sheetsLockName($c)]);$ownsSync=(string)$syncOwner['owner']===(string)$syncOwner['current_id'];
        if($owned)databaseUnlock($db,$c);
    }
    catch(PDOException $error){if(sheetsDisconnected($error))throw new FamilySheetReconnect();throw $error;}
    $failure=null;$result=null;try{$result=$operation();}catch(Throwable $error){$failure=$error;}
    try{if($owned)databaseLock($db,$c);}
    catch(Throwable $error){
        // Do not conceal a Google error with a second error from cleanup.
        if($failure)throw $failure;
        if(!sheetsDisconnected($error))throw $error;
        if(!$ownsSync)throw new FamilySheetReconnect();
        $previous=$db;$db=sheetsConnection($c);if(($GLOBALS['vault_db']??null)===$previous)$GLOBALS['vault_db']=$db;unset($previous);
        if(!sheetsTryLock($db,$c))fail('Một lượt đồng bộ khác đang chạy sau khi nối lại MySQL. Thử lại sau ít giây.',409);
        if($owned)databaseLock($db,$c);
        // Keep the acknowledged Google result only if another sync has not
        // changed our baseline/IDs/config. This also handles a host whose idle
        // timeout is shorter than every Google call, without repeating I/O.
        if(!hash_equals($guard,sheetsConnectionGuard($db)))throw new FamilySheetRestart();
    }
    if($failure)throw $failure;return $result;
}
// Local exception text can include SQL parameters and decrypted account values.
// Expose only fixed labels and a source location, never the original message.
function sheetsLocalFailure(Throwable $error,string $stage,string $scope): FamilyError {
    if($error instanceof FamilyError)return $error;
    $stages=['sync_lock','settings','read_remote','validate_remote','snapshot_local','normalize_vault','merge','begin_import','apply_core','apply_vault','commit_import','snapshot_output','write_remote','save_state'];
    if(!in_array($stage,$stages,true))$stage='unknown';
    $kind=$error instanceof PDOException?'database':($error instanceof JsonException?'json':($error instanceof TypeError?'type':($error instanceof Error?'php':'internal')));
    $reason='';$status=500;
    if($error instanceof PDOException){
        $native=$error->errorInfo[1]??null;
        $reasons=[1044=>'db_permission',1045=>'db_permission',1142=>'db_permission',1143=>'db_permission',1054=>'db_column',1146=>'db_table',1267=>'db_collation',1271=>'db_collation',1062=>'db_duplicate',1205=>'db_busy',1213=>'db_busy',2006=>'db_connection',2013=>'db_connection'];
        $reason=is_int($native)?($reasons[$native]??''):'';if($reason==='db_duplicate')$status=409;
    }elseif($error instanceof Error&&str_starts_with($error->getMessage(),'Call to undefined function '))$reason='missing_function';
    $files=['sheets.php','core.php','audit.php','records.php','business.php','vault.php','issues.php','import.php','statistics.php'];$file=basename($error->getFile());$line=$error->getLine();
    $location=in_array($file,$files,true)&&$line>0&&$line<=100000?' Vị trí PHP: '.$file.':'.$line.'.':'';
    $scopeLabel=$scope==='core'?'Family/Khách':($scope==='vault'?'Kho':'Sheet');
    return new FamilyError('Lỗi PHP khi đồng bộ '.$scopeLabel.' [php_sync]. Bước: ['.$stage.']. Loại: ['.$kind.'].'.($reason?' Mã: ['.$reason.'].':'').$location.' Chưa xác nhận đồng bộ hoàn tất.',$status);
}
// Synchronization telemetry contains fixed labels and aggregate counts only.
// It deliberately excludes row values, e-mails, tokens, passwords and 2FA keys.
function sheetsCountSet(string $scope): array {
    $out=[];foreach(array_keys(sheetsSchema($scope)) as $tab)$out[$tab]=['added'=>0,'updated'=>0,'deleted'=>0];return $out;
}
function sheetsChangedRows(array $before,array $after): array {
    $changes=[];foreach(array_unique([...array_keys($before),...array_keys($after)]) as $tab){
        $changes[$tab]=[];foreach(array_unique([...array_keys($before[$tab]??[]),...array_keys($after[$tab]??[])]) as $id){
            $old=$before[$tab][$id]??null;$new=$after[$tab][$id]??null;
            if($old!==null&&$new!==null&&sheetsCanonical($old)===sheetsCanonical($new))continue;
            if($old!==null||$new!==null)$changes[$tab][$id]=$old===null?'added':($new===null?'deleted':'updated');
        }
    }return $changes;
}
function sheetsTraceChanges(array &$trace,string $direction,array $before,array $after): void {
    $key='_changes_'.$direction;$all=$trace[$key]??[];
    foreach(sheetsChangedRows($before,$after) as $tab=>$changes)foreach($changes as $id=>$action){
        $previous=$all[$tab][$id]??null;
        // A reconnect may revisit one row; count that affected record once.
        $all[$tab][$id]=$previous==='added'&&$action==='updated'?'added':($previous==='deleted'&&$action==='added'?'updated':$action);
    }
    $trace[$key]=$all;$counts=sheetsCountSet($trace['scope']);
    foreach($all as $tab=>$changes){if(!$changes)continue;$counts[$tab]??=['added'=>0,'updated'=>0,'deleted'=>0];foreach($changes as $action)if(isset($counts[$tab][$action]))$counts[$tab][$action]++;}
    $trace['counts'][$direction]=$counts;if($direction==='sheet_to_web')$trace['import_applied']=array_sum(array_map('array_sum',$counts))>0;
}
function sheetsErrorReport(Throwable $error,string $stage): array {
    $allowedStages=['sync_lock','settings','read_remote','validate_remote','snapshot_local','normalize_vault','merge','begin_import','apply_core','apply_vault','commit_import','snapshot_output','write_remote','save_state'];
    $stage=in_array($stage,$allowedStages,true)?$stage:'unknown';$text=$error->getMessage();$code='sync_error';
    $messages=[
        'auth'=>'Google báo sai mã kết nối. Kiểm tra mã và bản triển khai đang dùng.',
        'unavailable'=>'Apps Script chưa xử lý được Sheet. Kiểm tra Google Table, vùng bảo vệ, quyền truy cập hoặc giới hạn dịch vụ.',
        'stale'=>'Sheet thay đổi trong lúc đồng bộ. Chưa xác nhận hoàn tất; thử lại để đọc bản mới.',
        'request'=>'Apps Script không nhận dạng yêu cầu. Kiểm tra URL /exec và phiên bản triển khai.',
        'limit'=>'Dữ liệu vượt giới hạn đồng bộ. Kiểm tra số dòng và độ dài nội dung ô.',
        'data'=>'Dữ liệu Sheet không hợp lệ. Kiểm tra ngày, gói và liên kết Family.',
        'vault_email'=>'Email Kho trống, không hợp lệ hoặc bị trùng.',
        'vault_date'=>'Ngày trial trong Kho chưa hợp lệ. Nhập đủ ngày, tháng và năm.',
        'schema'=>'Cấu trúc cột, ID hoặc công thức Sheet không đúng mẫu.',
        'formula'=>'Công thức trong vùng dữ liệu không được hỗ trợ.',
        'id'=>'ID Sheet trống, trùng hoặc không đúng mẫu.',
        'vault_id'=>'Liên kết ID Kho và Family chưa hợp lệ.',
        'db_permission'=>'Database chưa cho phép đọc hoặc ghi dữ liệu. Kiểm tra quyền của tài khoản database.',
        'db_column'=>'Cấu trúc cột database chưa đúng phiên bản ứng dụng.',
        'db_table'=>'Thiếu bảng database cần thiết cho ứng dụng.',
        'db_collation'=>'Database gặp xung đột kiểu so sánh chữ. Kiểm tra cấu hình charset/collation.',
        'db_duplicate'=>'Có dữ liệu trùng trong database. Kiểm tra hồ sơ liên quan.',
        'db_busy'=>'Database đang bận hoặc có tranh chấp khóa. Thử lại sau ít giây.',
        'db_connection'=>'Kết nối database bị ngắt. Chưa xác nhận đồng bộ hoàn tất; thử lại sau.',
        'sync_changed'=>'Dữ liệu đồng bộ đổi trong lúc nối lại database. Cần đọc lại bản mới.',
        'php_sync'=>'Website gặp lỗi xử lý dữ liệu. Kiểm tra cấu hình và nhật ký PHP.',
        'locked'=>'Kho đang khóa hoặc phiên mở khóa đã hết hạn. Mở lại Kho để đồng bộ.',
        'http'=>'Google chưa cho phép truy cập bản triển khai. Kiểm tra quyền và URL /exec.',
        'connection'=>'Chưa kết nối được Google. Dữ liệu web được giữ để thử lại.',
        'validation'=>'Có dữ liệu chưa hợp lệ hoặc đã thay đổi. Kiểm tra thông báo thao tác và thử lại.',
        'sync_error'=>'Chưa xác nhận đồng bộ hoàn tất. Mở thông báo đồng bộ để kiểm tra và thử lại.',
    ];
    if($error instanceof FamilyError)foreach(array_keys($messages) as $candidate)if(str_contains($text,'['.$candidate.']')){$code=$candidate;break;}
    if($code==='sync_error'){
        if($error instanceof FamilyError&&$error->status===423)$code='locked';
        elseif(str_starts_with($text,'Google trả HTTP ')||str_starts_with($text,'Google trả về trang đăng nhập.'))$code='http';
        elseif(str_starts_with($text,'Chưa kết nối được Google.'))$code='connection';
        elseif($error instanceof FamilyError&&$error->status<500)$code='validation';
        elseif($error instanceof PDOException){$native=$error->errorInfo[1]??null;$code=[1044=>'db_permission',1045=>'db_permission',1142=>'db_permission',1143=>'db_permission',1054=>'db_column',1146=>'db_table',1267=>'db_collation',1271=>'db_collation',1062=>'db_duplicate',1205=>'db_busy',1213=>'db_busy',2006=>'db_connection',2013=>'db_connection'][$native]??'php_sync';}
        elseif(!($error instanceof FamilyError))$code='php_sync';
    }
    $out=['code'=>$code,'stage'=>$stage,'message'=>$messages[$code]];
    if($error instanceof FamilyError&&preg_match('/FamilySync_Kho, dòng ([0-9]{1,5})(?:, cột ([0-9]{1,2}))?/u',$text,$at)){
        $row=(int)$at[1];$column=isset($at[2])?(int)$at[2]:null;
        if($row>=1&&$row<=10001){$out['location']=['tab'=>'FamilySync_Kho','row'=>$row];if($column!==null&&$column>=1&&$column<=9)$out['location']['column']=$column;}
    }
    return $out;
}
function sheetsAttemptPublic(array $trace): array {
    $allowed=['attempt_id','scope','source','state','started_at','finished_at','last_success','stage','counts','import_applied','write_attempted','write_acknowledged','layout_updated','conflict_count','skipped','error'];
    return array_intersect_key($trace,array_flip($allowed));
}
function sheetsAttemptPersist(PDO $db,array $trace,bool $retain=true): void {
    $entry=sheetsAttemptPublic($trace);$history=sheetsMeta($db,'history',[]);if(!is_array($history))$history=[];
    $history=array_values(array_filter($history,fn($row)=>is_array($row)&&($row['attempt_id']??'')!==$entry['attempt_id']));
    if($retain)array_unshift($history,$entry);
    sheetsPut($db,'history',array_slice($history,0,100));
    if(sheetsMeta($db,'active_attempt',null)===$entry['attempt_id'])sheetsPut($db,'health_'.$entry['scope'],$entry);
}
function sheetsAttemptBestEffort(PDO $db,array $trace,bool $retain=true): void {
    try{sheetsAttemptPersist($db,$trace,$retain);}catch(Throwable $ignored){/* Telemetry must never replace the actual sync result. */}
}
function sheetsAttemptFinish(PDO $db,array &$trace,array $result,?Throwable $failure=null): void {
    $trace['finished_at']=stamp();$trace['state']=$failure?'error':(!empty($result['conflicts'])?'conflict':'success');
    if($failure)$trace['error']=sheetsErrorReport($failure,$trace['stage']);
    if($trace['state']==='conflict')$trace['conflict_count']=count($result['conflicts']);
    if($trace['state']==='success'){$trace['last_success']=$result['last_sync']??$trace['finished_at'];$trace['stage']='complete';}
    $changed=false;foreach($trace['counts'] as $tabs)foreach($tabs??[] as $counts)if(array_sum($counts)>0)$changed=true;
    $retain=$trace['source']!=='auto'||$trace['state']!=='success'||$changed||$trace['layout_updated']||($trace['skipped']['sheet_deletions_ignored']??0)>0;
    sheetsAttemptBestEffort($db,$trace,$retain);$trace['_finished']=true;
}
function sheetsAttemptVisible(array $entry,?string $active,bool $locked): array {
    if(($entry['state']??'')==='running'&&(!$locked||($entry['attempt_id']??null)!==$active)){
        $entry['state']='error';$entry['error']=['code'=>'interrupted','stage'=>$entry['stage']??'unknown','message'=>'Lượt đồng bộ bị gián đoạn. Chưa xác nhận hoàn tất; hãy đồng bộ lại.'];
    }return $entry;
}
function sheetsHealth(PDO $db,array $c): array {
    $active=sheetsMeta($db,'active_attempt',null);$locked=one($db,'SELECT IS_USED_LOCK(?) AS owner',[sheetsLockName($c)])['owner']!==null;$out=[];
    foreach(['core','vault'] as $scope){$entry=sheetsMeta($db,'health_'.$scope,null);$last=sheetsMeta($db,'last_'.$scope,null);
        $out[$scope]=is_array($entry)?sheetsAttemptVisible($entry,is_string($active)?$active:null,$locked):['scope'=>$scope,'state'=>'idle','last_success'=>$last,'started_at'=>null,'finished_at'=>null,'error'=>null];
    }return $out;
}
function sheetsHistoryPage(PDO $db,array $c,array $query=[]): array {
    $page=filter_var($query['page']??1,FILTER_VALIDATE_INT,['options'=>['min_range'=>1,'max_range'=>100000]]);if($page===false)$page=1;
    $history=sheetsMeta($db,'history',[]);if(!is_array($history))$history=[];$total=count($history);$pages=max(1,(int)ceil($total/20));$page=min($page,$pages);
    $active=sheetsMeta($db,'active_attempt',null);$locked=one($db,'SELECT IS_USED_LOCK(?) AS owner',[sheetsLockName($c)])['owner']!==null;
    return ['entries'=>array_map(fn($entry)=>sheetsAttemptVisible($entry,is_string($active)?$active:null,$locked),array_slice($history,($page-1)*20,20)),'total'=>$total,'page'=>$page,'page_size'=>20,'pages'=>$pages];
}
function sheetsSync(PDO $db,array $c,string $scope,array $options=[],?string $key=null,?callable $transport=null): array {
    if(!in_array($scope,['core','vault'],true))fail('Phạm vi đồng bộ không hợp lệ.');
    $stage='sync_lock';$trace=null;
    $onStage=function(string $value)use(&$stage,&$trace,&$db): void {
        $stage=$value;if($trace!==null){$trace['stage']=$value;if(in_array($value,['read_remote','write_remote','save_state'],true))sheetsAttemptBestEffort($db,$trace);}
    };
    try{
        for($attempt=0;$attempt<2;$attempt++){
            try{
                if(!sheetsTryLock($db,$c))return ['ok'=>true,'configured'=>true,'busy'=>true];
                try{
                    if($attempt>0)databaseLock($db,$c);
                    if($trace===null&&sheetsMeta($db,'config',null)){
                        $trace=['attempt_id'=>bin2hex(random_bytes(12)),'scope'=>$scope,'source'=>($options['source']??'user')==='auto'?'auto':'user','state'=>'running','started_at'=>stamp(),'finished_at'=>null,'last_success'=>sheetsMeta($db,'last_'.$scope,null),'stage'=>'settings','counts'=>['sheet_to_web'=>sheetsCountSet($scope),'web_to_sheet'=>sheetsCountSet($scope)],'import_applied'=>false,'write_attempted'=>false,'write_acknowledged'=>false,'layout_updated'=>false,'conflict_count'=>0,'skipped'=>['sheet_deletions_ignored'=>0],'error'=>null];
                        try{sheetsPut($db,'active_attempt',$trace['attempt_id']);sheetsAttemptBestEffort($db,$trace);}catch(Throwable $ignored){}
                    }
                    if($attempt>0&&$trace!==null){try{sheetsPut($db,'active_attempt',$trace['attempt_id']);sheetsAttemptBestEffort($db,$trace);}catch(Throwable $ignored){}}
                    $result=sheetsSyncRun($db,$c,$scope,$options,$key,$transport,$onStage,$trace);
                    if($trace!==null){sheetsAttemptFinish($db,$trace,$result);$result['sync_report']=sheetsAttemptPublic($trace);}
                    return $result;
                }catch(FamilySheetReconnect $error){if($attempt>0&&$trace!==null)sheetsAttemptFinish($db,$trace,[],$error);throw $error;}
                catch(Throwable $error){if($trace!==null)sheetsAttemptFinish($db,$trace,[],$error);throw $error;}
                finally{sheetsReleaseLock($db,$c);}
            }catch(FamilySheetReconnect $error){
                // Explicitly drop a healthy previous application's lock before
                // retrying. An exception trace may keep its PDO object alive.
                if($error instanceof FamilySheetRestart)databaseUnlock($db,$c);
                if($attempt>0)throw $error;
                $previous=$db;$db=sheetsConnection($c);
                if(($GLOBALS['vault_db']??null)===$previous)$GLOBALS['vault_db']=$db;
                unset($previous);$stage='sync_lock';
            }
        }
        throw new FamilySheetReconnect();
    }catch(Throwable $error){if($trace!==null&&!($trace['_finished']??false))sheetsAttemptFinish($db,$trace,[],$error);throw sheetsLocalFailure($error,$stage,$scope);}
}
function sheetsSyncRun(PDO &$db,array $c,string $scope,array $options=[],?string $key=null,?callable $transport=null,?callable $onStage=null,?array &$trace=null): array {
    $onStage??=static function(string $value): void {};$onStage('settings');
    $settings=sheetsSettings($db,$c);if(!$settings)return ['ok'=>true,'configured'=>false];
    if($scope==='vault'&&($key===null||!vaultAuthorize($db,$c)))fail('Mở khóa Kho để đồng bộ tài khoản từ Sheet.',423);
    $send=$transport??fn($payload)=>sheetsRemote($settings,$payload);
    $onStage('read_remote');$remote=sheetsWaitForGoogle($db,$c,fn()=>$send(['action'=>'read','scope'=>$scope]));
    $onStage('validate_remote');$withTrial=$scope==='vault'&&($remote['vault_schema']??'')==='trial-date-v1';
    $withCodes=$scope==='core'&&($remote['lookup_codes']??'')==='v1'&&function_exists('lookupDerivedCode');
    $rows=sheetsValidateRemote($remote['data']??null,$scope,$withTrial,$withCodes);if($scope==='vault'&&!vaultAuthorize($db,$c))fail('Kho đã khóa trong lúc đồng bộ. Mở lại Kho để tiếp tục.',423);
    $onStage('snapshot_local');$local=sheetsSnapshot($db,$scope,$key,$withTrial,$withCodes);$base=sheetsMeta($db,'base_'.$scope);
    $pendingBinding=false;
    $onStage('normalize_vault');
    if($withTrial){foreach($rows['vault'] as $id=>&$row){
        try{$item=vaultFields($row);$row=[...$row,...$item,'totp'=>vaultTotpText($item['totp'],$item['email']),'trial_date'=>calendarDate($row['trial_date'])];}
        catch(FamilyError $e){$line=$remote['row_locations'][$id]??null;fail((is_int($line)&&$line>=2&&$line<=10001?'FamilySync_Kho, dòng '.$line.': ':'').$e->getMessage(),$e->status);}
        // A lost Google acknowledgement may leave an assigned new ID without
        // its Family link. Resolve that metadata from the stored alias only.
        $saved=$local['vault'][$id]??null;if(str_starts_with($id,'new:')&&$row['family_id']===''&&$saved&&$saved['family_id']!==''&&$saved['email']===$row['email']){$row['family_id']=$saved['family_id'];$pendingBinding=true;}
    }unset($row);$base=sheetsVaultBase($local,$rows,$base,$c);}
    $onStage('merge');$challenge=hash_hmac('sha256',sheetsCanonical(['local'=>sheetsFingerprints($local,$c),'remote'=>sheetsFingerprints($rows,$c),'base'=>$base]),sheetsKey($c));
    $choice=$options['choice']??null;if($choice!==null&&(!in_array($choice,['web','sheet'],true)||!hash_equals($challenge,(string)($options['conflict_token']??''))))$choice=null;
    $merge=sheetsMerge($local,$rows,$base,$c,$choice);
    if($trace!==null){$ignored=0;foreach($local as $tab=>$records)foreach($records as $id=>$row)if(isset($base[$tab][$id])&&!isset($rows[$tab][$id]))$ignored++;$trace['skipped']=['sheet_deletions_ignored'=>$ignored];}
    if($merge['conflicts'])return ['ok'=>false,'configured'=>true,'conflicts'=>$merge['conflicts'],'conflict_token'=>$challenge];
    // Commit imports before the external request. The unchanged baseline and stable
    // IDs make retry safe after a timeout, including a lost Google acknowledgement.
    $onStage('begin_import');beginAudit($db,$scope==='vault'?'Đồng bộ Kho từ Sheet':'Đồng bộ dữ liệu từ Sheet');
    try{$onStage($scope==='core'?'apply_core':'apply_vault');if($scope==='core')sheetsApplyCore($db,$local,$merge['data']);else sheetsApplyVault($db,$local,$merge['data'],$key,$withTrial);$onStage('commit_import');finishAudit();if($trace!==null){$trace['import_applied']=true;$trace['counts']['sheet_to_web']=null;}}catch(Throwable $e){finishAudit(false);throw $e;}
    if($scope==='vault'&&($key===null||!vaultAuthorize($db,$c)))fail('Kho đã khóa trong lúc đồng bộ. Mở lại Kho để tiếp tục.',423);
    $onStage('snapshot_output');$out=sheetsSnapshot($db,$scope,$key,$withTrial,$withCodes);if($trace!==null)sheetsTraceChanges($trace,'sheet_to_web',$local,$out);$payload=[];foreach($out as $tab=>$records)$payload[$tab]=array_values($records);
    // Freeze the acknowledged snapshot, not any newer web edits made while
    // Google is writing. Those newer edits will be sent on the next sync.
    $fingerprints=sheetsFingerprints($out,$c);
    $writeNeeded=$pendingBinding||$fingerprints!==sheetsFingerprints($rows,$c)||($scope==='core'&&($remote['customer_layout']??'')!=='grouped')||($withTrial&&($remote['vault_layout']??'')!=='entry');
    if($trace!==null){$trace['write_attempted']=$writeNeeded;$trace['write_acknowledged']=false;$trace['layout_updated']=$scope==='core'?($remote['customer_layout']??'')!=='grouped':($withTrial&&($remote['vault_layout']??'')!=='entry');}
    $onStage('write_remote');
    $write=function()use($send,$scope,$remote,$payload,$rows,$out,&$trace): array {
        $response=$send(['action'=>'write','scope'=>$scope,'revision'=>$remote['revision']??'','data'=>$payload]);
        if($trace!==null){$trace['write_acknowledged']=true;sheetsTraceChanges($trace,'web_to_sheet',$rows,$out);}return $response;
    };
    $written=$writeNeeded?sheetsWaitForGoogle($db,$c,$write):$remote;
    if($trace!==null&&!$writeNeeded)$trace['write_acknowledged']=true;
    $onStage('save_state');
    if($scope==='core')sheetsRuntime($db,$written);
    sheetsPut($db,'base_'.$scope,$fingerprints);sheetsPut($db,'last_'.$scope,stamp());
    if(isset($remote['sheet_url'])&&preg_match('~^https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]+/edit$~D',$remote['sheet_url']))sheetsPut($db,'url',$remote['sheet_url']);
    return ['ok'=>true,'configured'=>true,'last_sync'=>sheetsMeta($db,'last_'.$scope),'sheet_url'=>sheetsMeta($db,'url',''),'customer_layout'=>sheetsMeta($db,'customer_layout','unknown'),'script_version'=>sheetsMeta($db,'script_version','unknown')];
}
function sheetsRuntime(PDO $db,array $response): void {
    $version=$response['script_version']??'legacy';if(!is_string($version)||!preg_match('/^[A-Za-z0-9._-]{1,80}$/D',$version))$version='unknown';
    sheetsPut($db,'script_version',$version);$layout=$response['customer_layout']??'unknown';sheetsPut($db,'customer_layout',in_array($layout,['flat','grouped'],true)?$layout:'unknown');
    sheetsPut($db,'lookup_codes',($response['lookup_codes']??'')==='v1');sheetsPut($db,'gmail_invites',($response['gmail_invites']??'')==='v1');
}
function sheetsSaveSettings(PDO $db,array $c,array $d,?callable $probe=null): void {
    if(!sheetsTryLock($db,$c))fail('Một lượt đồng bộ Sheet đang chạy. Chờ hoàn tất rồi đổi link kết nối.',409);
    try{sheetsSaveSettingsRun($db,$c,$d,$probe);}finally{sheetsReleaseLock($db,$c);}
}
function sheetsSaveSettingsRun(PDO &$db,array $c,array $d,?callable $probe=null): void {
    $probe=$probe??fn($settings)=>sheetsRemote($settings,['action'=>'read','scope'=>'core']);
    $url=text($d['url']??'',500);$old=sheetsSettings($db,$c);$token=text($d['token']??'',256);if($token===''&&$old)$token=$old['token'];
    if(!preg_match('~^https://script\.google\.com/macros/s/[A-Za-z0-9_-]+/exec$~D',$url)||!preg_match('/^[A-Za-z0-9_-]{32,256}$/D',$token))fail('Nhập URL /exec và mã kết nối trong Script Properties.');
    $settings=['url'=>$url,'token'=>$token];$test=sheetsWaitForGoogle($db,$c,fn()=>$probe($settings));sheetsValidateRemote($test['data']??null,'core');
    $target=$test['sheet_url']??'';if(!is_string($target)||!preg_match('~^https://docs\.google\.com/spreadsheets/d/[A-Za-z0-9_-]+/edit$~D',$target))fail('Không xác định được file Sheet của link mới. Chưa đổi kết nối.',409);
    if($old&&($old['url']!==$url||!hash_equals($old['token'],$token))){
        $current=sheetsMeta($db,'url','');if(!$current){$previous=sheetsWaitForGoogle($db,$c,fn()=>$probe($old));$current=$previous['sheet_url']??'';}
        if($current!==$target)fail('Link mới trỏ sang file Sheet khác. Chưa thay đổi kết nối hoặc dữ liệu.',409);
    }
    sheetsPut($db,'config',vaultSeal(json_encode($settings,JSON_THROW_ON_ERROR),sheetsKey($c),'family-sheets-config-v1'));
    sheetsPut($db,'url',$target);sheetsRuntime($db,$test);
}
// Lấy link mời từ Gmail through the same Apps Script (v5.8+, read-only Gmail scope). The app
// lock is released while Google reads the mailbox; the import itself is one audited transaction.
function sheetsGmailInvites(PDO &$db,array $c,?callable $transport=null,array $want=[]): array {
    $settings=sheetsSettings($db,$c);if(!$settings)fail('Kết nối Google Sheet trước (nút Đồng bộ Sheet), rồi mới lấy link từ Gmail.',409);
    $send=$transport??fn($payload)=>sheetsRemote($settings,$payload);
    try{$reply=sheetsWaitForGoogle($db,$c,fn()=>$send(['action'=>'read','scope'=>'invites']));sheetsCheckRemoteReply($reply);}
    catch(FamilyError $e){if(str_contains($e->getMessage(),'[request]'))fail('Apps Script đang chạy bản cũ nên chưa lấy được link từ Gmail. Dán Code.gs và appsscript.json mới, chạy capQuyenGmail rồi triển khai New version.',409);throw $e;}
    $items=$reply['invites']??null;if(!is_array($items)||!array_is_list($items)||count($items)>500)fail('Apps Script trả danh sách thư mời không hợp lệ.',502);
    sheetsPut($db,'gmail_invites',true);
    // The Gmail the script reads; Gen mail mời offers it as the base address.
    $mailbox=is_string($reply['mailbox']??null)?strtolower(trim($reply['mailbox'])):'';if(strlen($mailbox)<=254&&preg_match('/^[^\s@+]+@[^\s@]+\.[^\s@]+$/D',$mailbox))sheetsPut($db,'gmail_mailbox',$mailbox);else $mailbox='';
    beginAudit($db,'Lấy link mời từ Gmail');
    try{$result=lookupImportInvites($db,$items,$want);finishAudit();}catch(Throwable $e){finishAudit(false);throw $e;}
    return ['ok'=>true,'mailbox'=>$mailbox,...$result];
}
function sheetsEndpointUrl(PDO $db,array $c): string {try{return sheetsSettings($db,$c)['url']??'';}catch(Throwable $e){return '';}}
function sheetsRequest(PDO $db,array $c,string $route,string $method): never {
    if($route==='/api/sheets/status'&&$method==='GET')reply(['configured'=>(bool)sheetsMeta($db,'config',null),'last_core'=>sheetsMeta($db,'last_core',null),'last_vault'=>sheetsMeta($db,'last_vault',null),'sheet_url'=>sheetsMeta($db,'url',''),'script_url'=>sheetsEndpointUrl($db,$c),'customer_layout'=>sheetsMeta($db,'customer_layout','unknown'),'script_version'=>sheetsMeta($db,'script_version','unknown'),'lookup_codes'=>sheetsMeta($db,'lookup_codes',false)===true,'gmail_invites'=>sheetsMeta($db,'gmail_invites',false)===true,'health'=>sheetsHealth($db,$c),'history_available'=>true]);
    if($route==='/api/sheets/history'&&$method==='GET')reply(sheetsHistoryPage($db,$c,$_GET));
    if($route==='/api/sheets/config'&&$method==='POST'){
        sheetsSaveSettings($db,$c,body());reply(['ok'=>true]);
    }
    if($route==='/api/sheets/config'&&$method==='DELETE'){if(!sheetsTryLock($db,$c))fail('Một lượt đồng bộ Sheet đang chạy. Chờ hoàn tất rồi ngắt kết nối.',409);try{sheetsStore($db);q($db,"DELETE FROM family_sheet_state WHERE name NOT IN ('history')");}finally{sheetsReleaseLock($db,$c);}reply(['ok'=>true]);}
    if($route==='/api/sheets/sync'&&$method==='POST')reply(sheetsSync($db,$c,'core',body()));
    if($route==='/api/sheets/gmail-invites'&&$method==='POST'){$d=body();reply(sheetsGmailInvites($db,$c,null,isset($d['to'])||isset($d['family_id'])?$d:[]));}
    fail('Không tìm thấy.',404);
}
function sheetsVaultRequest(PDO $db,array $c): never {
    $GLOBALS['vault_db']=$db;$auth=vaultAuthorize($db,$c);if(!$auth)fail('Mở khóa Kho trước khi đồng bộ mật khẩu/2FA.',423);
    reply(sheetsSync($db,$c,'vault',body(),$auth['key']));
}
