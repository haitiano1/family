import {createHash} from 'node:crypto';
import {normalizeProductImportRow,productImportFields} from './public/product-import.js';
import {initOtherProducts} from './other-products.js';
const fields=Object.keys(productImportFields),key=row=>JSON.stringify(fields.map(field=>row[field]??(field==='amount'||field==='plan_months'?0:'')));
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function initProductImport(db,helpers){
 const {fail}=helpers,save=helpers.saveOtherProduct||initOtherProducts(db,helpers);
 function prepare(data){
  if(!Array.isArray(data.items)||!data.items.length||data.items.length>500)fail('Cần từ 1 đến 500 dòng sản phẩm.');
  const known=new Set(db.prepare('SELECT * FROM other_purchases').all().map(key)),seen=new Set(),rows=[],errors=[];let added=0,skipped=0;
  for(const [index,raw] of data.items.entries()){
   const line=Number.isInteger(raw?.line)&&raw.line>0&&raw.line<1000000?raw.line:index+2;
   try{const row=normalizeProductImportRow(raw),identity=key(row),duplicate=known.has(identity)||seen.has(identity);seen.add(identity);rows.push({...row,line,action:duplicate?'skip':'add',reason:duplicate?'Dòng trùng hoàn toàn.':''});if(duplicate)skipped++;else added++;}
   catch(error){errors.push({line,message:error.message});}
  }
  const preview_token=errors.length?'':digest(rows.map(row=>[row.line,key(row),row.action]));return {ok:true,valid:!errors.length,total:data.items.length,rows,errors,added,skipped,preview_token};
 }
 function preview(data){return prepare(data);}
 function confirm(data){
  db.exec('SAVEPOINT product_sheet_import');
  try{const prepared=prepare(data);if(!prepared.valid)fail('Dữ liệu có lỗi. Xem trước và sửa các dòng trước khi nhập.');if(typeof data.preview_token!=='string'||!(/^[a-f0-9]{64}$/).test(data.preview_token))fail('Cần xem trước dữ liệu trước khi nhập.',409);if(data.preview_token!==prepared.preview_token&&prepared.added>0)fail('Dữ liệu sản phẩm đã thay đổi. Xem trước lại trước khi nhập.',409);
   for(const row of prepared.rows)if(row.action==='add')save(null,row,{username:'Cá nhân'});
   db.exec('RELEASE product_sheet_import');return {ok:true,added:prepared.added,skipped:prepared.skipped,total:prepared.total};
  }catch(error){db.exec('ROLLBACK TO product_sheet_import; RELEASE product_sheet_import');throw error;}
 }
 return {preview,confirm};
}
