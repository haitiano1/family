# Sửa kết nối Apps Script và xác định đúng phiên bản

**Với Code.gs v5 trong gói này: cập nhật family-private/sheets.php trên Hostinger trước theo NHAP-TAI-KHOAN.md. Sau đó mới triển khai Apps Script.**

Gói này không yêu cầu tạo Sheet mới, xóa database, đổi FAMILY_TOKEN hoặc ngắt kết nối. Giữ nguyên Script Properties và các tab FamilySync_*.

## 1. Cập nhật script ở đúng dự án đang chứa Sheet

- Sao lưu bằng File → Make a copy trên Sheet trước khi đổi bố cục.
- Thay Code.gs trong dự án Apps Script hiện tại bằng Code.gs trong gói này. Lưu.
- Deploy → Manage deployments → chọn bản triển khai bạn định dùng → bút chì → Version: New version → Deploy.
- Execute as: Me; Who has access: Anyone. Đây là quyền gọi script, không phải chia sẻ file Sheet công khai.
- Sao chép URL /exec của bản triển khai đó. Không thêm FAMILY_TOKEN vào URL.
- Mở URL /exec trong cửa sổ ẩn danh. Bản mới trả JSON có `service: family-sync` và `script_version: family-groups-compact-v5.7`, không có dữ liệu khách hoặc mã kết nối. Nếu bị yêu cầu đăng nhập thì endpoint chưa truy cập ẩn danh được. Nếu báo thiếu doGet thì link đang chạy mã cũ hoặc chưa triển khai đúng phiên bản.

## 2. Cập nhật màn hình kết nối website

- Giải nén gói và upload đè đúng 4 file:
  - `family-private/core.php`
  - `family-private/sheets.php`
  - `public_html/sheets.js`
  - `public_html/style.css`
- Giữ nguyên config.php và database. Nhấn Ctrl+F5.
- Mở Đồng bộ Sheet. Mục **Link script đang kết nối** cho biết chính xác URL website đang gọi.
- Nếu khác URL đã kiểm tra ở bước 1, bấm **Đổi link triển khai**, dán URL mới. Để trống FAMILY_TOKEN để dùng lại mã đã lưu. Chọn **Lưu link và đồng bộ**.
- Website xác minh link mới trỏ đến cùng file Sheet trước khi lưu; giữ nguyên ID, dữ liệu và dấu đối chiếu để tránh phải nhập lại hoặc phát sinh xung đột chỉ do đổi URL. Nếu link trỏ sang file khác, ứng dụng từ chối và giữ kết nối cũ.

## 3. Xác minh kết quả

- Khi đồng bộ ghi thành công bằng script mới, màn hình hiện phiên bản `family-groups-compact-v5.7` và **Theo Family · dd/mm/yyyy**.
- Tab Khách chuyển thành khối Family xanh lá, khách xanh dương, ngày dd/mm/yyyy.
- Nếu dữ liệu được đồng bộ nhưng script không xác nhận bố cục mới, ứng dụng hiện cảnh báo thay vì chỉ báo thành công chung.
- Nếu lỗi truy cập, thông báo mới có **HTTP 401/403/404/302…**. Gửi mã HTTP, phiên bản và URL /exec để chẩn đoán. Không gửi FAMILY_TOKEN, mật khẩu hay ảnh có mã bí mật.
- 401/403 thường cần kiểm tra quyền triển khai; 404 cần kiểm tra link/deployment còn tồn tại; chuyển hướng đăng nhập cần kiểm tra quyền Anyone và chính sách Workspace. Chỉ mã HTTP chưa đủ để khẳng định nguyên nhân cuối cùng.

Bộ kiểm thử đã xác minh đổi link cùng Sheet giữ baseline/ID, chặn đổi sang Sheet khác, mã kết nối không được trả về trình duyệt, đọc phiên bản công khai không tiết lộ dữ liệu, và giao diện đổi link trên mobile. Truy cập Google thật từ Hostinger vẫn cần kiểm chứng bằng URL và tài khoản của bạn.
