const tracked=['accounts','families','members','archived_customers','renewal_history','other_purchases','issues'];
const scopes=new WeakMap();
const lowerRegistered=new WeakSet();
function snapshot(db) {return Object.fromEntries(tracked.map(t=>[t,db.prepare(`SELECT * FROM ${t} ORDER BY id`).all()]));}
export function auditLog(db,message) {
  const scope=scopes.get(db);if(scope){scope.messages.push(message);return;}
  db.prepare('INSERT INTO logs(message,created_at) VALUES (?,?)').run(message,new Date().toISOString());
}
export function beginAudit(db,action,actor='Cá nhân') {
  if(scopes.has(db))throw Error('Audit scope already open');
  db.exec('SAVEPOINT audit_request');
  const scope={action,actor,before:snapshot(db),messages:[]};scopes.set(db,scope);return scope;
}
export function cancelAudit(db) {scopes.delete(db);db.exec('ROLLBACK TO audit_request; RELEASE audit_request');}
export function finishAudit(db) {
  const scope=scopes.get(db);if(!scope)return;
  try {
    const after=snapshot(db),changes=[];
    for(const table of tracked){const beforeMap=new Map(scope.before[table].map(r=>[r.id,r])),afterMap=new Map(after[table].map(r=>[r.id,r]));for(const id of new Set([...beforeMap.keys(),...afterMap.keys()])){const before=beforeMap.get(id)||null,next=afterMap.get(id)||null;if(JSON.stringify(before)!==JSON.stringify(next))changes.push({table,id,before,after:next});}}
    if(changes.length||scope.messages.length){const identities=[...new Set(changes.flatMap(c=>{return [c.before,c.after].filter(Boolean).flatMap(r=>{const values=[r.email,r.subject_email,r.original_email,r.name,r.family_name];if(c.table==='families')values.push(scope.before.accounts.find(a=>a.id===r.manager_id)?.email,after.accounts.find(a=>a.id===r.manager_id)?.email);return values.filter(Boolean);});} ))];const message=[scope.action,...identities,...scope.messages].join(' · ');db.prepare('INSERT INTO audit_events(action,actor,message,details,created_at) VALUES (?,?,?,?,?)').run(scope.action,scope.actor,message,JSON.stringify({changes}),new Date().toISOString());}
    db.exec('RELEASE audit_request');scopes.delete(db);
  }catch(error){cancelAudit(db);throw error;}
}
export async function withAudit(db,action,operation,actor='Cá nhân') {beginAudit(db,action,actor);try {const result=await operation();finishAudit(db);return result;}catch(error){if(scopes.has(db))cancelAudit(db);throw error;}}
export function journal(db,params) {
  if(!lowerRegistered.has(db)){db.function('fam_lower',{deterministic:true},s=>String(s||'').toLocaleLowerCase());lowerRegistered.add(db);}
  const page=Math.max(1,Math.min(100000,Number(params.get('page'))||1)),search=String(params.get('search')||'').slice(0,200).toLocaleLowerCase();
  const union="SELECT id,'audit' AS kind,action,actor,message,created_at FROM audit_events UNION ALL SELECT id,'log' AS kind,'Nhật ký cũ' AS action,'Cá nhân' AS actor,message,created_at FROM logs";
  const where=" WHERE fam_lower(message) LIKE ? ESCAPE '\\'";const pattern='%'+search.replace(/[\\%_]/g,c=>'\\'+c)+'%';
  const total=db.prepare(`SELECT COUNT(*) AS n FROM (${union}) j${where}`).get(pattern).n;
  const entries=db.prepare(`SELECT * FROM (${union}) j${where} ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET ?`).all(pattern,(page-1)*50);
  return {entries,total,page,page_size:50};
}
export function journalEntry(db,kind,id) {const row=db.prepare(`SELECT * FROM ${kind==='audit'?'audit_events':'logs'} WHERE id=?`).get(id);return row ? {...row,kind,changes:kind==='audit'?JSON.parse(row.details).changes:[]} : null;}
export function auditAction(method,path){const part=path.split('/')[2],label={families:'Family',members:'khách',accounts:'email quản lý','other-products':'sản phẩm',issues:'lỗi',restore:'dữ liệu',archives:'khách lưu trữ',import:'CSV'}[part]||'dữ liệu';if(path.includes('/renewal'))return 'Gia hạn khách';if(part==='import')return path.endsWith('commit')?'Nhập CSV':'Xem trước CSV';if(part==='restore')return 'Khôi phục dữ liệu';if(part==='archives')return 'Khôi phục khách';return ({POST:'Thêm',PATCH:'Sửa',DELETE:'Xóa'}[method]||'Tự động lưu trữ')+' '+label;}
