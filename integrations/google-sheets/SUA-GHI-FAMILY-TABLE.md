# Lỗi ghi Family tại flush — Google Table và vùng ô thường

## Kết quả trên website đang dùng

Sau khi sửa kết nối MySQL, Google báo `[unavailable]`, bước `[write_families]`, dòng 196 ở script v5.7. Dòng này là `SpreadsheetApp.flush()`, nơi Google áp dụng các lệnh trước đó. Tab Family trong ảnh là Google Table **Bảng_2**; các ô Ngày trial có thẻ xổ xuống. Người dùng đã chuyển bảng về dữ liệu chưa định dạng và xác nhận đồng bộ thành công.

Giữ tab **FamilySync_Family** ở dạng vùng ô thông thường nếu đã đồng bộ được. Không cần cài thêm hoặc tạo lại bảng để xử lý lỗi hiện tại. Các tab đồng bộ nên dùng vùng ô thường vì script quản lý cách ghi, ngày và phần dữ liệu ẩn. Giữ nguyên ID/cột ẩn; đối chiếu email/hạn đã đổi trong tab Khách sau lượt đồng bộ thành công.

Kết quả trên xác nhận lỗi ghi gắn với ràng buộc Google Table. Chưa có thông báo Google gốc để tách riêng tác động của kiểu cột, xác thực dữ liệu và định dạng trong bảng.

## Quy tắc duy trì

Luồng hiện tại có ghi và định dạng ô bằng Apps Script, có thể xung đột với ràng buộc kiểu cột hoặc xác thực dữ liệu của Google Table. Vùng ô thường là bố cục được khuyến nghị cho cả ba tab đồng bộ. Chưa hỗ trợ đầy đủ mọi cấu hình Google Table.

Sau khi đồng bộ được, đối chiếu giờ Family/Khách vừa cập nhật, email mới và hạn mới trên Sheet. Giữ nguyên Code.gs v5.7, bản PHP đã sửa kết nối MySQL, URL /exec và mã kết nối. Không cần triển khai lại hoặc upload thêm file cho lỗi này.

Đã bổ sung kiểm thử mô phỏng lỗi định dạng chỉ xuất hiện tại flush: script dừng trước khi ghi Khách và không trả thành công. Khi bỏ ràng buộc bảng trong mô phỏng, dữ liệu Family và Khách đồng bộ được, giữ nguyên ID và schema giao tiếp.
