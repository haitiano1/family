import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewalDates, purchaseExpiry, sortFamilies, familyOccupancy, renewalReceiptDate, today } from '../domain.js';
import { archiveDue } from '../archive.js';
test('receipt dates ignore old waiting dates and use the actual Vietnam day when recording a payment',()=>{
 const current=today(new Date('2026-10-22T18:00:00Z')),waiting={renewal_status:'awaiting_payment',renewal_paid_at:'2026-10-15'};assert.equal(current,'2026-10-23');
 for(const status of ['not_contacted','reminded','awaiting_payment','declined'])assert.equal(renewalReceiptDate(waiting,status,current),'');
 assert.equal(renewalReceiptDate(waiting,'paid',current),current);assert.equal(renewalReceiptDate(waiting,'partial',current),current);
 const partial={renewal_status:'partial',renewal_paid_at:'2026-10-15'};assert.equal(renewalReceiptDate(partial,'partial',current),'2026-10-15');assert.equal(renewalReceiptDate(partial,'paid',current),current);
 assert.equal(renewalReceiptDate({renewal_status:'paid',renewal_paid_at:'2026-10-20'},'paid',current),'2026-10-20');
});
test('Family occupancy excludes pending invitations, retains a five-slot reference and filters spare groups by occupied slots',()=>{
 const members=[...Array.from({length:3},(_,id)=>({id,family_id:1,membership_status:['active','unknown','new'][id]})),...Array.from({length:2},()=>({family_id:1,membership_status:'invited'}))];
 assert.deepEqual(familyOccupancy(members,1),{occupied:3,pending:2,capacity:5,label:'3/5 (2 chưa vào)'});
 assert.equal(familyOccupancy([],99).label,'0/5');assert.equal(familyOccupancy(members,99).label,'0/5');
 const occupied=Array.from({length:6},()=>({family_id:2,membership_status:'active'}));assert.equal(familyOccupancy(occupied.slice(0,5),2).label,'5/5');assert.equal(familyOccupancy(occupied,2).label,'6/5');
 assert.equal(familyOccupancy(occupied.slice(0,2),2).label,'2/5');
 assert.deepEqual(sortFamilies([{id:1,name:'A'},{id:2,name:'B'}],[...members,...occupied],'spare').map(f=>f.id),[1]);
});
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


test('purchase plans clamp calendar months and Family filters exclude pending guests from occupied slots',()=>{
  assert.equal(purchaseExpiry('2026-10-13',3),'2027-01-13');assert.equal(purchaseExpiry('2024-01-31',1),'2024-02-29');assert.equal(purchaseExpiry('2026-08-31',6),'2027-02-28');
  const families=[{id:1,name:'Family 48',trial_date:'2026-10-04'},{id:2,name:'Family 47',trial_date:''},{id:3,name:'Family 46',trial_date:'2026-10-02'},{id:4,name:'Family 45',trial_date:'2026-10-06'}];
  const members=[...Array.from({length:5},(_,i)=>({id:i,family_id:1,membership_status:i?'active':'invited'})),{family_id:3}];
  assert.deepEqual(sortFamilies(families,members).map(f=>f.id),[3,1,4,2]);assert.deepEqual(sortFamilies(families,members,'spare').map(f=>f.id),[3,1,4,2]);assert.deepEqual(sortFamilies(families,members,'name').map(f=>f.name),['Family 48','Family 47','Family 46','Family 45']);
});
