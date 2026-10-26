import {validateVaultBackup} from './vault-crypto.js';
const baseTables=['accounts','families','members','archived_customers','renewal_history','other_purchases','logs'];
const customerTables=[...baseTables,'issues','audit_events'];
const legacyTables=[...customerTables,'vault_meta','vault_items'];
const tables=[...legacyTables,'new_purchase_history'];
export function customerBackup(db) {
  const content=Object.fromEntries(tables.map(name=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY ${name==='vault_meta'?'name':'id'}`).all()]));
  content.archived_customers=content.archived_customers.map(row=>{const saved=JSON.parse(row.snapshot);if(saved?.record_type==='other_product'&&!Object.hasOwn(saved,'purchase_source'))return {...row,snapshot:JSON.stringify({...saved,purchase_source:''})};return row;});
  return {format:'family-customer-backup',version:9,created_at:new Date().toISOString(),tables:content};
}
export function restoreCustomers(db,data,fail) {
  if (data.format!=='family-customer-backup' || ![1,2,3,4,5,6,7,8,9].includes(data.version) || !data.tables || (data.version===1?baseTables:data.version<6?customerTables:data.version<8?legacyTables:tables).some(name=>!Array.isArray(data.tables[name]))) fail('File sao lưu khách hàng không hợp lệ.');
  if(data.version<8&&data.tables.new_purchase_history?.length)fail('Lịch sử mua mới cần sao lưu phiên bản 8.');
  if(data.version<8)data={...data,tables:{...data.tables,new_purchase_history:[]}};
  if(data.version===1)data={...data,tables:{...data.tables,issues:data.tables.issues||[],audit_events:data.tables.audit_events||[]}};
  if(data.version<6&&(data.tables.vault_meta?.length||data.tables.vault_items?.length))fail('Sao lưu chứa kho mã hóa cần định dạng phiên bản 6.');
  if(data.version<6)data={...data,tables:{...data.tables,vault_meta:[],vault_items:[]}};
  if(data.version<7)data={...data,tables:{...data.tables,vault_items:data.tables.vault_items.map(row=>({...row,family_id:null}))}};
  try{validateVaultBackup(data.tables.vault_meta,data.tables.vault_items);}catch{fail('Phần kho mã hóa trong sao lưu không hợp lệ.');}
  if (tables.filter(t=>!['logs','audit_events'].includes(t)).some(t=>db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n)) fail('Chỉ khôi phục vào ứng dụng đang trống để không ghi đè dữ liệu hiện có.',409);
  db.exec('SAVEPOINT backup_restore');
  try {

    for (const table of tables) {
      let columns=db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name);
      if(['logs','audit_events'].includes(table)&&db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n)columns=columns.filter(c=>c!=='id');
      const insert=db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`);
      for (let row of data.tables[table]) {
        if(data.version<3&&row&&typeof row==='object')row={...(table==='families'?{trial_date:''}:table==='issues'?{trial_date:'',reported_on:''}:{}),...row};
        if(data.version<4&&row&&typeof row==='object')row={...(table==='families'?{archived_at:''}:table==='other_purchases'?{plan_months:0}:table==='archived_customers'?{family_archive_id:null}:{}),...row};
        if(table==='other_purchases'&&data.version<9&&row&&typeof row==='object'&&!Object.hasOwn(row,'purchase_source'))row={...row,purchase_source:''};
        if (!row || typeof row!=='object' || columns.some(c=>!Object.hasOwn(row,c) || (row[c]!==null && !['string','number'].includes(typeof row[c])))) fail('Dữ liệu sao lưu thiếu trường hoặc sai định dạng.');
        if(table==='other_purchases'&&(typeof row.purchase_source!=='string'||row.purchase_source.length>200))fail('Nguồn mua trong sao lưu không hợp lệ.');
        if(table==='archived_customers'){
          const saved=JSON.parse(row.snapshot);
          if(!saved||typeof saved!=='object'||Array.isArray(saved))fail('Hồ sơ lưu trữ trong sao lưu không hợp lệ.');
          if(saved.record_type==='other_product'){
            if(!Object.hasOwn(saved,'purchase_source')){saved.purchase_source='';row={...row,snapshot:JSON.stringify(saved)};}
            if(typeof saved.purchase_source!=='string'||saved.purchase_source.length>200)fail('Nguồn mua trong hồ sơ lưu trữ không hợp lệ.');
          }
        }
        insert.run(...columns.map(c=>row[c]));
      }
    }
    db.prepare('DELETE FROM vault_sessions').run();
    if (db.prepare('PRAGMA foreign_key_check').all().length) fail('Dữ liệu sao lưu có liên kết không hợp lệ.');
    db.exec('RELEASE backup_restore');
    return {ok:true,customers:data.tables.members.length,families:data.tables.families.length,other_products:data.tables.other_purchases.length};
  } catch(error) {db.exec('ROLLBACK TO backup_restore; RELEASE backup_restore');if (error.status) throw error;fail('Không thể khôi phục file này. Dữ liệu hiện có được giữ nguyên.');}
}
