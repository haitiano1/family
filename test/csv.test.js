import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, prepareSheet, suggestMapping } from '../public/csv.js';
test('CSV handles BOM, CRLF, delimiters and quoted newlines without leaking legacy header passwords', () => {
  assert.deepEqual(parseCSV('\uFEFFEmail;Tên\r\na@example.com;"A; B"\r\n').records[0].cells,['a@example.com','A; B']);
  assert.equal(parseCSV('Email\tTên\na@example.com\tNguyễn An').delimiter,'\t');
  assert.deepEqual(parseCSV('Email,Note\na@example.com,"One\nTwo ""quoted"""').records[0].cells,['a@example.com','One\nTwo "quoted"']);
  assert.throws(()=>parseCSV('Email,Note\na@example.com,"Missing'));
  const sheet=prepareSheet('manager@example.com,DO-NOT-IMPORT-THIS,Gói mua,Ngày mua,Ngày đến hạn,Ngày pay 12,Contact\nNguyễn An,an@example.com,6 tháng,12/06/2026,12/12/2026,59,Zalo');
  assert.equal(sheet.legacy,true); assert.equal(sheet.records[0].cells[8],'manager@example.com'); assert.equal(sheet.normalizedCSV.includes('DO-NOT-IMPORT-THIS'),false); assert.equal(sheet.headers[1],'Email khách');
  const mapping=suggestMapping(sheet.headers); assert.equal(mapping.email,1); assert.equal(mapping.customer_name,0); assert.equal(mapping.plan_months,2); assert.equal(mapping.expires_at,4); assert.equal(mapping.payment_status,-1); assert.equal(mapping.contact,5);
});

test('stacked Family tables are flattened without manager passwords and preserve annual/custom plans, dates and notes', () => {
 const sheet=prepareSheet('Family 1,,,,,,\nmanager1@example.com,SECRET-HEADER-1,Gói mua,Ngày mua,Ngày đến hạn,Ngày pay,Contact\nA,a@example.com,1 năm,01/01/2026,01/01/2027,90,Zalo\nFamily 2,,,,,,\nmanager2@example.com,SECRET-HEADER-2,verification text,Ngày mua,Ngày đến hạn,,Contact\nB,b@example.com,13 tháng,10/01/2026,10/02/2027,120,FB,chưa vào');
 assert.equal(sheet.family_count,2);assert.equal(sheet.records.length,2);assert.equal(sheet.normalizedCSV.includes('SECRET-HEADER'),false);
 assert.equal(sheet.records[0].cells[2],'12 tháng');assert.equal(sheet.records[1].cells[2],'13 tháng');assert.equal(sheet.records[1].cells[9],'invited');assert.equal(sheet.records[1].cells[6],'chưa vào');
});
