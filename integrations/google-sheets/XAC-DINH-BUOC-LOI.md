# Xác định bước Apps Script bị lỗi — v5.6

Mã `[unavailable]` xác nhận script đã nhận đúng token nhưng một thao tác bên trong thất bại. Chưa xác định nguyên nhân cụ thể. Bản này bổ sung bước lỗi, nhóm lỗi và số dòng; không tự sửa quyền, Google Table hoặc bố cục, không trả nội dung lỗi thô có thể chứa dữ liệu riêng tư.

## Cập nhật một lần

1. Giữ bản sao Code.gs và file family-private/sheets.php đang chạy để có thể khôi phục. Giữ nguyên Sheet, cấu hình, database, FAMILY_TOKEN và URL /exec.
2. Trong Hostinger File Manager, upload đè file **family-private/sheets.php** trong gói vào đúng thư mục family-private của website. Không đưa vào public_html, không thay config.php.
3. Trong đúng dự án Apps Script đang dùng: thay toàn bộ nội dung **Code.gs** bằng file Code.gs trong gói và nhấn Lưu. Không chạy setupFamilySync, apDungBoCucKho hoặc apDungBoCucKhach.
4. Nhấn **Triển khai → Quản lý các bản triển khai**. Chọn bản có URL /exec đang lưu trên website → nhấn **bút chì**.
5. Ở **Phiên bản**, chọn **Phiên bản mới**. Giữ **Thực thi bằng: Tôi**, quyền **Bất kỳ ai**, rồi nhấn **Triển khai**. Đây là cập nhật bản hiện tại, không phải tạo triển khai mới.
6. Mở URL /exec hiện tại. Cần thấy `script_version: family-groups-compact-v5.7`. Đây chỉ là kiểm tra phiên bản, chưa xác nhận đồng bộ thành công.
7. Trên website, đóng Kho tài khoản nếu đang mở; chọn **Đồng bộ Sheet → Đồng bộ ngay** và gửi nguyên thông báo mới. Không gửi token, mật khẩu hoặc dữ liệu khách.

Ví dụ thông báo sẽ có **Bước: cố định hàng Khách [freeze_members]**, hoặc **Bước: đọc Khách [read_members]**, kèm dòng script nếu Google cung cấp. Đây là bước đang thực hiện khi lỗi xuất hiện; Google có thể trì hoãn áp dụng lệnh, nên lỗi ở flush/định dạng cũng có thể bắt nguồn từ lệnh trước đó. Nhóm lỗi dựa trên thông báo Google, chưa phải kết luận cuối cùng.

Nếu website chỉ hiện thông báo cũ không có bước, kiểm tra file PHP mới đã được upload đúng chỗ và /exec đã chạy v5.6. Có thể xem Apps Script → **Lượt thực thi / Executions** → lượt doPost vừa chạy → dòng nhật ký bắt đầu bằng **FAMILY_SYNC_DIAGNOSTIC**. Chỉ dòng này được tạo từ nhãn cố định và số dòng, không chứa lỗi thô hay giá trị ô.

Đừng thay token, xóa cột, bỏ bảo vệ hoặc chuyển Google Table theo phỏng đoán. Khi có bước lỗi cụ thể mới chọn cách xử lý tương ứng. Nếu đồng bộ thành công, đối chiếu giờ Family/Khách và hạn mới của khách trên Sheet.
