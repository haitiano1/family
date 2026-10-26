/* Add as a separate Apps Script file, then run xacDinhFileKho.
 * Read-only diagnostic: logs resource URL, known layout label and row count.
 * Never reads account rows or prints arbitrary header values or secrets.
 */
function xacDinhFileKho(){
  const id=PropertiesService.getScriptProperties().getProperty('FAMILY_SPREADSHEET_ID');
  if(!id)throw Error('Chưa có FAMILY_SPREADSHEET_ID. Không chạy setup để tạo file khác.');
  let book;try{book=SpreadsheetApp.openById(id);}catch(error){throw Error('Không mở được file đã cấu hình. Kiểm tra đúng tài khoản và quyền truy cập.');}
  const tab=book.getSheetByName('FamilySync_Kho');if(!tab)throw Error('File đã cấu hình không có tab FamilySync_Kho.');
  const width=Math.min(9,tab.getMaxColumns()),headers=tab.getRange(1,1,1,width).getDisplayValues()[0];
  const layout=headers[0]==='Ngày trial (dd/mm/yyyy)'&&headers[1]==='Email'?'MỚI: Ngày trial ở A, Email ở B':headers[0]==='ID (không sửa)'&&headers[1]==='ID Family (không sửa)'&&headers[2]==='Email (đổi tại Family)'?'CŨ: ID ở A:B, Email ở C':'CHƯA KHỚP MẪU';
  const url='https://docs.google.com/spreadsheets/d/'+encodeURIComponent(book.getId())+'/edit#gid='+tab.getSheetId();
  console.log('MỞ ĐÚNG TAB SCRIPT ĐANG DÙNG: '+url);
  console.log('BỐ CỤC HIỆN TẠI: '+layout+'. Số dòng dữ liệu: '+Math.max(0,tab.getLastRow()-1)+'.');
  if(typeof FAMILY_SYNC_VERSION==='string'&&/^family-groups-[a-z0-9.-]{1,60}$/.test(FAMILY_SYNC_VERSION))console.log('Mã lưu trong Editor: '+FAMILY_SYNC_VERSION+'. Đây không phải kiểm tra phiên bản đã triển khai /exec.');
  if(typeof SpreadsheetApp.getActiveSpreadsheet==='function'){
    const bound=SpreadsheetApp.getActiveSpreadsheet();
    if(bound)console.log('File gắn với dự án Apps Script '+(bound.getId()===book.getId()?'TRÙNG':'KHÁC')+' file cấu hình trong FAMILY_SPREADSHEET_ID.');
  }
  console.log('CHỈ ĐỌC: không đổi ô, cột, ID, bản triển khai hoặc cấu hình.');
  return {ok:true,sheet_url:url,layout:layout};
}
