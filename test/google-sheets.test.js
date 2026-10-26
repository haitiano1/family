import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
function script(){
 const properties=new Map(),tabs=new Map(),logs=[];let serial=0;
 function tab(name){const grid=[];let columns=26;return {name,grid,paints:[],formats:[],getParent:()=>book,getSheetId:()=>3,getName(){return this.name;},setName(next){tabs.delete(this.name);this.name=next;tabs.set(next,this);return this;},hideSheet(){this.hidden=true;return this;},copyTo(book){const copy=book.insertSheet('copy_'+(++serial));this.grid.forEach((row,i)=>{copy.grid[i]=row.map(cell=>cell?{...cell}:cell);});return copy;},getMaxRows:()=>1000,getMaxColumns:()=>columns,insertColumnsAfter(_after,count){columns+=count;},deleteColumns(start,count){columns-=count;grid.forEach(row=>row.splice(start-1,count));},showColumns(start,count){this.visibleColumns={start,count};},getLastRow:()=>{let n=grid.length;while(n&&(!grid[n-1]||grid[n-1].every(c=>!c?.value&&!c?.formula)))n--;return n;},getLastColumn:()=>Math.max(0,...grid.map(r=>r.length)),setFrozenRows(){},setColumnWidths(){},setColumnWidth(){},hideColumns(start,count){this.hiddenColumns={start,count};},insertRowsAfter(){},getRangeList(addresses){const ranges=addresses.map(address=>{const match=/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(address);const col=letters=>[...letters].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0);return this.getRange(Number(match[2]),col(match[1]),Number(match[4]||match[2])-Number(match[2])+1,col(match[3]||match[1])-col(match[1])+1);});const list={};for(const method of ['setBackground','setFontColor','setFontWeight','setFormula','setNumberFormat'])list[method]=value=>{ranges.forEach(range=>range[method](value));return list;};return list;},getRange(r,c,h=1,w=1){if(c+w-1>columns)throw Error('range outside Sheet');const sheet=this;const range={setNumberFormat(format){sheet.formats.push({r,c,h,w,format});return range;},setFontWeight(){return range;},setFontSize(){return range;},setFontColor(){return range;},setVerticalAlignment(){return range;},setFormula(formula){for(let i=0;i<h;i++){grid[r-1+i]??=[];for(let j=0;j<w;j++)grid[r-1+i][c-1+j]={value:'',formula};}return range;},setBackground(color){sheet.paints.push({r,c,h,w,color});return range;},setNote(){return range;},getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>grid[r-1+i]?.[c-1+j]?.date||grid[r-1+i]?.[c-1+j]?.value||'')),getDisplayValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>grid[r-1+i]?.[c-1+j]?.value||'')),getFormulas:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>grid[r-1+i]?.[c-1+j]?.formula||'')),setValues(values){values.forEach((row,i)=>row.forEach((value,j)=>{grid[r-1+i]??=[];const isDate=Object.prototype.toString.call(value)==='[object Date]';const text=isDate?value.toISOString().slice(0,10).split('-').reverse().join('/'):String(value);const quoted=!isDate&&text.startsWith("'");grid[r-1+i][c-1+j]={value:quoted?text.slice(1):text,formula:!quoted&&text.startsWith('=')?text:'',date:isDate?value:null};}));return range;},setValue(value){return range.setValues([[value]]);},clearContent(){return range.setValues(Array.from({length:h},()=>Array(w).fill('')));}};return range;}};}
 const book={getSpreadsheetTimeZone:()=> 'Asia/Ho_Chi_Minh',setActiveSheet(sheet){this.activeSheet=sheet;},getId:()=> 'test-sheet',getUrl:()=> 'https://docs.google.com/spreadsheets/d/test-sheet/edit',getSheetByName:n=>tabs.get(n),insertSheet:n=>{const sheet=tab(n);tabs.set(n,sheet);return sheet;}};
 let locked=false;
 const context=vm.createContext({console:{log:s=>logs.push(s)},PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties.get(k),setProperty:(k,v)=>properties.set(k,v)})},SpreadsheetApp:{create:()=>book,openById:()=>book,flush(){}},Utilities:{parseDate:(value,zone,format)=>{assert.equal(zone,'Asia/Ho_Chi_Minh');assert.equal(format,'yyyy-MM-dd');return new Date(value+'T00:00:00Z');},formatDate:(value,zone,format)=>{assert.equal(zone,'Asia/Ho_Chi_Minh');assert.equal(format,'yyyy-MM-dd');return value.toISOString().slice(0,10);},getUuid:()=>String(++serial).padStart(8,'0')+'-0000-4000-8000-000000000000',DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_a,s)=>[...createHash('sha256').update(s).digest()]},LockService:{getScriptLock:()=>({waitLock(){locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}})},ContentService:{MimeType:{JSON:'json'},createTextOutput:raw=>({raw,setMimeType(){return this;}})}});
 vm.runInContext(readFileSync(new URL('../integrations/google-sheets/Code.gs',import.meta.url),'utf8'),context);
 const run=s=>vm.runInContext(s,context);
 run('setupFamilySync()');const token=properties.get('FAMILY_TOKEN');
 const request=body=>{context.request=JSON.stringify({token,...body});return JSON.parse(run('doPost({postData:{contents:request}})').raw);};
 return {run,request,tabs,properties,logs,token,book};
}
test('Apps Script setup is repeatable and auth/core scope never disclose vault data',()=>{
 const s=script();s.run('setupFamilySync()');assert.equal(s.tabs.size,3);assert.equal(s.properties.get('FAMILY_TOKEN'),s.token);assert.ok(s.logs.every(line=>!line.includes(s.token)));
 assert.equal(s.request({action:'read',scope:'core',token:'wrong'}).code,'auth');
 const core=s.request({action:'read',scope:'core'});assert.equal(core.ok,true);assert.deepEqual(Object.keys(core.data),['families','members']);assert.equal('vault' in core.data,false);
});
test('sync diagnostics identify file/read errors without logging private exception contents',()=>{
 const s=script();s.run(`SpreadsheetApp.openById=()=>{const e=Error('Access denied FAKE_PRIVATE_PASSWORD');e.stack='Error: FAKE_PRIVATE_PASSWORD\\n    at doPost (Code:211:7)';throw e;};`);
 const denied=s.request({action:'read',scope:'core'});assert.equal(denied.code,'unavailable');assert.deepEqual(denied.diagnostic,{stage:'open_book',reason:'permission',line:211});
 assert.doesNotMatch(JSON.stringify(denied)+s.logs.join(' '),/FAKE_PRIVATE_PASSWORD/);
 const s2=script(),tab=s2.tabs.get('FamilySync_Family');tab.getRange=()=>{throw Error('FAKE_PRIVATE_PASSWORD');};
 const read=s2.request({action:'read',scope:'core'});assert.equal(read.diagnostic.stage,'read_families');assert.equal(read.diagnostic.reason,'unknown');
 assert.doesNotMatch(JSON.stringify(read)+s2.logs.join(' '),/FAKE_PRIVATE_PASSWORD/);
 const before=s2.logs.length,auth=s2.request({action:'read',scope:'core',token:'bad'});assert.equal(auth.code,'auth');assert.equal('diagnostic' in auth,false);assert.equal(s2.logs.length,before);
});
test('core write failures identify the customer operation and deferred Google flush separately',()=>{
 for(const deferred of [false,true]){
  const s=script(),data=groupedData(s),initial=s.request({action:'read',scope:'core'});
  assert.equal(s.request({action:'write',scope:'core',revision:initial.revision,data}).ok,true);
  const read=s.request({action:'read',scope:'core'});data.members[0].note='Customer update';
  if(deferred)s.run(`SpreadsheetApp.flush=()=>{throw Error('FAKE_PRIVATE_2FA');};`);
  else s.tabs.get('FamilySync_Khach').setFrozenRows=()=>{const e=Error('Cannot freeze part of a table FAKE_PRIVATE_2FA');e.stack='Error: FAKE_PRIVATE_2FA\n    at familyWriteGroups (Mã:123:4)';throw e;};
  const reply=s.request({action:'write',scope:'core',revision:read.revision,data});assert.equal(reply.ok,false);assert.equal(reply.code,'unavailable');assert.equal(reply.diagnostic.stage,deferred?'flush_write':'freeze_members');assert.equal(reply.diagnostic.reason,deferred?'unknown':'table');
  if(!deferred)assert.equal(reply.diagnostic.line,123);
  assert.doesNotMatch(JSON.stringify(reply)+s.logs.join(' '),/FAKE_PRIVATE_2FA/);
 }
});
test('renewing a customer skips unchanged Family rows whose formatting can fail at the next customer read',()=>{
 const s=script(),data=groupedData(s);let read=s.request({action:'read',scope:'core'});
 assert.equal(s.request({action:'write',scope:'core',revision:read.revision,data}).ok,true);
 const family=s.tabs.get('FamilySync_Family'),members=s.tabs.get('FamilySync_Khach');let pending=false,familyFormats=0;
 const familyRange=family.getRange.bind(family);family.getRange=(...args)=>{const range=familyRange(...args),format=range.setNumberFormat;range.setNumberFormat=value=>{if(args[0]>=2){pending=true;familyFormats++;}return format(value);};return range;};
 const memberRange=members.getRange.bind(members);members.getRange=(...args)=>{const range=memberRange(...args),display=range.getDisplayValues;range.getDisplayValues=()=>{if(pending){const error=Error('Delayed Family formatting failure');error.stack='Error: Delayed Family formatting failure\n    at familyGrouped (Code:23:1)';throw error;}return display();};return range;};
 read=s.request({action:'read',scope:'core'});data.members[0].joined_at='2026-11-18';data.members[0].expires_at='2027-02-18';
 const written=s.request({action:'write',scope:'core',revision:read.revision,data});assert.equal(written.ok,true,JSON.stringify(written));assert.equal(familyFormats,0,'unchanged Family is never reformatted during a customer renewal');
 const after=s.request({action:'read',scope:'core'});assert.equal(after.data.members[0].joined_at,'2026-11-18');assert.equal(after.data.members[0].expires_at,'2027-02-18');assert.deepEqual(after.data.families,data.families);
});
test('Family comparison ignores row/field order but still exports real edits and removal of an empty Family',()=>{
 const s=script(),data=groupedData(s);let read=s.request({action:'read',scope:'core'});assert.equal(s.request({action:'write',scope:'core',revision:read.revision,data}).ok,true);
 const family=s.tabs.get('FamilySync_Family'),getRange=family.getRange.bind(family);let writes=0;
 family.getRange=(...args)=>{const range=getRange(...args),setValues=range.setValues;range.setValues=values=>{if(args[0]>=2)writes++;return setValues(values);};return range;};
 data.families.reverse();data.families=data.families.map(row=>Object.fromEntries(Object.entries(row).reverse()));data.members[0].note='Changed customer';
 read=s.request({action:'read',scope:'core'});assert.equal(s.request({action:'write',scope:'core',revision:read.revision,data}).ok,true);assert.equal(writes,0);
 data.families.find(row=>row.id==='F1').note='Actual Family edit';data.families=data.families.filter(row=>row.id!=='F3');
 read=s.request({action:'read',scope:'core'});assert.equal(s.request({action:'write',scope:'core',revision:read.revision,data}).ok,true);assert.ok(writes>0);
 read=s.request({action:'read',scope:'core'});assert.equal(read.data.families.length,2);assert.equal(read.data.families.find(row=>row.id==='F1').note,'Actual Family edit');assert.equal(read.data.members[0].note,'Changed customer');
});
test('Family typed-column failures at flush stop before customers; converting to a normal range permits sync',()=>{
 const s=script(),data=groupedData(s),initial=s.request({action:'read',scope:'core'});assert.equal(s.request({action:'write',scope:'core',revision:initial.revision,data}).ok,true);
 const tab=s.tabs.get('FamilySync_Family'),getRange=tab.getRange.bind(tab),before=tab.grid.map(row=>row.map(cell=>cell?{...cell}:cell)),customers=JSON.stringify(s.tabs.get('FamilySync_Khach').grid);let typed=true;
 tab.getRange=(r,c,h=1,w=1)=>{const range=getRange(r,c,h,w),format=range.setNumberFormat;range.setNumberFormat=value=>{if(r>=2&&typed)tab.pending=true;return format(value);};return range;};
 s.run(`SpreadsheetApp.flush=()=>{if(SpreadsheetApp.openById('test-sheet').getSheetByName('FamilySync_Family').pending)throw Error('Cannot set number format in a typed column FAKE_PRIVATE');};`);
 const read=s.request({action:'read',scope:'core'});data.families[0].manager_email='new-owner@example.com';data.families[0].trial_date='2026-10-23';data.members[0].expires_at='2027-01-18';
 const blocked=s.request({action:'write',scope:'core',revision:read.revision,data});assert.equal(blocked.ok,false);assert.equal(blocked.diagnostic.stage,'write_families');assert.equal(blocked.diagnostic.reason,'table_column');assert.equal(JSON.stringify(s.tabs.get('FamilySync_Khach').grid),customers);assert.doesNotMatch(JSON.stringify(blocked)+s.logs.join(' '),/FAKE_PRIVATE/);
 tab.grid.splice(0,tab.grid.length,...before);typed=false;tab.pending=false;
 const retry=s.request({action:'read',scope:'core'});assert.equal(s.request({action:'write',scope:'core',revision:retry.revision,data}).ok,true);assert.deepEqual(s.request({action:'read',scope:'core'}).data,data);
});
test('a deferred failure writing changed Family data stops before reading or changing the customer tab',()=>{
 const s=script(),data=groupedData(s);let read=s.request({action:'read',scope:'core'});assert.equal(s.request({action:'write',scope:'core',revision:read.revision,data}).ok,true);
 read=s.request({action:'read',scope:'core'});const members=s.tabs.get('FamilySync_Khach'),before=JSON.stringify(members.grid);let familyWritten=false,readsAfterFamily=0;const getRange=members.getRange.bind(members),family=s.tabs.get('FamilySync_Family'),familyRange=family.getRange.bind(family);
 family.getRange=(...args)=>{const range=familyRange(...args),setValues=range.setValues;range.setValues=values=>{familyWritten=true;return setValues(values);};return range;};
 members.getRange=(...args)=>{if(familyWritten)readsAfterFamily++;return getRange(...args);};
 s.run(`SpreadsheetApp.flush=()=>{throw Error('Delayed Family operation failed');};`);data.families[0].note='Changed Family';
 const failed=s.request({action:'write',scope:'core',revision:read.revision,data});assert.equal(failed.ok,false);assert.equal(failed.diagnostic.stage,'write_families');assert.equal(JSON.stringify(members.grid),before);
 assert.equal(readsAfterFamily,0,'a failed Family flush prevents the later customer read');
});
test('diagnostic returns finite labels and only a numeric source line even for hostile errors',()=>{
 const s=script();
 const diagnostic=JSON.parse(s.run(`JSON.stringify(familySyncDiagnostic({message:'typed column FAKE_PRIVATE_PASSWORD',stack:'Error: FAKE_PRIVATE_PASSWORD\\n    at fn (Secret filename:321:4)'},'FAKE_PRIVATE_STAGE'))`));
 assert.deepEqual(diagnostic,{stage:'unknown',reason:'table_column',line:321});
 assert.doesNotMatch(JSON.stringify(diagnostic),/FAKE_PRIVATE|Secret filename/);
});
test('Apps Script issues stable IDs, rejects duplicate IDs/formulas and detects stale writes',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Family');tab.getRange(2,1,1,6).setValues([['','Gia đình Đặng','owner@example.com','','youtube','']]);
 const first=s.request({action:'read',scope:'core'});assert.ok(first.data.families[0].id.startsWith('new:'));assert.equal(s.request({action:'read',scope:'core'}).data.families[0].id,first.data.families[0].id);
 tab.getRange(2,6).setValue('Changed by user');assert.equal(s.request({action:'write',scope:'core',revision:first.revision,data:first.data}).code,'stale');assert.equal(tab.getRange(2,6).getDisplayValues()[0][0],'Changed by user');
 tab.getRange(3,1,1,6).setValues([[first.data.families[0].id,'Duplicate','other@example.com','','youtube','']]);assert.equal(s.request({action:'read',scope:'core'}).code,'id');tab.getRange(3,1,1,6).clearContent();tab.getRange(2,6).setValue('=IMPORTDATA("https://example.com")');assert.equal(s.request({action:'read',scope:'core'}).code,'formula');
});
test('Apps Script writes untrusted values literally, preserves apostrophes and keeps vault isolated',()=>{
 const s=script(),initial=s.request({action:'read',scope:'core'});const data={families:[{id:'F1',name:"'Quoted",manager_email:'owner@example.com',trial_date:'2026-10-17',service:'youtube',note:'=IMPORTDATA("https://example.com")'}],members:[]};
 assert.equal(s.request({action:'write',scope:'core',revision:initial.revision,data}).ok,true);const next=s.request({action:'read',scope:'core'});assert.deepEqual(next.data,data);
 const vault=s.request({action:'read',scope:'vault'});assert.deepEqual(vault.data,{vault:[]});assert.equal(s.request({action:'write',scope:'vault',revision:vault.revision,data:{vault:[{id:'K_F1',family_id:'F1',email:'owner@example.com',password:'=FAKE_PASSWORD',totp:'JBSWY3DPEHPK3PXP',recovery_email:'',label:'',note:'',trial_date:''}]}}).ok,true);
 assert.equal('vault' in s.request({action:'read',scope:'core'}).data,false);assert.equal(s.request({action:'read',scope:'vault'}).data.vault[0].password,'=FAKE_PASSWORD');
});
function groupedData(s){
 const families=['F1','F2','F3'].map((id,i)=>({id,name:'Family '+(i+1),manager_email:'owner'+i+'@example.com',trial_date:'2026-10-17',service:'youtube',note:''}));
 const fields=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.members.fields)'));
 const members=['M1','M2'].map((id,i)=>Object.fromEntries(fields.map(field=>[field,({id,family_id:'F'+(i+1),email:'guest'+i+'@example.com',customer_name:'Đặng Thị Hồng '+i,joined_at:'2026-10-17',expires_at:'2026-11-18',plan_months:'1',payment_status:'unpaid',amount:'0',membership_status:'unknown',renewal_status:'not_contacted',renewal_amount:'0',contact:'Zalo'}[field])||''])));
 return {families,members};
}
test('grouped customer Sheet shows Family blocks and dd/mm/yyyy while preserving the PHP wire schema',()=>{
 const s=script(),data=groupedData(s),initial=s.request({action:'read',scope:'core'});
 assert.equal(s.request({action:'write',scope:'core',revision:initial.revision,data}).ok,true);
 const tab=s.tabs.get('FamilySync_Khach');assert.equal(tab.getRange(3,1).getDisplayValues()[0][0],'Family 1');assert.equal(tab.getRange(4,1).getDisplayValues()[0][0],'owner0@example.com');assert.equal(tab.getRange(5,4).getDisplayValues()[0][0],'17/10/2026');assert.equal(tab.getRange(5,5).getDisplayValues()[0][0],'18/11/2026');assert.equal(tab.getRange(5,3).getDisplayValues()[0][0],'1 tháng');assert.equal(tab.getRange(5,8).getDisplayValues()[0][0],'M1');assert.match(tab.getRange(5,6).getFormulas()[0][0],/TODAY\(\)/);
 const current=s.request({action:'read',scope:'core'});assert.equal(current.ok,true);assert.deepEqual(current.data,data);assert.equal(current.data.members.length,2,'empty Family placeholder does not create a customer');
 tab.getRange(5,4).setValue('31/01/2026');tab.getRange(5,5).setValue('28/02/2026');tab.getRange(5,7).setValue('Contact đã sửa');const edited=s.request({action:'read',scope:'core'});assert.equal(edited.data.members[0].joined_at,'2026-01-31');assert.equal(edited.data.members[0].expires_at,'2026-02-28');assert.equal(edited.data.members[0].contact,'Contact đã sửa');
 assert.equal(s.request({action:'write',scope:'core',revision:current.revision,data}).code,'stale');
 tab.getRange(5,6).setValue('=IMPORTDATA("https://example.com")');assert.equal(s.request({action:'read',scope:'core'}).code,'formula');
});
test('new customer in a Family block inherits the Family ID; duplicate IDs and bad date formats are rejected',()=>{
 const s=script(),data=groupedData(s);let read=s.request({action:'read',scope:'core'});s.request({action:'write',scope:'core',revision:read.revision,data});
 const tab=s.tabs.get('FamilySync_Khach');tab.getRange(6,1,1,7).setValues([['Khách mới','new@example.com','1 năm','1/2/2026','01/02/2027','','Contact']]);
 read=s.request({action:'read',scope:'core'});assert.equal(read.ok,true);const row=read.data.members.find(m=>m.email==='new@example.com');assert.equal(row.family_id,'F1');assert.ok(row.id.startsWith('new:'));assert.equal(row.plan_months,'12');assert.equal(row.joined_at,'2026-02-01');assert.equal(s.request({action:'read',scope:'core'}).data.members.find(m=>m.email===row.email).id,row.id);
 tab.getRange(6,8).setValue('M1');assert.equal(s.request({action:'read',scope:'core'}).code,'id');tab.getRange(6,8).setValue(row.id);tab.getRange(6,4).setValue('02-01-26');assert.equal(s.request({action:'read',scope:'core'}).code,'data');
});
test('legacy flat customer tab remains readable and migrates to grouped layout without losing edits or IDs',()=>{
 const s=script(),data=groupedData(s);let read=s.request({action:'read',scope:'core'});s.request({action:'write',scope:'core',revision:read.revision,data});
 const tab=s.tabs.get('FamilySync_Khach'),spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.members)'));tab.grid.length=0;tab.insertColumnsAfter(tab.getMaxColumns(),spec.headers.length-tab.getMaxColumns());tab.getRange(1,1,1,spec.headers.length).setValues([spec.headers]);tab.getRange(2,1,data.members.length,spec.fields.length).setValues(data.members.map(m=>spec.fields.map(f=>"'"+m[f])));
 read=s.request({action:'read',scope:'core'});assert.equal(read.ok,true);assert.deepEqual(read.data,data);read.data.members[0].note='Giữ ghi chú từ bố cục cũ';assert.equal(s.request({action:'write',scope:'core',revision:read.revision,data:read.data}).ok,true);
 assert.equal(tab.getRange(1,1).getDisplayValues()[0][0],'Khách theo Family');const next=s.request({action:'read',scope:'core'});assert.equal(next.data.members[0].note,'Giữ ghi chú từ bố cục cũ');assert.equal(next.data.members[0].id,'M1');assert.equal(tab.getRange(5,4).getDisplayValues()[0][0],'17/10/2026');
});

