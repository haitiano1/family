// Shared CSV reader; supports Google Sheets exports, quoted commas/newlines, BOM and CRLF.
export function parseCSV(source, delimiter = 'auto') {
  if (typeof source !== 'string' || source.length > 1000000) throw new Error('CSV tối đa 1 MB.');
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  function read(separator) {
    const rows = []; let fields = [], cell = '', quoted = false, closed = false, line = 1, start = 1;
    const pushCell = () => { fields.push(cell); cell = ''; closed = false; if (fields.length > 100) throw new Error('CSV tối đa 100 cột.'); };
    const pushRow = () => { pushCell(); if (fields.some(v => v.trim())) rows.push({ line: start, cells: fields }); fields = []; if (rows.length > 10001) throw new Error('CSV tối đa 10.000 khách.'); };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
        else { cell += c; if (c === '\n') line++; }
      } else if (c === separator) pushCell();
      else if (c === '\n') { pushRow(); line++; start = line; }
      else if (c === '"') { if (cell.length || closed) throw new Error(`Dòng ${line}: dấu nháy CSV không hợp lệ.`); quoted = true; }
      else { if (closed) throw new Error(`Dòng ${line}: dữ liệu sau dấu nháy đóng không hợp lệ.`); cell += c; }
    }
    if (quoted) throw new Error('CSV thiếu dấu nháy đóng.');
    if (cell || fields.length || closed) pushRow();
    return rows;
  }
  if (delimiter === 'auto') {
    const candidates = [',', ';', '\t'].map(d => { try { return { d, rows: read(d) }; } catch { return null; } }).filter(Boolean);
    if (!candidates.length) throw new Error('CSV không hợp lệ. Kiểm tra dấu nháy hoặc chọn lại định dạng.');
    candidates.sort((a, b) => (b.rows[0]?.cells.length || 0) - (a.rows[0]?.cells.length || 0)); delimiter = candidates[0].d;
  }
  if (![',', ';', '\t'].includes(delimiter)) throw new Error('Dấu phân cách không hợp lệ.');
  const records = read(delimiter); if (records.length < 2) throw new Error('CSV cần dòng tiêu đề và ít nhất một dòng khách.');
  const headers = records.shift().cells.map((v, i) => v.trim() || `Cột ${i + 1}`);
  return { headers, records, delimiter };
}
export function normalizeHeader(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]/g, ''); }
export const importFields = {
  email: 'Email khách *', membership_status:'Trạng thái thành viên', customer_name: 'Tên khách', contact: 'Liên hệ', joined_at: 'Ngày vào', expires_at: 'Ngày hết hạn', payment_status: 'Thanh toán', plan_months: 'Gói mua (tháng)', amount: 'Số tiền đã ghi nhận', note: 'Ghi chú', family_name: 'Tên Family', manager_email: 'Email quản lý Family'
};
export function suggestMapping(headers) {
  const aliases = { membership_status:['trangthaithanhvien','membershipstatus'], email: ['email','mail','emailkhach','gmailkhach','gmail','emailcustomer'], customer_name: ['tenkhach','tenkhachhang','customername','name','hoten'], contact: ['lienhe','contact','sdt','dienthoai','zalo'], joined_at: ['ngayvao','ngaymua','ngaybatdau','joinedat','startdate'], expires_at: ['ngayhethan','ngaydenhan','hethan','han','expiresat','expiry','enddate'], payment_status: ['thanhtoan','trangthaithanhtoan','paymentstatus'], plan_months: ['goimua','goi','planmonths'], amount: ['sotien','tien','amount'], note: ['ghichu','note'], family_name: ['tenfamily','family','familyname','fam'], manager_email: ['emailquanly','taikhoanquanly','manageremail','emailmanager','gmailchu','chufamily'] };
  return Object.fromEntries(Object.keys(importFields).map(field => [field, headers.findIndex(h => aliases[field].includes(normalizeHeader(h)))]));
}

