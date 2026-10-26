<?php
declare(strict_types=1);
foreach(['core','business','audit','vault','records','issues'] as $file)require __DIR__."/$file.php";
$c=config();$db=db($c);$GLOBALS['vault_db']=$db;$key=random_bytes(32);
function preparedCheck(bool $ok): void {if(!$ok)throw new RuntimeException('Prepared owner assertion failed');}
beginAudit($db,'Test');$a=saveFamilyRecord($db,null,['name'=>'Original','manager_email'=>'a@example.com','trial_date'=>'2026-01-01']);$b=saveFamilyRecord($db,null,['name'=>'Prepared','manager_email'=>'b@example.com','trial_date'=>'2026-10-20']);$customer=saveMemberRecord($db,null,['family_id'=>$a['id'],'email'=>'guest@example.com']);
$ids=[];foreach([$a,$b] as $i=>$f){q($db,'INSERT INTO vault_items(payload,revision,created_at,updated_at,family_id) VALUES (?,0,?,?,?)',['',stamp(),stamp(),$f['id']]);$id=(int)$db->lastInsertId();$item=['email'=>$i?'b@example.com':'a@example.com','password'=>'FAKE-only-password-'.$i,'totp'=>['secret'=>'JBSWY3DPEHPK3PXP','algorithm'=>'SHA1','period'=>30],'recovery_email'=>'recovery@example.com','note'=>'prepared note','label'=>''];q($db,'UPDATE vault_items SET payload=? WHERE id=?',[json_encode(vaultSeal(json_encode($item),$key,'family-vault-item-v1:'.$id)),$id]);$ids[]=$id;}
$f=one($db,'SELECT * FROM families WHERE id=?',[$a['id']]);$case=saveIssue($db,null,['family_id'=>$a['id'],'title'=>'Fake error']);finishAudit();$payload=one($db,'SELECT payload FROM vault_items WHERE id=?',[$ids[1]])['payload'];
// An occupied prepared family must never be consumed.
beginAudit($db,'Test');$block=saveMemberRecord($db,null,['family_id'=>$b['id'],'email'=>'occupied@example.com']);finishAudit();
beginAudit($db,'Test');try{saveIssue($db,$case['id'],['revision'=>0,'status'=>'done','resolution'=>'replace','replacement_email'=>'b@example.com']);throw new RuntimeException('Accepted occupied family');}catch(FamilyError $e){finishAudit(false);preparedCheck($e->status===409);}
q($db,'DELETE FROM members WHERE id=?',[$block['id']]);
// All binding changes roll back if completing the case fails.
$db->exec("CREATE TRIGGER reject_prepared BEFORE UPDATE ON issues FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test failure'");
beginAudit($db,'Test');try{saveIssue($db,$case['id'],['revision'=>0,'status'=>'done','resolution'=>'replace','replacement_email'=>'b@example.com']);throw new RuntimeException('Accepted trigger');}catch(PDOException $e){finishAudit(false);}$db->exec('DROP TRIGGER reject_prepared');preparedCheck(one($db,'SELECT manager_id FROM families WHERE id=?',[$a['id']])['manager_id']===$f['manager_id']);
beginAudit($db,'Test');saveIssue($db,$case['id'],['revision'=>0,'status'=>'done','resolution'=>'replace','replacement_email'=>'b@example.com']);finishAudit();
$record=one($db,'SELECT * FROM vault_items WHERE id=?',[$ids[1]]);preparedCheck($record['family_id']===$a['id']&&$record['payload']===$payload&&$record['revision']===1);$read=vaultRead($record,$key);preparedCheck($read['password']==='FAKE-only-password-1'&&$read['recovery_email']==='recovery@example.com'&&$read['note']==='prepared note'&&$read['totp']['secret']==='JBSWY3DPEHPK3PXP');preparedCheck(one($db,'SELECT family_id FROM members WHERE id=?',[$customer['id']])['family_id']===$a['id']);preparedCheck(one($db,'SELECT trial_date FROM families WHERE id=?',[$a['id']])['trial_date']==='2026-10-20');preparedCheck(one($db,'SELECT archived_at FROM families WHERE id=?',[$b['id']])['archived_at']!=='');preparedCheck(one($db,'SELECT family_id FROM vault_items WHERE id=?',[$ids[0]])['family_id']===$b['id']);
echo "Prepared owner checks passed\n";