test('public Apps Script health identifies the deployed version without disclosing the token or Sheet',()=>{
 const s=script(),info=JSON.parse(s.run('doGet()').raw);assert.equal(info.script_version,'family-groups-compact-v5.7');assert.equal(info.service,'family-sync');assert.equal('token' in info,false);assert.equal('sheet_url' in info,false);assert.equal(JSON.stringify(info).includes(s.token),false);
});

test('owner-run migration changes the existing customer tab directly, backs up the old layout and preserves all wire data',()=>{
 const s=script(),data=groupedData(s);let read=s.request({action:'read',scope:'core'});s.request({action:'write',scope:'core',revision:read.revision,data});
 const tab=s.tabs.get('FamilySync_Khach'),spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.members)'));tab.grid.length=0;tab.insertColumnsAfter(tab.getMaxColumns(),spec.headers.length-tab.getMaxColumns());tab.getRange(1,1,1,spec.headers.length).setValues([spec.headers]);tab.getRange(2,1,data.members.length,spec.fields.length).setValues(data.members.map(m=>spec.fields.map(f=>"'"+m[f])));
 const original=JSON.stringify(tab.grid),familyBefore=JSON.stringify(s.tabs.get('FamilySync_Family').grid),vaultBefore=JSON.stringify(s.tabs.get('FamilySync_Kho').grid),tokenBefore=s.properties.get('FAMILY_TOKEN');
 const result=JSON.parse(JSON.stringify(s.run('apDungBoCucKhach()')));assert.equal(result.ok,true);assert.equal(result.customers,2);assert.equal(result.families,3);assert.equal(s.tabs.get('FamilySync_Khach'),tab,'original tab/gid retained');assert.equal(s.book.activeSheet,tab);
 const backup=s.tabs.get(result.backup);assert.ok(backup);assert.equal(backup.hidden,true);assert.equal(JSON.stringify(backup.grid),original,'backup includes exact pre-migration cells');assert.equal(JSON.stringify(s.tabs.get('FamilySync_Family').grid),familyBefore);assert.equal(JSON.stringify(s.tabs.get('FamilySync_Kho').grid),vaultBefore);assert.equal(s.properties.get('FAMILY_TOKEN'),tokenBefore);
 assert.equal(tab.getRange(5,4).getDisplayValues()[0][0],'17/10/2026');assert.equal(tab.getRange(5,5).getDisplayValues()[0][0],'18/11/2026');assert.deepEqual(s.request({action:'read',scope:'core'}).data,data);
});
test('owner-run migration retains the backup and does not report success after a formatting failure',()=>{
 const s=script(),data=groupedData(s);let read=s.request({action:'read',scope:'core'});s.request({action:'write',scope:'core',revision:read.revision,data});const tab=s.tabs.get('FamilySync_Khach'),before=JSON.stringify(tab.grid);tab.getRangeList=()=>{throw Error('simulated Google failure');};
 assert.throws(()=>s.run('apDungBoCucKhach()'),/Chưa hoàn tất/);const backups=[...s.tabs].filter(([name])=>name.startsWith('Khach_du_phong_'));assert.equal(backups.length,1);assert.equal(JSON.stringify(backups[0][1].grid),before);assert.equal(s.logs.some(line=>line.startsWith('HOÀN TẤT')),false);
});

