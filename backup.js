const tables=['accounts','families','members','archived_customers','renewal_history','other_purchases','logs'];
export function customerBackup(db) {
  return {format:'family-customer-backup',version:1,created_at:new Date().toISOString(),tables:Object.fromEntries(tables.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY id`).all()]))};
}
export function restoreCustomers(db,data,fail) {
  if (data.format!=='family-customer-backup' || data.version!==1 || !data.tables || tables.some(name=>!Array.isArray(data.tables[name]))) fail('File sao lưu khách hàng không hợp lệ.');
  if (tables.filter(t=>t!=='logs').some(t=>db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n)) fail('Chỉ khôi phục vào ứng dụng đang trống để không ghi đè dữ liệu hiện có.',409);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec('DELETE FROM logs');
    for (const table of tables) {
      const columns=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
      const insert=db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
      for (const row of data.tables[table]) {
        if (!row || typeof row!=='object' || columns.some(c=>!Object.hasOwn(row,c) || (row[c]!==null && !['string','number'].includes(typeof row[c])))) fail('Dữ liệu sao lưu thiếu trường hoặc sai định dạng.');
        insert.run(...columns.map(c=>row[c]));
      }
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) fail('Dữ liệu sao lưu có liên kết không hợp lệ.');
    db.exec('COMMIT');
    return {ok:true,customers:data.tables.members.length,families:data.tables.families.length,other_products:data.tables.other_purchases.length};
  } catch(error) {db.exec('ROLLBACK');if (error.status) throw error;fail('Không thể khôi phục file này. Dữ liệu hiện có được giữ nguyên.');}
}
