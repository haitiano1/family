import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const php = spawnSync('php', ['-m'], { encoding: 'utf8' });
const available = php.status === 0 && /pdo_sqlite/i.test(php.stdout);

test('PHP Sheet sync keeps the Mã tra cứu tab two-way and files Gmail invite links (SQLite logic check)', { skip: available ? false : 'php with pdo_sqlite is not installed' }, () => {
  const output = execFileSync('php', [path.join(import.meta.dirname, 'sheets-lookup-sqlite.php')], { encoding: 'utf8' });
  assert.match(output, /Sheet codes and Gmail invite checks passed/);
});
