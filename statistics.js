const monthFormatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit'});
function localMonth(date){const parts=monthFormatter.formatToParts(date),get=key=>parts.find(p=>p.type===key).value;return get('year')+'-'+get('month');}
function period(month){const [year,n]=month.split('-').map(Number),end=new Date(Date.UTC(year,n,0)).getUTCDate();return {month,start_date:month+'-01',end_date:month+'-'+String(end).padStart(2,'0')};}
const empty=month=>({...period(month),customers:0,renewals:0,amount:0});
function totals(rows,month){return {...(month==='all'?{month,start_date:null,end_date:null}:period(month)),customers:new Set(rows.map(h=>h.email.trim().toLocaleLowerCase()||'history:'+h.id)).size,renewals:rows.length,amount:rows.reduce((sum,h)=>sum+Number(h.amount),0)};}

// History rows are permanent snapshots. Reporting never edits or prunes them.
export function summarizeRenewals(history,options={},now=new Date()){
  const current=localMonth(now),month=options.month||current;
  if(month!=='all'&&!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))throw Object.assign(Error('Tháng thống kê không hợp lệ.'),{status:400});
  const [year,n]=current.split('-').map(Number),keys=Array.from({length:6},(_,i)=>new Date(Date.UTC(year,n-1-i,1)).toISOString().slice(0,7));
  const records=history.map(row=>{const time=/^\d{4}-\d{2}-\d{2}(?:$|T| )/.test(row.created_at)?Date.parse(row.created_at):NaN;return {row,time,month:Number.isFinite(time)?localMonth(new Date(time)):null};});
  const months=keys.map(key=>{const rows=records.filter(h=>h.month===key&&h.time<=now.getTime()).map(h=>h.row);return rows.length?totals(rows,key):empty(key);});
  const selected=records.filter(h=>month==='all'||h.month===month&&h.time<=now.getTime()),search=String(options.search||'').trim().slice(0,200).toLocaleLowerCase();
  const filtered=selected.filter(h=>[h.row.email,h.row.customer_name,h.row.family_name,h.row.note].join(' ').toLocaleLowerCase().includes(search)).sort((a,b)=>(Number.isFinite(b.time)?b.time:-Infinity)-(Number.isFinite(a.time)?a.time:-Infinity)||b.row.id-a.row.id);
  const pageSize=50,requested=Math.max(1,Math.min(100000,Math.trunc(Number(options.page))||1)),page=Math.min(requested,Math.max(1,Math.ceil(filtered.length/pageSize)));
  return {current_month:current,months,selected:totals(selected.map(h=>h.row),month),rows:filtered.slice((page-1)*pageSize,page*pageSize).map(h=>h.row),total:filtered.length,page,page_size:pageSize,history_total:history.length};
}
export function renewalStatistics(db,options={},now=new Date()){return summarizeRenewals(db.prepare('SELECT * FROM renewal_history').all(),options,now);}
