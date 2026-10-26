<?php
declare(strict_types=1);
const PRODUCT_IMPORT_FIELDS=['product','purchase_source','customer_name','email','contact','plan_months','joined_at','expires_at','payment_status','amount','note'];
function productImportText(mixed $value,int $max=1000): string {return text($value,$max);}
function productImportDate(mixed $value): string {
    $raw=productImportText($value,20);if($raw==='')return '';
    if(preg_match('~^(\d{1,2})/(\d{1,2})/(\d{4})$~D',$raw,$m))$raw=$m[3].'-'.str_pad($m[2],2,'0',STR_PAD_LEFT).'-'.str_pad($m[1],2,'0',STR_PAD_LEFT);
    if(!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$raw,$m)||!checkdate((int)$m[2],(int)$m[3],(int)$m[1]))fail('Ngày cần hợp lệ theo dd/mm/yyyy hoặc yyyy-mm-dd, có đủ năm.');return $raw;
}
function productImportFold(string $value): string {return strtolower(iconv('UTF-8','ASCII//TRANSLIT',strtr($value,['đ'=>'d','Đ'=>'D'])));}

function productImportNumber(mixed $value,bool $plan=false): int {
    if($value===null||$value==='')return 0;
    if(is_int($value)){if($value<0||$value>($plan?120:1000000000))fail($plan?'Gói mua từ 0 đến 120 tháng.':'Số tiền từ 0 đến 1 tỷ VND.');return $value;}
    if(!is_string($value))fail($plan?'Gói mua từ 0 đến 120 tháng.':'Số tiền từ 0 đến 1 tỷ VND.');$raw=productImportText($value,50);if($raw==='')return 0;
    if($plan){$raw=productImportFold($raw);if(!preg_match('/^(\d+)\s*(thang|months?|nam|years?)?$/D',$raw,$m))fail('Gói mua cần số tháng, ví dụ 3 tháng hoặc 1 năm.');$number=(float)$m[1]*(in_array($m[2]??'',['nam','year','years'],true)?12:1);if($number>120)fail('Gói mua từ 0 đến 120 tháng.');return (int)$number;}
    $raw=trim(preg_replace('/\s*(?:vnd|đ|₫)$/iu','',$raw));
    if(!preg_match('/^\d+$/D',$raw)){if(!preg_match('/^\d{1,3}([., ])\d{3}(?:\1\d{3})*$/D',$raw))fail('Số tiền cần là số nguyên VND, ví dụ 165000 hoặc 165.000 đ.');$raw=str_replace(['.',',',' '],'',$raw);}
    if((float)$raw>1000000000)fail('Số tiền từ 0 đến 1 tỷ VND.');return (int)$raw;
}
function productImportNormalize(mixed $raw): array {
    if(!is_array($raw)||array_is_list($raw))fail('Dòng dữ liệu không hợp lệ.');$product=productImportText($raw['product']??null,100);$name=productImportText($raw['customer_name']??null,200);$address=productImportText($raw['email']??null,254);if(!$product)fail('Nhập tên sản phẩm.');if(!$name&&!$address)fail('Nhập tên khách hoặc email khách.');if($address)$address=email($address);
    $plan=productImportNumber($raw['plan_months']??null,true);$joined=productImportDate($raw['joined_at']??null);$expires=productImportDate($raw['expires_at']??null);if(!$expires&&$joined&&$plan)$expires=purchaseExpiry($joined,$plan);if($joined&&$expires&&$expires<$joined)fail('Ngày hết hạn phải từ ngày mua trở đi.');
    $source=preg_replace('/[^a-z0-9]/','',productImportFold(productImportText($raw['payment_status']??null,50)));$aliases=['unknown'=>'unknown','chuaghinhan'=>'unknown','chuaxacminh'=>'unknown','unpaid'=>'unpaid','chuathanhtoan'=>'unpaid','partial'=>'partial','thanhtoanmotphan'=>'partial','datramotphan'=>'partial','tramotphan'=>'partial','paid'=>'paid','dathanhtoan'=>'paid','dathu'=>'paid'];$payment=$source===''?'unknown':($aliases[$source]??null);if(!$payment)fail('Trạng thái thanh toán: Chưa ghi nhận, Chưa thanh toán, Thanh toán một phần hoặc Đã thanh toán.');
    return ['product'=>$product,'purchase_source'=>productImportText($raw['purchase_source']??null,200),'customer_name'=>$name,'email'=>$address,'contact'=>productImportText($raw['contact']??null),'plan_months'=>$plan,'joined_at'=>$joined,'expires_at'=>$expires,'payment_status'=>$payment,'amount'=>productImportNumber($raw['amount']??null),'note'=>productImportText($raw['note']??null)];
}
function productImportIdentity(array $row): string {$values=[];foreach(PRODUCT_IMPORT_FIELDS as $key)$values[]=in_array($key,['amount','plan_months'],true)?(int)($row[$key]??0):(string)($row[$key]??'');return json_encode($values,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR);}
function productImportPreview(PDO $db,array $data): array {
    $items=$data['items']??null;if(!is_array($items)||!array_is_list($items)||!count($items)||count($items)>500)fail('Cần từ 1 đến 500 dòng sản phẩm.');$known=[];foreach(all($db,'SELECT * FROM other_purchases') as $row)$known[productImportIdentity($row)]=true;$seen=[];$rows=[];$errors=[];$added=0;$skipped=0;
    foreach($items as $index=>$raw){$line=is_array($raw)&&is_int($raw['line']??null)&&$raw['line']>0&&$raw['line']<1000000?$raw['line']:$index+2;try{$row=productImportNormalize($raw);$identity=productImportIdentity($row);$duplicate=isset($known[$identity])||isset($seen[$identity]);$seen[$identity]=true;$rows[]=[...$row,'line'=>$line,'action'=>$duplicate?'skip':'add','reason'=>$duplicate?'Dòng trùng hoàn toàn.':''];if($duplicate)$skipped++;else $added++;}catch(FamilyError $error){$errors[]=['line'=>$line,'message'=>$error->getMessage()];}}
    $proof=[];foreach($rows as $row)$proof[]=[$row['line'],productImportIdentity($row),$row['action']];$token=$errors?'':hash('sha256',json_encode($proof,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));return ['ok'=>true,'valid'=>!$errors,'total'=>count($items),'rows'=>$rows,'errors'=>$errors,'added'=>$added,'skipped'=>$skipped,'preview_token'=>$token];
}
function productImportConfirm(PDO $db,array $data): array {
    $owned=!$db->inTransaction();if($owned)$db->beginTransaction();else $db->exec('SAVEPOINT product_sheet_import');
    try{$prepared=productImportPreview($db,$data);if(!$prepared['valid'])fail('Dữ liệu có lỗi. Xem trước và sửa các dòng trước khi nhập.');$token=$data['preview_token']??null;if(!is_string($token)||!preg_match('/^[a-f0-9]{64}$/D',$token))fail('Cần xem trước dữ liệu trước khi nhập.',409);if(!hash_equals($prepared['preview_token'],$token)&&$prepared['added']>0)fail('Dữ liệu sản phẩm đã thay đổi. Xem trước lại trước khi nhập.',409);foreach($prepared['rows'] as $row)if($row['action']==='add')saveProduct($db,null,$row);if($owned)$db->commit();else $db->exec('RELEASE SAVEPOINT product_sheet_import');return ['ok'=>true,'added'=>$prepared['added'],'skipped'=>$prepared['skipped'],'total'=>$prepared['total']];}
    catch(Throwable $error){if($owned){if($db->inTransaction())$db->rollBack();}else{$db->exec('ROLLBACK TO SAVEPOINT product_sheet_import');$db->exec('RELEASE SAVEPOINT product_sheet_import');}throw $error;}
}
