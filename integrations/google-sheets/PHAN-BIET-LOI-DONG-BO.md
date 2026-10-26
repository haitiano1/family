# Xác định lỗi đồng bộ từ Hostinger

Bản này chỉ làm rõ mã lỗi Apps Script đã trả về. Chưa sửa nguyên nhân ở tài khoản Google và chưa chứng minh dữ liệu đã đồng bộ.

1. Giải nén gói, giữ bản sao `family-private/sheets.php` hiện đang chạy để có thể khôi phục.
2. Trong Hostinger File Manager, upload đè **chỉ** `family-private/sheets.php` vào đúng thư mục `family-private` của website hiện có. Không đưa file này vào `public_html`.
3. Giữ nguyên `config.php`, database, FAMILY_TOKEN, Sheet và URL `/exec`. Không cần sửa Code.gs, chạy hàm chuyển bố cục hoặc triển khai phiên bản mới.
4. Trên website, đóng Kho tài khoản nếu đang mở để kiểm tra riêng Family/Khách. Mở **Đồng bộ Sheet → Đồng bộ ngay**.
5. Gửi nguyên thông báo mới, đặc biệt phần trong dấu ngoặc vuông. Không gửi token hoặc thông tin tài khoản.

- `[auth]`: endpoint báo token không khớp/không được cấu hình. Kiểm tra đúng dự án Apps Script ứng với URL đang lưu trên website.
- `[unavailable]`: Apps Script gặp lỗi trong khi xử lý. Đây không phải mã phản hồi sai token. Cần kiểm tra đọc/ghi file, bảng Google Table, bảo vệ vùng hoặc lượt chạy đang bận; mã này chưa phân biệt chính xác các nguyên nhân đó.
- `[request]`: script không nhận dạng yêu cầu; đối chiếu URL và phiên bản triển khai.
- `[data]`: dữ liệu không hợp lệ; kiểm tra ngày, gói và liên kết Family.
- `[limit]`: vượt giới hạn số dòng hoặc độ dài dữ liệu.
- `[unknown]`: phản hồi không khớp giao thức. Chưa thể kết luận nguyên nhân.

Lỗi tiêu đề/ID/công thức, lỗi HTTP và trang đăng nhập vẫn có thông báo riêng. Không chuyển tiếp nội dung lỗi thô từ Google vì có thể chứa dữ liệu riêng tư.

Nếu vẫn thấy đúng câu cũ “Google từ chối đồng bộ. Kiểm tra mã kết nối và quyền triển khai Apps Script.”, cần xác nhận đã upload đúng website/thư mục và PHP đang dùng file mới. Không thay token liên tiếp để thử.
