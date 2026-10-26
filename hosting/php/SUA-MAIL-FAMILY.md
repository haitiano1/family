# 0.20.2 — Đổi email trong Sửa Family

Sao lưu dữ liệu rồi upload nội dung hai thư mục family-private và public_html của gói family-sua-mail-family.zip vào đúng thư mục đang dùng. Giữ config.php và database, sau đó Ctrl+F5. Không cần chạy SQL hoặc thay Apps Script; schema8 giữ nguyên.

Khi đổi email quản lý A sang B trong Sửa Family, thông tin Kho đang gắn với Family được ngắt liên kết. B không sử dụng mật khẩu, khóa 2FA, mail khôi phục hoặc Note của A. Mở Kho để nhập thông tin của B sau. Hồ sơ mã hóa của A được giữ riêng trong Thông tin chưa ghép Family; không xóa dữ liệu cũ. Chỉ sửa tên, ghi chú hoặc ngày trial mà giữ nguyên email sẽ không ngắt Kho.

Tên Family, danh sách khách và lịch sử được giữ. Nếu cập nhật thất bại, thay đổi email và liên kết Kho cùng được hoàn tác. Luồng Đã fix / Đổi mail mới không thay đổi.
