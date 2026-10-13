# Cập nhật Family đã cài lên bản0.8

Website Family đã có config.php và MySQL riêng: chỉ thay file chương trình trên chính website này. Bản cập nhật không chứa config.php hoặc dữ liệu khách; MySQL tự thêm bảng/cột lỗi/nhật ký/ngày trial khi mở app sau cập nhật. Không cần tạo database hoặc nhập lại khách.

1. Trong Family đang chạy, **Sao lưu / Chuyển dữ liệu → Tải file sao lưu** để giữ một bản trên máy tính.
2. Tải [family-hostinger-update.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger-update.zip) và **giải nén trên máy tính**. Có public_html và family-private.
3. Trong hPanel mở File Manager **đúng website Family**, mở family-private đang có config.php. Bấm Upload, chọn toàn bộ file **bên trong family-private của gói cập nhật** (Ctrl+A trong hộp chọn file), xác nhận thay thế file trùng.
4. Về thư mục gốc và mở public_html chính. Upload toàn bộ file **bên trong public_html của gói cập nhật**, thay thế file trùng. Tải **file bên trong**, không tạo thêm public_html/public_html hoặc family-private/family-private. Giữ file config.php/database hiện có.
5. Mở website Family, **Ctrl+F5** trên máy tính để tải giao diện mới. Nếu dùng iPhone, đóng rồi mở lại biểu tượng Family; khi cần thử bằng Safari tải lại trang.
6. Kiểm tra hồ sơ khách/Family được giữ. Bộ lọc khách chỉ còn3lựa chọn; Confirmed gộp khách chờ tiền/trả một phần và quá hạn chưa nhận đủ tiền gia hạn. Khách xếp theo hạn gần trước, hạn trống cuối. Icon sau tên/email/Contact sao chép đúng từng mục; liên kết Contact bấm mở được. Chọn Không gia hạn chuyển ngay vào Khách lưu trữ; các khách đã chọn từ bản cũ cũng sẽ được chuyển khi mở app, không cần nhập lại dữ liệu. Vào Family → Sửa → Ngày trial để nhập ngày. Cột Ngày trial hiện ngày này. Báo lỗi tự ghi ngày Việt Nam hiện tại và số ngày dùng;10/08 đến15/08 là5 ngày, chốt theo lần báo. Case cũ chưa có ngày trial không tự lấy ngày mới nhập. Case Đã fix có Xóa case, nhật ký giữ dữ liệu trước xóa. Chữ trên điện thoại đã tăng cỡ. Tìm kiếm Family, Báo lỗi rồi chuyển thẻ Chờ fix/Đang fix/Đã fix. Lựa chọn Đổi mail cập nhật cả hồ sơ quản lý/khách tương ứng trong Family; thẻ Done và nhật ký ghi từ mail cũ sang mail mới. Giữ nguyên không sửa email hồ sơ.
7. Mở Nhật ký và Xem chi tiết một lần sửa. Các thao tác sau cập nhật có trước/sau; log cũ chỉ có nội dung. Thao tác lỗi/xung đột không lưu một phần dữ liệu; kiểm tra thông báo và tải lại để xử lý.

Thẻ lỗi đã hoàn tất có thể chuyển lại Chờ fix/Đang fix; các lần hoàn tất trước vẫn có trong nhật ký. Bảng có lựa chọn trạng thái trên từng thẻ cho iPhone. Nhật ký hỗ trợ đối chiếu dữ liệu đã sửa/xóa, chưa có nút hoàn tác tự động.

Nếu gặp lỗi sau cập nhật, kiểm tra các file mới audit.php, issues.php và features.sql đã có trong family-private, và api.php/app.js/domain.js/contacts.js/index.html/style.css đã cập nhật trong public_html. Gói cập nhật chỉ đổi source, không chứa hoặc ghi đè cấu hình riêng. Bộ mã đầy đủ vẫn ở family-hostinger.zip dành cho cài mới.
