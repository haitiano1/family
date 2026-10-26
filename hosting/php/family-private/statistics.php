<?php
declare(strict_types=1);
function statisticsPeriod(string $month): array {
    $date=new DateTimeImmutable($month.'-01',new DateTimeZone('Asia/Ho_Chi_Minh'));
    return ['month'=>$month,'start_date'=>$month.'-01','end_date'=>$date->format('Y-m-t')];
}
function statisticsTotals(array $rows,string $month,string $metric='renewals'): array {
    $seen=[];$amount=0;foreach($rows as $h){$mail=strtolower(trim($h['email']));$seen[$mail!==''?$mail:'history:'.$h['id']]=true;$amount+=$h['amount'];}
    return [...($month==='all'?['month'=>'all','start_date'=>null,'end_date'=>null]:statisticsPeriod($month)),'customers'=>count($seen),$metric=>count($rows),'amount'=>$amount];
}
function statisticsReport(array $history,array $options,DateTimeImmutable $now,string $dateField,string $metric): array {
    $zone=new DateTimeZone('Asia/Ho_Chi_Minh');$now=$now->setTimezone($zone);$current=$now->format('Y-m');$month=$options['month']??$current;if($month==='')$month=$current;
    if(!is_string($month)||($month!=='all'&&!preg_match('/^[1-9]\d{3}-(0[1-9]|1[0-2])$/D',$month)))fail('Tháng thống kê không hợp lệ.');
    $records=[];$nowTime=(float)$now->format('U.u');
    foreach($history as $h){
        $time=null;$key=null;if(preg_match('/^\d{4}-\d{2}-\d{2}(?:$|T| )/',$h['created_at']))try{$date=(new DateTimeImmutable($h['created_at'],new DateTimeZone('UTC')))->setTimezone($zone);$time=(float)$date->format('U.u');$key=$date->format('Y-m');}catch(Exception $e){}
        $value=$h[$dateField]??'';if(preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$value,$parts)&&checkdate((int)$parts[2],(int)$parts[3],(int)$parts[1]))$key=substr($value,0,7);
        $records[]=['row'=>$h,'time'=>$time,'month'=>$key];
    }
    $first=new DateTimeImmutable($current.'-01',$zone);$months=[];
    for($i=0;$i<6;$i++){$key=$first->modify("-$i months")->format('Y-m');$rows=array_map(fn($h)=>$h['row'],array_filter($records,fn($h)=>$h['month']===$key&&$h['time']!==null&&$h['time']<=$nowTime));$months[]=statisticsTotals($rows,$key,$metric);}
    $selected=array_values(array_filter($records,fn($h)=>$month==='all'||($h['month']===$month&&$h['time']!==null&&$h['time']<=$nowTime)));
    $search=trim(text($options['search']??'',200));$pattern='~'.preg_quote($search,'~').'~iu';
    $filtered=array_values(array_filter($selected,fn($h)=>$search===''||preg_match($pattern,implode(' ',[$h['row']['email'],$h['row']['customer_name'],$h['row']['family_name'],$h['row']['note']]))===1));
    usort($filtered,fn($a,$b)=>(($b['time']??-PHP_FLOAT_MAX)<=>($a['time']??-PHP_FLOAT_MAX))?:($b['row']['id']<=>$a['row']['id']));
    $pageSize=50;$requested=max(1,min(100000,(int)($options['page']??1)));$page=min($requested,max(1,(int)ceil(count($filtered)/$pageSize)));
    return ['current_month'=>$current,'months'=>$months,'selected'=>statisticsTotals(array_map(fn($h)=>$h['row'],$selected),$month,$metric),'rows'=>array_map(fn($h)=>$h['row'],array_slice($filtered,($page-1)*$pageSize,$pageSize)),'total'=>count($filtered),'page'=>$page,'page_size'=>$pageSize,'history_total'=>count($history)];
}
function renewalStatistics(PDO $db,array $options=[],?DateTimeImmutable $now=null): array {
    $now=$now??new DateTimeImmutable('now');
    return [...statisticsReport(all($db,'SELECT * FROM renewal_history'),$options,$now,'old_expires_at','renewals'),'new_purchases'=>statisticsReport(all($db,'SELECT * FROM new_purchase_history'),[...$options,'page'=>$options['new_page']??1],$now,'joined_at','purchases')];
}
