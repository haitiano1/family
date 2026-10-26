import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../integrations/google-sheets/XacDinhFileKho.gs',import.meta.url),'utf8');
function diagnose(headers,{missing=false,boundId='different-book'}={}){
 const logs=[],properties=new Map([['FAMILY_SPREADSHEET_ID','configured-book'],['FAMILY_TOKEN','FAKE_SECRET_TOKEN']]);let opens=0;
 const tab={getMaxColumns:()=>26,getLastRow:()=>49,getSheetId:()=>123,getRange:(row,col,h,w)=>{assert.deepEqual([row,col,h,w],[1,1,1,9],'reads headers only, never account rows');return {getDisplayValues:()=>[headers]};}};
 const book={getId:()=> 'configured-book',getSheetByName:name=>{assert.equal(name,'FamilySync_Kho');return missing?null:tab;}};
 const ctx=vm.createContext({FAMILY_SYNC_VERSION:'family-groups-compact-v5.2',PropertiesService:{getScriptProperties:()=>({getProperty:name=>{assert.equal(name,'FAMILY_SPREADSHEET_ID','never reads token');return properties.get(name);}})},SpreadsheetApp:{openById:id=>{assert.equal(id,'configured-book');opens++;return book;},getActiveSpreadsheet:()=>boundId?{getId:()=>boundId}:null},console:{log:message=>logs.push(message)}});
 vm.runInContext(source,ctx);return {run:()=>vm.runInContext('xacDinhFileKho()',ctx),logs,properties,get opens(){return opens;}};
}
test('read-only Sheet diagnostic identifies the configured book/tab and legacy layout without reading account rows or token',()=>{
 const s=diagnose(['ID (không sửa)','ID Family (không sửa)','Email (đổi tại Family)','Mật khẩu','Khóa 2FA','Mail khôi phục','Nhãn','Note','']);const before=JSON.stringify([...s.properties]);const result=s.run();
 assert.equal(result.sheet_url,'https://docs.google.com/spreadsheets/d/configured-book/edit#gid=123');assert.match(result.layout,/CŨ/);assert.equal(JSON.stringify([...s.properties]),before);assert.equal(s.opens,1);assert.match(s.logs.join(' '),/KHÁC file cấu hình/);assert.doesNotMatch(s.logs.join(' '),/FAKE_SECRET_TOKEN/);
});
test('diagnostic recognizes new layout and does not disclose unknown header contents',()=>{
 for(const headers of [['Ngày trial (dd/mm/yyyy)','Email','','','','','','',''],['FAKE_PRIVATE_PASSWORD','FAKE_2FA_SECRET','','','','','','','']]){
  const s=diagnose(headers,{boundId:'configured-book'}),result=s.run();assert.match(result.layout,headers[0].startsWith('Ngày')?/MỚI/:/CHƯA KHỚP/);assert.match(s.logs.join(' '),/TRÙNG/);assert.doesNotMatch(s.logs.join(' '),/FAKE_PRIVATE_PASSWORD|FAKE_2FA_SECRET/);
 }
});
test('missing target tab is reported without creating or modifying a Sheet',()=>{
 const s=diagnose([],{missing:true});assert.throws(()=>s.run(),/không có tab FamilySync_Kho/);assert.deepEqual(s.logs,[]);
});
