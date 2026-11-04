import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { derivedCode } from '../lookup.js';

const php = spawnSync('php', ['-m'], { encoding: 'utf8' });
const available = php.status === 0 && /pdo_sqlite/i.test(php.stdout);

test('PHP lookup rules match the Node build (SQLite logic check)', { skip: available ? false : 'php with pdo_sqlite is not installed' }, () => {
  const salt = randomBytes(32).toString('hex');
  const output = execFileSync('php', [path.join(import.meta.dirname, 'lookup-sqlite.php'), salt], { encoding: 'utf8' });
  const lines = output.trim().split('\n');
  assert.equal(lines.at(-1), 'ok');
  const { codes } = JSON.parse(lines[0]);
  for (const [address, code] of Object.entries(codes)) assert.equal(code, derivedCode(salt, address), 'same personal code in PHP and Node for ' + address);
});
