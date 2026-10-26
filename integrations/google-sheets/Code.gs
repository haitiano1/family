/* Family PHP connector. Run setupFamilySync once, then deploy as a Web app.
 * Script Properties holds FAMILY_TOKEN and FAMILY_SPREADSHEET_ID privately.
 * No account credentials, tokens or cell values are written to execution logs.
 */
const FAMILY_SYNC_VERSION='family-groups-compact-v5.7';
function doGet(){return ContentService.createTextOutput(JSON.stringify({ok:true,service:'family-sync',script_version:FAMILY_SYNC_VERSION})).setMimeType(ContentService.MimeType.JSON);}
const FAMILY_TABS = {
  families: {name:'FamilySync_Family', fields:['id','name','manager_email','trial_date','service','note'], headers:['ID (không sửa)','Tên Family','Email quản lý','Ngày trial (yyyy-mm-dd)','Dịch vụ','Ghi chú']},
  members: {name:'FamilySync_Khach', fields:['id','family_id','email','customer_name','contact','joined_at','expires_at','payment_status','amount','plan_months','membership_status','note','renewal_status','renewal_amount','renewal_paid_at','renewal_note'], headers:['ID (không sửa)','ID Family','Email khách','Tên khách','Contact','Ngày mua (yyyy-mm-dd)','Hết hạn (yyyy-mm-dd)','Thanh toán','Số tiền VND','Gói tháng','Thành viên','Ghi chú','Gia hạn tiếp theo','Tiền gia hạn VND','Ngày nhận tiền gia hạn (yyyy-mm-dd)','Ghi chú gia hạn']},
  vault: {name:'FamilySync_Kho', fields:['id','family_id','email','password','totp','recovery_email','label','note'], headers:['ID (không sửa)','ID Family (không sửa)','Email (đổi tại Family)','Mật khẩu','Khóa 2FA','Mail khôi phục','Nhãn','Note']}
};
// Grouped customer layout keeps the wire schema unchanged for existing websites.
const FAMILY_GROUP_TITLE='Khách theo Family';
const FAMILY_LEGACY_GROUP_FIELDS=['customer_name','email','plan_months','joined_at','expires_at',null,'contact','payment_status','amount','membership_status','note','renewal_status','renewal_amount','renewal_paid_at','renewal_note','id','family_id'];
const FAMILY_LEGACY_GROUP_HEADERS=['Tên khách','Email khách','Gói mua','Ngày mua','Ngày hết hạn','Còn ngày','Contact','Thanh toán','Số tiền VND','Thành viên','Ghi chú','Gia hạn tiếp theo','Tiền gia hạn VND','Ngày nhận tiền gia hạn','Ghi chú gia hạn','ID (không sửa)','ID Family (không sửa)','Loại dòng (không sửa)'];
const FAMILY_LEGACY_DAYS_FORMULA='=IFERROR(IF(INDIRECT("E"&ROW())="","",IF(ISNUMBER(INDIRECT("E"&ROW())),INT(INDIRECT("E"&ROW())),DATE(VALUE(RIGHT(INDIRECT("E"&ROW()),4)),VALUE(MID(INDIRECT("E"&ROW()),4,2)),VALUE(LEFT(INDIRECT("E"&ROW()),2))))-TODAY()),"")';
function familyDisplayDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)?value.slice(8,10)+'/'+value.slice(5,7)+'/'+value.slice(0,4):value;}
function familyInputDate(value){
  if(!value||/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
  const parts=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);if(!parts)throw Error('data');
  return parts[3]+'-'+parts[2].padStart(2,'0')+'-'+parts[1].padStart(2,'0');
}
function familyGrouped(tab){return tab.getRange(1,1).getDisplayValues()[0][0]===FAMILY_GROUP_TITLE;}
function familyReadLegacyGroups(tab){
  if(tab.getLastColumn()>18||tab.getLastRow()>50000||tab.getRange(2,1,1,18).getDisplayValues()[0].some((v,i)=>v!==FAMILY_LEGACY_GROUP_HEADERS[i]))throw Error('schema');
  if(tab.getLastRow()<3)return [];
  const range=tab.getRange(3,1,tab.getLastRow()-2,18),values=range.getDisplayValues(),formulas=range.getFormulas(),seen={},rows=[];
  let currentFamily='';
  values.forEach((cells,index)=>{
    const kind=cells[17];
    if(formulas[index].some((formula,col)=>formula&&!(col===5&&formula.replace(/;/g,',')===FAMILY_LEGACY_DAYS_FORMULA&&kind!=='family')))throw Error('formula');
    if(kind==='family'){if(!cells[16])throw Error('id');currentFamily=cells[16];return;}
    if(kind&&kind!=='member')throw Error('schema');
    if(cells.slice(0,15).every((v,i)=>i===5||v===''))return;
    let id=cells[15];if(!id){id='new:'+Utilities.getUuid();tab.getRange(index+3,16).setNumberFormat('@').setValue(id);}
    if(!/^[A-Za-z0-9_:-]{1,140}$/.test(id)||seen[id])throw Error('id');seen[id]=true;
    const data={};FAMILY_LEGACY_GROUP_FIELDS.forEach((field,col)=>{if(field)data[field]=String(cells[col]);});
    data.id=id;data.family_id=data.family_id||currentFamily;if(!data.family_id)throw Error('data');
    ['joined_at','expires_at','renewal_paid_at'].forEach(field=>data[field]=familyInputDate(data[field]));
    if(data.plan_months){const match=/^(\d+)(?:\s*(tháng|năm))?$/.exec(data.plan_months.trim());if(!match)throw Error('data');data.plan_months=String(Number(match[1])*(match[2]==='năm'?12:1));}
    const defaults={payment_status:'unpaid',amount:'0',plan_months:'0',membership_status:'unknown',renewal_status:'not_contacted',renewal_amount:'0'};
    const row={};FAMILY_TABS.members.fields.forEach(field=>row[field]=data[field]||defaults[field]||'');rows.push(row);
  });
  if(rows.length>10000)throw Error('limit');return rows.sort((a,b)=>a.id.localeCompare(b.id));
}
// Only A:G are editable/displayed. H:K retain IDs and the omitted business fields.
// The HTTP schema is unchanged, so a layout update cannot erase payments on web.
const FAMILY_GROUP_FIELDS=['customer_name','email','plan_months','joined_at','expires_at',null,'contact'];
const FAMILY_GROUP_HEADERS=['Tên khách','Email khách','Gói mua','Ngày mua','Ngày hết hạn','Còn ngày','Contact','ID (không sửa)','ID Family (không sửa)','Loại dòng (không sửa)','Dữ liệu đồng bộ (không sửa)'];
const FAMILY_BACKING_FIELDS=['payment_status','amount','membership_status','note','renewal_status','renewal_amount','renewal_paid_at','renewal_note'];
const FAMILY_MEMBER_DEFAULTS={payment_status:'unpaid',amount:'0',plan_months:'0',membership_status:'unknown',renewal_status:'not_contacted',renewal_amount:'0'};
// No argument separators: works with both comma and semicolon spreadsheet locales.
// IFERROR has an optional second argument; division by zero leaves empty dates blank.
const FAMILY_DAYS_FORMULA='=IFERROR((INDIRECT("E"&ROW())-TODAY()-2)/(INDIRECT("E"&ROW())<>""))';
function familyBacking(member){
  const data={};FAMILY_BACKING_FIELDS.forEach(field=>data[field]=member[field]||FAMILY_MEMBER_DEFAULTS[field]||'');
  const encoded=JSON.stringify(data);if(encoded.length>49000)throw Error('limit');return encoded;
}
function familyReadGroups(tab){
  const width=tab.getMaxColumns()>=18?18:11,header=tab.getRange(2,1,1,width).getDisplayValues()[0];
  if(width===18&&header.every((v,i)=>v===FAMILY_LEGACY_GROUP_HEADERS[i]))return familyReadLegacyGroups(tab);
  if(tab.getLastColumn()>11||tab.getLastRow()>50000||FAMILY_GROUP_HEADERS.some((v,i)=>header[i]!==v))throw Error('schema');
  if(tab.getLastRow()<3)return [];
  const range=tab.getRange(3,1,tab.getLastRow()-2,11),values=range.getDisplayValues(),formulas=range.getFormulas(),seen={},rows=[];
  let currentFamily='';
  values.forEach((cells,index)=>{
    const kind=cells[9];
    if(formulas[index].some((formula,col)=>formula&&!(col===5&&formula===FAMILY_DAYS_FORMULA&&kind!=='family')))throw Error('formula');
    if(kind==='family'){if(!cells[8])throw Error('id');currentFamily=cells[8];return;}
    if(kind&&kind!=='member')throw Error('schema');
    if(cells.slice(0,7).every((v,i)=>i===5||v===''))return;
    let id=cells[7],backing;
    // Missing metadata on an existing row must not reset payments or renewal data.
    if(id||cells[10]){
      try{backing=JSON.parse(cells[10]);}catch(error){throw Error('schema');}
      if(!backing||Array.isArray(backing)||Object.keys(backing).length!==FAMILY_BACKING_FIELDS.length||FAMILY_BACKING_FIELDS.some(field=>typeof backing[field]!=='string'||backing[field].length>12000))throw Error('schema');
    }else{backing=JSON.parse(familyBacking({}));}
    if(!id){id='new:'+Utilities.getUuid();tab.getRange(index+3,8,1,4).setNumberFormat('@').setValues([[id,cells[8]||currentFamily,'member',familyBacking(backing)]]);}
    if(!/^[A-Za-z0-9_:-]{1,140}$/.test(id)||seen[id])throw Error('id');seen[id]=true;
    const data={...backing};FAMILY_GROUP_FIELDS.forEach((field,col)=>{if(field)data[field]=String(cells[col]);});
    data.id=id;data.family_id=cells[8]||currentFamily;if(!data.family_id)throw Error('data');
    ['joined_at','expires_at'].forEach(field=>data[field]=familyInputDate(data[field]));
    if(data.plan_months){const match=/^(\d+)(?:\s*(tháng|năm))?$/.exec(data.plan_months.trim());if(!match)throw Error('data');data.plan_months=String(Number(match[1])*(match[2]==='năm'?12:1));}
    const row={};FAMILY_TABS.members.fields.forEach(field=>row[field]=data[field]||FAMILY_MEMBER_DEFAULTS[field]||'');rows.push(row);
  });
  if(rows.length>10000)throw Error('limit');return rows.sort((a,b)=>a.id.localeCompare(b.id));
}
function familySheetDate(value,timezone){
  if(!value)return '';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('data');
  const date=Utilities.parseDate(value,timezone,'yyyy-MM-dd');
  if(Utilities.formatDate(date,timezone,'yyyy-MM-dd')!==value)throw Error('data');
  return date;
}
function familyDateISO(display,value,timezone){
  const iso=Object.prototype.toString.call(value)==='[object Date]'?Utilities.formatDate(value,timezone,'yyyy-MM-dd'):familyInputDate(display);
  if(iso)familySheetDate(iso,timezone);return iso;
}
function familyWriteGroups(tab,families,members,onStage=()=>{}){
  onStage('prepare_members');
  const grouped=new Map(families.map(f=>[f.id,[]])),timezone=tab.getParent().getSpreadsheetTimeZone();
  members.forEach(member=>{if(!grouped.has(member.family_id))throw Error('data');grouped.get(member.family_id).push(member);});
  // Capture and validate the full replacement before modifying the original tab.
  const output=[Array(11).fill(''),FAMILY_GROUP_HEADERS.slice()],titles=[],groups=[],body=[];
  output[0][0]=FAMILY_GROUP_TITLE;output[0][1]='Ngày dd/mm/yyyy. Còn ngày = hạn − TODAY() − 2. Thanh toán/gia hạn quản lý trên web.';
  families.forEach(f=>{
    const title=Array(11).fill('');title[0]=f.name;title[8]=f.id;title[9]='family';titles.push(output.length+1);output.push(title);
    const row=FAMILY_GROUP_HEADERS.slice();row[0]=f.manager_email;row[1]=f.name;row[7]='';row[8]=f.id;row[9]='family';row[10]='';groups.push(output.length+1);output.push(row);
    const rows=grouped.get(f.id);(rows.length?rows:[null]).forEach(member=>{
      const values=Array(11).fill('');if(member){FAMILY_GROUP_FIELDS.forEach((field,col)=>{if(field){let value=member[field];if(['joined_at','expires_at'].includes(field))value=familySheetDate(value,timezone);if(field==='plan_months')value=value==='0'?'':value+' tháng';values[col]=value;}});values[7]=member.id;values[10]=familyBacking(member);}
      values[8]=f.id;values[9]='member';body.push(output.length+1);output.push(values);
    });output.push(Array(11).fill(''));
  });
  if(output.length>50000)throw Error('limit');
  onStage('resize_members');const old=tab.getLastRow();if(tab.getMaxColumns()<11)tab.insertColumnsAfter(tab.getMaxColumns(),11-tab.getMaxColumns());if(tab.getMaxRows()<output.length)tab.insertRowsAfter(tab.getMaxRows(),output.length-tab.getMaxRows());
  // Trim old visible business columns/IDs only after preserving their values above.
  if(tab.getMaxColumns()>11)tab.deleteColumns(12,tab.getMaxColumns()-11);
  onStage('write_member_cells');tab.getRange(1,1,output.length,11).setNumberFormat('@').setValues(output.map(row=>row.map(v=>typeof v==='string'?"'"+v:v)));
  if(old>output.length)tab.getRange(output.length+1,1,old-output.length,11).clearContent();
  onStage('style_members');const full=tab.getRange(1,1,Math.max(old,output.length),11);full.setBackground('#ffffff').setFontColor('#172b4d').setFontSize(11).setFontWeight('normal').setVerticalAlignment('middle');
  tab.getRange(1,1,2,7).setBackground('#eff5ff').setFontWeight('bold');onStage('freeze_members');tab.setFrozenRows(2);
  onStage('style_member_rows');
  for(let start=0;start<titles.length;start+=100)tab.getRangeList(titles.slice(start,start+100).map(row=>'A'+row)).setBackground('#fff176').setFontColor('#b00020').setFontWeight('bold');
  for(let start=0;start<groups.length;start+=100)tab.getRangeList(groups.slice(start,start+100).map(row=>'A'+row+':G'+row)).setBackground('#34e83b').setFontColor('#102610').setFontWeight('bold');
  for(let start=0;start<body.length;start+=100){const batch=body.slice(start,start+100);tab.getRangeList(batch.map(row=>'A'+row+':G'+row)).setBackground('#b7d5ee');tab.getRangeList(batch.map(row=>'D'+row+':E'+row)).setNumberFormat('dd/mm/yyyy');tab.getRangeList(batch.map(row=>'F'+row)).setFormula(FAMILY_DAYS_FORMULA).setNumberFormat('0').setFontColor('#b00020').setFontWeight('bold');}
  onStage('resize_member_columns');tab.setColumnWidth(1,200);tab.setColumnWidth(2,270);tab.setColumnWidths(3,4,120);tab.setColumnWidth(7,230);tab.showColumns(1,7);tab.hideColumns(8,4);
  tab.getRange(1,1).setNote('Chỉ dùng A:G. H:K chứa ID và dữ liệu giữ thanh toán/gia hạn, không xóa/sửa. Sắp xếp toàn bộ dòng cùng các cột ẩn.');
}

