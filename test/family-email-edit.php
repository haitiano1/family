<?php
declare(strict_types=1);
foreach(['core','business','audit','vault','records','sheets'] as $file)require __DIR__."/$file.php";
$c=config();$db=db($c);$GLOBALS['vault_db']=$db;$key=random_bytes(32);
function emailEditCheck(bool $ok): void {if(!$ok)throw new RuntimeException('Family email edit assertion failed');}
beginAudit($db,'Test');$a=saveFamilyRecord($db,null,['name'=>'Family','manager_email'=>'old@example.com','trial_date'=>'2026-10-01']);$id=vaultInsert($db,vaultFields(['email'=>'old@example.com','password'=>'FAKE_ONLY_PASSWORD','totp'=>'JBSWY3DPEHPK3PXP','recovery_email'=>'recovery@example.com','note'=>'Fake note']),$key);finishAudit();
$original=one($db,'SELECT * FROM vault_items WHERE id=?',[$id]);$change=['name'=>'Family edited','manager_email'=>'new@example.com','trial_date'=>'2026-10-01'];
beginAudit($db,'Test');saveFamilyRecord($db,$a['id'],[...$change,'manager_email'=>'old@example.com']);finishAudit();emailEditCheck(one($db,'SELECT * FROM vault_items WHERE id=?',[$id])===$original);
$db->exec("CREATE TRIGGER reject_family_detach BEFORE UPDATE ON vault_items FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fake failure'");
beginAudit($db,'Test');try{saveFamilyRecord($db,$a['id'],$change);throw new RuntimeException('Accepted failure');}catch(PDOException $e){finishAudit(false);}$db->exec('DROP TRIGGER reject_family_detach');emailEditCheck(one($db,'SELECT * FROM vault_items WHERE id=?',[$id])===$original);emailEditCheck(!one($db,'SELECT id FROM accounts WHERE email=?',['new@example.com']));
beginAudit($db,'Test');saveFamilyRecord($db,$a['id'],$change);finishAudit();$saved=one($db,'SELECT * FROM vault_items WHERE id=?',[$id]);emailEditCheck($saved['family_id']===null&&$saved['revision']===$original['revision']+1&&$saved['payload']===$original['payload']);emailEditCheck(vaultRead($saved,$key)['email']==='old@example.com');
$rows=sheetsSnapshot($db,'vault',$key,true)['vault'];$new=array_values(array_filter($rows,fn($row)=>$row['email']==='new@example.com'));emailEditCheck(count($new)===1&&$new[0]['password']===''&&$new[0]['totp']===''&&$new[0]['recovery_email']===''&&$new[0]['note']==='');
echo "Family email edit checks passed\n";
