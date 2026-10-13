import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isPendingPayment,sortCustomers} from '../domain.js';
import {contactParts} from '../public/contacts.js';

test('pending payment combines overdue and confirmed/partial renewals while excluding received payments and cancellations',()=>{
  assert.equal(isPendingPayment({expiry_status:'expired',renewal_status:'not_contacted'}),true);
  for(const renewal_status of ['awaiting_payment','partial'])assert.equal(isPendingPayment({expiry_status:'active',renewal_status}),true);
  for(const renewal_status of ['paid','declined'])assert.equal(isPendingPayment({expiry_status:'expired',renewal_status}),false);
  assert.equal(isPendingPayment({expiry_status:'active',renewal_status:'not_contacted',payment_status:'unpaid'}),false);
});
test('customer deadline sorting prioritizes overdue/nearest dates, leaves unknown dates last and does not change source order',()=>{
  const rows=[{id:1,expires_at:''},{id:2,expires_at:'2026-12-01'},{id:3,expires_at:'2026-10-14'},{id:4,expires_at:'2026-10-12'},{id:5,expires_at:'2026-10-14'}];
  assert.deepEqual(sortCustomers(rows).map(m=>m.id),[4,3,5,2,1]);assert.deepEqual(rows.map(m=>m.id),[1,2,3,4,5]);
});
test('contact links preserve notes and full copy text; only web URLs become links',()=>{
  const source='FB: https://www.facebook.com/nganbae93,\nZalo: zalo.me/0901234567 (chưa vào)';
  const parts=contactParts(source);assert.equal(parts.map(p=>p.text).join(''),source);assert.deepEqual(parts.filter(p=>p.href).map(p=>p.href),['https://www.facebook.com/nganbae93','https://zalo.me/0901234567']);
  for(const source of ['javascript:alert(1)','data:text/html,<script>alert(1)</script>','Ghi chú và số điện thoại 0901234567']){const parts=contactParts(source);assert.equal(parts.map(p=>p.text).join(''),source);assert.equal(parts.some(p=>p.href),false);}
  assert.equal(contactParts('www.facebook.com/example')[0].href,'https://www.facebook.com/example');
  assert.equal(contactParts('(https://example.com/contact)')[1].href,'https://example.com/contact');
});
