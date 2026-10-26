import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {initDatabase} from '../database.js';
import {initIssues} from '../issues.js';
import {validators} from '../validation.js';
import {withAudit} from '../audit.js';
import {seal,open} from '../vault-crypto.js';
import {randomBytes} from 'node:crypto';
test('prepared owner keeps encrypted B identity while preserving A and refusing occupied B',async()=>{
 const dir=mkdtempSync(tmpdir()+'/prepared-'),db=initDatabase(dir),key=randomBytes(32),now=new Date().toISOString();
 try{const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});},issues=initIssues(db,{fail,...validators(fail),log:()=>{}});
 for(const [id,email] of [[1,'a@example.com'],[2,'b@example.com']]){db.prepare('INSERT INTO accounts(id,email,created_at) VALUES (?,?,?)').run(id,email,now);db.prepare('INSERT INTO families(id,name,manager_id,created_at,trial_date) VALUES (?,?,?,?,?)').run(id,'Family '+id,id,now,'2026-10-20');db.prepare('INSERT INTO vault_items(id,family_id,payload,created_at,updated_at) VALUES (?,?,?,?,?)').run(id,id,JSON.stringify(seal(JSON.stringify({email,password:'fake-'+id,note:'full note'}),key,'family-vault-item-v1:'+id)),now,now);}
 const payload=db.prepare('SELECT payload FROM vault_items WHERE id=2').get().payload;
 const incident=issues.save(null,{family_id:1,title:'Fake error'}),request={revision:0,status:'done',resolution:'replace',replacement_email:'b@example.com'};
 db.prepare("INSERT INTO members(family_id,email) VALUES (2,'occupied@example.com')").run();await assert.rejects(withAudit(db,'Test',()=>issues.save(incident.id,request)),{status:409});db.prepare('DELETE FROM members').run();
 await withAudit(db,'Test',()=>issues.save(incident.id,request));const row=db.prepare('SELECT * FROM vault_items WHERE id=2').get();assert.equal(row.family_id,1);assert.equal(row.payload,payload);assert.equal(JSON.parse(open(JSON.parse(row.payload),key,'family-vault-item-v1:2')).password,'fake-2');assert.equal(db.prepare('SELECT family_id FROM vault_items WHERE id=1').get().family_id,2);assert.ok(db.prepare('SELECT archived_at FROM families WHERE id=2').get().archived_at);assert.equal(db.prepare("SELECT COUNT(*) n FROM accounts WHERE email LIKE 'swap-%'").get().n,0);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
