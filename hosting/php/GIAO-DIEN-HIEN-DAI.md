# Giao diện hiện đại — 0.19.0

## Cài trên Hostinger

1. Tải bản sao dữ liệu hiện tại bằng **Tiện ích → Sao lưu / Chuyển dữ liệu** (bản cũ có nút Sao lưu trên thanh đầu trang). Giữ bản sao các file ứng dụng trước khi ghi đè.
2. Đóng các tab Family trong lúc upload. Giải nén **family-giao-dien-hien-dai.zip**.
3. Upload nội dung thư mục **family-private** vào family-private đang dùng, và nội dung **public_html** vào public_html đang dùng. Chọn ghi đè các file mã nguồn tương ứng. Giữ **config.php** và database hiện tại; gói không có cấu hình thật hoặc dữ liệu khách.
4. Mở lại website, nhấn **Ctrl+F5**. Trên điện thoại tải lại trang; nếu còn giao diện cũ, đóng và mở lại tab ứng dụng.

Không cần chạy SQL, thay Apps Script, URL /exec hoặc mã kết nối. Gói giữ các bản sửa ngày nhận tiền, slot Family và đồng bộ trước đó. Gói chưa được đưa lên GitHub Releases; cài bằng upload thủ công như bạn đã chọn.

## Các thay đổi giao diện

- **Tổng quan:** bốn nhóm việc hôm nay, danh sách khách ưu tiên, trạng thái Family và lối vào nhanh Kho/Thống kê.
- **Điều hướng:** Tổng quan, Khách, Family và Kho tài khoản luôn sẵn; Thêm chứa Thống kê, Fix lỗi, sản phẩm, nhật ký, lưu trữ và nhập CSV. Điện thoại dùng thanh điều hướng dưới cùng.
- **Tiện ích:** Đồng bộ Sheet vẫn ở thanh đầu trang nếu đã hỗ trợ. Cập nhật một chạm, sao lưu và khóa ứng dụng nằm trong Tiện ích.
- **Danh sách:** nhấn mạnh tên/email, hạn và nút Gia hạn; thao tác phụ ở dấu …; Family hiển thị x/5 cùng thanh số chỗ và số chưa vào.
- **Form:** nhãn và ô ngày mua/hết hạn được nhóm đúng, nút và vùng chạm rõ, hộp thoại thích ứng màn hình nhỏ.
- **Thống kê:** giữ thứ tự Gia hạn → Khách mua mới → 6 tháng gần nhất. Giải thích chi tiết nằm trong phần mở rộng để trang gọn hơn.

## Quy tắc dữ liệu được giữ

Không thay cách tính ngày nhận tiền, nối kỳ từ hạn cũ, thống kê theo tháng của hạn cũ, trạng thái Mua mới, khách chưa vào không chiếm slot hoặc chuyển Family vượt 5. Tìm không dấu, phân trang và bộ lọc khi quay lại tiếp tục hoạt động. Website chỉ thay mã sau khi bạn upload gói; không có kết nối tự động vào Hostinger hoặc dữ liệu thật trong quá trình kiểm tra.
