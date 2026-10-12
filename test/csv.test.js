import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, prepareSheet, suggestMapping } from '../public/csv.js';
test('CSV handles BOM, CRLF, delimiters and quoted newlines without leaking legacy header passwords', () => {
  assert.deepEqual(parseCSV('\uFEFFEmail;Tên\r\na@example.com;"A; B"\r\n').records[0].cells,['a@example.com','A; B']);
  assert.equal(parseCSV('Email\tTên\na@example.com\tNguyễn An').delimiter,'\t');
  assert.deepEqual(parseCSV('Email,Note\na@example.com,"One\nTwo ""quoted"""').records[0].cells,['a@example.com','One\nTwo "quoted"']);
  assert.throws(()=>parseCSV('Email,Note\na@example.com,"Missing'));
  const sheet=prepareSheet('manager@example.com,DO-NOT-IMPORT-THIS,Gói mua,Ngày mua,Ngày đến hạn,Ngày pay 12,Contact\nNguyễn An,an@example.com,6 tháng,12/06/2026,12/12/2026,59,Zalo');
  assert.equal(sheet.legacy,true); assert.equal(sheet.manager_email,'manager@example.com'); assert.equal(sheet.normalizedCSV.includes('DO-NOT-IMPORT-THIS'),false); assert.equal(sheet.headers[1],'Email khách');
  const mapping=suggestMapping(sheet.headers); assert.equal(mapping.email,1); assert.equal(mapping.customer_name,0); assert.equal(mapping.plan_months,2); assert.equal(mapping.expires_at,4); assert.equal(mapping.payment_status,-1); assert.equal(mapping.contact,6);
});
