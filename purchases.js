// A first-purchase snapshot stays in its original month after later renewals.
export function recordNewPurchase(db,id){
  db.prepare(`INSERT INTO new_purchase_history(member_id,email,customer_name,contact,family_name,joined_at,expires_at,plan_months,payment_status,amount,note,created_at)
    SELECT m.id,m.email,m.customer_name,m.contact,f.name,m.joined_at,m.expires_at,m.plan_months,m.payment_status,m.amount,m.note,?
    FROM members m JOIN families f ON f.id=m.family_id
    WHERE m.id=? AND m.membership_status='new' AND NOT EXISTS(SELECT 1 FROM new_purchase_history h WHERE h.member_id=m.id)`).run(new Date().toISOString(),id);
}
