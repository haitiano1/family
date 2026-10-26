<?php
declare(strict_types=1);
require __DIR__.'/../hosting/php/family-private/core.php';
require __DIR__.'/../hosting/php/family-private/sheets.php';

$private='FAKE_PRIVATE_PASSWORD_AND_TOKEN';$checks=0;
$cases=[
    [['ok'=>false,'code'=>'auth'],502,'[auth]'],
    [['ok'=>false,'code'=>'unavailable'],502,'[unavailable]'],
    [['ok'=>false,'code'=>'request'],502,'[request]'],
    [['ok'=>false,'code'=>'limit'],409,'[limit]'],
    [['ok'=>false,'code'=>'data'],409,'[data]'],
    [['ok'=>false,'code'=>'stale'],409,'Sheet vừa thay đổi'],
    [['ok'=>false,'code'=>'vault_date'],409,'Ngày trial'],
    [['ok'=>false,'code'=>'vault_email'],409,'Email Kho'],
];
foreach(['schema','formula','id','vault_id'] as $code)$cases[]=[['ok'=>false,'code'=>$code],409,'Kiểm tra tiêu đề cột'];
foreach([null,false,'private response',[],['ok'=>'true'],['ok'=>false,'code'=>$private],['ok'=>false,'code'=>[$private]]] as $reply)$cases[]=[$reply,502,'[unknown]'];
foreach($cases as [$reply,$status,$expected]){
    if(is_array($reply))$reply['message']=$private;
    try{sheetsCheckRemoteReply($reply);throw new RuntimeException('Rejected reply was accepted.');}
    catch(FamilyError $error){
        if($error->status!==$status||!str_contains($error->getMessage(),$expected)||str_contains($error->getMessage(),$private))throw new RuntimeException('Incorrect or unsafe Sheet error classification.');
        if($expected==='[unavailable]'&&str_contains($error->getMessage(),'[auth]'))throw new RuntimeException('Script execution error mislabeled as authentication error.');
    }
    $checks++;
}
foreach([
    [['tab'=>'FamilySync_Kho','row'=>8,'column'=>2],true],
    [['tab'=>$private,'row'=>8,'column'=>2],false],
    [['tab'=>'FamilySync_Kho','row'=>$private,'column'=>2],false],
    [['tab'=>'FamilySync_Kho','row'=>10002,'column'=>2],false],
    [['tab'=>'FamilySync_Kho','row'=>8,'column'=>10],false],
] as [$location,$visible]){
    try{sheetsCheckRemoteReply(['ok'=>false,'code'=>'vault_date','location'=>$location]);throw new RuntimeException('Bad date accepted.');}
    catch(FamilyError $error){if(str_contains($error->getMessage(),'dòng 8, cột 2')!==$visible||str_contains($error->getMessage(),$private))throw new RuntimeException('Unsafe diagnostic location.');}
    $checks++;
}
foreach([
    [['stage'=>'freeze_members','reason'=>'table','line'=>123],['[freeze_members]','Google Table','Dòng script: 123.']],
    [['stage'=>'read_families','reason'=>'protected','line'=>12],['[read_families]','vùng được bảo vệ','Dòng script: 12.']],
    [['stage'=>$private,'reason'=>$private,'line'=>$private],[]],
    [['stage'=>[$private],'reason'=>[$private],'line'=>100001],[]],
] as [$diagnostic,$expected]){
    try{sheetsCheckRemoteReply(['ok'=>false,'code'=>'unavailable','diagnostic'=>$diagnostic]);throw new RuntimeException('Failure accepted.');}
    catch(FamilyError $error){
        foreach($expected as $part)if(!str_contains($error->getMessage(),$part))throw new RuntimeException('Missing recognized diagnostic.');
        if(str_contains($error->getMessage(),$private)||(!$expected&&str_contains($error->getMessage(),'Dòng script:')))throw new RuntimeException('Unsafe remote diagnostic.');
    }
    $checks++;
}
sheetsCheckRemoteReply(['ok'=>true,'data'=>[]]);$checks++;
echo "Sheet error diagnostics: $checks checks passed.\n";

$localChecks=0;
foreach([
    [new TypeError($private),'apply_core','[type]',''],
    [new JsonException($private),'snapshot_local','[json]',''],
    [new Error('Call to undefined function '.$private.'()'),'apply_core','[php]','[missing_function]'],
    [new RuntimeException($private),$private,'[internal]',''],
] as [$exception,$stage,$kind,$reason]){
    $error=sheetsLocalFailure($exception,$stage,'core');$message=$error->getMessage();
    foreach(['[php_sync]','Family/Khách',$kind,$reason] as $expected)if($expected&&!str_contains($message,$expected))throw new RuntimeException('Missing safe local diagnostic.');
    if(str_contains($message,$private)||str_contains($message,__DIR__)||($stage===$private&&!str_contains($message,'[unknown]')))throw new RuntimeException('Unsafe local diagnostic.');
    $localChecks++;
}
foreach([1146=>'db_table',1267=>'db_collation',1062=>'db_duplicate',1142=>'db_permission'] as $native=>$reason){
    $exception=new PDOException($private);$exception->errorInfo=['HY000',$native,$private];$error=sheetsLocalFailure($exception,'apply_core','core');
    if(!str_contains($error->getMessage(),'['.$reason.']')||str_contains($error->getMessage(),$private)||$error->status!==($native===1062?409:500))throw new RuntimeException('Unsafe SQL classification.');
    $localChecks++;
}
$known=new FamilyError('Known validation',409);if(sheetsLocalFailure($known,'apply_core','core')!==$known)throw new RuntimeException('Validation was replaced.');$localChecks++;
echo "Local Sheet error diagnostics: $localChecks checks passed.\n";
