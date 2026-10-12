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
  email: 'Email khách *', customer_name: 'Tên khách', contact: 'Liên hệ', joined_at: 'Ngày vào', expires_at: 'Ngày hết hạn', payment_status: 'Thanh toán', plan_months: 'Gói mua (tháng)', amount: 'Số tiền đã ghi nhận', note: 'Ghi chú', family_name: 'Tên Family', manager_email: 'Email quản lý Family'
};
export function suggestMapping(headers) {
  const aliases = { email: ['email','mail','emailkhach','gmailkhach','gmail','emailcustomer'], customer_name: ['tenkhach','tenkhachhang','customername','name','hoten'], contact: ['lienhe','contact','sdt','dienthoai','zalo'], joined_at: ['ngayvao','ngaymua','ngaybatdau','joinedat','startdate'], expires_at: ['ngayhethan','ngaydenhan','hethan','han','expiresat','expiry','enddate'], payment_status: ['thanhtoan','trangthaithanhtoan','paymentstatus'], plan_months: ['goimua','goi','planmonths'], amount: ['sotien','tien','amount'], note: ['ghichu','note'], family_name: ['tenfamily','family','familyname','fam'], manager_email: ['emailquanly','taikhoanquanly','manageremail','emailmanager','gmailchu','chufamily'] };
  return Object.fromEntries(Object.keys(importFields).map(field => [field, headers.findIndex(h => aliases[field].includes(normalizeHeader(h)))]));
}

export function prepareSheet(source, delimiter = 'auto') {
  const parsed = parseCSV(source, delimiter);
  const legacy = parsed.headers.length >= 5 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parsed.headers[0]) && normalizeHeader(parsed.headers[2]) === 'goimua' && normalizeHeader(parsed.headers[3]) === 'ngaymua';
  const manager_email = legacy ? parsed.headers[0].trim().toLowerCase() : '';
  if (legacy) { parsed.headers[0] = 'Tên khách'; parsed.headers[1] = 'Email khách'; }
  // Only the old layout's first-row password is removed; the email column below is retained.
  const encode = value => '"' + value.replaceAll('"', '""') + '"';
  const normalizedCSV = [parsed.headers, ...parsed.records.map(r => r.cells)].map(row => row.map(encode).join(',')).join('\n');
  return { ...parsed, manager_email, legacy, normalizedCSV };
}