function setupFamilySync() {
  const props=PropertiesService.getScriptProperties();
  let id=props.getProperty('FAMILY_SPREADSHEET_ID');
  const book=id?SpreadsheetApp.openById(id):SpreadsheetApp.create('Family – Đồng bộ website');
  if(!id)props.setProperty('FAMILY_SPREADSHEET_ID',book.getId());
  if(!props.getProperty('FAMILY_TOKEN'))props.setProperty('FAMILY_TOKEN',Utilities.getUuid().replace(/-/g,'')+Utilities.getUuid().replace(/-/g,''));
  Object.keys(FAMILY_TABS).forEach(key=>familyTab(book,key));
  console.log('Sheet của bạn: '+book.getUrl());
  console.log('Mở Project Settings → Script Properties để lấy FAMILY_TOKEN. Không gửi mã qua chat.');
}
function familyTab(book,key) {
  if(key==='vault')return familyVaultTab(book);
  const spec=FAMILY_TABS[key];let tab=book.getSheetByName(spec.name);
  if(!tab&&key==='members'){tab=book.insertSheet(spec.name);familyWriteGroups(tab,[],[]);return tab;}
  if(tab&&key==='members'&&familyGrouped(tab))return tab;
  if(!tab){tab=book.insertSheet(spec.name);tab.getRange(1,1,1,spec.headers.length).setValues([spec.headers]);tab.setFrozenRows(1);tab.getRange(2,1,tab.getMaxRows()-1,spec.fields.length).setNumberFormat('@');tab.getRange(1,1,1,spec.headers.length).setFontWeight('bold').setBackground('#eff5ff');tab.setColumnWidths(1,spec.headers.length,180);tab.getRange(1,1).setNote('ID được cấp tự động. Để thêm dòng, bỏ trống ID. Không xóa/sửa ID của dòng đã đồng bộ.');}
  const headers=tab.getRange(1,1,1,spec.headers.length).getDisplayValues()[0];
  if(headers.some((h,i)=>h!==spec.headers[i])||tab.getLastColumn()>spec.headers.length)throw Error('schema');
  return tab;
}
function familyRead(book,scope,onStage=()=>{}) {
  const result={};const keys=scope==='core'?['families','members']:['vault'];
  keys.forEach(key=>{
    onStage('read_'+key);const tab=familyTab(book,key);if(key==='vault'){result.vault=familyReadVault(book,tab);return;}if(key==='members'&&familyGrouped(tab)){result[key]=familyReadGroups(tab);return;}
    const spec=FAMILY_TABS[key],count=Math.max(0,tab.getLastRow()-1);if(count>10000)throw Error('limit');
    result[key]=[];if(!count)return;
    const range=tab.getRange(2,1,count,spec.fields.length),values=range.getDisplayValues(),formulas=range.getFormulas(),raw=key==='families'?range.getValues():null,seen={};
    values.forEach((cells,index)=>{
      if(cells.every(v=>v===''))return;
      if(formulas[index].some(Boolean))throw Error('formula');
      if(!cells[0]){if(key==='vault')throw Error('vault_id');cells[0]='new:'+Utilities.getUuid();tab.getRange(index+2,1).setNumberFormat('@').setValue(cells[0]);}
      if(!/^[A-Za-z0-9_:-]{1,140}$/.test(cells[0])||seen[cells[0]])throw Error('id');seen[cells[0]]=true;
      const defaults={service:'youtube',payment_status:'unpaid',amount:'0',plan_months:'0',membership_status:'unknown',renewal_status:'not_contacted',renewal_amount:'0'};
      const row={};spec.fields.forEach((field,i)=>row[field]=String(cells[i]||defaults[field]||''));if(key==='families'){try{row.trial_date=familyDateISO(cells[3],raw[index][3],book.getSpreadsheetTimeZone());}catch(error){familyVaultError('vault_date',index+2,4,'FamilySync_Family');}}result[key].push(row);
    });
    result[key].sort((a,b)=>a.id.localeCompare(b.id));
  });
  return result;
}
function familyRevision(data) {
  // Explicit field order and row sort make revision independent of sheet row order.
  const json=JSON.stringify(data);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,json,Utilities.Charset.UTF_8).map(n=>('0'+((n+256)%256).toString(16)).slice(-2)).join('');
}
function familySameRows(left,right,fields){
  const canonical=rows=>rows.map(row=>fields.map(field=>row[field])).sort((a,b)=>a[0].localeCompare(b[0]));
  return JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
}
function familyWrite(book,scope,data,onStage=()=>{},current=null) {
  onStage('validate_output');
  const layoutWarnings=[];const keys=scope==='core'?['families','members']:['vault'];
  keys.forEach(key=>{
    const spec=FAMILY_TABS[key],rows=data[key],fields=key==='vault'?FAMILY_VAULT_WIRE:spec.fields;if(!Array.isArray(rows)||rows.length>10000)throw Error('limit');const seen={};
    rows.forEach(row=>{if(!row||Object.keys(row).length!==fields.length||fields.some(f=>typeof row[f]!=='string'||row[f].length>12000)||!/^[A-Za-z0-9_:-]{1,140}$/.test(row.id)||seen[row.id])throw Error('data');seen[row.id]=true;});
  });
  keys.forEach(key=>{
    // A customer renewal must not reformat or rewrite an unchanged Family tab.
    // Sheets can defer a failure here until a later read of the customer tab.
    if(key==='families'&&current&&familySameRows(current.families,data.families,FAMILY_TABS.families.fields))return;
    onStage('write_'+key);const spec=FAMILY_TABS[key],tab=familyTab(book,key);if(key==='vault'){layoutWarnings.push(...familyWriteVault(tab,data.vault));return;}if(key==='members'){familyWriteGroups(tab,data.families,data.members,onStage);return;}
    const rows=data[key],old=Math.max(0,tab.getLastRow()-1);
    if(tab.getMaxRows()<rows.length+1)tab.insertRowsAfter(tab.getMaxRows(),rows.length+1-tab.getMaxRows());
    if(rows.length){const values=rows.map(row=>spec.fields.map(f=>"'"+row[f]));tab.getRange(2,1,rows.length,spec.fields.length).setNumberFormat('@').setValues(values);}
    if(old>rows.length)tab.getRange(rows.length+2,1,old-rows.length,spec.fields.length).clearContent();
    // Force pending Family operations to finish while the diagnostic still
    // points at Family, before familyGrouped reads the customer title cell.
    SpreadsheetApp.flush();
  });onStage('flush_write');SpreadsheetApp.flush();if(scope==='vault'){onStage('verify_vault');familyVaultAssertEntry(book.getSheetByName(FAMILY_TABS.vault.name));}return layoutWarnings;
}
// Return only finite diagnostic labels and a line number. Google's raw error
// text/stack can contain cell values and must never reach responses or logs.
function familySyncDiagnostic(error,stage){
  const stages=['wait_lock','open_book','read_families','read_members','read_vault','revision','validate_output','write_families','write_members','write_vault','prepare_members','resize_members','write_member_cells','style_members','freeze_members','style_member_rows','resize_member_columns','flush_write','verify_vault','response_metadata'];
  const text=String(error&&error.message||''),stack=String(error&&error.stack||'');
  let reason='unknown';
  if(/typed column|column type|bảng.*kiểu|cột.*kiểu/i.test(text))reason='table_column';
  else if(/table|bảng/i.test(text))reason='table';
  else if(/protect|được bảo vệ|bảo vệ/i.test(text))reason='protected';
  else if(/permission|access denied|authorization|quyền truy cập|không có quyền/i.test(text))reason='permission';
  else if(/quota|too many|limit exceeded|hạn mức/i.test(text))reason='quota';
  else if(stage==='wait_lock')reason='lock';
  const match=/\bat [^\r\n]*?:(\d+)(?::\d+)?\)?(?:\r?\n|$)/.exec(stack),line=match?Number(match[1]):0;
  return {stage:stages.includes(stage)?stage:'unknown',reason,...(line>0&&line<=100000?{line}:{})};
}
function doPost(event) {
  const reply=value=>ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
  const lock=LockService.getScriptLock();let stage='request',authenticated=false;const onStage=value=>{stage=value;};
  try{
    if(!event||!event.postData||event.postData.contents.length>8000000)return reply({ok:false,code:'request'});
    const request=JSON.parse(event.postData.contents),props=PropertiesService.getScriptProperties(),token=props.getProperty('FAMILY_TOKEN');
    if(!token||typeof request.token!=='string'||request.token!==token)return reply({ok:false,code:'auth'});
    authenticated=true;
    if(!['core','vault'].includes(request.scope)||!['read','write'].includes(request.action))return reply({ok:false,code:'request'});
    onStage('wait_lock');lock.waitLock(20000);
    onStage('open_book');const book=SpreadsheetApp.openById(props.getProperty('FAMILY_SPREADSHEET_ID')),current=familyRead(book,request.scope,onStage);onStage('revision');const revision=familyRevision(current);
    if(request.action==='write'){
      if(request.revision!==revision)return reply({ok:false,code:'stale'});
      const layoutWarnings=familyWrite(book,request.scope,request.data,onStage,current);onStage('response_metadata');
      return reply({ok:true,...(layoutWarnings.length?{layout_warnings:layoutWarnings}:{}),script_version:FAMILY_SYNC_VERSION,vault_schema:'trial-date-v1',vault_layout:familyVaultEntry(book.getSheetByName(FAMILY_TABS.vault.name))?'entry':'legacy',customer_layout:familyGrouped(familyTab(book,'members'))?'grouped':'flat'});
    }
    onStage('response_metadata');return reply({ok:true,script_version:FAMILY_SYNC_VERSION,vault_schema:'trial-date-v1',vault_layout:familyVaultEntry(book.getSheetByName(FAMILY_TABS.vault.name))?'entry':'legacy',customer_layout:familyGrouped(familyTab(book,'members'))?'grouped':'flat',data:current,...(request.scope==='vault'?{row_locations:FAMILY_VAULT_LOCATIONS}:{}),revision:revision,sheet_url:'https://docs.google.com/spreadsheets/d/'+book.getId()+'/edit'});
  }catch(error){const code=['schema','formula','id','limit','vault_id','vault_date','vault_email','data'].includes(error.message)?error.message:'unavailable';const diagnostic=authenticated&&code==='unavailable'?familySyncDiagnostic(error,stage):null;if(diagnostic)console.log('FAMILY_SYNC_DIAGNOSTIC '+JSON.stringify(diagnostic));return reply({ok:false,script_version:FAMILY_SYNC_VERSION,code,...(diagnostic?{diagnostic}:{}),...(error.location?{location:error.location}:{})});}
  finally{if(lock.hasLock())lock.releaseLock();}
}

