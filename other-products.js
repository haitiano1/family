import {purchaseExpiry} from './domain.js';
export const productChoices=['Netflix','Spotify','Google One','ChatGPT','Khác'];
export function initOtherProducts(db,{fail,text,email,calendarDate,log}) {
  return function save(id,data,actor) {
    const old=id?db.prepare('SELECT * FROM other_purchases WHERE id=?').get(id):null;if(id&&!old)fail('Không tìm thấy sản phẩm đã bán.',404);
    const source=text(Object.hasOwn(data,'purchase_source')?data.purchase_source:old?.purchase_source,200);
    const product=text(data.product,100);if (!product) fail('Nhập tên sản phẩm.');
    const name=text(data.customer_name,200),address=data.email ? email(data.email) : '';
    if (!name && !address) fail('Nhập tên khách hoặc email khách.');
    const plan=Number(data.plan_months||0);if(!Number.isInteger(plan)||plan<0||plan>120)fail('Gói mua cần từ 1 đến 120 tháng hoặc để chưa đặt.');
    const purchased=calendarDate(data.joined_at),expires=calendarDate(data.expires_at||(!id&&purchased&&plan?purchaseExpiry(purchased,plan):''));
    if (purchased && expires && expires<purchased) fail('Ngày hết hạn phải từ ngày mua trở đi.');
    const payment=data.payment_status || 'unknown';if (!['unknown','unpaid','partial','paid'].includes(payment)) fail('Trạng thái thanh toán không hợp lệ.');
    const amount=Number(data.amount || 0);if (!Number.isSafeInteger(amount) || amount<0 || amount>1000000000) fail('Số tiền từ 0 đến 1 tỷ VND.');
    const values=[product,name,address,text(data.contact,1000),purchased,expires,payment,amount,text(data.note),plan,source];
    if (id) {
      if (!db.prepare('SELECT id FROM other_purchases WHERE id=?').get(id)) fail('Không tìm thấy sản phẩm đã bán.',404);
      db.prepare('UPDATE other_purchases SET product=?,customer_name=?,email=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=?,plan_months=?,purchase_source=? WHERE id=?').run(...values,id);
      log(`${actor.username}: cập nhật sản phẩm khác #${id}`);return {ok:true};
    }
    const result=db.prepare('INSERT INTO other_purchases(product,customer_name,email,contact,joined_at,expires_at,payment_status,amount,note,plan_months,purchase_source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(...values,new Date().toISOString());
    log(`${actor.username}: ghi nhận bán sản phẩm ${product}`);return {id:Number(result.lastInsertRowid)};
  };
}
