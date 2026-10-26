const monthFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'});
function localMonth(date){const parts=monthFormatter.formatToParts(date),get=key=>parts.find(p=>p.type===key).value;return get('year')+'-'+get('month');}
function period(month){const [year,n]=month.split('-').map(Number),end=new Date(Date.UTC(year,n,0)).getUTCDate();return {month,start_date:month+'-01',end_date:month+'-'+String(end).padStart(2,'0')};}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
function totals(rows,month,metric){return {...(month==='all'?{month,start_date:null,end_date:null}:period(month)),customers:new Set(rows.map(h=>h.email.trim().toLocaleLowerCase()||'history:'+h.id)).size,[metric]:rows.length,amount:rows.reduce((sum,h)=>sum+Number(h.amount),0)};}
function report(history,options,now,dateField,metric){
  const current=localMonth(now),month=options.month||current;
  if(month!=='all'&&!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))throw Object.assign(Error('Tháng thống kê không hợp lệ.'),{status:400});
  const [year,n]=current.split('-').map(Number),keys=Array.from({length:6},(_,i)=>new Date(Date.UTC(year,n-1-i,1)).toISOString().slice(0,7));
  const records=history.map(row=>{const time=/^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(row.created_at)?Date.parse(row.created_at):NaN;return {row,time,month:validDate(row[dateField])?row[dateField].slice(0,7):Number.isFinite(time)?localMonth(new Date(time)):null};});
  const months=keys.map(key=>totals(records.filter(h=>h.month===key&&h.time<=now.getTime()).map(h=>h.row),key,metric));
  const selected=records.filter(h=>month==='all'||h.month===month&&h.time<=now.getTime()),search=String(options.search||'').trim().slice(0,200).toLocaleLowerCase();
  const filtered=selected.filter(h=>[h.row.email,h.row.customer_name,h.row.family_name,h.row.note].join(' ').toLocaleLowerCase().includes(search)).sort((a,b)=>(Number.isFinite(b.time)?b.time:-Infinity)-(Number.isFinite(a.time)?a.time:-Infinity)||b.row.id-a.row.id);
  const pageSize=50,requested=Math.max(1,Math.min(100000,Math.trunc(Number(options.page))||1)),page=Math.min(requested,Math.max(1,Math.ceil(filtered.length/pageSize)));
  return {current_month:current,months,selected:totals(selected.map(h=>h.row),month,metric),rows:filtered.slice((page-1)*pageSize,page*pageSize).map(h=>h.row),total:filtered.length,page,page_size:pageSize,history_total:history.length};
}
// Completion/receipt dates remain visible, but the old expiry owns the renewal month.
export function summarizeRenewals(history,options={},now=new Date()){return report(history,options,now,'old_expires_at','renewals');}
export function summarizeNewPurchases(history,options={},now=new Date()){return report(history,options,now,'joined_at','purchases');}
export function renewalStatistics(db,options={},now=new Date()){
  return {...summarizeRenewals(db.prepare('SELECT * FROM renewal_history').all(),options,now),new_purchases:summarizeNewPurchases(db.prepare('SELECT * FROM new_purchase_history').all(),{...options,page:options.new_page},now)};
}
