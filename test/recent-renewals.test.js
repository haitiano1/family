import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {initDatabase} from '../database.js';import {recentRenewals} from '../recent-renewals.js';

test('recent renewal window is fourteen elapsed days from confirmation, with latest customer renewal and retained archive details',()=>{
 const dir=mkdtempSync('/tmp/fam-recent-'),db=initDatabase(dir);try{
  db.prepare('INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)').run('manager@example.com','','2026-01-01');db.prepare('INSERT INTO families(name,manager_id,created_at) VALUES (?,?,?)').run('Family 1',1,'2026-01-01');
  for(const email of ['late@example.com','outside@example.com','boundary@example.com','future@example.com','archive@example.com'])db.prepare('INSERT INTO members(family_id,email) VALUES (?,?)').run(1,email);
  const insert=db.prepare('INSERT INTO renewal_history(member_id,email,customer_name,family_name,old_expires_at,new_expires_at,plan_months,amount,paid_at,note,created_at,created_by,old_purchase_at,new_purchase_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  const add=(id,time)=>insert.run(id,'history@example.com','Khách gia hạn','Family 1','2026-01-05','2026-04-05',3,100000,'2026-01-15','Note',time,'Local','2025-10-05','2026-01-05');
  add(1,'2026-10-12T12:00:00.000Z');add(1,'2026-10-13T12:00:00.000Z');add(2,'2026-09-29T11:59:59.999Z');add(3,'2026-09-29T12:00:00.000Z');add(4,'2026-10-13T12:00:00.001Z');const archived=add(5,'2026-10-07T12:00:00.000Z');
  db.prepare('UPDATE renewal_history SET archive_id=?,member_id=NULL WHERE id=?').run(9,Number(archived.lastInsertRowid));
  const now=new Date('2026-10-13T12:00:00.000Z'),members=[{id:1,email:'current@example.com',customer_name:'Tên hiện tại',contact:'https://zalo.me/example'}],archives=[{id:9,member:{email:'archive@example.com',contact:'Archived contact'}}];
  const result=recentRenewals(db,members,archives,now);assert.equal(result.length,2);assert.equal(result[0].member_id,1);assert.equal(result[0].customer.email,'current@example.com');assert.equal(result[0].customer.contact,'https://zalo.me/example');assert.equal(result[0].renewed_at,'2026-10-13T12:00:00.000Z');assert.equal(result[0].paid_at,'2026-01-15');assert.equal(result[0].new_purchase_at,'2026-01-05');assert.equal(result[1].customer.contact,'Archived contact');
  assert.equal(recentRenewals(db,members,archives,new Date('2026-10-27T12:00:00.000Z')).length,1); // The formerly future confirmation is now within its window.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM members').get().n,5);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM renewal_history').get().n,6);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
