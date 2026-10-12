import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export function hosting(env = process.env) {
  const configured = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL;
  const external = !['127.0.0.1','localhost','::1'].includes(env.HOST || '127.0.0.1');
  if (external && !configured) throw new Error('Set PUBLIC_ORIGIN to the HTTPS website URL before listening outside localhost.');
  if (!configured) return { enabled:false, allowedHost:host=>['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+host).hostname), allowedOrigin:(origin,host)=>origin==='http://'+host };
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a path.');
  const password = env.ACCESS_PASSWORD || '';
  if (password.length < 7) throw new Error('Set ACCESS_PASSWORD to a private password longer than 6 characters in hosting settings.');
  const secret = createHash('sha256').update('family-hosting-session\0'+password).digest();
  const sign = value=>createHmac('sha256',secret).update(value).digest('hex');
  const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length && timingSafeEqual(x,y);};
  let attempts=0, windowEnd=0;
  return {
    enabled:true,
    allowedHost:host=>host===url.host || ['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+host).hostname),
    allowedOrigin:origin=>origin===url.origin,
    authorized(req) {
      const token=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('fam_access='))?.slice(11);
      if (!token) return false;
      const [expires,signature]=token.split('.');
      return /^\d+$/.test(expires) && Number(expires)>Date.now() && !!signature && equal(sign(expires),signature);
    },
    login(value) {
      if (Date.now()>windowEnd) {attempts=0;windowEnd=Date.now()+10*60000;}
      if (attempts>=30) return {status:429,error:'Đã thử quá nhiều lần. Vui lòng đợi 10 phút.'};
      if (typeof value !== 'string' || !equal(createHash('sha256').update(value).digest('hex'),createHash('sha256').update(password).digest('hex'))) {attempts++;return {status:401,error:'Mật khẩu truy cập không đúng.'};}
      const expires=String(Date.now()+30*86400000);
      return {cookie:`fam_access=${expires}.${sign(expires)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`};
    }
  };
}
