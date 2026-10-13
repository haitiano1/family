import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewalDates, purchaseExpiry, sortFamilies } from '../domain.js';
import { archiveDue } from '../archive.js';
test('renewals start at the old expiry and clamp calendar months, including leap years', () => {
  assert.deepEqual(renewalDates('2027-01-05','2026-10-10',3),{purchase_date:'2027-01-05',base_date:'2027-01-05',expires_at:'2027-04-05'});
  assert.equal(renewalDates('2026-01-31','2026-01-30',1).expires_at,'2026-02-28');
  assert.equal(renewalDates('2024-01-31','2024-01-30',1).expires_at,'2024-02-29');
  assert.deepEqual(renewalDates('2026-01-01','2026-10-12',1),{purchase_date:'2026-01-01',base_date:'2026-01-01',expires_at:'2026-02-01'});
  assert.deepEqual(renewalDates('2026-01-05','2026-01-15',3),{purchase_date:'2026-01-05',base_date:'2026-01-05',expires_at:'2026-04-05'});
  assert.throws(()=>renewalDates('','2026-01-15',3),/chưa có ngày hết hạn/);
  assert.throws(()=>renewalDates('2026-02-30','2026-10-12',1));
});
test('only an explicit declined renewal archives immediately, irrespective of expiry or missing legacy selection date', () => {
  assert.equal(archiveDue({renewal_status:'declined',declined_at:'',expires_at:'2027-01-01'}),true);
  for(const status of ['paid','partial','awaiting_payment','not_contacted','reminded'])assert.equal(archiveDue({renewal_status:status,expires_at:'2020-01-01'}),false);
});


test('purchase plans clamp calendar months and Family filters count every recorded guest',()=>{
  assert.equal(purchaseExpiry('2026-10-13',3),'2027-01-13');assert.equal(purchaseExpiry('2024-01-31',1),'2024-02-29');assert.equal(purchaseExpiry('2026-08-31',6),'2027-02-28');
  const families=[{id:1,name:'Family 48',trial_date:'2026-10-04'},{id:2,name:'Family 47',trial_date:''},{id:3,name:'Family 46',trial_date:'2026-10-02'},{id:4,name:'Family 45',trial_date:'2026-10-06'}];
  const members=[...Array.from({length:5},(_,i)=>({id:i,family_id:1,membership_status:i?'active':'invited'})),{family_id:3}];
  assert.deepEqual(sortFamilies(families,members).map(f=>f.id),[3,1,4,2]);assert.deepEqual(sortFamilies(families,members,'spare').map(f=>f.id),[3,4,2]);assert.deepEqual(sortFamilies(families,members,'name').map(f=>f.name),['Family 48','Family 47','Family 46','Family 45']);
});
