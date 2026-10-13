// The review window uses the successful confirmation time, never the old expiry or receipt date.
export function recentRenewals(db,members,archives,now=new Date(),days=14) {
  const end=now.toISOString(),start=new Date(now.getTime()-days*86400000).toISOString();
  const live=new Map(members.map(m=>[m.id,m])),stored=new Map(archives.map(a=>[a.id,a.member]));
  const seen=new Set(),rows=[];
  for(const h of db.prepare('SELECT * FROM renewal_history WHERE created_at>? AND created_at<=? ORDER BY created_at DESC,id DESC').all(start,end)){
    const key=h.member_id!==null?'member:'+h.member_id:h.archive_id!==null?'archive:'+h.archive_id:'history:'+h.id;
    if(seen.has(key))continue;seen.add(key);
    const customer=live.get(h.member_id)||stored.get(h.archive_id)||{email:h.email,customer_name:h.customer_name,contact:'',family_name:h.family_name};
    rows.push({...h,customer,renewed_at:h.created_at});
  }
  return rows;
}
