import { createHmac, randomBytes } from 'node:crypto';
import { parseCSV, importFields, normalizeHeader } from './public/csv.js';
export function initImporter(db, { fail, email, text, memberData, log }) {
  const key = randomBytes(32);
  const columns = ['email','customer_name','contact','joined_at','expires_at','payment_status','amount','note','plan_months','membership_status'];
  const dateCell = value => {
    if (!value) return '';
    const parts = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    return parts ? `${parts[3]}-${parts[2].padStart(2,'0')}-${parts[1].padStart(2,'0')}` : value;
  };
  const paymentCell = value => {
    const aliases = { paid: ['paid','dathanhtoan','dathu','datra'], partial: ['partial','thanhtoanmotphan','motphan'], unpaid: ['unpaid','chuathanhtoan','chuathu','chuatra'] };
    const normalized = normalizeHeader(value); if (!normalized) return 'unknown';
    for (const [key, values] of Object.entries(aliases)) if (values.includes(normalized)) return key;
    fail('Thanh toán cần là Đã thanh toán, Chưa thanh toán hoặc Thanh toán một phần.');
  };
  const amountCell = value => {
    if (!value) return 0;
    const clean = value.replace(/\s/g,'').replace(/(?:vnd|đ|₫)$/i,'');
    if (/^\d+$/.test(clean)) return Number(clean);
    if (/^\d{1,3}([.,])\d{3}(?:\1\d{3})*$/.test(clean)) return Number(clean.replace(/[.,]/g,''));
    fail('Số tiền cần là số nguyên VND, ví dụ 100000 hoặc 100.000.');
  };
  const planCell = value => {
    if (!value) return 0;
    if (/^(?:1|một|mot)\s*năm$/i.test(value)) return 12;
    const match = value.match(/^(\d+)\s*(?:tháng|thang|th|months?)?$/i);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 120) fail('Gói mua cần từ 1 đến 120 tháng.');
    return Number(match[1]);
  };
  function prepare(data) {
    let csv; try { csv = parseCSV(data.csv, data.delimiter || 'auto'); } catch (error) { fail(error.message); }
    if (!data.mapping || typeof data.mapping !== 'object' || Array.isArray(data.mapping)) fail('Cần chọn cột dữ liệu.');
    const mapping = {};
    for (const name of Object.keys(importFields)) {
      const value = data.mapping[name] ?? -1;
      if (!Number.isInteger(value) || value < -1 || value >= csv.headers.length) fail('Cột dữ liệu không hợp lệ.'); mapping[name] = value;
    }
    if (mapping.email < 0) fail('Cần chọn cột Email khách.');
    const selected = Object.values(mapping).filter(v => v >= 0); if (new Set(selected).size !== selected.length) fail('Một cột chỉ được gán cho một trường.');
    if (!['skip','update'].includes(data.duplicates || 'skip')) fail('Cách xử lý khách trùng không hợp lệ.');
    for (const key of ['allow_overflow','match_by_manager']) if (data[key] != null && typeof data[key] !== 'boolean') fail('Tùy chọn nhập không hợp lệ.');
    if (data.create_groups != null && typeof data.create_groups !== 'boolean') fail('Tùy chọn tạo nhóm không hợp lệ.');
    const accounts = db.prepare('SELECT * FROM accounts ORDER BY id').all();
    const families = db.prepare("SELECT f.*,a.email AS manager_email FROM families f JOIN accounts a ON a.id=f.manager_id WHERE f.archived_at='' ORDER BY f.id").all();
    const members = db.prepare('SELECT * FROM members ORDER BY id').all();
    const fallback = families.find(f => f.id === Number(data.family_id));
    if (!fallback && !data.default_manager && mapping.family_name < 0 && mapping.manager_email < 0) fail('Chọn Family nhận khách hoặc chọn cột Family/email quản lý.');
    const newGroups = new Map(), seen = new Set(), counts = new Map(families.map(f => [String(f.id), members.filter(m => m.family_id === f.id && m.membership_status !== 'invited').length]));
    const items = [];
    function groupFor(name, manager) {
      if (!name && !manager && !fallback && data.default_manager) { manager = data.default_manager; name = text(data.default_family || '', 200); }
      if (manager) {
        manager = email(manager); const found = families.find(f => f.manager_email === manager);
        if (found) { if (name && name !== found.name && !data.match_by_manager) fail('Tên Family không khớp email quản lý trong hệ thống.'); return { key: String(found.id), ...found }; }
        if (!data.create_groups) fail('Email quản lý chưa có Family. Tạo hồ sơ trước hoặc bật tạo Family mới.');
        const groupName = name || `Family ${manager}`;
        if (newGroups.has(manager)) { const g = newGroups.get(manager); if (g.name !== groupName) fail('Một email quản lý có nhiều tên Family trong CSV.'); return g; }
        const g = { key: `new:${manager}`, name: text(groupName, 200), manager_email: manager, account_id: accounts.find(a => a.email === manager)?.id };
        newGroups.set(manager, g); counts.set(g.key, 0); return g;
      }
      if (name) {
        const matches = families.filter(f => f.name === name);
        if (matches.length !== 1) fail(matches.length ? 'Tên Family trùng nhau. Cần cột email quản lý.' : 'Không tìm thấy Family. Cần email quản lý để tạo nhóm mới.');
        return { key: String(matches[0].id), ...matches[0] };
      }
      if (fallback) return { key: String(fallback.id), ...fallback }; fail('Dòng này thiếu Family hoặc email quản lý.');
    }
    for (const record of csv.records) {
      const item = { line: record.line, status: 'error', email: '', family_name: '', message: '' };
      try {
        if (record.cells.length > csv.headers.length) fail('Dòng có nhiều cột hơn tiêu đề. Kiểm tra dấu phân cách và dấu nháy.');
        const cell = name => mapping[name] < 0 ? '' : (record.cells[mapping[name]] || '').trim();
        const address = email(cell('email')); item.email = address;
        const group = groupFor(cell('family_name'), cell('manager_email')); item.family_name = group.name; item.group_key = group.key;
        if (address === group.manager_email) fail('Email khách trùng tài khoản quản lý.');
        const identity = group.key + '\0' + address;
        const existing = members.find(m => String(m.family_id) === group.key && m.email === address);
        if (seen.has(identity)) { item.status = 'skip'; item.message = 'Trùng khách trong CSV; giữ dòng đầu.'; items.push(item); continue; }
        seen.add(identity);
        if (existing && data.duplicates !== 'update') { item.status = 'skip'; item.message = 'Khách đã có trong Family; giữ nguyên hồ sơ.'; items.push(item); continue; }
        const values = existing ? { ...existing } : { email: address, payment_status: 'unknown' };
        for (const name of columns) {
          if (mapping[name] < 0) continue; const raw = cell(name);
          // Empty update cells do not erase existing customer data.
          if (existing && !raw && name !== 'email') continue;
          values[name] = ['joined_at','expires_at'].includes(name) ? dateCell(raw) : name === 'payment_status' ? paymentCell(raw) : name === 'amount' ? amountCell(raw) : name === 'plan_months' ? planCell(raw) : raw;
        }
        item.values = memberData(values); item.member_id = existing?.id;
        const before = existing && existing.membership_status !== 'invited' ? 1 : 0;
        const after = item.values[9] !== 'invited' ? 1 : 0;
        if (counts.get(group.key) - before + after > 5) fail('Family đã đủ 5 khách và 1 quản lý.');
        counts.set(group.key, counts.get(group.key) - before + after);
        item.status = existing ? 'update' : 'create'; item.message = existing ? 'Cập nhật trường đã chọn, giữ dữ liệu ô trống.' : 'Thêm khách mới.';
      } catch (error) { if (!error.status) throw error; item.message = error.message; }
      items.push(item);
    }
    const groups = [...newGroups.values()].filter(g => items.some(i => i.group_key === g.key && i.status === 'create'));
    const summary = { total: items.length, create: items.filter(i => i.status === 'create').length, update: items.filter(i => i.status === 'update').length, skip: items.filter(i => i.status === 'skip').length, errors: items.filter(i => i.status === 'error').length, new_families: groups.length, new_accounts: groups.filter(g => !g.account_id).length };
    const token = createHmac('sha256', key).update(JSON.stringify({ data, accounts, families, members })).digest('hex');
    return { summary, items, groups, token };
  }
  function handle(data, user, commit = false) {
    const token = data.preview_token; const input = { ...data }; delete input.preview_token;
    db.exec('SAVEPOINT csv_save');
    try {
      const plan = prepare(input);
      if (commit) {
        if (token !== plan.token) fail('Dữ liệu hoặc thiết lập đã thay đổi. Hãy xem trước lại rồi xác nhận.', 409);
        if (plan.summary.errors) fail('CSV có dòng lỗi. Sửa lỗi và xem trước lại; chưa nhập khách nào.');
        if (!plan.summary.create && !plan.summary.update) fail('Không có khách mới hoặc cập nhật để nhập.');
        const groupIds = new Map();
        for (const g of plan.groups) {
          const accountId = g.account_id || Number(db.prepare('INSERT INTO accounts(email,note,created_at) VALUES (?,?,?)').run(g.manager_email,'',new Date().toISOString()).lastInsertRowid);
          const id = Number(db.prepare('INSERT INTO families(name,manager_id,service,note,created_at) VALUES (?,?,?,?,?)').run(g.name,accountId,'youtube','',new Date().toISOString()).lastInsertRowid); groupIds.set(g.key,id);
        }
        for (const row of plan.items) {
          if (row.status === 'create') db.prepare('INSERT INTO members(family_id,email,customer_name,contact,joined_at,expires_at,payment_status,amount,note,plan_months,membership_status) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(groupIds.get(row.group_key) || Number(row.group_key),...row.values);
          else if (row.status === 'update') db.prepare('UPDATE members SET email=?,customer_name=?,contact=?,joined_at=?,expires_at=?,payment_status=?,amount=?,note=?,plan_months=?,membership_status=?,renewal_revision=renewal_revision+1 WHERE id=?').run(...row.values,row.member_id);
        }
        log(`${user.username}: nhập CSV ${plan.summary.create} khách mới, ${plan.summary.update} cập nhật, ${plan.summary.skip} bỏ qua, ${plan.summary.new_families} Family mới`);
      }
      db.exec('RELEASE csv_save');
      return { summary: plan.summary, preview_token: plan.token, rows: plan.items.slice(0,200).map(i => ({ line: i.line, status: i.status, email: i.email, family_name: i.family_name, message: i.message, customer_name: i.values?.[1] || '', joined_at: i.values?.[3] || '', expires_at: i.values?.[4] || '', plan_months: i.values?.[8] || 0 })), groups: plan.groups.map(g => ({ name: g.name, manager_email: g.manager_email })), errors: plan.items.filter(i => i.status === 'error').slice(0,200).map(i => ({ line: i.line, message: i.message })), committed: commit };
    } catch (error) { db.exec('ROLLBACK TO csv_save; RELEASE csv_save'); throw error; }
  }
  return handle;
}