test('each Family has its own yellow title, green owner header and blue member rows in the same tab',()=>{
 const s=script(),data=groupedData(s),read=s.request({action:'read',scope:'core'});assert.equal(s.request({action:'write',scope:'core',revision:read.revision,data}).ok,true);
 const tab=s.tabs.get('FamilySync_Khach');const colorAt=(row,col)=>tab.paints.filter(p=>row>=p.r&&row<p.r+p.h&&col>=p.c&&col<p.c+p.w).at(-1)?.color;
 for(const [title,header,member,familyId,memberId] of [[3,4,5,'F1','M1'],[7,8,9,'F2','M2']]){assert.equal(colorAt(title,1),'#fff176');assert.equal(colorAt(header,1),'#34e83b');assert.equal(colorAt(member,1),'#b7d5ee');assert.equal(tab.getRange(member,9).getDisplayValues()[0][0],familyId);assert.equal(tab.getRange(member,8).getDisplayValues()[0][0],memberId);}
 assert.equal(colorAt(6,1),'#ffffff','blank row separates Families');
});

test('compact Sheet keeps seven visible columns, stores real dates and generates a locale-independent expiry minus TODAY minus two formula',()=>{
 const s=script(),data=groupedData(s),read=s.request({action:'read',scope:'core'});data.members[1].expires_at='';
 assert.equal(s.request({action:'write',scope:'core',revision:read.revision,data}).ok,true);
 const tab=s.tabs.get('FamilySync_Khach');assert.equal(tab.getMaxColumns(),11);assert.deepEqual(tab.visibleColumns,{start:1,count:7});assert.deepEqual(tab.hiddenColumns,{start:8,count:4});
 assert.deepEqual(tab.getRange(2,1,1,7).getDisplayValues()[0],['Tên khách','Email khách','Gói mua','Ngày mua','Ngày hết hạn','Còn ngày','Contact']);
 assert.ok(tab.grid[4][3].date instanceof Date);assert.ok(tab.grid[4][4].date instanceof Date,'expiry is a date value, not a dd/mm string');assert.equal(tab.grid[8][4].date,null,'empty expiry remains empty');
 assert.ok(tab.formats.some(f=>f.r===5&&f.c===4&&f.w===2&&f.format==='dd/mm/yyyy'));
 const formula=tab.getRange(5,6).getFormulas()[0][0];assert.match(formula,/-TODAY\(\)-2/);assert.doesNotMatch(formula,/[,;]/,'no spreadsheet locale dependent separators');assert.match(formula,/IFERROR/);assert.match(formula, /<>""/,'empty dates do not show a negative countdown');
 assert.deepEqual(s.request({action:'read',scope:'core'}).data,data);
});
function legacyGrouped(s,data,semicolon=false){
 const tab=s.tabs.get('FamilySync_Khach'),headers=JSON.parse(s.run('JSON.stringify(FAMILY_LEGACY_GROUP_HEADERS)')),fields=JSON.parse(s.run('JSON.stringify(FAMILY_LEGACY_GROUP_FIELDS)'));tab.grid.length=0;
 if(tab.getMaxColumns()<18)tab.insertColumnsAfter(tab.getMaxColumns(),18-tab.getMaxColumns());
 const output=[Array(18).fill(''),headers];output[0][0]='Khách theo Family';
 for(const family of data.families){const header=headers.slice();header[0]=family.manager_email;header[1]=family.name;header[15]='';header[16]=family.id;header[17]='family';output.push(header);
 for(const member of data.members.filter(m=>m.family_id===family.id)){const row=Array(18).fill('');fields.forEach((f,col)=>{if(f)row[col]=member[f];});row[17]='member';output.push(row);}}
 tab.getRange(1,1,output.length,18).setValues(output.map(row=>row.map(v=>"'"+v)));
 const formula=s.run('FAMILY_LEGACY_DAYS_FORMULA');for(let i=2;i<output.length;i++)if(output[i][17]==='member'){tab.grid[i][5]={value:'#ERROR!',formula:semicolon?formula.replaceAll(',',';'):formula};}
 return tab;
}
test('existing grouped layout with formula errors migrates without losing any removed payment, membership, note or renewal fields',()=>{
 for(const semicolon of [false,true]){
  const s=script(),data=groupedData(s),read=s.request({action:'read',scope:'core'});
  Object.assign(data.members[0],{payment_status:'paid',amount:'165000',membership_status:'active',note:"'Giữ ghi chú\n=IMPORTDATA(\"https://example.com\")",renewal_status:'partial',renewal_amount:'50000',renewal_paid_at:'2026-10-16',renewal_note:'Đã nhận một phần'});
  s.request({action:'write',scope:'core',revision:read.revision,data});const tab=legacyGrouped(s,data,semicolon),before=JSON.stringify(tab.grid);
  assert.deepEqual(s.request({action:'read',scope:'core'}).data,data);
  const result=JSON.parse(JSON.stringify(s.run('apDungBoCucKhach()')));assert.equal(result.ok,true);assert.equal(JSON.stringify(s.tabs.get(result.backup).grid),before);assert.equal(tab.getMaxColumns(),11);
  assert.deepEqual(s.request({action:'read',scope:'core'}).data,data);
  tab.getRange(5,1).setValue('Đổi tên từ Sheet');tab.getRange(5,7).setValue('Đổi Contact');const edited=s.request({action:'read',scope:'core'});assert.equal(edited.ok,true);const member=edited.data.members[0];
  assert.equal(member.customer_name,'Đổi tên từ Sheet');assert.equal(member.contact,'Đổi Contact');for(const field of JSON.parse(s.run('JSON.stringify(FAMILY_BACKING_FIELDS)')))assert.equal(member[field],data.members[0][field],field+' retained when editing visible fields');
  assert.equal(s.request({action:'write',scope:'core',revision:edited.revision,data:edited.data}).ok,true);assert.deepEqual(s.request({action:'read',scope:'core'}).data,edited.data);
  assert.equal(s.run('apDungBoCucKhach().ok'),true,'migration can run again on compact layout');
 }
});
test('damaged hidden metadata fails instead of clearing payments; invalid expiry fails before rewriting the customer tab',()=>{
 const s=script(),data=groupedData(s),read=s.request({action:'read',scope:'core'});data.members[0].payment_status='paid';data.members[0].amount='165000';s.request({action:'write',scope:'core',revision:read.revision,data});
 const tab=s.tabs.get('FamilySync_Khach'),metadata=tab.getRange(5,11).getDisplayValues()[0][0];
 for(const value of ['', '{}', '{"amount":0}', '{bad json']){tab.getRange(5,11).setValue(value);assert.equal(s.request({action:'read',scope:'core'}).code,'schema');}
 tab.getRange(5,11).setValue(metadata);const current=s.request({action:'read',scope:'core'});assert.deepEqual(current.data,data);
 data.members[0].expires_at='2026-02-30';const before=JSON.stringify(tab.grid);assert.equal(s.request({action:'write',scope:'core',revision:current.revision,data}).code,'data');assert.equal(JSON.stringify(tab.grid),before);
});

