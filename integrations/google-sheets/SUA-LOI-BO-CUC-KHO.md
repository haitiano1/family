# Sửa lỗi apDungBoCucKho dừng sau khi tạo bản dự phòng

Bản Apps Script: **family-groups-compact-v5.7**. Gói sửa này dành cho website đã cập nhật PHP theo NHAP-TAI-KHOAN.md. **Không cần upload lại PHP** nếu đã thay sheets.php ở gói nhập tài khoản trước đó.

## Bản sửa giải quyết gì?

Bản trước đọc ngày trial từ tab Family bằng chuỗi hiển thị rồi yêu cầu yyyy-mm-dd khi chuyển Kho. Nếu ô đang là ngày thực Google hoặc văn bản dd/mm/yyyy, bước chuyển có thể dừng với thông báo quá chung, giống lỗi sau khi vừa tạo Kho_du_phong_….

Bản mới đọc đúng giá trị ngày và năm từ Google, nhận dd/mm/yyyy hoặc yyyy-mm-dd, kiểm tra ngày hợp lệ. Văn bản 18/10 thiếu năm vẫn yêu cầu bổ sung năm; không tự đoán năm từ hôm nay.

Ngoài ra có hàm kiểm tra **chỉ đọc**, và lỗi chuyển bố cục nêu rõ bước, tab/dòng/cột khi xác định được. Không đưa giá trị ô, mật khẩu, khóa 2FA hoặc lỗi Google thô có thể chứa giá trị ô vào nhật ký. Chưa xác nhận Sheet thật của bạn có đúng nguyên nhân này trước khi chạy kiểm tra.

## Thực hiện

1. Đóng các tab website Family, chờ đồng bộ đang chạy kết thúc. Giữ tab dự phòng Kho_du_phong_… đã tạo trong lần lỗi trước; không xóa cột, không tạo Sheet hoặc kết nối mới.
2. Trong đúng dự án Apps Script đang kết nối, thay toàn bộ **Code.gs** bằng file trong gói sửa, bấm **Lưu**. Giữ nguyên Script Properties, FAMILY_TOKEN, FAMILY_SPREADSHEET_ID và appsscript.json.
3. Trong Editor chọn **kiemTraBoCucKho → Chạy**. Hàm này chỉ đọc, không cấp ID, đổi ô hay tạo bản sao. Nếu hiện **KIỂM TRA ĐẠT**, tiếp tục bước 4. Nếu báo lỗi, dừng và gửi thông báo mới (chỉ có bước/vị trí lỗi), không gửi các ô tài khoản.
4. **Triển khai → Quản lý các bản triển khai → bản hiện tại → bút chì → Phiên bản mới → Triển khai**. Giữ nguyên URL /exec và quyền **Bất kỳ ai**. Mở đúng URL đang lưu trên website và kiểm tra `script_version` là `family-groups-compact-v5.7`.
5. Quay lại Editor, chọn **apDungBoCucKho → Chạy**. Hàm tự tạo thêm bản dự phòng ẩn rồi đổi tab gốc. Chờ **HOÀN TẤT**. Nếu lỗi, giữ bản dự phòng và gửi dòng thông báo mới; không lặp lại liên tục.
6. Khi thành công, tab FamilySync_Kho có Ngày trial ở A, Email ở B, các trường tài khoản theo sau; ID H:I bị ẩn. Mở website → mục Kho → mở khóa → Đồng bộ ngay và kiểm tra thông tin.

Nếu bước kiểm tra chỉ đọc báo **FamilySync_Family, dòng N, cột 4**, hãy kiểm tra ô ngày trial của dòng đó: nhập đủ dd/mm/yyyy hoặc yyyy-mm-dd, hoặc để trống nếu chưa biết. Sau đó chạy lại kiemTraBoCucKho.

## Kiểm chứng

30 kiểm thử Apps Script mô phỏng đã đạt, gồm tái hiện lỗi cũ rồi sửa ngày trial thực/văn bản, chuyển Kho giữ nguyên dữ liệu/ID, kiểm tra chỉ đọc không ghi ID, thông báo vị trí lỗi, giữ bản dự phòng và che nội dung lỗi Google chứa thông tin tài khoản giả. Chưa áp dụng hoặc xác minh trên tài khoản Google thật. Backend PHP không thay đổi trong gói sửa này.

Nếu dừng ở bước **ẩn ID và chỉnh hiển thị**, xem **SUA-HIEN-THI-KHO.md**. Bản v5.2 đối chiếu dữ liệu bắt buộc và báo riêng từng thao tác hiển thị chưa áp dụng.
