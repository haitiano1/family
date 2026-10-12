import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
export function initDatabase(dir) {
mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'family.sqlite');
const existing = existsSync(file);
const db = new DatabaseSync(file);
const currentVersion = db.prepare('PRAGMA user_version').get().user_version;
if (currentVersion > 7) throw new Error('Database is newer than this application. Use the latest application version.');
if (existing && currentVersion < 7) {
  const backup = path.join(dir, `before-v7-${Date.now()}.sqlite`);
  db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
  console.log('Saved pre-upgrade database backup in the data directory.');
}
db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS families (id INTEGER PRIMARY KEY, name TEXT NOT NULL, manager_id INTEGER UNIQUE NOT NULL REFERENCES accounts(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE, email TEXT NOT NULL, UNIQUE(family_id,email));
CREATE TABLE IF NOT EXISTS jobs (id INTEGER PRIMARY KEY, action TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, message TEXT NOT NULL, created_at TEXT NOT NULL);`);
const additions = {
  families: { service: "TEXT NOT NULL DEFAULT 'youtube'", note: "TEXT NOT NULL DEFAULT ''" },
  members: { customer_name: "TEXT NOT NULL DEFAULT ''", contact: "TEXT NOT NULL DEFAULT ''", joined_at: "TEXT NOT NULL DEFAULT ''", expires_at: "TEXT NOT NULL DEFAULT ''", payment_status: "TEXT NOT NULL DEFAULT 'unpaid'", amount: 'INTEGER NOT NULL DEFAULT 0', plan_months: 'INTEGER NOT NULL DEFAULT 0', note: "TEXT NOT NULL DEFAULT ''", renewal_status: "TEXT NOT NULL DEFAULT 'not_contacted'", renewal_amount: 'INTEGER NOT NULL DEFAULT 0', renewal_paid_at: "TEXT NOT NULL DEFAULT ''", renewal_note: "TEXT NOT NULL DEFAULT ''", renewal_revision: 'INTEGER NOT NULL DEFAULT 0', declined_at: "TEXT NOT NULL DEFAULT ''", membership_status: "TEXT NOT NULL DEFAULT 'unknown'" },
  jobs: { account_id: 'INTEGER', family_id: 'INTEGER', email: "TEXT NOT NULL DEFAULT ''", service: "TEXT NOT NULL DEFAULT 'youtube'", manager_email: "TEXT NOT NULL DEFAULT ''", completed_at: 'TEXT', completed_by: 'TEXT' }
};
db.exec('BEGIN');
try {
  for (const [table, columns] of Object.entries(additions)) {
    const known = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
    for (const [name, type] of Object.entries(columns)) if (!known.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS renewal_history (id INTEGER PRIMARY KEY, member_id INTEGER REFERENCES members(id) ON DELETE SET NULL, email TEXT NOT NULL,customer_name TEXT NOT NULL,family_name TEXT NOT NULL,old_expires_at TEXT NOT NULL,new_expires_at TEXT NOT NULL,plan_months INTEGER NOT NULL,amount INTEGER NOT NULL,paid_at TEXT NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL,created_by TEXT NOT NULL);
  `);
  const historyColumns = new Set(db.prepare('PRAGMA table_info(renewal_history)').all().map(c => c.name));
  for (const name of ['old_purchase_at','new_purchase_at']) if (!historyColumns.has(name)) db.exec(`ALTER TABLE renewal_history ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
  if (!historyColumns.has('archive_id')) db.exec('ALTER TABLE renewal_history ADD COLUMN archive_id INTEGER');
  if (currentVersion < 7) db.prepare("UPDATE members SET declined_at=? WHERE renewal_status='declined' AND declined_at=''").run(new Date().toISOString());
  db.exec(`CREATE TABLE IF NOT EXISTS archived_customers (id INTEGER PRIMARY KEY,original_member_id INTEGER NOT NULL,email TEXT NOT NULL,customer_name TEXT NOT NULL,family_name TEXT NOT NULL,manager_email TEXT NOT NULL,snapshot TEXT NOT NULL,archived_at TEXT NOT NULL,reason TEXT NOT NULL,restored_at TEXT,restored_by TEXT,restored_member_id INTEGER);
  PRAGMA user_version=7; COMMIT`);
} catch (error) { db.exec('ROLLBACK'); throw error; }
return db;
}
