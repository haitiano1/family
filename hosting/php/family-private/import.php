<?php
declare(strict_types=1);
const IMPORT_FIELDS=['email','membership_status','customer_name','contact','joined_at','expires_at','payment_status','plan_months','amount','note','family_name','manager_email'];
function readCsv(string $source,string $separator): array {
    $rows=[];$fields=[];$cell='';$quoted=false;$closed=false;$line=1;$start=1;
    $pushCell=function()use(&$fields,&$cell,&$closed){$fields[]=$cell;$cell='';$closed=false;if(count($fields)>100) fail('CSV tối đa 100 cột.');};
    $pushRow=function()use(&$rows,&$fields,&$line,&$start,$pushCell){$pushCell();if(array_filter($fields,fn($c)=>trim($c)!=='')) $rows[]=['line'=>$start,'cells'=>$fields];$fields=[];if(count($rows)>10001)fail('CSV tối đa 10.000 khách.');};
    for($i=0,$n=strlen($source);$i<$n;$i++) {
        $c=$source[$i];
        if($quoted) {if($c==='"'){if(($source[$i+1]??'')==='"'){$cell.='"';$i++;}else{$quoted=false;$closed=true;}}else{$cell.=$c;if($c==="\n")$line++;}}
        elseif($c===$separator)$pushCell();
        elseif($c==="\n"){$pushRow();$line++;$start=$line;}
        elseif($c==='"'){if(strlen($cell)||$closed) fail("Dòng $line: dấu nháy CSV không hợp lệ.");$quoted=true;}
        else{if($closed)fail("Dòng $line: dữ liệu sau dấu nháy đóng không hợp lệ.");$cell.=$c;}
    }
    if($quoted)fail('CSV thiếu dấu nháy đóng.');if($cell!==''||$fields||$closed)$pushRow();return $rows;
}
function parseCsv(mixed $source,string $delimiter): array {
    if(!is_string($source)||strlen($source)>1000000)fail('CSV tối đa 1 MB.');$source=preg_replace('/^\xEF\xBB\xBF/','',$source);$source=str_replace(["\r\n","\r"],"\n",$source);
    if($delimiter==='auto'){$candidates=[];foreach([',',';',"\t"] as $d){try{$r=readCsv($source,$d);$candidates[]=['d'=>$d,'rows'=>$r];}catch(FamilyError $e){}}if(!$candidates)fail('CSV không hợp lệ.');usort($candidates,fn($a,$b)=>count($b['rows'][0]['cells']??[])<=>count($a['rows'][0]['cells']??[]));$delimiter=$candidates[0]['d'];}
    if(!in_array($delimiter,[',',';',"\t"],true))fail('Dấu phân cách không hợp lệ.');$rows=readCsv($source,$delimiter);if(count($rows)<2)fail('CSV cần dòng tiêu đề và ít nhất một dòng khách.');$header=array_shift($rows)['cells'];return ['headers'=>$header,'records'=>$rows];
}
function normalized(string $s): string {return preg_replace('/[^a-z0-9]/','',strtolower(iconv('UTF-8','ASCII//TRANSLIT',strtr($s,['đ'=>'d','Đ'=>'D']))));}
function dateCell(string $v): string {return preg_match('~^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$~D',$v,$p)?$p[3].'-'.str_pad($p[2],2,'0',STR_PAD_LEFT).'-'.str_pad($p[1],2,'0',STR_PAD_LEFT):$v;}
function paymentCell(string $v): string {
    $s=normalized($v);if(!$s)return 'unknown';foreach(['paid'=>['paid','dathanhtoan','dathu','datra'],'partial'=>['partial','thanhtoanmotphan','motphan'],'unpaid'=>['unpaid','chuathanhtoan','chuathu','chuatra']]as $key=>$values)if(in_array($s,$values,true))return $key;fail('Thanh toán cần là Đã thanh toán, Chưa thanh toán hoặc Thanh toán một phần.');
}
function amountCell(string $v): int {
    if(!$v)return 0;$s=preg_replace('/(?:vnd|đ|₫)$/iu','',preg_replace('/\s/u','',$v));
    if(preg_match('/^\d+$/D',$s)||preg_match('/^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/D',$s))return integer(str_replace([',','.'],'',$s),0,1000000000,'Số tiền từ 0 đến 1 tỷ VND.');fail('Số tiền cần là số nguyên VND, ví dụ 100000 hoặc 100.000.');
}
function planCell(string $v): int {if(!$v)return 0;if(preg_match('/^(?:1|một|mot)\s*năm$/iuD',$v))return 12;if(!preg_match('/^(\d+)\s*(?:tháng|thang|th|months?)?$/iuD',$v,$p))fail('Gói mua cần từ 1 đến 120 tháng.');return integer($p[1],1,120,'Gói mua cần từ 1 đến 120 tháng.');}
function first(array $rows,callable $fn): array|false {foreach($rows as $r)if($fn($r))return $r;return false;}
function importCustomers(PDO $db,array $data,bool $commit,array $config): array {
    return transaction($db,function()use($db,$data,$commit,$config){
        $input=$data;unset($input['preview_token']);$csv=parseCsv($input['csv']??null,$input['delimiter']??'auto');
        if(!is_array($input['mapping']??null)||array_is_list($input['mapping']))fail('Cần chọn cột dữ liệu.');$mapping=[];
        foreach(IMPORT_FIELDS as $name){$n=$input['mapping'][$name]??-1;if(!is_int($n)||$n< -1||$n>=count($csv['headers']))fail('Cột dữ liệu không hợp lệ.');$mapping[$name]=$n;}
        if($mapping['email']<0)fail('Cần chọn cột Email khách.');$selected=array_filter($mapping,fn($n)=>$n>=0);if(count(array_unique($selected))!==count($selected))fail('Một cột chỉ được gán cho một trường.');
        if(!in_array($input['duplicates']??'skip',['skip','update'],true))fail('Cách xử lý khách trùng không hợp lệ.');foreach(['allow_overflow','match_by_manager','create_groups']as $key)if(isset($input[$key])&&!is_bool($input[$key]))fail('Tùy chọn nhập không hợp lệ.');
        $accounts=all($db,'SELECT * FROM accounts ORDER BY id');$families=all($db,'SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at=\'\' ORDER BY f.id');$members=all($db,'SELECT * FROM members ORDER BY id');$fallback=first($families,fn($f)=>$f['id']==(int)($input['family_id']??0));
        if(!$fallback&&empty($input['default_manager'])&&$mapping['family_name']<0&&$mapping['manager_email']<0)fail('Chọn Family nhận khách hoặc chọn cột Family/email quản lý.');
        $groups=[];$counts=[];$seen=[];$items=[];foreach($families as $f)$counts[(string)$f['id']]=count(array_filter($members,fn($m)=>$m['family_id']===$f['id']&&$m['membership_status']!=='invited'));
        $groupFor=function($name,$manager)use($input,$families,$accounts,$fallback,&$groups,&$counts){
            if(!$name&&!$manager&&!$fallback&&!empty($input['default_manager'])){$manager=$input['default_manager'];$name=text($input['default_family']??'',200);}
            if($manager){$manager=email($manager);$found=first($families,fn($f)=>$f['manager_email']===$manager);if($found){if($name&&$name!==$found['name']&&empty($input['match_by_manager']))fail('Tên Family không khớp email quản lý trong hệ thống.');return ['key'=>(string)$found['id'],...$found];}
                if(empty($input['create_groups']))fail('Email quản lý chưa có Family. Tạo hồ sơ trước hoặc bật tạo Family mới.');$groupName=$name?:"Family $manager";
                if(isset($groups[$manager])){if($groups[$manager]['name']!==$groupName)fail('Một email quản lý có nhiều tên Family trong CSV.');return $groups[$manager];}
                $account=first($accounts,fn($a)=>$a['email']===$manager);$g=['key'=>"new:$manager",'name'=>text($groupName,200),'manager_email'=>$manager,'account_id'=>$account['id']??null];$groups[$manager]=$g;$counts[$g['key']]=0;return $g;
            }
            if($name){$matches=array_values(array_filter($families,fn($f)=>$f['name']===$name));if(count($matches)!==1)fail($matches?'Tên Family trùng nhau. Cần cột email quản lý.':'Không tìm thấy Family. Cần email quản lý để tạo nhóm mới.');return ['key'=>(string)$matches[0]['id'],...$matches[0]];}
            if($fallback)return ['key'=>(string)$fallback['id'],...$fallback];fail('Dòng này thiếu Family hoặc email quản lý.');
        };
        foreach($csv['records']as $record){$item=['line'=>$record['line'],'status'=>'error','email'=>'','family_name'=>'','message'=>''];
            try{
                if(count($record['cells'])>count($csv['headers']))fail('Dòng có nhiều cột hơn tiêu đề. Kiểm tra dấu phân cách và dấu nháy.');$cell=fn($name)=>$mapping[$name]<0?'':trim($record['cells'][$mapping[$name]]??'');$address=email($cell('email'));$item['email']=$address;$group=$groupFor($cell('family_name'),$cell('manager_email'));$item['family_name']=$group['name'];$item['group_key']=$group['key'];
                if($address===$group['manager_email'])fail('Email khách trùng tài khoản quản lý.');$identity=$group['key']."\0".$address;$existing=first($members,fn($m)=>(string)$m['family_id']===$group['key']&&$m['email']===$address);
                if(isset($seen[$identity])){$item['status']='skip';$item['message']='Trùng khách trong CSV; giữ dòng đầu.';$items[]=$item;continue;}$seen[$identity]=true;
                if($existing&&($input['duplicates']??'skip')!=='update'){$item['status']='skip';$item['message']='Khách đã có trong Family; giữ nguyên hồ sơ.';$items[]=$item;continue;}
                $values=$existing?:['email'=>$address,'payment_status'=>'unknown'];
                foreach(['email','customer_name','contact','joined_at','expires_at','payment_status','amount','note','plan_months','membership_status']as $name){if($mapping[$name]<0)continue;$raw=$cell($name);if($existing&&$raw===''&&$name!=='email')continue;$values[$name]=match($name){'joined_at','expires_at'=>dateCell($raw),'payment_status'=>paymentCell($raw),'amount'=>amountCell($raw),'plan_months'=>planCell($raw),default=>$raw};}
                $item['values']=memberValues($values);$item['member_id']=$existing['id']??null;$before=$existing&&$existing['membership_status']!=='invited'?1:0;$after=$item['values'][9]!=='invited'?1:0;
                if($counts[$group['key']]-$before+$after>5)fail('Family đã đủ 5 khách và 1 quản lý.');$counts[$group['key']]+=$after-$before;$item['status']=$existing?'update':'create';$item['message']=$existing?'Cập nhật trường đã chọn, giữ dữ liệu ô trống.':'Thêm khách mới.';
            }catch(FamilyError $e){$item['message']=$e->getMessage();}$items[]=$item;
        }
        $groups=array_values(array_filter($groups,fn($g)=>first($items,fn($i)=>($i['group_key']??'')===$g['key']&&$i['status']==='create')));
        $summary=['total'=>count($items),'create'=>0,'update'=>0,'skip'=>0,'errors'=>0,'new_families'=>count($groups),'new_accounts'=>count(array_filter($groups,fn($g)=>!$g['account_id']))];foreach($items as $i)$summary[$i['status']==='error'?'errors':$i['status']]++;
        $token=hash_hmac('sha256',json_encode([$input,$accounts,$families,$members],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),accessKey($config));
        if($commit){if(!is_string($data['preview_token']??null)||!hash_equals($token,$data['preview_token']))fail('Dữ liệu hoặc thiết lập đã thay đổi. Hãy xem trước lại rồi xác nhận.',409);if($summary['errors'])fail('CSV có dòng lỗi. Sửa lỗi và xem trước lại; chưa nhập khách nào.');if(!$summary['create']&&!$summary['update'])fail('Không có khách mới hoặc cập nhật để nhập.');$ids=[];
            foreach($groups as $g){$account=$g['account_id'];if(!$account){q($db,'INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)',[$g['manager_email'],'',stamp()]);$account=(int)$db->lastInsertId();}q($db,'INSERT INTO families(name,manager_id,service,note,created_at) VALUES (?,?,?,?,?)',[$g['name'],$account,'youtube','',stamp()]);$ids[$g['key']]=(int)$db->lastInsertId();}
            foreach($items as $i){if($i['status']==='create')q($db,'INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note,plan_months,membership_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[$ids[$i['group_key']]??(int)$i['group_key'],...$i['values']]);elseif($i['status']==='update')q($db,'UPDATE members SET email=?,customer_name=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=?,plan_months=?,membership_status=?,renewal_revision=renewal_revision+1 WHERE id=?',[...$i['values'],$i['member_id']]);}logEntry($db,"Cá nhân: nhập CSV {$summary['create']} khách mới, {$summary['update']} cập nhật, {$summary['skip']} bỏ qua");
        }
        return ['summary'=>$summary,'preview_token'=>$token,'rows'=>array_map(fn($i)=>['line'=>$i['line'],'status'=>$i['status'],'email'=>$i['email'],'family_name'=>$i['family_name'],'message'=>$i['message'],'customer_name'=>$i['values'][1]??'','joined_at'=>$i['values'][3]??'','expires_at'=>$i['values'][4]??'','plan_months'=>$i['values'][8]??0],array_slice($items,0,200)),'groups'=>array_map(fn($g)=>['name'=>$g['name'],'manager_email'=>$g['manager_email']],$groups),'errors'=>array_map(fn($i)=>['line'=>$i['line'],'message'=>$i['message']],array_slice(array_values(array_filter($items,fn($i)=>$i['status']==='error')),0,200)),'committed'=>$commit];
    });
}
