import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {journal} from '../audit.js';

test('journal classifies recorded actions and filters the entire history before pagination without rewriting events',()=>{
 const db=new DatabaseSync(':memory:');try{
  db.exec('CREATE TABLE audit_events(id INTEGER PRIMARY KEY,action TEXT,actor TEXT,message TEXT,details TEXT,created_at TEXT);CREATE TABLE logs(id INTEGER PRIMARY KEY,message TEXT,created_at TEXT)');
  const insert=db.prepare('INSERT INTO audit_events(action,actor,message,details,created_at) VALUES (?,\'Cá nhân\',?,\'{"changes":[]}\',\'2026-10-15T00:00:00Z\')');
  const cases=[['Xóa Family','delete'],['Xóa hồ sơ lưu trữ','delete'],['Lưu trữ sản phẩm','delete'],['Tự động lưu trữ dữ liệu','delete'],['Thêm khách','create'],['Tạo mật khẩu kho','create'],['Đổi mật khẩu kho','edit'],['Gia hạn khách','renewal'],['Chuyển Family','transfer'],['Khôi phục dữ liệu','restore'],['Nhập CSV','import'],['Nhập hàng loạt kho tài khoản','import'],['Xem trước CSV','import'],['Liên kết Kho với Family','other']];
  for(const [action] of cases)insert.run(action,'guest@example.com · '+action);
  for(let i=0;i<55;i++)insert.run('Sửa khách',`guest@example.com · sửa ${i} · ghi chú nhắc Xóa Family %_\\`);
  db.prepare('INSERT INTO logs(message,created_at) VALUES (?,?)').run('Nhật ký cũ nhắc Xóa và Sửa khách','2025-01-01T00:00:00Z');
  const before=db.prepare('SELECT * FROM audit_events').all(),get=params=>journal(db,new URLSearchParams(params));
  const all=get({});assert.equal(all.total,70);assert.equal(all.entries.length,50);
  for(const [action,category] of cases){const data=get({category,search:action});assert.ok(data.entries.some(e=>e.action===action&&e.category===category),action);}
  const edits=get({category:'edit'});assert.equal(edits.total,56);assert.equal(edits.entries.length,50);assert.ok(edits.entries.every(e=>e.category==='edit'));
  const second=get({category:'edit',page:2});assert.equal(second.total,56);assert.equal(second.entries.length,6);assert.equal(new Set([...edits.entries,...second.entries].map(e=>e.id)).size,56);
  const deleted=get({category:'delete'});assert.equal(deleted.total,4);assert.ok(deleted.entries.every(e=>e.category==='delete'));assert.ok(deleted.entries.some(e=>e.action==='Xóa Family')); // Older than the first 50 unfiltered events.
  assert.equal(get({category:'delete',search:'ghi chú nhắc Xóa Family'}).total,0);
  assert.equal(get({category:'edit',search:'%_\\'}).total,55);assert.equal(get({category:'other',search:'Nhật ký cũ'}).entries[0].kind,'log');assert.equal(get({category:'edit',search:'absent'}).total,0);
  assert.throws(()=>get({category:"delete' OR 1=1 --"}),{status:400});assert.deepEqual(db.prepare('SELECT * FROM audit_events').all(),before);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM logs').get().n,1);
 }finally{db.close();}
});
