# Sửa lỗi ở bước “ẩn ID và chỉnh hiển thị”

Bản Apps Script **family-groups-compact-v5.7**. Áp dụng cho website đã cập nhật PHP nhập tài khoản ở gói trước. Không cần upload lại PHP.

Ảnh lỗi cho thấy hàm đã qua bước ghi tài khoản và dừng trong nhóm thao tác trình bày (cố định hàng, chỉnh độ rộng, ẩn/hiện cột hoặc ghi chú). Nhóm cũ chưa ghi được chính xác thao tác con nào thất bại; không thể khẳng định đó là lỗi quyền hay lỗi ngày chỉ từ thông báo đó. Dữ liệu chưa được đối chiếu trước khi hàm cũ dừng, nên giữ các bản dự phòng.

Bản mới tiếp tục đối chiếu đầy đủ tài khoản sau khi thử từng thao tác hiển thị. Ghi dữ liệu, ID và đối chiếu vẫn là các bước bắt buộc. Lỗi ghi/đối chiếu vẫn dừng hàm; lỗi trình bày được báo riêng theo đúng thao tác, không bị giấu hoặc coi là đã áp dụng thành công. Ẩn/hiện cột có cách gọi dự phòng từng cột nếu cách gọi theo nhóm thất bại.

## Thực hiện

1. Đóng các tab website Family, chờ đồng bộ kết thúc. Giữ các tab dự phòng Kho_du_phong_…; không tự xóa cột hoặc sửa ID.
2. Mở đúng dự án Apps Script đang dùng, thay toàn bộ Code.gs bằng file trong gói, bấm Lưu. Giữ nguyên Script Properties và appsscript.json.
3. Triển khai → Quản lý các bản triển khai → bản hiện tại → bút chì → Phiên bản mới → Triển khai. Giữ nguyên URL /exec và quyền Bất kỳ ai. Mở đúng URL đang lưu trên website để kiểm tra `script_version: family-groups-compact-v5.7`.
4. Trong Editor chọn **apDungBoCucKho → Chạy**. Hàm đọc được cả bố cục cũ và bố cục mới đã ghi ở lượt trước; tạo bản dự phòng trước khi chạy lại. Nếu cần kiểm tra trước mà không thay đổi gì, chạy **kiemTraBoCucKho**.
5. Xem nhật ký:
   - **HOÀN TẤT**: dữ liệu đã đối chiếu khớp và toàn bộ thiết lập trình bày đã áp dụng.
   - **DỮ LIỆU ĐÃ ĐỐI CHIẾU KHỚP** rồi **CHƯA ÁP DỤNG: …**: dữ liệu đã khớp, chỉ còn thao tác trình bày được nêu tên. Không cần chạy lại liên tục. Chỉnh thao tác đó bằng tay theo phần dưới.
   - **CHƯA HOÀN TẤT** ở bước ghi tài khoản/đối chiếu: chưa xác nhận chuyển thành công; giữ bản dự phòng và gửi thông báo mới, không gửi dữ liệu ô tài khoản.
6. Sau khi dữ liệu đã đối chiếu khớp, mở website → vào Kho → mở khóa → Đồng bộ ngay, kiểm tra tài khoản với Sheet.

## Nếu Google không cho chỉnh hiển thị tự động

- **ẩn cột ID H:I**: trong tab Kho chọn chữ H và I trên đầu cột → chuột phải → Ẩn cột H–I. Không chọn Xóa cột.
- **hiện cột nhập A:G**: nếu có cột bị ẩn, dùng mũi tên ở khoảng giữa các chữ cái cột để hiện lại. A là Ngày trial, B là Email; các cột dữ liệu C:G theo sau.
- **cố định hàng 1**: Xem → Cố định → 1 hàng. Nếu không cần, có thể để hàng tiêu đề cuộn bình thường.
- **độ rộng cột**: kéo mép cột bằng tay; việc này không thay đổi tài khoản.
- Nếu không chỉnh được do bảo vệ, dùng tài khoản có quyền chỉnh sửa hoặc kiểm tra Dữ liệu → Bảo vệ trang tính và dải ô. Không cần công khai Sheet hoặc đổi quyền truy cập file để đồng bộ.

Các cảnh báo chỉ chứa tên thao tác và loại lỗi đã rút gọn, không chứa giá trị ô hoặc nội dung lỗi Google có thể kèm thông tin tài khoản. 30 kiểm thử Apps Script mô phỏng đã đạt, gồm lỗi cố định/độ rộng/ẩn cột, cách gọi dự phòng, dữ liệu giữ nguyên, và xác nhận lỗi ghi/đối chiếu vẫn dừng hàm. Chưa xác minh trên Sheet thật của bạn.

Nếu file đang xem vẫn có ID ở A:B dù nhật ký báo dữ liệu khớp, xem **XAC-NHAN-BO-CUC-KHO.md**. Bản v5.3 bắt buộc xác nhận cả hàng tiêu đề và in URL đúng file/tab trước khi báo chuyển thành công.