// Owner-run migration: works directly on the configured Sheet, without waiting
// for Hostinger/HTTP. Keeps the original tab (and gid), with a hidden backup.
function apDungBoCucKhach() {
  const lock=LockService.getScriptLock();let backupName='',stage='lấy khóa';
  try{
    lock.waitLock(20000);
    const id=PropertiesService.getScriptProperties().getProperty('FAMILY_SPREADSHEET_ID');
    if(!id)throw Error('missing_config');
    const book=SpreadsheetApp.openById(id),tab=book.getSheetByName(FAMILY_TABS.members.name),families=book.getSheetByName(FAMILY_TABS.families.name);
    if(!tab||!families)throw Error('missing_tab');
    stage='kiểm tra bảng hiện có';familyTab(book,'members');familyTab(book,'families');
    // A new Family needs a website ID first; do not assign IDs or edit that tab
    // as a side effect of a presentation-only customer migration.
    if(families.getLastRow()>1){const rows=families.getRange(2,1,families.getLastRow()-1,FAMILY_TABS.families.fields.length).getDisplayValues();if(rows.some(row=>row.some(Boolean)&&!row[0]))throw Error('family_id');}
    stage='tạo bản dự phòng';backupName='Khach_du_phong_'+Utilities.getUuid().replace(/-/g,'').slice(0,20);
    tab.copyTo(book).setName(backupName).hideSheet();
    stage='đọc khách và Family';const data=familyRead(book,'core');
    const familyIds=new Set(data.families.map(f=>f.id));if(data.members.some(m=>!familyIds.has(m.family_id)))throw Error('family_id');
    const before=familyRevision({members:data.members});
    console.log('Bắt đầu đổi bố cục: '+data.families.length+' Family, '+data.members.length+' khách.');
    stage='đổi bố cục';familyWriteGroups(tab,data.families,data.members);SpreadsheetApp.flush();
    stage='đối chiếu dữ liệu';const after=familyReadGroups(tab);
    if(familyRevision({members:after})!==before)throw Error('verification');
    book.setActiveSheet(tab);
    console.log('HOÀN TẤT: FamilySync_Khach còn 7 cột; ngày dd/mm/yyyy; Còn ngày = hạn - TODAY() - 2.');
    console.log('File đã cập nhật: '+book.getUrl());
    console.log('Bản dự phòng ẩn: '+backupName+'. Mở View → Hidden sheets để xem khi cần.');
    return {ok:true,changed:true,families:data.families.length,customers:after.length,backup:backupName};
  }catch(error){
    const codes={missing_config:'Chưa có FAMILY_SPREADSHEET_ID trong Script Properties.',missing_tab:'Thiếu tab FamilySync_Khach hoặc FamilySync_Family.',family_id:'Có khách thiếu liên kết Family hoặc Family mới chưa có ID; đồng bộ Family trước.',schema:'Tiêu đề/cột dữ liệu khác mẫu. Chưa xác nhận được bố cục.',formula:'Có công thức ngoài cột Còn ngày được hỗ trợ.',id:'Có ID trùng hoặc sai định dạng.',data:'Có giá trị ngày/gói hoặc liên kết không đúng mẫu.',verification:'Đối chiếu sau chuyển chưa khớp; hãy dùng bản dự phòng để kiểm tra.'};
    throw Error('Chưa hoàn tất ở bước '+stage+'. '+(codes[error.message]||'Google Sheets chưa thực hiện được thao tác. Đóng các tab website, chờ lượt đồng bộ cũ kết thúc rồi thử lại.')+(backupName?' Bản dự phòng (nếu đã tạo): '+backupName+'.':''));
  }finally{if(lock.hasLock())lock.releaseLock();}
}


