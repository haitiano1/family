# Xác nhận đúng file, đúng tab và đúng bố cục Kho

Bản Apps Script: **family-groups-compact-v5.7**. PHP giữ nguyên như gói nhập tài khoản trước.

Ảnh có ID ở A:B và Email ở C là bố cục cũ. Nhật ký “dữ liệu đối chiếu khớp” ở bản cũ chỉ xác nhận các trường tài khoản, không bắt buộc xác nhận tiêu đề đã đổi. Vì vậy trước đây nó chưa đủ để chứng minh cột Ngày trial đã có. Bản v5.3 bổ sung kiểm tra bắt buộc toàn bộ tiêu đề A:I, in URL đúng file và đúng tab (gid), rồi mới đối chiếu và báo thành công.

Không thể xác định chỉ từ ảnh rằng bản triển khai cũ, tab chưa tải lại hay thao tác khác đã thay đổi bố cục. Kiểm tra trước, không tự xóa bảng/cột hoặc chọn bản dự phòng thay cho tab chính.

## Kiểm tra trước khi cập nhật thêm

1. Xác nhận FAMILY_SPREADSHEET_ID trùng với đoạn ID giữa /d/ và /edit của file đang xem.
2. Mở đúng /exec trong website → Đồng bộ Sheet → Link script đang kết nối, kiểm tra script_version. Không coi phiên bản trong Editor là phiên bản đang chạy trên website.
3. Tải lại Google Sheet bằng Ctrl+Shift+R hoặc đóng/mở lại file. Nếu cột A đã là Ngày trial, không cần chuyển bố cục lại chỉ vì giao diện cũ chưa tải lại.

## Nếu vẫn thấy bố cục cũ

1. Đóng các tab website Family và chờ một phút để lượt đồng bộ đang chạy kết thúc. Giữ các bản dự phòng Kho_du_phong_….
2. Thay toàn bộ Code.gs bằng bản v5.3 trong gói, bấm Lưu. Giữ nguyên Script Properties, Sheet và URL.
3. Trong Editor chạy **kiemTraBoCucKho**. Đây là bước chỉ đọc. Nhật ký mới in **TAB SCRIPT ĐANG KIỂM TRA** kèm URL đúng tab, và **BỐ CỤC HIỆN TẠI: MỚI/CŨ**. Bấm URL trong nhật ký để mở trực tiếp tab đó, không chỉ chọn lại file có tên giống nhau.
4. Nếu xác nhận cần đổi, cập nhật **bản triển khai hiện tại → bút chì → Phiên bản mới → Triển khai**. Giữ nguyên quyền Bất kỳ ai và URL /exec. URL đang lưu trên web cần trả `family-groups-compact-v5.7`.
5. Chạy **apDungBoCucKho**. Hàm tạo bản dự phòng; sau khi ghi, phải xác nhận A=Ngày trial, B=Email, các trường còn lại và ID ở H:I đúng mẫu. Nếu vẫn là bố cục cũ, hàm báo lỗi ở **xác nhận bố cục Kho A:I** thay vì báo đã chuyển xong.
6. Chỉ khi thấy **ĐÃ XÁC NHẬN BỐ CỤC MỚI** và dữ liệu đối chiếu khớp, bấm URL sau **MỞ TAB ĐÃ ĐỐI CHIẾU**, tải lại tab đó. Lỗi cố định hàng/độ rộng vẫn được báo riêng, không thay cho việc xác nhận bố cục/dữ liệu.
7. Sau khi kiểm tra đúng trên Sheet, mở lại web, mở khóa Kho và đồng bộ. Nếu bố cục chỉ quay về cũ sau bước này, giữ nguyên các bản dự phòng và kiểm tra các bản website/triển khai khác có đang ghi cùng file.

Chưa cần gửi ảnh chứa tài khoản. Khi cần hỗ trợ, chỉ gửi các dòng thông báo phiên bản/bố cục và vị trí lỗi, không gửi mật khẩu, khóa 2FA hoặc FAMILY_TOKEN.

## Kiểm thử

30 kiểm thử Apps Script và 3 kiểm thử hàm chẩn đoán file đã đạt. Có trường hợp mô phỏng hàng tiêu đề bị trả về bố cục cũ nhưng dữ liệu tài khoản vẫn khớp: bản mới phải từ chối xác nhận đổi xong, cả khi chạy hàm bằng tay lẫn khi nhận yêu cầu đồng bộ. URL trả về và xác nhận bố cục mới cũng được kiểm tra. Chưa áp dụng hoặc xác minh trực tiếp trên tài khoản Google của bạn.

Bản hiện tại lưu và đối chiếu dữ liệu Kho trước khi định dạng; xem **GHI-KHO-TRUOC-DINH-DANG.md** nếu lỗi còn ở bước xác nhận tiêu đề A:I.
