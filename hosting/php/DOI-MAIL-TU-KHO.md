# 0.20.1 — Đổi mail Fix lỗi sang tài khoản đã nhập từ Sheet

Sao lưu dữ liệu trước khi cập nhật. Giải nén family-fix-doi-mail-tu-kho.zip, upload nội dung hai thư mục family-private và public_html vào đúng thư mục đang dùng, giữ config.php/database, sau đó Ctrl+F5. Không cần thay Apps Script. Gói giữ các tính năng 0.20.0, schema8.

Khi hoàn tất Fix lỗi của mail quản lý A và đổi sang B đã nhập từ Sheet Kho:

- Nếu B đang gắn với Family trống có thông tin Kho, Family A giữ ID, thành viên và lịch sử; nhận B cùng nguyên hồ sơ Kho đã mã hóa (mật khẩu, 2FA, mail khôi phục, Note), giữ ngày trial của B nếu có.
- Family trống từng chứa B chuyển thành Family lưu trữ cho mail A cũ. Thông tin Kho cũ của A được giữ ở đó. Không xóa thông tin tài khoản cũ.
- Nếu Family B có khách, case lỗi hoặc hồ sơ khách lưu trữ, thao tác bị chặn để tránh tự ý gộp hai nhóm đang dùng.
- Nếu B chưa có trong hệ thống, vẫn dùng luồng cũ: thay mail, đặt trial theo ngày xác nhận và để trống Kho để nhập cho tài khoản mới.
- Áp dụng cho đổi mail quản lý Family; không tự gộp hồ sơ mail khách. Tài khoản Kho độc lập chưa gắn với Family cần được kiểm tra liên kết trước.

Các bước cập nhật nằm trong một giao dịch: lỗi giữa chừng khôi phục toàn bộ liên kết. Không giải mã hoặc đưa mật khẩu/2FA vào nhật ký.