// Vault entry layout: seven visible input columns, stable IDs hidden in H:I.
let FAMILY_VAULT_LOCATIONS={};
const FAMILY_VAULT_WIRE=FAMILY_TABS.vault.fields.concat(['trial_date']);
const FAMILY_VAULT_FIELDS=['trial_date','email','password','totp','recovery_email','note','label','id','family_id'];
const FAMILY_VAULT_HEADERS=['Ngày trial (dd/mm/yyyy)','Email','Mật khẩu','Khóa 2FA','Mail khôi phục','Note','Nhãn','ID (không sửa)','ID Family (không sửa)'];
function familyVaultEntry(tab){return !!tab&&tab.getRange(1,1).getDisplayValues()[0][0]===FAMILY_VAULT_HEADERS[0];}
function familyVaultUrl(book,tab){return 'https://docs.google.com/spreadsheets/d/'+encodeURIComponent(book.getId())+'/edit#gid='+tab.getSheetId();}
function familyVaultAssertEntry(tab){
  if(!tab||tab.getMaxColumns()<FAMILY_VAULT_HEADERS.length)familyVaultError('schema',1,1);
  const headers=tab.getRange(1,1,1,FAMILY_VAULT_HEADERS.length).getDisplayValues()[0];
  FAMILY_VAULT_HEADERS.forEach((value,column)=>{if(headers[column]!==value)familyVaultError('schema',1,column+1);});
}
function familyVaultError(code,row,column,tab='FamilySync_Kho'){const error=Error(code);error.location={tab:tab,row:row,column:column};throw error;}
function familyVaultTab(book){
  const spec=FAMILY_TABS.vault;let tab=book.getSheetByName(spec.name);
  if(!tab){tab=book.insertSheet(spec.name);familyWriteVault(tab,[]);return tab;}
  const headers=familyVaultEntry(tab)?FAMILY_VAULT_HEADERS:spec.headers;
  if(tab.getMaxColumns()<headers.length)familyVaultError('schema',1,tab.getMaxColumns()+1);if(tab.getLastColumn()>headers.length)familyVaultError('schema',1,headers.length+1);
  const actual=tab.getRange(1,1,1,headers.length).getDisplayValues()[0];
  headers.forEach((value,i)=>{if(actual[i]!==value)familyVaultError('schema',1,i+1);});return tab;
}
function familyVaultTrialDates(book){
  if(!book.getSheetByName(FAMILY_TABS.families.name))throw Error('missing_family_tab');
  const tab=familyTab(book,'families'),result=new Map();if(tab.getLastRow()<2)return result;
  const range=tab.getRange(2,1,tab.getLastRow()-1,FAMILY_TABS.families.fields.length),values=range.getDisplayValues(),raw=range.getValues();
  values.forEach((row,index)=>{if(row[2]){
    try{result.set(row[2].trim().toLowerCase(),familyDateISO(row[3],raw[index][3],book.getSpreadsheetTimeZone()));}
    catch(error){familyVaultError('vault_date',index+2,4,'FamilySync_Family');}
  }});return result;
}
function familyReadVault(book,tab,assignIds=true){
  FAMILY_VAULT_LOCATIONS={};
  const entry=familyVaultEntry(tab),fields=entry?FAMILY_VAULT_FIELDS:FAMILY_TABS.vault.fields,count=Math.max(0,tab.getLastRow()-1);
  if(count>10000)throw Error('limit');if(!count)return [];
  const range=tab.getRange(2,1,count,fields.length),values=range.getDisplayValues(),formulas=range.getFormulas(),raw=entry?range.getValues():null;
  const dates=entry?null:familyVaultTrialDates(book),timezone=book.getSpreadsheetTimeZone(),seen=new Set(),emails=new Set(),rows=[],assignments=[];
  values.forEach((cells,index)=>{
    const line=index+2;
    formulas[index].forEach((formula,col)=>{if(formula)familyVaultError('formula',line,col+1);});
    // Clearing the visible account cells leaves stable IDs in hidden columns.
    // Such a row has no account input. Keep its metadata untouched on reads;
    // the website's existing merge rules still retain any saved account.
    if(cells.every((value,col)=>value===''||fields[col]==='id'||fields[col]==='family_id'))return;
    const data={};fields.forEach((field,col)=>data[field]=String(cells[col]));
    const address=data.email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||emails.has(address))familyVaultError('vault_email',line,entry?2:3);emails.add(address);data.email=address;
    if(entry){
      try{data.trial_date=familyDateISO(data.trial_date,raw[index][0],timezone);}catch(error){familyVaultError('vault_date',line,1);}
    }else data.trial_date=dates.get(address)||'';
    if(!data.id){if(data.family_id)familyVaultError('vault_id',line,entry?8:1);data.id='new:'+Utilities.getUuid();assignments.push({row:line,column:entry?8:1,id:data.id});}
    if(!/^[A-Za-z0-9_:-]{1,140}$/.test(data.id)||seen.has(data.id))familyVaultError('id',line,entry?8:1);seen.add(data.id);
    FAMILY_VAULT_LOCATIONS[data.id]=line;const record={};FAMILY_VAULT_WIRE.forEach(field=>record[field]=data[field]||'');rows.push(record);
  });
  // Validate the entire batch before assigning IDs. Never log account values.
  if(assignIds)assignments.forEach(item=>tab.getRange(item.row,item.column).setNumberFormat('@').setValue(item.id));
  return rows.sort((a,b)=>a.id.localeCompare(b.id));
}
function familyVaultValues(tab,rows){
  const timezone=tab.getParent().getSpreadsheetTimeZone();
  return rows.map((row,index)=>FAMILY_VAULT_FIELDS.map(field=>{
    if(field!=='trial_date')return "'"+row[field];
    try{return familySheetDate(row[field],timezone);}catch(error){familyVaultError('vault_date',index+2,1);}
  }));
}
// Apply presentation separately from account values. Never suppress a data error.
function familyVaultStyleIssue(step,error){
  const message=typeof error.message==='string'?error.message:'';
  let reason='Google chưa áp dụng được thao tác hiển thị này';
  if(/permission|protected|access denied|quyền|bảo vệ/i.test(message))reason='Quyền chỉnh sửa hoặc phạm vi được bảo vệ';
  else if(/merged|merge|gộp|hợp nhất/i.test(message))reason='Có ô được gộp trong vùng liên quan';
  else if(/frozen|freeze|cố định/i.test(message))reason='Thiết lập hàng/cột cố định chưa áp dụng được';
  else if(error.name==='TypeError')reason='Phương thức hiển thị chưa thực hiện được';
  return {step:step,reason:reason};
}
function familyVaultVisibility(tab,show,start,count){
  try{if(show)tab.showColumns(start,count);else tab.hideColumns(start,count);}
  catch(error){
    const fallback=show?'unhideColumn':'hideColumn';if(typeof tab[fallback]!=='function')throw error;
    for(let column=start;column<start+count;column++)tab[fallback](tab.getRange(1,column));
  }
}
function familyVaultStyle(tab){
  const issues=[],steps=[
    ['tô tiêu đề',()=>tab.getRange(1,1,1,9).setFontWeight('bold').setBackground('#eff5ff')],
    ['cố định hàng 1',()=>tab.setFrozenRows(1)],
    ['độ rộng cột A',()=>tab.setColumnWidth(1,130)],
    ['độ rộng cột B',()=>tab.setColumnWidth(2,270)],
    ['độ rộng cột C:E',()=>tab.setColumnWidths(3,3,230)],
    ['độ rộng cột F',()=>tab.setColumnWidth(6,270)],
    ['độ rộng cột G',()=>tab.setColumnWidth(7,160)],
    ['hiện cột nhập A:G',()=>familyVaultVisibility(tab,true,1,7)],
    ['ẩn cột ID H:I',()=>familyVaultVisibility(tab,false,8,2)],
    ['ghi chú tiêu đề',()=>tab.getRange(1,1).setNote('Thêm dòng mới bằng email và thông tin tài khoản. Nhập ngày đủ năm dd/mm/yyyy. ID H:I tự cấp; không sửa/xóa. Web nhận khi mở khóa và đang ở Kho.')]
  ];
  steps.forEach(([step,operation])=>{try{operation();SpreadsheetApp.flush();}catch(error){issues.push(familyVaultStyleIssue(step,error));}});return issues;
}
function familyWriteVault(tab,rows,onStage=()=>{}){
  onStage('chuẩn bị ngày trial');const values=familyVaultValues(tab,rows);
  onStage('mở rộng bảng');const old=tab.getLastRow();if(tab.getMaxColumns()<9)tab.insertColumnsAfter(tab.getMaxColumns(),9-tab.getMaxColumns());if(tab.getMaxRows()<Math.max(2,rows.length+1))tab.insertRowsAfter(tab.getMaxRows(),Math.max(2,rows.length+1)-tab.getMaxRows());
  onStage('ghi tiêu đề Kho');tab.getRange(1,1,1,9).setNumberFormat('@').setValues([FAMILY_VAULT_HEADERS]);
  // Format empty input rows as text too, so passwords/2FA keep leading zeroes.
  onStage('định dạng cột');tab.getRange(2,1,tab.getMaxRows()-1,9).setNumberFormat('@');tab.getRange(2,1,tab.getMaxRows()-1,1).setNumberFormat('dd/mm/yyyy');
  onStage('ghi tài khoản');if(rows.length)tab.getRange(2,1,rows.length,9).setValues(values);
  onStage('dọn phần dư');if(old>rows.length+1)tab.getRange(rows.length+2,1,old-rows.length-1,9).clearContent();
  // Google batches spreadsheet operations. Commit and verify account values
  // before any presentation operation can fail or invalidate queued changes.
  onStage('lưu dữ liệu Kho vào Google');SpreadsheetApp.flush();
  onStage('xác nhận bố cục Kho A:I trước khi định dạng');familyVaultAssertEntry(tab);
  onStage('đối chiếu dữ liệu trước khi định dạng');
  const expected=rows.map(row=>{const item={};FAMILY_VAULT_WIRE.forEach(field=>item[field]=row[field]);return item;}).sort((a,b)=>a.id.localeCompare(b.id));
  if(familyRevision({vault:familyReadVault(tab.getParent(),tab,false)})!==familyRevision({vault:expected}))throw Error('verification');
  onStage('ẩn ID và chỉnh hiển thị');return familyVaultStyle(tab);
}
function familyVaultFailure(error,stage,backup=''){
  const reasons={missing_config:'Thiếu FAMILY_SPREADSHEET_ID.',missing_tab:'Không có tab FamilySync_Kho.',missing_family_tab:'Không có tab FamilySync_Family.',schema:'Tiêu đề hoặc số cột không đúng mẫu.',formula:'Có công thức trong ô tài khoản; bộ đồng bộ chỉ nhận giá trị văn bản.',id:'ID sai định dạng hoặc trùng.',vault_id:'Dòng có ID Family nhưng thiếu ID tài khoản.',vault_email:'Email trống, không hợp lệ hoặc trùng dòng.',vault_date:'Ngày trial không hợp lệ hoặc thiếu năm. Nhập đủ dd/mm/yyyy hoặc yyyy-mm-dd.',limit:'Vượt giới hạn số dòng.',verification:'Dữ liệu trước và sau chuyển chưa khớp. Chưa xác nhận đổi thành công.'};
  const location=error.location;let at='';
  if(location&&['FamilySync_Kho','FamilySync_Family'].includes(location.tab)&&Number.isInteger(location.row)&&Number.isInteger(location.column))at=' Vị trí: '+location.tab+', dòng '+location.row+', cột '+location.column+'.';
  // Unexpected Google exceptions can contain cell values. Never forward their text.
  return 'CHƯA HOÀN TẤT ở bước '+stage+'. '+(Object.prototype.hasOwnProperty.call(reasons,error.message)?reasons[error.message]:'Google Sheets chưa thực hiện được thao tác ở bước này; kiểm tra quyền chỉnh sửa và phạm vi được bảo vệ.')+at+(backup?' Giữ bản dự phòng '+backup+'.':'')+' Không gửi mật khẩu, khóa 2FA hoặc mã kết nối.';
}
function kiemTraBoCucKho(){
  let stage='mở file Sheet';
  try{
    const id=PropertiesService.getScriptProperties().getProperty('FAMILY_SPREADSHEET_ID');if(!id)throw Error('missing_config');
    const book=SpreadsheetApp.openById(id),existing=book.getSheetByName(FAMILY_TABS.vault.name);if(!existing)throw Error('missing_tab');
    stage='kiểm tra tiêu đề Kho';const tab=familyVaultTab(book);
    console.log('TAB SCRIPT ĐANG KIỂM TRA: '+familyVaultUrl(book,tab));
    console.log('BỐ CỤC HIỆN TẠI: '+(familyVaultEntry(tab)?'MỚI: Ngày trial ở A, Email ở B.':'CŨ: ID ở A:B, Email ở C.'));
    stage='đọc dữ liệu và ngày trial';const data=familyReadVault(book,tab,false);
    stage='kiểm tra ngày trước khi ghi';familyVaultValues(tab,data);
    console.log('KIỂM TRA ĐẠT: '+data.length+' dòng tài khoản. Chỉ đọc; chưa cấp ID, đổi ô hay tạo bản sao. Có thể chạy apDungBoCucKho.');return {ok:true,rows:data.length};
  }catch(error){throw Error(familyVaultFailure(error,stage));}
}
function apDungBoCucKho(){
  const lock=LockService.getScriptLock();let backup='',stage='lấy khóa';
  try{
    lock.waitLock(20000);stage='mở file Sheet';const props=PropertiesService.getScriptProperties(),id=props.getProperty('FAMILY_SPREADSHEET_ID');if(!id)throw Error('missing_config');
    const book=SpreadsheetApp.openById(id),existing=book.getSheetByName(FAMILY_TABS.vault.name);if(!existing)throw Error('missing_tab');
    stage='kiểm tra tiêu đề Kho';const tab=familyVaultTab(book);
    console.log('TAB SCRIPT ĐANG CHUYỂN: '+familyVaultUrl(book,tab));
    stage='tạo bản dự phòng';backup='Kho_du_phong_'+Utilities.getUuid().replace(/-/g,'').slice(0,20);tab.copyTo(book).setName(backup).hideSheet();
    stage='đọc dữ liệu và ngày trial';const data=familyReadVault(book,tab),before=familyRevision({vault:data});const issues=familyWriteVault(tab,data,value=>stage=value);SpreadsheetApp.flush();
    stage='xác nhận bố cục Kho A:I';familyVaultAssertEntry(tab);
    stage='đối chiếu dữ liệu';if(familyRevision({vault:familyReadVault(book,tab)})!==before)throw Error('verification');
    console.log('ĐÃ XÁC NHẬN BỐ CỤC MỚI: A=Ngày trial, B=Email, ID ở H:I.');
    console.log('MỞ TAB ĐÃ ĐỐI CHIẾU: '+familyVaultUrl(book,tab));
    stage='mở tab Kho';try{book.setActiveSheet(tab);SpreadsheetApp.flush();}catch(error){issues.push(familyVaultStyleIssue('mở tab Kho',error));}
    if(issues.length){
      console.log('DỮ LIỆU ĐÃ ĐỐI CHIẾU KHỚP: '+data.length+' dòng tài khoản; còn '+issues.length+' thao tác hiển thị chưa áp dụng.');
      issues.forEach(issue=>console.log('CHƯA ÁP DỤNG: '+issue.step+'. '+issue.reason+'.'));
      console.log('Giữ bản dự phòng '+backup+'. Có thể chỉnh hiển thị bằng tay; không xóa/sửa ID H:I.');
    }else console.log('HOÀN TẤT: Kho có 7 cột nhập, ID H:I ẩn. Bản dự phòng: '+backup+'.');
    return {ok:true,data_verified:true,vault_layout:'entry',sheet_url:familyVaultUrl(book,tab),layout_complete:issues.length===0,layout_warnings:issues,backup:backup};
  }catch(error){throw Error(familyVaultFailure(error,stage,backup));}
  finally{if(lock.hasLock())lock.releaseLock();}
}
