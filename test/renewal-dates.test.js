import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewalDates } from '../domain.js';
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
test('archive eligibility is seven calendar days after selection in Vietnam, and only declined customers qualify', () => {
  const m={renewal_status:'declined',declined_at:'2026-10-12T18:00:00Z',expires_at:'2026-01-01'}; // Selected October 13 in Vietnam.
  assert.equal(archiveDue(m,'2026-10-19','declined'),false);
  assert.equal(archiveDue(m,'2026-10-20','declined'),true);
  assert.equal(archiveDue({...m,renewal_status:'paid'},'2026-10-20','declined'),false);
  assert.equal(archiveDue({...m,declined_at:''},'2026-10-20','declined'),false);
});
