# Xác định đúng file/tab Kho trước khi thay đổi thêm

Dùng khi nhật ký báo đã chuyển và đối chiếu khớp nhưng tab đang xem vẫn có ID ở A:B và Email ở C. Ảnh như vậy là bố cục cũ, không phải cột Ngày trial bị ẩn. Cần đối chiếu file thực sự được Script Properties cấu hình, và bản triển khai mà website gọi; chưa suy đoán đó là cùng file hoặc web đã dùng đúng phiên bản.

Không cần thay Code.gs hoặc tạo bản triển khai mới để chạy bước kiểm tra này.

1. Tải **XacDinhFileKho.gs**, mở bằng trình soạn thảo văn bản và sao chép nội dung.
2. Trong đúng dự án Apps Script đang dùng, ở cạnh Files / Tệp bấm **+ → Script / Tập lệnh**, đặt tên **XacDinhFileKho**. Thay nội dung mặc định của tệp mới bằng nội dung đã sao chép, rồi Lưu. Giữ nguyên Code.gs và Script Properties.
3. Chọn hàm **xacDinhFileKho → Chạy**.
4. Trong nhật ký, bấm URL ngay sau **MỞ ĐÚNG TAB SCRIPT ĐANG DÙNG**. URL trỏ đúng cả file và tab FamilySync_Kho được script cấu hình. Kiểm tra file này có phải file bạn đang nhìn không.
5. Gửi lại dòng **BỐ CỤC HIỆN TẠI** và cho biết URL vừa mở có phải file trong ảnh không. Không cần gửi ảnh các hàng tài khoản, mật khẩu, khóa 2FA hoặc FAMILY_TOKEN.

Hàm chỉ đọc Script Property FAMILY_SPREADSHEET_ID, thông tin file, hàng tiêu đề và số dòng. Không đọc các hàng tài khoản, không đổi ô/ID/cột, không đổi mã kết nối hay deployment. Phiên bản trong Editor được nêu riêng, không coi đó là phiên bản /exec đang triển khai. Không kết luận Sheet thật đã đổi dựa trên các kiểm thử mô phỏng.
