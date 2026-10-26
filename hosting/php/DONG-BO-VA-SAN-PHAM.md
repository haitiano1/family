# Cập nhật 0.20.0: đồng bộ, Fix lỗi và Sản phẩm khác

## Cài trên Hostinger

1. Tải file sao lưu từ Tiện ích → Sao lưu / Chuyển dữ liệu trước khi cập nhật. Giữ bản sao file ứng dụng hiện tại.
2. Đóng các tab Family. Giải nén family-dong-bo-va-san-pham.zip, upload nội dung hai thư mục family-private và public_html vào đúng hai thư mục đang dùng, ghi đè mã nguồn tương ứng. Giữ config.php và database hiện tại.
3. Mở lại web rồi Ctrl+F5. Bản này tự bổ sung cột Nguồn mua khi mở lần đầu (schema 8); tài khoản database cần quyền ALTER TABLE. Không cần tự chạy SQL. Không cần đổi Apps Script, URL /exec hoặc token.

## Đồng bộ

Nút trạng thái trên đầu trang mở phần Trạng thái/Lịch sử đồng bộ. Family/Khách và Kho có trạng thái, lần thành công gần nhất riêng; Kho chỉ chạy khi mở khóa ở mục Kho.

Lịch sử bắt đầu từ bản này, giữ tối đa 100 lượt, phân trang 20 lượt. Hiện số dòng thêm/sửa/xóa theo hướng Sheet → Web và Web → Sheet. Nếu đã nhập vào web nhưng ghi Google chưa được xác nhận, thông báo nêu rõ chưa hoàn tất. Lượt tự kiểm tra thành công không thay đổi dữ liệu không làm đầy lịch sử. Không ghi giá trị khách, mật khẩu, khóa 2FA hoặc token vào lịch sử.

Thông tin lịch sử nằm trong metadata kết nối trên hosting; ngắt kết nối vẫn giữ lịch sử. File sao lưu khách hàng không bao gồm lịch sử đồng bộ hoặc tùy chọn thứ tự case. Mở web để tự kiểm tra mỗi 30 giây; đóng web thì không có tác vụ đồng bộ nền.

## Fix lỗi

Lỗi mới báo đứng trên cùng. Kéo thẻ lên/xuống trong cùng cột để sắp xếp, hoặc dùng nút ↑/↓ trên điện thoại/bàn phím. Thứ tự lưu trên hosting, giữ khi tải lại hoặc dùng thiết bị khác. Bấm Mới nhất để đặt lại thứ tự theo ngày báo. Nếu tab khác đổi dữ liệu trước, hệ thống yêu cầu tải lại thay vì ghi đè thứ tự cũ. Chuyển cột tiếp tục dùng quy trình đổi trạng thái/hoàn tất hiện có.

## Sản phẩm khác

Có cột Nguồn mua; nhập khi thêm/sửa, tìm kiếm theo nguồn và giữ khi lưu trữ/khôi phục. Nguồn mua được đưa vào file sao lưu phiên bản 9; vẫn nhận bản sao cũ, trường này mặc định trống.

Nhập từ Sheet: copy bảng có hàng tiêu đề từ Google Sheet/Excel rồi dán, hoặc chọn CSV/TSV (tối đa 1 MB, 500 dòng). Chọn cột → Xem trước → kiểm tra → xác nhận nhập. Bắt buộc Sản phẩm và Tên khách hoặc Email. Các cột tùy chọn: Nguồn mua, Contact, Gói mua, Ngày mua, Ngày hết hạn, Thanh toán, Số tiền, Ghi chú. Ngày dd/mm/yyyy hoặc yyyy-mm-dd; tiền nguyên VND như 165000 hoặc 165.000 đ. Nếu thiếu hạn và có ngày mua/gói tháng, tự tính hạn. Dòng trùng hoàn toàn bỏ qua; không ghi đè hồ sơ có sẵn. Có dòng lỗi thì sửa rồi xem trước lại, chưa lưu dòng nào. Đây là nhập dữ liệu một lần, không phải đồng bộ tự động Sản phẩm khác.

Bản này chưa được phát hành lên GitHub Releases. Cài bằng upload thủ công; nút cập nhật một chạm không tự chuyển schema 7 sang 8.