const vaultRow=(extra={})=>({id:'K_F1',family_id:'F1',email:'owner@example.com',password:'FAKE_PRIVATE_PASSWORD',totp:'JBSWY3DPEHPK3PXP',recovery_email:'recovery@example.com',label:'',note:'FAKE_PRIVATE_NOTE',trial_date:'2026-10-18',...extra});
test('cleared vault input rows with leftover hidden IDs do not block reading or replacing an owner email',()=>{
 for(const clearedId of ['new:cleared-test','K_F2']){
  const s=script(),tab=s.tabs.get('FamilySync_Kho'),first=s.request({action:'read',scope:'vault'}),original=vaultRow();
  assert.equal(s.request({action:'write',scope:'vault',revision:first.revision,data:{vault:[original]}}).ok,true);
  tab.getRange(50,1,1,9).setValues([['18/10/2026','test@example.com','FAKE_TEST_PASSWORD','','','','',clearedId,clearedId==='K_F2'?'F2':'']]);
  tab.getRange(50,1,1,7).clearContent();const cleared=JSON.stringify(tab.grid[49]);
  const read=s.request({action:'read',scope:'vault'});
  assert.equal(read.ok,true,JSON.stringify(read));assert.deepEqual(read.data.vault,[original]);assert.equal(JSON.stringify(tab.grid[49]),cleared,'read leaves hidden metadata untouched');
  assert.deepEqual(read.row_locations,{K_F1:2});
  const replacement=vaultRow({email:'replacement@example.com',password:'',totp:'',recovery_email:'',note:'',trial_date:'2026-10-23'});
  assert.equal(s.request({action:'write',scope:'vault',revision:read.revision,data:{vault:[replacement]}}).ok,true);
  assert.deepEqual(s.request({action:'read',scope:'vault'}).data.vault,[replacement]);
  assert.equal(tab.getRange(50,1,1,9).getDisplayValues()[0].every(value=>value===''),true);
 }
});
test('legacy vault ignores metadata-only rows while partially filled account rows still fail',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho'),spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.vault)')),account=vaultRow({trial_date:''});
 tab.grid.length=0;tab.getRange(1,1,1,8).setValues([spec.headers]);tab.getRange(2,1,1,8).setValues([spec.fields.map(field=>"'"+account[field])]);
 tab.getRange(50,1,1,8).setValues([['new:cleared-test','','','','','','','']]);
 let read=s.request({action:'read',scope:'vault'});assert.equal(read.ok,true,JSON.stringify(read));assert.deepEqual(read.data.vault,[account]);
 tab.getRange(50,4).setValue('FAKE_REMAINING_PASSWORD');read=s.request({action:'read',scope:'vault'});assert.equal(read.code,'vault_email');assert.deepEqual(read.location,{tab:'FamilySync_Kho',row:50,column:3});
 assert.doesNotMatch(JSON.stringify(read)+s.logs.join(' '),/FAKE_REMAINING_PASSWORD/);
});
test('vault clearing never hides invalid partial rows or formulas with empty display values',()=>{
 for(const column of [1,3,4,5,6,7]){
  const s=script(),tab=s.tabs.get('FamilySync_Kho');tab.getRange(50,8).setValue('new:cleared-test');tab.getRange(50,column).setValue('FAKE_PARTIAL_VALUE');
  const reply=s.request({action:'read',scope:'vault'});assert.equal(reply.code,'vault_email');assert.deepEqual(reply.location,{tab:'FamilySync_Kho',row:50,column:2});assert.doesNotMatch(JSON.stringify(reply),/FAKE_PARTIAL_VALUE/);
 }
 const s=script(),tab=s.tabs.get('FamilySync_Kho');tab.getRange(50,8).setValue('new:cleared-test');tab.getRange(50,3).setFormula('=""');
 const reply=s.request({action:'read',scope:'vault'});assert.equal(reply.code,'formula');assert.equal(reply.location.column,3);
});
test('vault entry accepts a pasted account batch, keeps secrets literal, allocates stable hidden IDs and discloses nothing to core scope',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho');assert.deepEqual(tab.hiddenColumns,{start:8,count:2});assert.equal(tab.getRange(1,2).getDisplayValues()[0][0],'Email');
 tab.getRange(2,1,2,7).setValues([['18/10/2026','NEW@example.com','012345FAKE','jbsw y3dp ehpk 3pxp','recovery@example.com','trial 10h34','Family thử'],['19/10/2026','second@example.com',"'=FAKE_LITERAL",'','','','']]);
 const first=s.request({action:'read',scope:'vault'});assert.equal(first.ok,true);assert.equal(first.vault_schema,'trial-date-v1');assert.equal(first.data.vault.length,2);const account=first.data.vault.find(row=>row.email==='new@example.com');assert.ok(account.id.startsWith('new:'));assert.equal(account.family_id,'');assert.equal(account.trial_date,'2026-10-18');assert.equal(account.password,'012345FAKE');assert.equal(first.row_locations[account.id],2);
 const second=s.request({action:'read',scope:'vault'});assert.deepEqual(second.data,first.data);assert.equal(tab.getRange(2,8).getDisplayValues()[0][0],account.id);assert.equal(s.request({action:'read',scope:'core'}).data.vault,undefined);assert.ok(s.logs.every(line=>!line.includes('012345FAKE')&&!line.includes('jbsw')));
 assert.equal(s.request({action:'write',scope:'vault',revision:first.revision,data:first.data}).ok,true);assert.deepEqual(s.request({action:'read',scope:'vault'}).data,first.data);
});
test('invalid date, duplicate email and credential formulas report safe vault cell locations before assigning any IDs',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho');
 tab.getRange(2,1,1,7).setValues([['18/10','new@example.com','FAKE_PASSWORD','','','','']]);let result=s.request({action:'read',scope:'vault'});assert.equal(result.code,'vault_date');assert.deepEqual(result.location,{tab:'FamilySync_Kho',row:2,column:1});assert.equal(tab.getRange(2,8).getDisplayValues()[0][0],'');
 tab.getRange(2,1).setValue('30/02/2026');assert.equal(s.request({action:'read',scope:'vault'}).code,'vault_date');
 tab.getRange(2,1).setValue('18/10/2026');tab.getRange(3,1,1,7).setValues([['18/10/2026',' NEW@example.com ','FAKE_OTHER','','','','']]);result=s.request({action:'read',scope:'vault'});assert.equal(result.code,'vault_email');assert.equal(result.location.row,3);assert.equal(tab.getRange(2,8).getDisplayValues()[0][0],'');
 tab.getRange(3,1,1,9).clearContent();tab.getRange(2,3).setFormula('=IMPORTDATA("https://example.com/FAKE_PRIVATE")');result=s.request({action:'read',scope:'vault'});assert.equal(result.code,'formula');assert.equal(result.location.column,3);assert.equal(JSON.stringify(result).includes('FAKE_PRIVATE'),false);
});
test('a real date displayed without year still imports its full year and existing ID/email bindings are retained',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho');tab.getRange(2,1,1,9).setValues([[new Date('2026-10-18T00:00:00Z'),'owner@example.com','FAKE','','','','','K_F1','F1']]);tab.grid[1][0].value='18/10';
 const read=s.request({action:'read',scope:'vault'});assert.equal(read.ok,true);assert.equal(read.data.vault[0].trial_date,'2026-10-18');assert.equal(read.data.vault[0].id,'K_F1');
});
test('legacy vault layout migrates in place with encrypted-account fields, Family trial, backup and hidden IDs preserved',()=>{
 const s=script(),core=s.request({action:'read',scope:'core'}),data=groupedData(s);data.families[0].manager_email='owner@example.com';s.request({action:'write',scope:'core',revision:core.revision,data});
 const tab=s.tabs.get('FamilySync_Kho'),spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.vault)')),account=vaultRow({trial_date:'2026-10-17'});tab.grid.length=0;tab.getRange(1,1,1,8).setValues([spec.headers]);tab.getRange(2,1,1,8).setValues([spec.fields.map(field=>"'"+account[field])]);
 const before=JSON.stringify(tab.grid),coreBefore=JSON.stringify(s.tabs.get('FamilySync_Khach').grid),familiesBefore=JSON.stringify(s.tabs.get('FamilySync_Family').grid);const read=s.request({action:'read',scope:'vault'});assert.equal(read.ok,true);assert.equal(read.vault_layout,'legacy');assert.deepEqual(read.data.vault,[account]);
 const result=JSON.parse(JSON.stringify(s.run('apDungBoCucKho()')));assert.equal(result.ok,true);assert.equal(result.vault_layout,'entry');assert.equal(result.sheet_url,'https://docs.google.com/spreadsheets/d/test-sheet/edit#gid=3');assert.ok(s.logs.some(line=>line.startsWith('ĐÃ XÁC NHẬN BỐ CỤC MỚI')));assert.equal(s.tabs.get('FamilySync_Kho'),tab);assert.equal(JSON.stringify(s.tabs.get(result.backup).grid),before);assert.equal(s.tabs.get(result.backup).hidden,true);assert.deepEqual(tab.hiddenColumns,{start:8,count:2});
 assert.deepEqual(s.request({action:'read',scope:'vault'}).data,read.data);assert.equal(s.request({action:'read',scope:'vault'}).vault_layout,'entry');assert.equal(JSON.stringify(s.tabs.get('FamilySync_Khach').grid),coreBefore);assert.equal(JSON.stringify(s.tabs.get('FamilySync_Family').grid),familiesBefore);assert.equal(tab.grid[1][0].date instanceof Date,true);
});

