import {randomBytes,timingSafeEqual} from 'node:crypto';
import {withAudit,auditLog} from './audit.js';
import {VAULT_SESSION_MS,validVaultPassword,wrapMaster,unwrapMaster,fingerprint,seal,open,normalizeTotp,totp,totpText} from './vault-crypto.js';
export function initVault(db,{fail,email,text,commonPassword='',secure=false}){
  const one=(sql,...args)=>db.prepare(sql).get(...args),run=(sql,...args)=>db.prepare(sql).run(...args),sessionKey=randomBytes(32);
  let attempts=0,windowEnd=0;
  const meta=()=>one("SELECT value FROM vault_meta WHERE name='config'")?.value;
  const token=req=>{const value=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('fam_vault='))?.slice(10);return value&&value.length<5000?value:'';};
  function cookie(res,value,close=false){res.setHeader('Set-Cookie',`fam_vault=${value}; HttpOnly; SameSite=Strict; Path=/api/vault; Max-Age=${close?0:900}${secure?'; Secure':''}`);}
  function authorize(req){const raw=token(req),config=meta();if(!raw||!config)return null;const row=one('SELECT expires_at FROM vault_sessions WHERE token_hash=?',fingerprint(raw));if(!row||row.expires_at<=Date.now())return null;try{const info=JSON.parse(open(JSON.parse(Buffer.from(raw,'base64url').toString()),sessionKey,'family-vault-session-v1'));const key=Buffer.from(info.key,'base64');if(key.length!==32||info.config_hash!==fingerprint(config)||info.expires!==row.expires_at)return null;return {key,expires:info.expires};}catch{return null;}}
  function requireOpen(req){const auth=authorize(req);if(!auth)fail('Kho đã khóa. Nhập mật khẩu kho để mở lại.',423);return auth;}
  function issueSession(req,res,key){const expires=Date.now()+VAULT_SESSION_MS,raw=Buffer.from(JSON.stringify(seal(JSON.stringify({key:key.toString('base64'),expires,config_hash:fingerprint(meta())}),sessionKey,'family-vault-session-v1'))).toString('base64url');run('DELETE FROM vault_sessions WHERE token_hash=? OR expires_at<=?',fingerprint(token(req)),Date.now());run('INSERT INTO vault_sessions(token_hash,expires_at) VALUES (?,?)',fingerprint(raw),expires);cookie(res,raw);return {ok:true,session_expires:expires};}
  function passwordKey(password){if(Date.now()>windowEnd){attempts=0;windowEnd=Date.now()+10*60000;}if(attempts>=10)fail('Đã thử nhiều lần. Chờ 10 phút rồi mở kho lại.',429);if(typeof password!=='string'||Buffer.byteLength(password)>512){attempts++;fail('Mật khẩu kho không đúng.',403);}try{const key=unwrapMaster(password,JSON.parse(meta()));attempts=0;return key;}catch{attempts++;fail('Mật khẩu kho không đúng.',403);}}
  function fields(data){const address=email(data.email);return {email:address,label:text(data.label,200),note:text(data.note,1000),password:textPassword(data.password),totp:normalizeTotp(data.totp||''),recovery_email:data.recovery_email?email(data.recovery_email):''};}
  function textPassword(value){if(typeof value!=='string'||[...value].length>2048||Buffer.byteLength(value)>8192)fail('Mật khẩu tài khoản không hợp lệ.');return value;}
  function read(row,key){try{return JSON.parse(open(JSON.parse(row.payload),key,'family-vault-item-v1:'+row.id));}catch{fail('Không thể giải mã hồ sơ kho. Kiểm tra file sao lưu hoặc mở lại kho.',500);}}
  function guard(row,data){if(!row)fail('Không tìm thấy hồ sơ trong kho.',404);if(!Number.isInteger(data.revision)||data.revision!==row.revision||data.expected_created_at!==row.created_at)fail('Hồ sơ kho đã thay đổi. Tải lại kho rồi thử lại.',409);}
  function importItems(data,key){
    if(!Array.isArray(data.items)||!data.items.length||data.items.length>500)fail('Chọn từ 1 đến 500 tài khoản để nhập.');
    const seen=new Set(db.prepare('SELECT * FROM vault_items').all().map(row=>read(row,key).email));
    return data.items.map((row,index)=>{const line=Number.isInteger(row?.line)&&row.line>0?row.line:index+2;let item;try{if(!row||typeof row!=='object')throw Error('Thông tin không hợp lệ.');item=fields(row);}catch(error){fail(`Dòng ${line}: ${error.message}`);}if(seen.has(item.email))fail(`Dòng ${line}: tài khoản đã có trong kho hoặc trùng trong bảng nhập.`,409);seen.add(item.email);return {...item,line};});
  }
  function insert(item,key){const now=new Date().toISOString(),id=Number(run('INSERT INTO vault_items(payload,revision,created_at,updated_at) VALUES (?,0,?,?)','',now,now).lastInsertRowid);run('UPDATE vault_items SET payload=? WHERE id=?',JSON.stringify(seal(JSON.stringify(item),key,'family-vault-item-v1:'+id)),id);return id;}
  const mutate=(action,operation)=>withAudit(db,action,operation);
  return async function route(req,res,path,data={}){
    const method=req.method,config=meta();
    if(method==='GET'&&path==='/api/vault/status'){const auth=authorize(req);return {configured:!!config,unlocked:!!auth,session_expires:auth?.expires||null};}
    if(method==='POST'&&path==='/api/vault/setup'){
      if(config||one('SELECT id FROM vault_items LIMIT 1'))fail('Kho đã có mật khẩu. Chọn Mở kho.',409);validVaultPassword(data.password,commonPassword);if(data.confirm_password!==data.password)fail('Hai mật khẩu kho chưa giống nhau.');
      const key=randomBytes(32);try{return await mutate('Tạo mật khẩu kho',()=>{run("INSERT INTO vault_meta(name,value) VALUES ('config',?)",JSON.stringify(wrapMaster(data.password,key)));auditLog(db,'Cá nhân: tạo kho tài khoản đã mã hóa');return issueSession(req,res,key);});}finally{key.fill(0);}
    }
    if(method==='POST'&&path==='/api/vault/unlock'){if(!config)fail('Tạo mật khẩu kho lần đầu.');const key=passwordKey(data.password);try{return issueSession(req,res,key);}finally{key.fill(0);}}
    if(method==='POST'&&path==='/api/vault/lock'){run('DELETE FROM vault_sessions WHERE token_hash=?',fingerprint(token(req)));cookie(res,'',true);return {ok:true};}
    const auth=requireOpen(req);try{
      if(method==='POST'&&path==='/api/vault/import/preview'){const rows=importItems(data,auth.key);return {count:rows.length,items:rows.map(i=>({line:i.line,email:i.email,label:i.label,note:i.note,recovery_email:i.recovery_email,has_password:!!i.password,has_totp:!!i.totp.secret}))};}
      if(method==='POST'&&path==='/api/vault/import')return await mutate('Nhập hàng loạt kho tài khoản',()=>{const rows=importItems(data,auth.key),ids=rows.map(({line,...item})=>insert(item,auth.key));auditLog(db,`Cá nhân: nhập ${ids.length} hồ sơ kho đã mã hóa`);return {ok:true,count:ids.length,ids};});
      if(method==='GET'&&path==='/api/vault/items'){const now=Date.now();return {items:db.prepare('SELECT * FROM vault_items ORDER BY id DESC').all().map(row=>{const item=read(row,auth.key);return {id:row.id,revision:row.revision,created_at:row.created_at,updated_at:row.updated_at,email:item.email,label:item.label,note:item.note||'',recovery_email:item.recovery_email,has_password:!!item.password,has_totp:!!item.totp.secret,totp_key:totpText(item.totp,item.email),...totp(item.totp,now)};}),server_time:now,session_expires:auth.expires};}
      if(method==='POST'&&path==='/api/vault/password'){const old=passwordKey(data.current_password);try{if(!timingSafeEqual(old,auth.key))fail('Mật khẩu kho không đúng.',403);}finally{old.fill(0);}validVaultPassword(data.password,commonPassword);if(data.password!==data.confirm_password)fail('Hai mật khẩu kho chưa giống nhau.');return await mutate('Đổi mật khẩu kho',()=>{run("UPDATE vault_meta SET value=? WHERE name='config'",JSON.stringify(wrapMaster(data.password,auth.key)));run('DELETE FROM vault_sessions');auditLog(db,'Cá nhân: đổi mật khẩu kho, khóa các phiên cũ');return issueSession(req,res,auth.key);});}
      const match=path.match(/^\/api\/vault\/items\/(\d+)$/),id=match?Number(match[1]):null;
      if(method==='GET'&&id){const row=one('SELECT * FROM vault_items WHERE id=?',id);if(!row)fail('Không tìm thấy hồ sơ trong kho.',404);const item=read(row,auth.key);return {...item,note:item.note||'',totp:totpText(item.totp,item.email),id,revision:row.revision,created_at:row.created_at};}
      if((method==='POST'&&path==='/api/vault/items')||(method==='PATCH'&&id)){const row=id?one('SELECT * FROM vault_items WHERE id=?',id):null;if(id)guard(row,data);const item=fields(data);if(db.prepare('SELECT * FROM vault_items WHERE id!=?').all(id||0).some(other=>read(other,auth.key).email===item.email))fail('Tài khoản này đã có trong kho.',409);return await mutate(id?'Sửa hồ sơ kho':'Thêm hồ sơ kho',()=>{const now=new Date().toISOString();let next=id;if(!next)next=Number(run('INSERT INTO vault_items(payload,revision,created_at,updated_at) VALUES (?,0,?,?)','',now,now).lastInsertRowid);run('UPDATE vault_items SET payload=?,updated_at=?,revision=revision+? WHERE id=?',JSON.stringify(seal(JSON.stringify(item),auth.key,'family-vault-item-v1:'+next)),now,id?1:0,next);auditLog(db,`Cá nhân: ${id?'sửa':'thêm'} hồ sơ kho #${next}`);return {ok:true,id:next};});}
      if(method==='DELETE'&&id){const row=one('SELECT * FROM vault_items WHERE id=?',id);guard(row,data);return await mutate('Xóa hồ sơ kho',()=>{run('DELETE FROM vault_items WHERE id=?',id);auditLog(db,`Cá nhân: xóa hồ sơ kho #${id}`);return {ok:true};});}
      fail('Không tìm thấy.',404);
    }finally{auth.key.fill(0);}
  };
}
