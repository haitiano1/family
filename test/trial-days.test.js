import {test} from 'node:test';
import assert from 'node:assert/strict';
import {today,trialUsageDays} from '../domain.js';

test('trial usage counts elapsed calendar days without adding the start day',()=>{
  assert.equal(trialUsageDays('2026-08-10','2026-08-15'),5);
  assert.equal(trialUsageDays('2026-08-10','2026-08-10'),0);
  assert.equal(trialUsageDays('2024-02-29','2024-03-05'),5);
  assert.equal(trialUsageDays('2025-12-31','2026-01-05'),5);
  for(const [trial,reported] of [['','2026-08-15'],['2026-08-16','2026-08-15'],['2026-02-30','2026-03-05'],['bad','2026-08-15']])assert.equal(trialUsageDays(trial,reported),null);
  assert.equal(today(new Date('2026-08-14T23:30:00.000Z')),'2026-08-15');
});