test('legacy vault migration reads a real Family trial date and dd/mm/yyyy text without changing the Family sheet',()=>{
 for(const date of [new Date('2026-10-18T00:00:00Z'),'18/10/2026']){
  const s=script(),family=s.tabs.get('FamilySync_Family'),tab=s.tabs.get('FamilySync_Kho'),spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.vault)')),account=vaultRow();
  family.getRange(2,1,1,6).setValues([['F1','Family 1','owner@example.com',date,'youtube','']]);tab.grid.length=0;tab.getRange(1,1,1,8).setValues([spec.headers]);tab.getRange(2,1,1,8).setValues([spec.fields.map(field=>"'"+account[field])]);
  const before=JSON.stringify(family.grid);assert.equal(s.run('apDungBoCucKho().ok'),true);assert.equal(JSON.stringify(family.grid),before);assert.deepEqual(s.request({action:'read',scope:'vault'}).data.vault,[account]);assert.equal(s.request({action:'read',scope:'core'}).data.families[0].trial_date,'2026-10-18');
 }
});

test('vault preflight is read-only even with new rows requiring IDs and reports invalid Family dates safely',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho'),family=s.tabs.get('FamilySync_Family');tab.getRange(2,1,1,7).setValues([['18/10/2026','new@example.com','FAKE_PRIVATE_PASSWORD','JBSWY3DPEHPK3PXP','','','']]);
 const snapshot=()=>JSON.stringify([...s.tabs].map(([name,t])=>[name,t.grid,t.formats]));let before=snapshot();const result=s.run('kiemTraBoCucKho()');assert.equal(result.ok,true);assert.equal(result.rows,1);assert.equal(snapshot(),before);assert.equal(tab.getRange(2,8).getDisplayValues()[0][0],'');
 const spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.vault)'));tab.grid.length=0;tab.getRange(1,1,1,8).setValues([spec.headers]);tab.getRange(2,1,1,8).setValues([['','','owner@example.com','FAKE_PRIVATE_PASSWORD','JBSWY3DPEHPK3PXP','','','']]);family.getRange(2,1,1,6).setValues([['F1','Family 1','owner@example.com','18/10','youtube','']]);before=snapshot();
 assert.throws(()=>s.run('kiemTraBoCucKho()'),error=>{assert.match(error.message,/FamilySync_Family, dòng 2, cột 4/);assert.match(error.message,/đọc dữ liệu và ngày trial/);assert.doesNotMatch(error.message,/FAKE_PRIVATE_PASSWORD|JBSWY3DPEHPK3PXP/);return true;});assert.equal(snapshot(),before);
});
test('vault style failures report the exact operation without hiding data verification or leaking Google exception values',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho'),spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.vault)')),family=s.tabs.get('FamilySync_Family');family.getRange(2,1,1,6).setValues([['F1','Family 1','owner@example.com','2026-10-18','youtube','']]);tab.grid.length=0;tab.getRange(1,1,1,8).setValues([spec.headers]);tab.getRange(2,1,1,8).setValues([spec.fields.map(field=>"'"+vaultRow()[field])]);const before=JSON.stringify(tab.grid);
 tab.setColumnWidths=()=>{throw Error('Google exception containing FAKE_PRIVATE_PASSWORD and JBSWY3DPEHPK3PXP');};
 const result=JSON.parse(JSON.stringify(s.run('apDungBoCucKho()')));assert.equal(result.ok,true);assert.equal(result.data_verified,true);assert.equal(result.layout_complete,false);assert.equal(result.layout_warnings.length,1);assert.equal(result.layout_warnings[0].step,'độ rộng cột C:E');
 assert.deepEqual(s.request({action:'read',scope:'vault'}).data.vault,[vaultRow()]);const backups=[...s.tabs].filter(([name])=>name.startsWith('Kho_du_phong_'));assert.equal(backups.length,1);assert.equal(JSON.stringify(backups[0][1].grid),before);assert.equal(s.logs.some(line=>line.startsWith('HOÀN TẤT')),false);assert.ok(s.logs.some(line=>line.startsWith('DỮ LIỆU ĐÃ ĐỐI CHIẾU KHỚP')));assert.doesNotMatch(s.logs.join(' ')+' '+JSON.stringify(result),/FAKE_PRIVATE_PASSWORD|JBSWY3DPEHPK3PXP/);
});
test('invalid legacy trial stops before rewriting vault headers and retains the original account cells',()=>{
 const s=script(),family=s.tabs.get('FamilySync_Family'),tab=s.tabs.get('FamilySync_Kho'),spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.vault)'));family.getRange(2,1,1,6).setValues([['F1','Family 1','owner@example.com','18/10','youtube','']]);tab.grid.length=0;tab.getRange(1,1,1,8).setValues([spec.headers]);tab.getRange(2,1,1,8).setValues([spec.fields.map(field=>"'"+vaultRow()[field])]);const before=JSON.stringify(tab.grid);
 assert.throws(()=>s.run('apDungBoCucKho()'),/FamilySync_Family, dòng 2, cột 4/);assert.equal(JSON.stringify(tab.grid),before);
});

