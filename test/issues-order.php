<?php
declare(strict_types=1);
foreach(['core','audit','issues'] as $file)require __DIR__."/$file.php";
$c=config();$db=db($c);
function checkIssueOrder(bool $condition,string $label): void {if(!$condition)throw new RuntimeException($label);}
function columnRows(PDO $db,string $status='todo'): array {return array_values(array_filter(issueList($db),fn($row)=>$row['status']===$status));}
function columnIds(PDO $db,string $status='todo'): array {return array_column(columnRows($db,$status),'id');}
function orderRequest(PDO $db,array $ids=[],bool $reset=false,string $status='todo'): array {$rows=columnRows($db,$status);return ['status'=>$status,'order'=>$ids,'reset'=>$reset,'expected'=>array_map(fn($row)=>['id'=>$row['id'],'created_at'=>$row['created_at'],'revision'=>$row['revision']],$rows),'order_token'=>$rows[0]['order_token']??issueOrdered($db,$status)['token']];}
function expectOrderFailure(callable $operation,int $status): void {try{$operation();throw new RuntimeException('Invalid reorder accepted');}catch(FamilyError $error){checkIssueOrder($error->status===$status,'Invalid reorder status');}}
$insert=function(int $id,string $created,string $status='todo')use($db): void {q($db,'INSERT INTO issues(id,family_id,family_name,target_type,target_id,subject_email,original_email,title,status,created_at,updated_at,reported_on) VALUES (?,NULL,?,?,?,?,?,?,?,?,?,?)',[$id,'Fake Family','manager',$id,"case$id@example.com","case$id@example.com",'Fake issue',$status,$created,$created,substr($created,0,10)]);};
$insert(1,'2026-10-20T12:00:00.000Z');$insert(2,'2026-10-23T12:00:00.000Z');$insert(3,'2026-10-21T12:00:00.000Z');
checkIssueOrder(columnIds($db)===[2,3,1],'Creation time orders reports newest first');$before=all($db,'SELECT * FROM issues ORDER BY id');$stale=orderRequest($db,[1,2,3]);reorderIssues($db,$stale);checkIssueOrder(columnIds($db)===[1,2,3],'Manual order applied');checkIssueOrder(all($db,'SELECT * FROM issues ORDER BY id')===$before,'No business fields modified');
$peer=new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port']??3306).';dbname='.$c['db_name'].';charset=utf8mb4',$c['db_user'],$c['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false]);checkIssueOrder(columnIds($peer)===[1,2,3],'Order survives independent connection');
expectOrderFailure(fn()=>reorderIssues($db,$stale),409);
foreach([[1,1,3],[1,2],[1,2,999],[1,2,'3']] as $bad)expectOrderFailure(fn()=>reorderIssues($db,orderRequest($db,$bad)),400);
$insert(4,'2026-10-24T12:00:00.000Z');checkIssueOrder(columnIds($db)===[4,1,2,3],'New reports above saved manual order');
$stale=orderRequest($db,[3,2,1,4]);q($peer,'UPDATE issues SET revision=revision+1 WHERE id=2');expectOrderFailure(fn()=>reorderIssues($db,$stale),409);
reorderIssues($db,orderRequest($db,[],true));checkIssueOrder(columnIds($db)===[4,2,3,1],'Reset restores newest first');
reorderIssues($db,orderRequest($db,[4,3,2,1]));$case=one($db,'SELECT * FROM issues WHERE id=1');saveIssue($db,1,['status'=>'doing','revision'=>$case['revision'],'expected_created_at'=>$case['created_at']]);$case=one($db,'SELECT * FROM issues WHERE id=1');saveIssue($db,1,['status'=>'todo','revision'=>$case['revision'],'expected_created_at'=>$case['created_at']]);checkIssueOrder(columnIds($db)===[1,4,3,2],'Moved case arrives at top');
$case=one($db,'SELECT * FROM issues WHERE id=3');saveIssue($db,3,['note'=>'Changed note, same order','revision'=>$case['revision'],'expected_created_at'=>$case['created_at']]);checkIssueOrder(columnIds($db)===[1,4,3,2],'Note edits keep report order');
$stale=orderRequest($db,[2,3,4,1]);q($db,'DELETE FROM issues WHERE id=1');$insert(1,'2026-10-25T12:00:00.000Z');expectOrderFailure(fn()=>reorderIssues($db,$stale),409);checkIssueOrder(columnIds($db)===[1,4,3,2],'Reused numeric ID gets new identity');
echo "Issue ordering checks passed\n";
