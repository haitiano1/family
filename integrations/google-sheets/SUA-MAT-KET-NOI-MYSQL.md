# Sửa mất kết nối MySQL khi đồng bộ Google Sheet

## Lỗi đã xác định

Thông báo `[php_sync]`, bước `[read_remote]`, loại `[database]`, mã `[db_connection]`, tại `core.php:65` xác nhận PHP gặp kết nối MySQL bị ngắt trong luồng chờ Google. Dòng core.php là hàm chạy SQL chung; thông báo này không xác định được cấu hình hoặc sự cố mạng nào của hosting đã ngắt kết nối.

Luồng cũ nhả khóa ứng dụng trong lúc gọi Google rồi dùng lại kết nối MySQL đó. Nếu MySQL đóng kết nối đang rảnh, bước lấy lại khóa thất bại. Lỗi dọn dẹp cũng có thể che thông báo lỗi gốc từ Google.

## Thay đổi

- Nối lại MySQL tại ranh giới gọi Google, khi không có giao dịch dữ liệu đang mở.
- Lấy lại khóa đồng bộ và khóa ứng dụng trước khi tiếp tục. Nếu một lượt khác đang chạy, dừng và báo thử lại.
- Giữ phản hồi Google đã nhận nếu cấu hình, ID và mốc đồng bộ không đổi. Nhờ đó, Google phản hồi chậm hơn thời gian chờ MySQL ở cả bước đọc lẫn ghi vẫn có thể hoàn tất, không cần gọi Google lặp lại.
- Nếu lượt khác đã thay đổi trạng thái đồng bộ trong lúc mất kết nối, đọc lại cả dữ liệu web và Sheet; chỉ khởi động lại một lần trong yêu cầu đó.
- Giữ mốc của đúng dữ liệu đã gửi; các thay đổi web phát sinh khi Google đang ghi vẫn được gửi ở lần tiếp theo. Kiểm tra lại phiên mở khóa Kho sau khi đọc dữ liệu. Giữ nguyên thông báo Google khi cả Google và việc dọn dẹp kết nối cùng lỗi.
- Không tự chạy lại câu SQL ghi hoặc giao dịch đang lỗi. Không nâng cấp cấu trúc database trong bước nối lại.

Đã kiểm thử bằng MySQL thật với `wait_timeout=1`, ngắt kết nối ở cả đọc/ghi, phản hồi ghi đã thành công, thay đổi đồng thời, lượt đồng bộ tranh khóa, giới hạn thử lại và phiên Kho bị thu hồi. Đây là kiểm thử dữ liệu giả; cần đối chiếu kết quả sau khi áp dụng trên hosting.

## Cài vào website đang dùng

1. Trong Hostinger File Manager, tải giữ bản sao file **family-private/sheets.php** hiện tại.
2. Upload đè file **family-private/sheets.php** trong gói vào đúng thư mục **family-private**, nằm ngoài **public_html**. Giữ nguyên config.php và database.
3. Tải lại website. Vào **Khách → Đồng bộ Sheet → Đồng bộ ngay**. Nếu đang mở Kho, đóng/khóa Kho trước để kiểm tra riêng Family/Khách.
4. Kiểm tra thông báo thành công, giờ **Family/Khách** vừa cập nhật và đối chiếu email/hạn đã sửa trong **FamilySync_Khach**. Sau đó có thể vào Kho, mở khóa và đồng bộ Kho.
5. Nếu còn lỗi, gửi nguyên thông báo mới có mã bước và loại lỗi. Không gửi mật khẩu, 2FA, FAMILY_TOKEN hoặc nội dung config.php.

Giữ nguyên Code.gs v5.7, Sheet, URL /exec và mã kết nối. Không cần triển khai lại Apps Script hoặc thay thông số MySQL trên Hostinger. Bản này đã chứa phần chẩn đoán PHP ở gói trước.