test('freezing or hiding failures keep account values verified and report explicit incomplete presentation',()=>{
 for(const [method,step] of [['setFrozenRows','cố định hàng 1'],['showColumns','hiện cột nhập A:G'],['hideColumns','ẩn cột ID H:I']]){
  const s=script(),tab=s.tabs.get('FamilySync_Kho'),first=s.request({action:'read',scope:'vault'}),data={vault:[vaultRow()]};assert.equal(s.request({action:'write',scope:'vault',revision:first.revision,data}).ok,true);
  tab[method]=()=>{throw Error('protected range contains FAKE_PRIVATE_PASSWORD');};const result=JSON.parse(JSON.stringify(s.run('apDungBoCucKho()')));
  assert.equal(result.data_verified,true);assert.equal(result.layout_complete,false);assert.equal(result.layout_warnings.length,1);assert.equal(result.layout_warnings[0].step,step);assert.equal(result.layout_warnings[0].reason,'Quyền chỉnh sửa hoặc phạm vi được bảo vệ');assert.deepEqual(s.request({action:'read',scope:'vault'}).data,data);assert.doesNotMatch(JSON.stringify(result)+s.logs.join(' '),/FAKE_PRIVATE_PASSWORD/);
 }
});
test('column visibility uses single-column fallbacks when batch methods fail',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho');let shown=0,hidden=0;tab.showColumns=()=>{throw new TypeError('batch show unavailable');};tab.hideColumns=()=>{throw new TypeError('batch hide unavailable');};tab.unhideColumn=()=>shown++;tab.hideColumn=()=>hidden++;
 const result=JSON.parse(JSON.stringify(s.run('apDungBoCucKho()')));assert.equal(result.data_verified,true);assert.equal(result.layout_complete,true);assert.equal(shown,7);assert.equal(hidden,2);assert.deepEqual(result.layout_warnings,[]);
});
test('vault write and verification failures remain fatal when presentation is optional',()=>{
 for(const mismatch of [false,true]){
  const s=script(),tab=s.tabs.get('FamilySync_Kho'),first=s.request({action:'read',scope:'vault'}),data={vault:[vaultRow()]};s.request({action:'write',scope:'vault',revision:first.revision,data});const before=JSON.stringify(tab.grid),getRange=tab.getRange.bind(tab);
  tab.getRange=(r,c,h=1,w=1)=>{const range=getRange(r,c,h,w),setValues=range.setValues.bind(range);if(r===2&&c===1&&w===9)range.setValues=values=>{if(!mismatch)throw Error('Google data error FAKE_PRIVATE_PASSWORD');const result=setValues(values);tab.grid[1][5].value='Changed by failed write';return result;};return range;};
  assert.throws(()=>s.run('apDungBoCucKho()'),error=>{assert.match(error.message,mismatch?/đối chiếu dữ liệu/:/ghi tài khoản/);assert.doesNotMatch(error.message,/FAKE_PRIVATE_PASSWORD/);return true;});assert.equal(s.logs.some(line=>line.startsWith('HOÀN TẤT')||line.startsWith('DỮ LIỆU ĐÃ ĐỐI CHIẾU KHỚP')),false);const backups=[...s.tabs].filter(([name])=>name.startsWith('Kho_du_phong_'));assert.equal(JSON.stringify(backups[0][1].grid),before);
 }
});
test('vault API returns safe presentation warnings while preserving the synchronized payload',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho'),read=s.request({action:'read',scope:'vault'});tab.setFrozenRows=()=>{throw Error('protected FAKE_PRIVATE_PASSWORD');};const data={vault:[vaultRow()]},written=s.request({action:'write',scope:'vault',revision:read.revision,data});assert.equal(written.ok,true);assert.equal(written.layout_warnings[0].step,'cố định hàng 1');assert.doesNotMatch(JSON.stringify(written),/FAKE_PRIVATE_PASSWORD/);assert.deepEqual(s.request({action:'read',scope:'vault'}).data,data);
});

