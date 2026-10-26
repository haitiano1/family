import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initDatabase} from '../database.js';
import {initIssues} from '../issues.js';
import {validators} from '../validation.js';
import {withAudit} from '../audit.js';

function fixture(){
  const dir=mkdtempSync(path.join(tmpdir(),'family-issue-order-'));let db,issues;
  const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
  const start=()=>{db=initDatabase(dir);issues=initIssues(db,{fail,...validators(fail),log:message=>db.prepare('INSERT INTO logs(message,created_at) VALUES (?,?)').run(message,new Date().toISOString())});};start();
  const insert=(id,created,status='todo')=>db.prepare('INSERT INTO issues(id,family_id,family_name,target_type,target_id,subject_email,original_email,title,status,created_at,updated_at,reported_on) VALUES (?,NULL,?,?,?,?,?,?,?,?,?,?)').run(id,'Fake Family','manager',id,`case${id}@example.com`,`case${id}@example.com`,'Fake error',status,created,created,created.slice(0,10));
  const rows=status=>issues.list().filter(row=>row.status===status),ids=status=>rows(status).map(row=>row.id);
  const request=(status,order,reset=false)=>{const current=rows(status);return {status,order,reset,expected:current.map(({id,created_at,revision})=>({id,created_at,revision})),order_token:current[0]?.order_token};};
  return {get db(){return db;},get issues(){return issues;},insert,rows,ids,request,restart(){db.close();start();},close(){db.close();rmSync(dir,{recursive:true,force:true});}};
}

test('issue columns use report creation time, persist custom order and keep newly reported cases above saved rows',()=>{
  const f=fixture();try{
    f.insert(1,'2026-10-20T12:00:00.000Z');f.insert(2,'2026-10-23T12:00:00.000Z');f.insert(3,'2026-10-21T12:00:00.000Z');
    assert.deepEqual(f.ids('todo'),[2,3,1]);const business=f.db.prepare('SELECT * FROM issues ORDER BY id').all(),request=f.request('todo',[1,2,3]);
    f.issues.reorder(request);assert.deepEqual(f.ids('todo'),[1,2,3]);assert.equal(f.rows('todo')[0].order_custom,true);assert.deepEqual(f.db.prepare('SELECT * FROM issues ORDER BY id').all(),business);
    f.restart();assert.deepEqual(f.ids('todo'),[1,2,3]);f.insert(4,'2026-10-23T13:00:00.000Z');assert.deepEqual(f.ids('todo'),[4,1,2,3]);
    assert.throws(()=>f.issues.reorder(request),e=>e.status===409);assert.deepEqual(f.ids('todo'),[4,1,2,3]);
    f.issues.reorder(f.request('todo',undefined,true));assert.deepEqual(f.ids('todo'),[4,2,3,1]);assert.equal(f.rows('todo')[0].order_custom,false);
  }finally{f.close();}
});

test('issue reordering rejects stale snapshots, wrong statuses, duplicates, missing rows and reused identities without changing preferences',()=>{
 const f=fixture();try{
   for(let id=1;id<=3;id++)f.insert(id,`2026-10-2${id}T12:00:00.000Z`);f.insert(4,'2026-10-24T12:00:00.000Z','doing');
   let request=f.request('todo',[1,2,3]);f.issues.reorder(request);const saved=f.db.prepare("SELECT value FROM app_meta WHERE name='issue_order_todo'").get().value;
   assert.throws(()=>f.issues.reorder(request),e=>e.status===409);
   for(const order of [[1,1,3],[1,2],[1,2,4],[1,2,'3']])assert.throws(()=>f.issues.reorder(f.request('todo',order)),e=>e.status===400);
   request=f.request('todo',[3,2,1]);f.db.prepare('UPDATE issues SET revision=revision+1 WHERE id=2').run();assert.throws(()=>f.issues.reorder(request),e=>e.status===409);
   assert.equal(f.db.prepare("SELECT value FROM app_meta WHERE name='issue_order_todo'").get().value,saved);
   f.db.prepare('DELETE FROM issues WHERE id=1').run();f.insert(1,'2026-10-25T12:00:00.000Z');assert.deepEqual(f.ids('todo'),[1,2,3]);
   request=f.request('todo',[3,2,1]);f.db.prepare('UPDATE issues SET status=? WHERE id=2').run('doing');assert.throws(()=>f.issues.reorder(request),e=>e.status===409);
 }finally{f.close();}
});

test('moving a case between status columns clears its saved position so it arrives at the top, while editing notes preserves order',()=>{
 const f=fixture();try{
   for(let id=1;id<=3;id++)f.insert(id,`2026-10-2${id}T12:00:00.000Z`);
   f.issues.reorder(f.request('todo',[3,2,1]));let old=f.rows('todo').find(row=>row.id===1);
   f.issues.save(1,{status:'doing',revision:old.revision,expected_created_at:old.created_at});assert.deepEqual(f.ids('todo'),[3,2]);assert.deepEqual(f.ids('doing'),[1]);
   old=f.rows('doing')[0];f.issues.save(1,{status:'todo',revision:old.revision,expected_created_at:old.created_at});assert.deepEqual(f.ids('todo'),[1,3,2]);
   old=f.rows('todo').find(row=>row.id===3);f.issues.save(3,{note:'Edit leaves creation date and position intact',revision:old.revision,expected_created_at:old.created_at});assert.deepEqual(f.ids('todo'),[1,3,2]);
 }finally{f.close();}
});


test('a failed status update rolls back ordering preferences together with the case inside the request transaction',async()=>{
 const f=fixture();try{
   for(let id=1;id<=3;id++)f.insert(id,`2026-10-2${id}T12:00:00.000Z`);
   f.issues.reorder(f.request('todo',[1,2,3]));const before=f.db.prepare("SELECT value FROM app_meta WHERE name='issue_order_todo'").get().value,caseBefore=f.db.prepare('SELECT * FROM issues WHERE id=1').get();
   f.db.exec("CREATE TRIGGER reject_issue_move BEFORE UPDATE ON issues BEGIN SELECT RAISE(ABORT,'Injected status failure'); END");
   await assert.rejects(withAudit(f.db,'Move case',()=>f.issues.save(1,{status:'doing',revision:caseBefore.revision,expected_created_at:caseBefore.created_at})),/Injected status failure/);
   assert.equal(f.db.prepare("SELECT value FROM app_meta WHERE name='issue_order_todo'").get().value,before);assert.deepEqual(f.db.prepare('SELECT * FROM issues WHERE id=1').get(),caseBefore);assert.deepEqual(f.ids('todo'),[1,2,3]);
 }finally{f.close();}
});
