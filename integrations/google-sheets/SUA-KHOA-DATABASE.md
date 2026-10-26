# Bản 0.15.1 — sửa “Ứng dụng đang xử lý dữ liệu” khi đồng bộ Sheet

## Nguyên nhân đã xác định trong mã

Lượt đồng bộ trước giữ khóa database chung trong lúc gọi Google. Nếu Google chậm, yêu cầu đọc/sửa khách khác chờ quá 10 giây sẽ báo ứng dụng đang xử lý dữ liệu. Bản sửa nhả khóa database trong lúc chờ mạng, dùng khóa đồng bộ riêng để ngăn các tab chạy trùng, và không ghi lại Sheet khi dữ liệu/bố cục không thay đổi.

Dữ liệu web vẫn được đọc lại sau khi Google trả về. Nếu có thay đổi mới trên web trong khi gửi Sheet, chỉ bản đã gửi được ghi nhận là đã đồng bộ; thay đổi mới được giữ để gửi ở lượt sau. Không tăng thời gian chờ database để che lỗi.

## Cập nhật trên Hostinger

1. Tải một bản sao lưu từ website nếu hiện mở được. Đóng các tab Family trên các thiết bị đang dùng, đợi khoảng 2 phút để lượt đồng bộ cũ kết thúc. Đóng tab không hủy ngay tác vụ máy chủ đã chạy.
2. Giải nén gói. Upload đè đúng **4 file** vào thư mục website hiện có:
   - `family-private/core.php`
   - `family-private/sheets.php`
   - `public_html/sheets.js`
   - `public_html/style.css`
3. Giữ nguyên `config.php`, database, URL /exec, FAMILY_TOKEN và các tab Sheet. Không chạy lại setupFamilySync, không tạo deployment hoặc Sheet mới. Gói sửa khóa database không yêu cầu đổi phiên bản Apps Script. Nếu cần thu gọn tab Khách và sửa Còn ngày, áp dụng riêng GON-COT-VA-CON-NGAY.md.
4. Mở lại **một tab** Family, nhấn Ctrl+F5. Kiểm tra mở danh sách khách và sửa một ghi chú nhỏ.
5. Chọn **Đồng bộ Sheet → Đồng bộ ngay**. Trong khi chờ, đóng hộp thoại đồng bộ và thử đọc/sửa khách. Website không cần chờ Google mới xử lý được thao tác này.
6. Nếu mở hai tab và bấm đồng bộ cùng lúc, một lượt chạy; lượt còn lại báo đã có tab đang đồng bộ. Đây là thông báo riêng cho Sheet, không khóa chức năng quản lý khách.

Cần upload cả core.php và sheets.php trong cùng lần cập nhật vì chúng dùng chung helper quản lý khóa. Không áp dụng riêng một file rồi để website chạy lâu với file còn lại cũ.

## Phạm vi kiểm chứng

Đã dùng hai kết nối MySQL để xác minh yêu cầu khác lấy được khóa ứng dụng trong khi mô phỏng chờ Google, tab trùng không gửi thêm request, sửa khách trong lúc đọc/gửi không bị mất, dấu đối chiếu chỉ ghi nhận bản đã gửi, khóa được trả lại sau lỗi mạng, và dữ liệu không đổi không bị ghi lại lên Google. Các kiểm thử nghiệp vụ dùng khóa database và giao diện được chạy riêng.

Bản này sửa tranh chấp khóa trên website; quyền triển khai Google hoặc lỗi HTTP từ Google vẫn là vấn đề riêng nếu xuất hiện. Khi cần chẩn đoán tiếp, gửi nội dung lỗi mới, không gửi mật khẩu hoặc FAMILY_TOKEN.
