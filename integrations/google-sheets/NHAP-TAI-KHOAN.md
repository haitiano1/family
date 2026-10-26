# Nhập một dòng trên Sheet → có cả Family và tài khoản Kho trên web

Bản Apps Script: **family-groups-compact-v5.7**. Dành cho website PHP/Hostinger đã kết nối Sheet. Cần cập nhật **cả file PHP và Apps Script**, giữ nguyên database, mã kết nối và URL /exec hiện tại.

## Cập nhật một lần

1. Đóng các tab website Family, chờ lượt đồng bộ đang chạy kết thúc. Không nhập thêm trên Sheet trong lúc cập nhật. Giữ bản sao lưu database theo cách bạn đang dùng.
2. Trong **Hostinger → File Manager**, tìm thư mục **family-private** đang chứa file **sheets.php** của website. Thay đúng file đó bằng **family-private/sheets.php** trong gói này. Thư mục family-private thường nằm cạnh public_html. Giữ nguyên config.php và các file khác; không tạo database mới.
3. Mở **đúng dự án Apps Script đã kết nối**, thay toàn bộ **Code.gs** bằng file trong gói, bấm **Lưu**. Giữ nguyên appsscript.json, FAMILY_TOKEN, FAMILY_SPREADSHEET_ID.
4. **Triển khai → Quản lý các bản triển khai → bản hiện tại → bút chì → Phiên bản mới → Triển khai**. Giữ thực thi bằng tài khoản của bạn và quyền **Bất kỳ ai**. Không tạo bản triển khai/link mới. Mở đúng URL /exec đang lưu trên web, kiểm tra trả về `script_version: family-groups-compact-v5.7`. Nếu thiếu doGet, dừng và kiểm tra lại đúng dự án/bản triển khai/link.
5. Trong **Editor**, chọn hàm **apDungBoCucKho → Chạy**. Hàm tạo một tab sao lưu ẩn **Kho_du_phong_…**, rồi đổi bố cục Kho ngay trong tab gốc. Chờ **HOÀN TẤT**. Không chọn setupFamilySync. Không cần chạy lại hàm đổi bố cục Khách.
6. Mở lại website → vào **Kho tài khoản** → **mở khóa Kho**. Bấm **Đồng bộ Sheet → Đồng bộ ngay** để đối chiếu dữ liệu cũ trước khi nhập tài khoản mới. Nếu báo xung đột, chọn bản đúng sau khi kiểm tra; không gửi mật khẩu/khóa qua chat.

Chỉ làm bước nhập mới khi hoàn tất cả cập nhật PHP, triển khai v5 và đổi bố cục Kho. Gói không có config.php, dữ liệu khách hoặc thông tin tài khoản thật.

## Nhập liệu từ nay

Điền/dán các dòng mới **cuối tab FamilySync_Kho**, theo đúng cột:

| A – Ngày trial | B – Email | C – Mật khẩu | D – Khóa 2FA | E – Mail khôi phục | F – Note | G – Nhãn |
|---|---|---|---|---|---|---|
| 18/10/2026 | account@example.com | mật khẩu của bạn | khóa TOTP bí mật | recovery@example.com | trial 10h34 | Family mới |

Dòng ví dụ chỉ mô tả vị trí cột, không phải dữ liệu để đồng bộ. Không gộp Mail khôi phục và Note vào một ô. Nếu dán một bảng nguồn có thứ tự khác, ghép các cột theo tiêu đề trước.

