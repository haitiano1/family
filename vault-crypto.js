import {randomBytes,pbkdf2Sync,createCipheriv,createDecipheriv,createHash,createHmac} from 'node:crypto';
export const VAULT_ITERATIONS=600000;
export const VAULT_SESSION_MS=30*60*1000;
const bad=message=>{throw Object.assign(new Error(message),{status:400});};
export const fingerprint=value=>createHash('sha256').update(value).digest('hex');
export function validVaultPassword(value,common=''){
  if(typeof value!=='string'||[...value].length<5||[...value].length>128||Buffer.byteLength(value)>512)bad('Mật khẩu kho cần từ 5 đến 128 ký tự.');
  if(common&&value===common)bad('Chọn mật khẩu kho khác mật khẩu truy cập website.');
  return value;
}
function bytes(value,min,max=min){
  if(typeof value!=='string'||value.length>Math.ceil(max/3)*4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))throw Error('Invalid encrypted data');
  const b=Buffer.from(value,'base64');if(b.length<min||b.length>max||b.toString('base64')!==value)throw Error('Invalid encrypted data');return b;
}
export function seal(value,key,aad){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(aad));
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return {version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),data:data.toString('base64')};
}
export function open(envelope,key,aad){
  if(envelope?.version!==1)throw Error('Invalid encrypted data');
  const decipher=createDecipheriv('aes-256-gcm',key,bytes(envelope.iv,12));decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(bytes(envelope.tag,16));
  return Buffer.concat([decipher.update(bytes(envelope.data,1,32768)),decipher.final()]).toString('utf8');
}
export function wrapMaster(password,master){
  const salt=randomBytes(16),key=pbkdf2Sync(password,salt,VAULT_ITERATIONS,32,'sha256');
  try{return {version:1,kdf:'pbkdf2-sha256',iterations:VAULT_ITERATIONS,salt:salt.toString('base64'),wrapped_key:seal(master.toString('base64'),key,'family-vault-key-v1')};}finally{key.fill(0);}
}
export function validVaultConfig(config){
  if(config?.version!==1||config.kdf!=='pbkdf2-sha256'||config.iterations!==VAULT_ITERATIONS)throw Error('Invalid vault configuration');
  bytes(config.salt,16);if(config.wrapped_key?.version!==1)throw Error('Invalid vault configuration');bytes(config.wrapped_key.iv,12);bytes(config.wrapped_key.tag,16);bytes(config.wrapped_key.data,1,32768);return config;
}
export function unwrapMaster(password,config){
  validVaultConfig(config);const key=pbkdf2Sync(password,bytes(config.salt,16),config.iterations,32,'sha256');
  try{return bytes(open(config.wrapped_key,key,'family-vault-key-v1'),32);}finally{key.fill(0);}
}
export function base32(value){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,acc=0;const out=[];
  for(const c of value){const n=alphabet.indexOf(c);if(n<0)bad('Khóa 2FA Base32 chỉ dùng A–Z và 2–7; kiểm tra lại khóa từ nơi cấp.');acc=(acc<<5)|n;bits+=5;if(bits>=8){bits-=8;out.push((acc>>bits)&255);acc&=(1<<bits)-1;}}
  if(acc!==0||![0,1,2,3,4].includes(bits)||out.length<10||out.length>160)bad('Khóa 2FA không hợp lệ. Nhập khóa bí mật, không phải mã 6 số hoặc mã dự phòng.');return Buffer.from(out);
}
export function normalizeTotp(value){
  if(typeof value!=='string'||value.length>2048)bad('Khóa 2FA không hợp lệ.');let secret=value,algorithm='SHA1',period=30;
  if(value.trim().startsWith('otpauth:')){let url;try{url=new URL(value.trim());}catch{bad('Liên kết 2FA không hợp lệ.');}if(url.protocol!=='otpauth:'||url.hostname!=='totp')bad('Chỉ hỗ trợ khóa TOTP tạo mã theo thời gian.');secret=url.searchParams.get('secret')||'';algorithm=(url.searchParams.get('algorithm')||'SHA1').toUpperCase();period=Number(url.searchParams.get('period')||30);if((url.searchParams.get('digits')||'6')!=='6')bad('Kho hiện hỗ trợ mã 2FA 6 số.');}
  secret=secret.replace(/[\s-]/g,'').replace(/=+$/,'').toUpperCase();if(!secret)return {secret:'',algorithm:'SHA1',period:30};
  if(!/^[A-Z2-7]{16,256}$/.test(secret))bad('Khóa 2FA Base32 chỉ dùng A–Z và 2–7; kiểm tra lại khóa từ nơi cấp.');base32(secret);
  if(!['SHA1','SHA256','SHA512'].includes(algorithm)||!Number.isInteger(period)||period<15||period>120)bad('Thiết lập khóa 2FA không được hỗ trợ.');return {secret,algorithm,period};
}
export function totp(config,now=Date.now()){
  if(!config.secret)return {code:'',expires_at:null,period:30};const counter=Math.floor(now/1000/config.period),buffer=Buffer.alloc(8);buffer.writeBigUInt64BE(BigInt(counter));
  const digest=createHmac(config.algorithm.toLowerCase(),base32(config.secret)).update(buffer).digest(),offset=digest[digest.length-1]&15;
  return {code:String((digest.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0'),expires_at:(counter+1)*config.period*1000,period:config.period};
}
export function totpText(config,email){return !config.secret?'':config.algorithm==='SHA1'&&config.period===30?config.secret:`otpauth://totp/${encodeURIComponent(email)}?secret=${config.secret}&algorithm=${config.algorithm}&digits=6&period=${config.period}`;}
export function validateVaultBackup(meta,items){
  if(!Array.isArray(meta)||!Array.isArray(items)||meta.length>1)throw Error('Invalid encrypted vault backup');
  if(!meta.length){if(items.length)throw Error('Missing encrypted vault configuration');return;}
  if(meta[0].name!=='config'||typeof meta[0].value!=='string')throw Error('Invalid encrypted vault configuration');validVaultConfig(JSON.parse(meta[0].value));
  const ids=new Set(),families=new Set();for(const row of items){if(!Number.isSafeInteger(row.id)||row.id<1||ids.has(row.id)||!Number.isSafeInteger(row.revision)||row.revision<0||(row.family_id!==null&&(!Number.isSafeInteger(row.family_id)||row.family_id<1||families.has(row.family_id)))||typeof row.payload!=='string'||row.payload.length>50000||!Number.isFinite(Date.parse(row.created_at))||!Number.isFinite(Date.parse(row.updated_at)))throw Error('Invalid encrypted vault entry');ids.add(row.id);if(row.family_id!==null)families.add(row.family_id);const envelope=JSON.parse(row.payload);if(envelope.version!==1)throw Error('Invalid encrypted vault entry');bytes(envelope.iv,12);bytes(envelope.tag,16);bytes(envelope.data,1,32768);}
}
