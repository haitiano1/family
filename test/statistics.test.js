import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRenewals} from '../statistics.js';
const row=(id,created_at,email='guest@example.com',amount=100000)=>({id,created_at,email,amount,customer_name:'Nguyễn Ánh',family_name:'Family 1',note:'Note %_[]\\ literal',paid_at:'2025-01-01',new_purchase_at:'2025-01-05',new_expires_at:'2025-04-05'});

test('six calendar months use Vietnam midnight boundaries, distinct emails and every completed payment',()=>{
 const now=new Date('2026-11-15T00:00:00Z'),history=[row(1,'2026-09-30T16:59:59.999Z'),row(2,'2026-09-30T17:00:00Z',' A@example.com '),row(3,'2026-10-31T16:59:59.999Z','a@example.com',250000),row(4,'2026-10-31T17:00:00Z','b@example.com'),row(5,'2024-02-29T16:59:59.999Z'),row(6,'2027-01-01T00:00:00Z'),row(7,'unknown')],original=structuredClone(history);
 const result=summarizeRenewals(history,{month:'2026-10'},now);assert.deepEqual(result.months.map(m=>m.month),['2026-11','2026-10','2026-09','2026-08','2026-07','2026-06']);assert.deepEqual(result.selected,{month:'2026-10',start_date:'2026-10-01',end_date:'2026-10-31',customers:1,renewals:2,amount:350000});assert.deepEqual(result.rows.map(r=>r.id),[3,2]);assert.equal(result.months[0].renewals,1);assert.equal(result.months[2].renewals,1);assert.equal(result.months[5].amount,0);assert.equal(summarizeRenewals(history,{month:'all'},now).total,7);assert.deepEqual(history,original);
 const leap=summarizeRenewals(history,{month:'2024-02'},now);assert.equal(leap.selected.end_date,'2024-02-29');assert.equal(leap.selected.renewals,1);
 const january=summarizeRenewals([],{month:'2026-01'},new Date('2025-12-31T17:00:00Z'));assert.equal(january.current_month,'2026-01');assert.deepEqual(january.months.map(m=>m.month),['2026-01','2025-12','2025-11','2025-10','2025-09','2025-08']);
});
test('history search and pagination do not change monthly totals or discard older snapshots',()=>{
 const history=Array.from({length:65},(_,i)=>row(i+1,'2026-10-10T00:00:00Z','guest'+i+'@example.com',i+1)),now=new Date('2026-10-15T00:00:00Z');
 let stats=summarizeRenewals(history,{page:2},now);assert.equal(stats.rows.length,15);assert.equal(stats.rows[0].id,15);assert.equal(stats.selected.renewals,65);assert.equal(stats.selected.amount,2145);assert.equal(stats.selected.customers,65);
 stats=summarizeRenewals(history,{search:'NGUYỄN ÁNH',page:999},now);assert.equal(stats.page,2);assert.equal(stats.total,65);assert.equal(stats.rows.length,15);
 stats=summarizeRenewals(history,{search:'guest64@'},now);assert.equal(stats.total,1);assert.equal(stats.rows[0].id,65);assert.equal(stats.selected.amount,2145);
 assert.equal(summarizeRenewals(history,{search:'%_[]\\'},now).total,65);assert.equal(summarizeRenewals(history,{search:'absent'},now).total,0);
 for(const month of ['2026-00','2026-13','2026-1','2026-10-01','abc'])assert.throws(()=>summarizeRenewals(history,{month},now),{status:400});
});
