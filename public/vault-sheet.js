import {parseCSV,normalizeHeader} from './csv.js';
export const vaultSheetFields={email:'Tài khoản *',password:'Mật khẩu',totp:'2FA',recovery_email:'Mail khôi phục',label:'Tên Family',note:'Note'};
export function readVaultSheet(source,delimiter='auto'){
  const parsed=parseCSV(source,delimiter);
  if(parsed.records.length>500)throw Error('Mỗi lần nhập tối đa 500 tài khoản.');
  const aliases={email:['taikhoan','account','email','mail','gmail','mailchufam','mailchufamily','mailchu','manageremail'],password:['matkhau','password','pass'],totp:['2fa','auth','authenticator','key2fa','khoabimat2fa','totp','secret','key'],recovery_email:['mailkhoiphuc','emailkhoiphuc','recoveryemail','recovery','recoverymail'],label:['tenfamily','family','fam','tennhom','label'],note:['note','notes','ghichu']};
  return {...parsed,mapping:Object.fromEntries(Object.keys(vaultSheetFields).map(k=>[k,parsed.headers.findIndex(h=>aliases[k].includes(normalizeHeader(h)))]))};
}
export function mapVaultSheet(parsed,mapping){
  if(!Number.isInteger(mapping.email)||mapping.email<0||mapping.email>=parsed.headers.length)throw Error('Chọn cột Tài khoản trước khi xem trước.');
  const used=Object.values(mapping).filter(v=>v>=0);if(new Set(used).size!==used.length)throw Error('Mỗi cột chỉ dùng cho một loại thông tin.');
  return parsed.records.map(row=>({line:row.line,...Object.fromEntries(Object.keys(vaultSheetFields).map(k=>[k,mapping[k]>=0?row.cells[mapping[k]]||'':'']))}));
}
