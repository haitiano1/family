import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
export function initDatabase(dir) {
mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'family.sqlite');
const existing = existsSync(file);
const db = new DatabaseSync(file);
const currentVersion = db.prepare('PRAGMA user_version').get().user_version;
if (currentVersion > 16) throw new Error('Database is newer than this application. Use the latest application version.');
if (existing && currentVersion < 16) {
  const backup = path.join(dir, `before-v16-${Date.now()}.sqlite`);
  db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
  console.log('Saved pre-upgrade database backup in the data directory.');
}
db.exec(`PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS accounts (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS families (id INTEGER PRIMARY KEY, name TEXT NOT NULL, manager_id INTEGER UNIQUE NOT NULL REFERENCES accounts(id), created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (id INTEGER PRIMARY KEY, family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE, email TEXT NOT NULL, UNIQUE(family_id,email));
CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY, message TEXT NOT NULL, created_at TEXT NOT NULL);`);
const additions = {
  families: { service: "TEXT NOT NULL DEFAULT 'youtube'", note: "TEXT NOT NULL DEFAULT ''", trial_date: "TEXT NOT NULL DEFAULT ''", archived_at:"TEXT NOT NULL DEFAULT ''" },
  members: { customer_name: "TEXT NOT NULL DEFAULT ''", contact: "TEXT NOT NULL DEFAULT ''", joined_at: "TEXT NOT NULL DEFAULT ''", expires_at: "TEXT NOT NULL DEFAULT ''", payment_status: "TEXT NOT NULL DEFAULT 'unpaid'", amount: 'INTEGER NOT NULL DEFAULT 0', plan_months: 'INTEGER NOT NULL DEFAULT 0', note: "TEXT NOT NULL DEFAULT ''", renewal_status: "TEXT NOT NULL DEFAULT 'not_contacted'", renewal_amount: 'INTEGER NOT NULL DEFAULT 0', renewal_paid_at: "TEXT NOT NULL DEFAULT ''", renewal_note: "TEXT NOT NULL DEFAULT ''", renewal_revision: 'INTEGER NOT NULL DEFAULT 0', declined_at: "TEXT NOT NULL DEFAULT ''", membership_status: "TEXT NOT NULL DEFAULT 'unknown'" },

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
  if (currentVersion < 9) db.prepare("UPDATE members SET declined_at=? WHERE renewal_status='declined' AND declined_at=''").run(new Date().toISOString());
  db.exec(`CREATE TABLE IF NOT EXISTS archived_customers (id INTEGER PRIMARY KEY,original_member_id INTEGER NOT NULL,email TEXT NOT NULL,customer_name TEXT NOT NULL,family_name TEXT NOT NULL,manager_email TEXT NOT NULL,snapshot TEXT NOT NULL,archived_at TEXT NOT NULL,reason TEXT NOT NULL,restored_at TEXT,restored_by TEXT,restored_member_id INTEGER);
  CREATE TABLE IF NOT EXISTS other_purchases (id INTEGER PRIMARY KEY,product TEXT NOT NULL,customer_name TEXT NOT NULL,email TEXT NOT NULL,contact TEXT NOT NULL,joined_at TEXT NOT NULL,expires_at TEXT NOT NULL,payment_status TEXT NOT NULL,amount INTEGER NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS issues(id INTEGER PRIMARY KEY,family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,family_name TEXT NOT NULL,target_type TEXT NOT NULL,target_id INTEGER NOT NULL,subject_email TEXT NOT NULL,original_email TEXT NOT NULL,title TEXT NOT NULL,note TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'todo',revision INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,done_at TEXT NOT NULL DEFAULT '',resolution TEXT NOT NULL DEFAULT '',resolution_email TEXT NOT NULL DEFAULT '',resolution_note TEXT NOT NULL DEFAULT '');
  CREATE TABLE IF NOT EXISTS audit_events(id INTEGER PRIMARY KEY,action TEXT NOT NULL,actor TEXT NOT NULL,message TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);`);
  const issueColumns=new Set(db.prepare('PRAGMA table_info(issues)').all().map(c=>c.name));
  for(const name of ['trial_date','reported_on'])if(!issueColumns.has(name))db.exec(`ALTER TABLE issues ADD COLUMN ${name} TEXT NOT NULL DEFAULT ''`);
  if(!db.prepare('PRAGMA table_info(other_purchases)').all().some(c=>c.name==='plan_months'))db.exec('ALTER TABLE other_purchases ADD COLUMN plan_months INTEGER NOT NULL DEFAULT 0');
  if(!db.prepare('PRAGMA table_info(other_purchases)').all().some(c=>c.name==='purchase_source'))db.exec("ALTER TABLE other_purchases ADD COLUMN purchase_source TEXT NOT NULL DEFAULT ''");
  if(!db.prepare('PRAGMA table_info(archived_customers)').all().some(c=>c.name==='family_archive_id'))db.exec('ALTER TABLE archived_customers ADD COLUMN family_archive_id INTEGER REFERENCES families(id)');
  db.exec(`CREATE TABLE IF NOT EXISTS vault_meta(name TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS vault_items(id INTEGER PRIMARY KEY AUTOINCREMENT,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS vault_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(vault_items)').all().some(c=>c.name==='family_id'))db.exec('ALTER TABLE vault_items ADD COLUMN family_id INTEGER REFERENCES families(id)');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS vault_family_link ON vault_items(family_id)');
  db.exec(`CREATE TABLE IF NOT EXISTS new_purchase_history(id INTEGER PRIMARY KEY,member_id INTEGER UNIQUE REFERENCES members(id) ON DELETE SET NULL,archive_id INTEGER,email TEXT NOT NULL,customer_name TEXT NOT NULL,contact TEXT NOT NULL,family_name TEXT NOT NULL,joined_at TEXT NOT NULL,expires_at TEXT NOT NULL,plan_months INTEGER NOT NULL,payment_status TEXT NOT NULL,amount INTEGER NOT NULL,note TEXT NOT NULL,created_at TEXT NOT NULL);`);
  // Tra cứu & chuyển nhóm: additive tables only, so user_version stays 16 and older builds still open the file.
  db.exec(`CREATE TABLE IF NOT EXISTS family_statuses(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL UNIQUE REFERENCES families(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'active',note TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS family_invites(id INTEGER PRIMARY KEY,family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,label TEXT NOT NULL DEFAULT '',url TEXT NOT NULL,sent_on TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS member_moves(id INTEGER PRIMARY KEY,member_id INTEGER REFERENCES members(id) ON DELETE SET NULL,email TEXT NOT NULL,customer_name TEXT NOT NULL,from_family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,from_family_name TEXT NOT NULL,from_status TEXT NOT NULL,from_note TEXT NOT NULL,to_family_id INTEGER REFERENCES families(id) ON DELETE SET NULL,to_family_name TEXT NOT NULL,invite_id INTEGER REFERENCES family_invites(id) ON DELETE SET NULL,invite_label TEXT NOT NULL DEFAULT '',state TEXT NOT NULL DEFAULT 'assigned',report_reason TEXT NOT NULL DEFAULT '',report_note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,opened_at TEXT NOT NULL DEFAULT '',joined_at TEXT NOT NULL DEFAULT '',reported_at TEXT NOT NULL DEFAULT '',dismissed_at TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS lookup_codes(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE,code TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lookup_settings(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lookup_sessions(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS lookup_attempts(name TEXT PRIMARY KEY,window_end INTEGER NOT NULL,count INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS member_moves_member ON member_moves(member_id);
  CREATE INDEX IF NOT EXISTS member_moves_invite ON member_moves(invite_id);`);
  db.prepare("INSERT OR IGNORE INTO lookup_settings(name,value) VALUES ('code_salt',?)").run(randomBytes(32).toString('hex'));
  db.exec('PRAGMA user_version=16; COMMIT');
} catch (error) { db.exec('ROLLBACK'); throw error; }
return db;
}
