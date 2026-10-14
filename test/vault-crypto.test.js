import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTotp,totp,seal,open,wrapMaster,unwrapMaster,validVaultPassword} from '../vault-crypto.js';
const encode=b=>{const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,value=0,out='';for(const n of b){value=(value<<8)|n;bits+=8;while(bits>=5){bits-=5;out+=alphabet[(value>>bits)&31];value&=(1<<bits)-1;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;};
test('TOTP matches every RFC6238 vector for SHA1/SHA256/SHA512, with six digits and correct expiry',()=>{
  const times=[59,1111111109,1111111111,1234567890,2000000000,20000000000];
  const values={SHA1:['94287082','07081804','14050471','89005924','69279037','65353130'],SHA256:['46119246','68084774','67062674','91819424','90698825','77737706'],SHA512:['90693936','25091201','99943326','93441116','38618901','47863826']};
  for(const algorithm of Object.keys(values)){const length={SHA1:20,SHA256:32,SHA512:64}[algorithm],secret=encode(Buffer.from('1234567890'.repeat(7).slice(0,length))),config=normalizeTotp(`otpauth://totp/test?secret=${secret}&algorithm=${algorithm}&digits=6&period=30`);for(let i=0;i<times.length;i++){const result=totp(config,times[i]*1000);assert.equal(result.code,values[algorithm][i].slice(-6));assert.equal(result.expires_at,(Math.floor(times[i]/30)+1)*30000);}}
});
test('grouped lowercase secrets normalize correctly; invalid 8/manual/backup codes are not guessed into a key',()=>{
 const raw='GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',grouped=raw.toLowerCase().match(/.{1,4}/g).join(' ');assert.equal(normalizeTotp(grouped).secret,raw);assert.equal(totp(normalizeTotp(grouped),59000).code,'287082');
 for(const input of ['JBSWY3DPEHPK3PX8','123456','12345678 87654321','otpauth://hotp/test?secret='+raw,'otpauth://totp/test?secret='+raw+'&digits=8','otpauth://totp/test?secret='+raw+'&algorithm=SHA3'])assert.throws(()=>normalizeTotp(input));
 assert.equal(totp(normalizeTotp(''),0).code,'');
});
test('AES-GCM rejects tampering, wrong key and record substitution, and password wrapping preserves master key',()=>{
 const key=Buffer.alloc(32,1),entry=seal('Public test value',key,'family-vault-item-v1:1');assert.equal(open(entry,key,'family-vault-item-v1:1'),'Public test value');assert.throws(()=>open(entry,Buffer.alloc(32,2),'family-vault-item-v1:1'));assert.throws(()=>open(entry,key,'family-vault-item-v1:2'));
 const altered={...entry,tag:Buffer.alloc(16).toString('base64')};assert.throws(()=>open(altered,key,'family-vault-item-v1:1'));
 const config=wrapMaster('Test vault password',key);assert.deepEqual(unwrapMaster('Test vault password',config),key);assert.throws(()=>unwrapMaster('Wrong password',config));assert.throws(()=>unwrapMaster('Test vault password',{...config,iterations:1}));
 assert.throws(()=>validVaultPassword('123456'));assert.throws(()=>validVaultPassword('common-password','common-password'));assert.equal(validVaultPassword('1234567'),'1234567');
});
