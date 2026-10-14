import {sortFamilies} from './domain.js';
export function projectVaultFamilies(families,members,items,query='',filter=''){
  const active=families.filter(f=>!f.archived_at),byFamily=new Map(items.filter(i=>i.family_id).map(i=>[i.family_id,i])),byMail=new Map(items.filter(i=>!i.family_id).map(i=>[i.email,i])),linked=new Set(),q=query.trim().toLocaleLowerCase();
  const all=active.map(f=>{const saved=byFamily.get(f.id)||byMail.get(f.manager_email);if(saved)linked.add(saved.id);return {id:saved?.id??-f.id,vault_id:saved?.id??null,family_id:f.id,family_name:f.name,trial_date:f.trial_date||'',email:f.manager_email,label:f.name,note:'',recovery_email:'',has_password:false,has_totp:false,totp_key:'',code:'',...saved,email:f.manager_email,label:f.name,family_id:f.id};});
  const ordered=sortFamilies(all.map(row=>({id:row.family_id,name:row.family_name,trial_date:row.trial_date,row})),members,filter).map(w=>w.row).filter(row=>`${row.family_name} ${row.email} ${row.note||''} ${row.recovery_email}`.toLocaleLowerCase().includes(q));
  const unlinked=filter==='spare'?[]:items.filter(i=>!linked.has(i.id)&&`${i.email} ${i.label} ${i.note||''} ${i.recovery_email}`.toLocaleLowerCase().includes(q)).map(i=>({...i,vault_id:i.id,family_id:null,family_name:i.label||'',trial_date:''}));
  return {rows:ordered,unlinked,total:active.length};
}