test('vault migration rejects a legacy header restored after writing even when all account data still matches',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho'),family=s.tabs.get('FamilySync_Family'),spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.vault)'));family.getRange(2,1,1,6).setValues([['F1','Family 1','owner@example.com','2026-10-18','youtube','']]);tab.grid.length=0;tab.getRange(1,1,1,8).setValues([spec.headers]);tab.getRange(2,1,1,8).setValues([spec.fields.map(field=>"'"+vaultRow()[field])]);
 s.run(`SpreadsheetApp.flush=function(){const tab=SpreadsheetApp.openById('test-sheet').getSheetByName('FamilySync_Kho');tab.grid.length=0;tab.getRange(1,1,1,8).setValues([FAMILY_TABS.vault.headers]);tab.getRange(2,1,1,8).setValues([['K_F1','F1','owner@example.com','FAKE_PRIVATE_PASSWORD','JBSWY3DPEHPK3PXP','recovery@example.com','','FAKE_PRIVATE_NOTE']]);};`);
 assert.throws(()=>s.run('apDungBoCucKho()'),/xác nhận bố cục Kho/);assert.equal(s.logs.some(line=>line.startsWith('HOÀN TẤT')||line.startsWith('DỮ LIỆU ĐÃ ĐỐI CHIẾU KHỚP')),false);
});

