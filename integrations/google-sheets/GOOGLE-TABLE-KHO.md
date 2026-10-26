# Khi Kho đang dùng Google Table “Bảng_1”

Ảnh người dùng cho thấy FamilySync_Kho có bảng Google Table, tên Bảng_1, với ký hiệu loại cột Tt. Writer hiện định dạng cả vùng thành văn bản bằng setNumberFormat('@'). Cột được định kiểu của Google Table có thể từ chối thay đổi này, và lỗi chỉ xuất hiện khi flush gửi thao tác sang Google. Đây là khả năng cần kiểm tra; chưa có thông báo lỗi gốc để khẳng định nguyên nhân trên tài khoản thật.

Không cần thêm gói hoặc đổi deployment để thử chuyển Table thành vùng ô thường:

1. Đóng website Family, chờ lượt đồng bộ kết thúc. Giữ các bản dự phòng Kho_du_phong_….
2. Trong tab chính FamilySync_Kho, bấm mũi tên cạnh nhãn xanh Bảng_1 ngay trên đầu bảng.
3. Chọn mục hoàn nguyên về dữ liệu chưa định dạng (Revert to unformatted data), tức chuyển bảng thành vùng ô thường. Mục này giữ giá trị dữ liệu và bỏ cấu trúc/định dạng Table. Không chọn Delete table / Xóa bảng.
4. Sau khi nhãn Bảng_1 không còn, quay lại Apps Script v5.4 và chạy apDungBoCucKho. Không cần thay mã hoặc triển khai lại nếu /exec đã là v5.4.
5. Chỉ khi có xác nhận bố cục mới cùng dữ liệu đối chiếu khớp, mở URL tab trong nhật ký và kiểm tra A=Ngày trial, B=Email. Giữ bản dự phòng đến khi kiểm tra xong.

Nếu không thấy mục tương ứng, cần xem riêng menu của Bảng_1, không cần gửi ảnh các hàng tài khoản. Nếu vẫn lỗi sau khi bỏ Table, giữ nguyên dữ liệu và gửi thông báo lỗi mới; không tiếp tục thay gói hoặc xóa cột theo suy đoán.
