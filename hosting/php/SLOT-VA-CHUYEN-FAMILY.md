# Slot và chuyển Family — 0.18.0

## Cách đếm

Mục **KHÁCH ĐANG GHI NHẬN** trong danh sách Family, chi tiết Family và phần chọn/kiểm tra nhóm nhận khi chuyển khách dùng cùng một cách tính:

- Trạng thái hiện có **Đã mời, chưa vào** (`invited`) không chiếm slot. Khách vẫn được lưu và xuất hiện trong danh sách.
- Các trạng thái **Chưa xác minh**, **Đã vào**, **Mua mới** vẫn chiếm slot.
- Mẫu luôn là `x/5`: `0/5`, `2/5`, `5/5`, `6/5`. Nếu có người chưa vào, thêm số lượng như `3/5 (2 chưa vào)` hoặc `6/5 (1 chưa vào)`.
- Bộ lọc **Fam dư slot** lấy Family có số khách chiếm slot dưới 5; khách chưa vào không làm mất nhóm khỏi bộ lọc.

Mẫu số 5 là số chỗ tham chiếu, không bị tăng lên 6 khi nhóm có 6 người. Không tính tài khoản quản lý vào số khách.

## Chuyển khách

Cho phép chuyển sang Family đang 5/5 hoặc đã vượt 5/5. Khách đang chiếm slot được chuyển vào nhóm 5/5 thì hiển thị 6/5; khách chưa vào được chuyển vào nhóm 5/5 thì hiển thị 5/5 (1 chưa vào). Trạng thái của khách được giữ nguyên.

Vẫn kiểm tra email trùng, email trùng chủ nhóm, Family lưu trữ, thông tin cũ và hai thao tác cùng chuyển một khách. Hai khách khác nhau cùng chuyển vào một nhóm đều được nhận và ghi nhật ký riêng. Gói, hạn, thanh toán, lịch sử và xử lý case Fix lỗi giữ theo luồng chuyển hiện có.

Family vượt 5 vẫn sửa được hồ sơ khách hiện có, cập nhật từ CSV hoặc Sheet nếu không làm tăng số slot. Quy tắc thêm khách mới và đổi một khách chưa vào sang trạng thái chiếm slot vẫn giữ giới hạn hiện có là 5; ngoại lệ cho việc vượt số này là **Chuyển Family** theo yêu cầu.

## Cài trên Hostinger

1. Sao lưu dữ liệu trong website và giữ bản sao các file hiện tại.
2. Giải nén **family-slot-va-chuyen-family.zip**, upload nội dung hai thư mục **family-private** và **public_html** vào đúng hai thư mục đang dùng.
3. Giữ nguyên **config.php**, database, Sheet, URL /exec và mã kết nối. Gói không có config.php và không có migration mới.
4. Mở lại website, Ctrl+F5. Kiểm tra Family có 3 khách chiếm slot và 2 khách **Đã mời, chưa vào** hiển thị **3/5 (2 chưa vào)**.
5. Chuyển khách vào Family đang **5/5**, kiểm tra đích **6/5** và dữ liệu khách được giữ. Nếu đã kết nối Sheet, đồng bộ Family/Khách để đối chiếu nhóm mới.

Không cần thay Apps Script hoặc triển khai lại Google. Các tab đồng bộ tiếp tục dùng vùng ô thường như bản đã hoạt động. Cập nhật tự động chỉ thấy gói sau khi bản phát hành tương ứng được người quản lý repository đưa lên GitHub Releases.
