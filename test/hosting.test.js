import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hosting} from '../hosting.js';

test('Public hosting requires HTTPS and private access; password changes revoke remembered devices',()=>{
  assert.throws(()=>hosting({HOST:'0.0.0.0'}),/PUBLIC_ORIGIN/);
  assert.throws(()=>hosting({HOST:'0.0.0.0',PUBLIC_ORIGIN:'https://family.example.com'}),/ACCESS_PASSWORD/);
  assert.throws(()=>hosting({PUBLIC_ORIGIN:'http://family.example.com',ACCESS_PASSWORD:'abcdefg'}),/HTTPS/);
  const h=hosting({PUBLIC_ORIGIN:'https://family.example.com',ACCESS_PASSWORD:'abcdefg'});
  assert.equal(h.allowedHost('family.example.com'),true);assert.equal(h.allowedHost('attacker.example'),false);
  assert.equal(h.allowedOrigin('https://family.example.com'),true);assert.equal(h.allowedOrigin('http://family.example.com'),false);
  assert.equal(h.login('wrong').status,401);
  const cookie=h.login('abcdefg').cookie;
  assert.match(cookie,/Secure; SameSite=Strict/);assert.match(cookie,/HttpOnly/);
  assert.equal(h.authorized({headers:{cookie}}),true);
  assert.equal(h.authorized({headers:{cookie:cookie.replace(/\.[a-f0-9]+;/,'.bad;')}}),false);
  assert.equal(hosting({PUBLIC_ORIGIN:'https://family.example.com',ACCESS_PASSWORD:'new-pass'}).authorized({headers:{cookie}}),false);
  assert.equal(h.authorized({headers:{cookie:'fam_access=0.invalid'}}),false);
});

test('Hosted access throttles repeated wrong passwords',()=>{
  const h=hosting({PUBLIC_ORIGIN:'https://family.example.com',ACCESS_PASSWORD:'abcdefg'});
  for(let i=0;i<30;i++) assert.equal(h.login('wrong').status,401);
  assert.equal(h.login('wrong').status,429);
});