export function prepareSheet(source, delimiter = 'auto') {
  const parsed = parseCSV(source, delimiter);
  const email = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value || '').trim());
  const raw = [{ line:1,cells:parsed.headers }, ...parsed.records];
  const managerRows = raw.filter(r => email(r.cells[0]) && !email(r.cells[1]));
  const legacy = managerRows.length > 0 && raw.some(r => normalizeHeader(r.cells[2] || '') === 'goimua');
  const encode = value => '"' + String(value).replaceAll('"','""') + '"';
  if (!legacy) {
    const normalizedCSV = [parsed.headers, ...parsed.records.map(r=>r.cells)].map(row=>row.map(encode).join(',')).join('\n');
    return { ...parsed, manager_email:'', legacy:false, normalizedCSV, warnings:[] };
  }
  const headers = ['Tên khách','Email khách','Gói mua','Ngày mua','Ngày đến hạn','Contact','Ghi chú','Tên Family','Email quản lý','Trạng thái thành viên'];
  const records=[], warnings=[], groups=[];
  let group=null, label='';
  function shortDate(value) {
    const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m && { day:Number(m[1]),month:Number(m[2]),year:Number(m[3]) };
  }
  for (const record of raw) {
    const cells=record.cells, first=(cells[0] || '').trim(), address=(cells[1] || '').trim();
    if (email(first) && !email(address)) {
      group = { manager_email:first.toLowerCase(),name:label || `Family ${String(groups.length+1).padStart(2,'0')}`,line:record.line,count:0,occupied:0 };
      groups.push(group); label=''; continue; // Entire manager header (including its password/verification fields) is discarded.
    }
    if (!email(address)) {
      if (/^(?:fam(?:ily)?|nhóm|nhom)\s*\d+/i.test(first)) label=first.slice(0,200);
      continue;
    }
    if (!group) throw new Error(`Dòng ${record.line}: chưa xác định được email quản lý Family.`);
    let plan=(cells[2] || '').trim(), purchase=(cells[3] || '').trim(), expires=(cells[4] || '').trim();
    const notes=[];
    if (/^(?:1|một|mot)\s*năm$/i.test(plan)) plan='12 tháng';
    if (!plan) { warnings.push({line:record.line,message:'Gói mua đang trống, giữ chưa đặt.'}); }
    const partial=purchase.match(/^(\d{1,2})\/(\d{1,2})$/), end=shortDate(expires), months=plan.match(/^(\d+)\s*(?:tháng|thang|th)?$/i);
    if (partial && end && months) {
      const base = new Date(Date.UTC(end.year,end.month-1,1)); base.setUTCMonth(base.getUTCMonth()-Number(months[1]));
      if (Number(partial[1]) === end.day && Number(partial[2]) === base.getUTCMonth()+1) {
        const original=purchase; purchase=`${partial[1]}/${partial[2]}/${base.getUTCFullYear()}`;

        warnings.push({line:record.line,message:'Ngày mua thiếu năm: đã bổ sung năm theo gói và hạn, cần đối chiếu.'});
      } else {
        notes.push(`Ngày mua gốc ${purchase} thiếu năm, cần bổ sung.`); purchase=''; warnings.push({line:record.line,message:'Ngày mua thiếu năm: giữ chưa đặt và ghi thông tin gốc vào ghi chú.'});
      }
    }
    if (!purchase) { warnings.push({line:record.line,message:'Ngày mua trống, giữ chưa đặt.'}); }
    if (!expires) { warnings.push({line:record.line,message:'Ngày đến hạn trống, chưa tính cảnh báo hết hạn.'}); }
    const extraNote=(cells[7] || '').trim(); if (extraNote) notes.push(extraNote);
    const pending = normalizeHeader((cells[6] || '')+' '+extraNote).includes('chuavao');
    records.push({line:record.line,cells:[first,address.toLowerCase(),plan,purchase,expires,cells[6] || '',notes.join(' '),group.name,group.manager_email,pending ? 'invited' : 'unknown']}); group.count++; if (!pending) group.occupied++;
  }
  if (!records.length) throw new Error('Chưa tìm thấy khách có email trong các Family.');
  const overflows=groups.filter(g=>g.occupied>5).map(g=>({line:g.line,count:g.occupied}));

  const normalizedCSV=[headers,...records.map(r=>r.cells)].map(row=>row.map(encode).join(',')).join('\n');
  return {headers,records,delimiter:',',manager_email:'',legacy:true,multi_family:true,normalizedCSV,warnings,overflows,family_count:groups.length};
}
