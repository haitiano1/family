import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initDatabase} from '../database.js';
import {validators} from '../validation.js';
import {initProductImport} from '../product-import.js';
import {normalizeProductImportRow,readProductSheet,mapProductSheet} from '../public/product-import.js';
const sample=(email='guest@example.com',extra={})=>({line:2,product:'Netflix',purchase_source:'Đại lý A',customer_name:'Đặng Thị Hồng',email,contact:'Zalo',plan_months:'3 tháng',joined_at:'31/01/2026',expires_at:'',payment_status:'Đã thanh toán',amount:'165.000 đ',note:'Ghi chú',...extra});
function fixture(){const dir=mkdtempSync(path.join(tmpdir(),'family-products-sheet-'));const db=initDatabase(dir);const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};const helper=initProductImport(db,{...validators(fail),fail,log:message=>db.prepare('INSERT INTO logs(message,created_at) VALUES (?,?)').run(message,new Date().toISOString())});return {db,...helper,close(){db.close();rmSync(dir,{recursive:true,force:true});}};}
test('product Sheet parsing maps Vietnamese headers, quoted TSV/CSV, calendar clamping and VND amounts',()=>{
 const source='Sản phẩm\tNguồn mua\tTên khách\tEmail\tGói mua\tNgày mua\tThanh toán\tSố tiền\tGhi chú\nNetflix\tĐại lý A\tĐặng Thị Hồng\tGuest@Example.com\t3 tháng\t31/01/2026\tĐã thanh toán\t165.000 đ\t"Ghi chú có\nngắt dòng"';const parsed=readProductSheet(source),items=mapProductSheet(parsed,parsed.mapping);assert.equal(items.length,1);const row=normalizeProductImportRow(items[0]);assert.equal(row.purchase_source,'Đại lý A');assert.equal(row.email,'guest@example.com');assert.equal(row.amount,165000);assert.equal(row.plan_months,3);assert.equal(row.joined_at,'2026-01-31');assert.equal(row.expires_at,'2026-04-30');assert.equal(row.payment_status,'paid');assert.equal(row.note,'Ghi chú có\nngắt dòng');
 assert.equal(normalizeProductImportRow(sample(undefined,{plan_months:'1 năm',amount:'1,000,000 VND'})).plan_months,12);assert.equal(normalizeProductImportRow(sample(undefined,{amount:'1,000,000 VND'})).amount,1000000);
 const csv=readProductSheet('Product,Customer name,Email,Amount\nSpotify,Example,hello@example.com,"165,000"');assert.equal(normalizeProductImportRow(mapProductSheet(csv,csv.mapping)[0]).amount,165000);
 assert.throws(()=>mapProductSheet(parsed,{...parsed.mapping,email:parsed.mapping.product}),/Mỗi cột/);
});
test('product Sheet rejects malformed plans, dates and ambiguous money rather than guessing',()=>{
 for(const [field,values] of Object.entries({plan_months:['-1','1.5','1/2','121 tháng'],joined_at:['31/02/2026','01/02','0000-01-01','2026-13-01'],amount:['165,00','1.234,000','-500','1e5','1000000001'],payment_status:['đã gửi lời mời'],email:['bad-address']}))for(const value of values)assert.throws(()=>normalizeProductImportRow(sample(undefined,{[field]:value})),field+':'+value);
 assert.throws(()=>normalizeProductImportRow(sample(undefined,{customer_name:'',email:''})),/tên khách hoặc email/);
});
test('product import preview is read-only, reports row errors, skips exact duplicates and safely retries confirmation',()=>{
 const f=fixture();try{const a=sample(),duplicate={...a,line:3},bad=sample('other@example.com',{line:4,joined_at:'31/02/2026'});let preview=f.preview({items:[a,duplicate,bad]});assert.equal(preview.valid,false);assert.equal(preview.errors[0].line,4);assert.equal(preview.added,1);assert.equal(preview.skipped,1);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM other_purchases').get().n,0);assert.throws(()=>f.confirm({items:[a,bad],preview_token:'a'.repeat(64)}),{status:400});
 preview=f.preview({items:[a,duplicate]});assert.equal(preview.valid,true);assert.equal(f.confirm({items:[a,duplicate],preview_token:preview.preview_token}).added,1);assert.equal(f.confirm({items:[a,duplicate],preview_token:preview.preview_token}).added,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM other_purchases').get().n,1);
 const otherSource={...a,purchase_source:'Đại lý B'};assert.equal(f.preview({items:[otherSource]}).added,1);
 const b=sample('second@example.com',{line:5});preview=f.preview({items:[a,b]});f.db.prepare("UPDATE other_purchases SET note='Updated separately'").run();assert.throws(()=>f.confirm({items:[a,b],preview_token:preview.preview_token}),{status:409});assert.equal(f.db.prepare('SELECT COUNT(*) n FROM other_purchases').get().n,1);
 }finally{f.close();}
});
test('product batch rolls back every product and log when a later insert fails',()=>{
 const f=fixture();try{const rows=[sample(),sample('failure@example.com',{line:3,product:'Failure product'})],preview=f.preview({items:rows});f.db.exec("CREATE TRIGGER reject_product BEFORE INSERT ON other_purchases WHEN NEW.product='Failure product' BEGIN SELECT RAISE(ABORT,'injected failure'); END;");assert.throws(()=>f.confirm({items:rows,preview_token:preview.preview_token}),/injected failure/);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM other_purchases').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM logs').get().n,0);
 }finally{f.close();}
});
