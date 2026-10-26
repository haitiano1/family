# Chẩn đoán lỗi PHP đồng bộ Family/Khách

## Phạm vi

Gói này thay một file **family-private/sheets.php** để lỗi PHP trong luồng đồng bộ có mã bước và loại lỗi. Đây là bản bổ sung chẩn đoán, chưa xác nhận nguyên nhân hoặc sửa lỗi trên Hostinger khi chưa có kết quả mới. Giữ nguyên Code.gs v5.7, URL /exec, mã kết nối, cấu hình và database.

File Code.gs v5.7 đã đối chiếu: dòng 198 chỉ đóng hàm `familyWrite`. Một số dòng trong ngăn xếp Apps Script không phải câu lệnh đầu tiên gây lỗi; cần cả phần Bước và lý do. Thông báo hiện tại “Lỗi hệ thống. Kiểm tra cấu hình hoặc nhật ký lỗi của website Family.” là thông báo chung phía PHP, không đủ kết luận cùng nguyên nhân với lỗi script trước đó.

## Thao tác

1. Trong Hostinger File Manager, lưu bản sao file **family-private/sheets.php** đang chạy.
2. Upload đè **family-private/sheets.php** trong gói vào đúng thư mục **family-private** của website. Thư mục này nằm ngoài **public_html**. Không upload vào public_html và không thay config.php.
3. Tải lại website. Đóng/khóa Kho nếu đang mở rồi vào mục **Khách**, để lượt thử chỉ đồng bộ Family/Khách.
4. Chọn **Đồng bộ Sheet → Đồng bộ ngay** và gửi nguyên thông báo mới. Ví dụ dạng `Lỗi PHP khi đồng bộ Family/Khách [php_sync]. Bước: [apply_core]. Loại: [database]. Mã: [db_column]. Vị trí PHP: records.php:...`.

Thông báo chỉ dùng nhãn cố định, tên file mã nguồn cho phép và số dòng. Không đưa câu SQL, thông báo lỗi thô, mật khẩu, 2FA hoặc mã kết nối lên màn hình. Không cần gửi dữ liệu khách hoặc nội dung config.php.

## Đọc kết quả

- `read_remote`: đang gọi Google đọc dữ liệu.
- `validate_remote`: kiểm tra cấu trúc phản hồi.
- `snapshot_local`: đọc dữ liệu web và trạng thái đồng bộ.
- `merge`: đối chiếu thay đổi web/Sheet.
- `begin_import`, `apply_core`, `apply_vault`, `commit_import`: xử lý dữ liệu vào web và nhật ký.
- `snapshot_output`, `write_remote`: chuẩn bị/gửi dữ liệu ra Sheet.
- `save_state`: lưu mốc đồng bộ sau lượt thành công.
- `db_column`, `db_table`: MySQL báo thiếu cột/bảng; `db_collation`: xung đột collation; `db_permission`: thiếu quyền; `missing_function`: PHP thiếu hàm ở mã đang chạy. Đây là phân loại lỗi máy chủ, cần đối chiếu bước/vị trí để sửa đúng nguyên nhân.

Nếu vẫn hiện nguyên câu lỗi chung cũ, gửi lại câu đó và xác nhận đường dẫn đã upload. Lỗi có thể xảy ra trước khi tới bộ đồng bộ hoặc file mới chưa được nạp. Chưa xóa tab, cột ẩn, ngắt kết nối hay chạy setup để thử sửa.