test('vault API never acknowledges a layout write that reverts to legacy headers',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho'),family=s.tabs.get('FamilySync_Family');family.getRange(2,1,1,6).setValues([['F1','Family 1','owner@example.com','2026-10-18','youtube','']]);const first=s.request({action:'read',scope:'vault'});assert.equal(s.request({action:'write',scope:'vault',revision:first.revision,data:{vault:[vaultRow()]}}).ok,true);const read=s.request({action:'read',scope:'vault'});
 s.run(`SpreadsheetApp.flush=function(){const tab=SpreadsheetApp.openById('test-sheet').getSheetByName('FamilySync_Kho');tab.grid.length=0;tab.getRange(1,1,1,8).setValues([FAMILY_TABS.vault.headers]);tab.getRange(2,1,1,8).setValues([['K_F1','F1','owner@example.com','FAKE_PRIVATE_PASSWORD','JBSWY3DPEHPK3PXP','recovery@example.com','','FAKE_PRIVATE_NOTE']]);};`);
 const result=s.request({action:'write',scope:'vault',revision:read.revision,data:read.data});assert.equal(result.ok,false);assert.equal(result.code,'schema');assert.deepEqual(result.location,{tab:'FamilySync_Kho',row:1,column:1});assert.doesNotMatch(JSON.stringify(result),/FAKE_PRIVATE_PASSWORD|JBSWY3DPEHPK3PXP/);
});

test('account values are flushed and verified before a failing presentation call can discard pending writes',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho'),family=s.tabs.get('FamilySync_Family'),spec=JSON.parse(s.run('JSON.stringify(FAMILY_TABS.vault)'));family.getRange(2,1,1,6).setValues([['F1','Family 1','owner@example.com','2026-10-18','youtube','']]);tab.grid.length=0;tab.getRange(1,1,1,8).setValues([spec.headers]);tab.getRange(2,1,1,8).setValues([spec.fields.map(field=>"'"+vaultRow()[field])]);const old=tab.grid.map(row=>row.map(cell=>cell?{...cell}:cell));let committed=false;
 s.run('SpreadsheetApp.flush=function(){SpreadsheetApp._committed=true;};');
 tab.setFrozenRows=()=>{committed=s.run('SpreadsheetApp._committed===true');if(!committed){tab.grid.length=0;old.forEach((row,i)=>tab.grid[i]=row.map(cell=>cell?{...cell}:cell));}throw Error('Rejected table freeze');};
 const result=JSON.parse(JSON.stringify(s.run('apDungBoCucKho()')));assert.equal(committed,true,'flush must precede risky presentation calls');assert.equal(result.data_verified,true);assert.equal(result.vault_layout,'entry');assert.equal(result.layout_warnings[0].step,'cố định hàng 1');assert.deepEqual(s.request({action:'read',scope:'vault'}).data.vault,[vaultRow()]);
});

test('a deferred presentation error is caught at its own flush after account data is committed',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho'),read=s.request({action:'read',scope:'vault'});s.request({action:'write',scope:'vault',revision:read.revision,data:{vault:[vaultRow()]}});
 s.run('SpreadsheetApp.flush=function(){if(SpreadsheetApp._stylePending){SpreadsheetApp._stylePending=false;throw Error("Google deferred error FAKE_PRIVATE_PASSWORD");}};');
 tab.setFrozenRows=()=>s.run('SpreadsheetApp._stylePending=true');const result=JSON.parse(JSON.stringify(s.run('apDungBoCucKho()')));assert.equal(result.data_verified,true);assert.equal(result.vault_layout,'entry');assert.equal(result.layout_warnings.length,1);assert.equal(result.layout_warnings[0].step,'cố định hàng 1');assert.deepEqual(s.request({action:'read',scope:'vault'}).data.vault,[vaultRow()]);assert.doesNotMatch(JSON.stringify(result)+s.logs.join(' '),/FAKE_PRIVATE_PASSWORD/);
});
test('a failed data flush remains fatal and prevents all presentation calls',()=>{
 const s=script(),tab=s.tabs.get('FamilySync_Kho'),read=s.request({action:'read',scope:'vault'});s.request({action:'write',scope:'vault',revision:read.revision,data:{vault:[vaultRow()]}});let presentationCalls=0;tab.setFrozenRows=()=>presentationCalls++;
 s.run('SpreadsheetApp.flush=function(){throw Error("failed account commit FAKE_PRIVATE_PASSWORD");};');assert.throws(()=>s.run('apDungBoCucKho()'),error=>{assert.match(error.message,/lưu dữ liệu Kho vào Google/);assert.doesNotMatch(error.message,/FAKE_PRIVATE_PASSWORD/);return true;});assert.equal(presentationCalls,0);assert.equal(s.logs.some(line=>line.startsWith('ĐÃ XÁC NHẬN BỐ CỤC MỚI')),false);
});