- **Email** bắt buộc. Mật khẩu và khóa 2FA nhập vào đúng hai ô riêng. Nhập khóa TOTP, không nhập mã 6 số đang thay đổi. Có thể dán khóa có khoảng trắng; web chuẩn hóa và kiểm tra trước khi lưu.
- **Ngày trial** có thể bỏ trống nếu chưa biết. Khi gõ văn bản, nhập đủ năm **dd/mm/yyyy**, ví dụ **18/10/2026**. Văn bản **18/10** sẽ bị từ chối để tránh đoán sai năm. Nếu ô là giá trị ngày thực của Google dù chỉ hiển thị 18/10, hệ thống đọc cả năm đã lưu trong ô.
- Mail khôi phục, Note, Nhãn là tùy chọn. **Nhãn** được dùng làm tên Family khi tạo mới; để trống thì web đặt tên theo email. Đổi tên Family về sau trong tab Family/web.
- Hai cột **H:I** chứa ID được ẩn; để trống khi thêm dòng. Hệ thống tự cấp và giữ liên kết. Không xóa/sửa ID, không sao chép cả ID của dòng khác.
- Nếu email chưa có, khi đồng bộ Kho web sẽ tự tạo **Family YouTube + tài khoản Kho**, liên kết với nhau và lưu ngày trial. Không cần tạo trước ở tab Family.
- Nếu email đã có dòng trên Sheet (kể cả dòng chưa có mật khẩu), hãy sửa ngay dòng đó, không thêm dòng trùng. Nếu Family đã có nhưng chưa lưu thông tin Kho, hệ thống dùng lại Family đó. Family đã lưu trữ phải được khôi phục trên web trước.
- **Kho chỉ nhận dữ liệu khi web đang mở khóa và đang ở mục Kho.** Bấm Đồng bộ ngay nếu muốn nhận liền; bình thường hệ thống kiểm tra khoảng 30 giây/lần. Đóng website hoặc khóa Kho thì các dòng mới chờ đến lần mở lại Kho.
- Family mới xuất hiện trên web sau lượt đồng bộ Kho thành công. Tab Family/khối Khách được cập nhật ở lượt đồng bộ Family/Khách kế tiếp; có thể bấm Đồng bộ ngay một lần nữa để thấy ngay.
- Sửa ngày trial ở dòng Kho sẽ cập nhật ngày trial của Family. Nếu hai nơi cùng sửa, hệ thống báo xung đột để chọn bản giữ.
- Xóa dòng Sheet vẫn không xóa hồ sơ web. Xóa/lưu trữ dùng chức năng trên web.

## Khi có lỗi

- Lỗi ngày/email/công thức trên Sheet báo tab, dòng, cột. Lỗi khóa 2FA khi nhập báo dòng; không ghi giá trị khóa/mật khẩu vào thông báo.
- Một dòng không hợp lệ sẽ dừng lượt nhập. Những thay đổi Family/Kho trong lượt đó được hoàn tác khi lỗi xảy ra trước lúc lưu thành công. Không nhận thông báo thành công thì kiểm tra lỗi trước khi nhập thêm.
- Nếu web đã lưu nhưng Google chưa nhận được phản hồi, giữ nguyên ID và thử lại. ID ổn định giúp tránh tạo trùng tài khoản/Family.
- Bản sao **Kho_du_phong_…** có thể mở ở **Xem → Trang tính bị ẩn**. Bản dự phòng chứa dữ liệu Kho cũ dưới quyền truy cập của cùng file Sheet; giữ đến khi đối chiếu xong.

Đã kiểm tra bằng dữ liệu giả: 30 kiểm thử Apps Script mô phỏng và bộ tích hợp PHP/MySQL, gồm nâng cấp bảng cũ, tạo Family/Kho, thử lại sau lỗi, trùng email, khóa Kho, lỗi ngày/2FA, xung đột, mã hóa database và không ghi bí mật vào metadata/nhật ký. Chưa triển khai hoặc kiểm tra trên tài khoản Google/Hostinger thật; cần bạn áp dụng và đối chiếu.

Nếu apDungBoCucKho dừng sau khi tạo bản dự phòng, xem **SUA-LOI-BO-CUC-KHO.md**. Bản mới có hàm **kiemTraBoCucKho** chỉ đọc trước khi đổi.

Nếu dừng ở bước **ẩn ID và chỉnh hiển thị**, xem **SUA-HIEN-THI-KHO.md**. Bản v5.2 đối chiếu dữ liệu bắt buộc và báo riêng từng thao tác hiển thị chưa áp dụng.

Nếu file đang xem vẫn có ID ở A:B dù nhật ký báo dữ liệu khớp, xem **XAC-NHAN-BO-CUC-KHO.md**. Bản v5.3 bắt buộc xác nhận cả hàng tiêu đề và in URL đúng file/tab trước khi báo chuyển thành công.

Bản hiện tại lưu và đối chiếu dữ liệu Kho trước khi định dạng; xem **GHI-KHO-TRUOC-DINH-DANG.md** nếu lỗi còn ở bước xác nhận tiêu đề A:I.
