import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readVaultSheet,mapVaultSheet} from '../public/vault-sheet.js';
test('vault Sheet maps Vietnamese/English headers, preserves password spaces and multiline notes without using code column as a secret',()=>{
  const parsed=readVaultSheet('\uFEFFTài khoản\tMật khẩu\t2FA\tMã 2FA\tMail khôi phục\tNote\nowner@example.com\t  Keep spaces ! \tGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ\t123456\t\t"Line one\nLine two"\nother@example.com\t\t\t\t\t');
  const rows=mapVaultSheet(parsed,parsed.mapping);assert.equal(rows.length,2);assert.equal(rows[0].password,'  Keep spaces ! ');assert.equal(rows[0].note,'Line one\nLine two');assert.notEqual(rows[0].totp,'123456');assert.equal(rows[1].recovery_email,'');assert.deepEqual(rows.map(r=>r.line),[2,4]);
  const csv=readVaultSheet('Account;pass;key;Recovery email;notes;Family\naccount@example.com;"with,comma";;;"Note; with delimiter";Family 48');assert.equal(csv.delimiter,';');assert.equal(mapVaultSheet(csv,csv.mapping)[0].note,'Note; with delimiter');assert.equal(mapVaultSheet(csv,csv.mapping)[0].label,'Family 48');
});
test('vault Sheet accepts manual column selection, rejects ambiguous mapping and caps large imports before sending',()=>{
  const parsed=readVaultSheet('A,B,C\nmail@example.com,password,note');assert.equal(parsed.mapping.email,-1);assert.throws(()=>mapVaultSheet(parsed,parsed.mapping),/Tài khoản/);assert.throws(()=>mapVaultSheet(parsed,{...parsed.mapping,email:0,password:0}),/Mỗi cột/);const row=mapVaultSheet(parsed,{...parsed.mapping,email:0,password:1,note:2})[0];assert.equal(row.email,'mail@example.com');assert.equal(row.note,'note');assert.throws(()=>readVaultSheet('Email,Pass\n'+Array(501).fill('mail@example.com,p').join('\n')),/500/);assert.throws(()=>readVaultSheet('Email,Note\nmail@example.com,"missing'),/CSV/);
});
