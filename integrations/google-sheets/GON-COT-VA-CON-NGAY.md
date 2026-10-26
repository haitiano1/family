# Sửa Còn ngày và thu gọn tab Khách

**Với Code.gs v5 trong gói này: cập nhật family-private/sheets.php trên Hostinger trước theo NHAP-TAI-KHOAN.md. Sau đó mới triển khai Apps Script.**

Bản Apps Script: `family-groups-compact-v5.7`. Dùng cho Sheet và website đã kết nối. Giữ nguyên Sheet/link kết nối; bản v5 cần cập nhật file PHP đồng bộ theo NHAP-TAI-KHOAN.md trước.

## Cách áp dụng

1. Đóng các tab website Family, chờ lượt đồng bộ đang chạy kết thúc. Trong lúc cập nhật, không sửa Sheet.
2. Mở đúng dự án **Apps Script đang kết nối Sheet hiện tại**. Thay toàn bộ nội dung **Code.gs** bằng file Code.gs trong gói này, rồi bấm **Lưu**. Giữ nguyên Script Properties, FAMILY_TOKEN và FAMILY_SPREADSHEET_ID. Không chạy setupFamilySync.
3. Chọn **Triển khai → Quản lý các bản triển khai → bản hiện tại → biểu tượng bút chì → Phiên bản mới → Triển khai**. Giữ thực thi bằng tài khoản của bạn và quyền truy cập **Bất kỳ ai**. Giữ nguyên URL /exec. Mở URL đó và kiểm tra `script_version` là `family-groups-compact-v5.7` trước khi làm tiếp.
4. Quay lại **Trình chỉnh sửa / Editor**, chọn hàm **apDungBoCucKhach**, bấm **Chạy / Run**. Nếu Google yêu cầu cấp quyền, kiểm tra đúng dự án/tài khoản của bạn rồi cấp quyền thao tác Sheet.
5. Chờ nhật ký có **HOÀN TẤT: FamilySync_Khach còn 7 cột; ngày dd/mm/yyyy; Còn ngày = hạn - TODAY() - 2.** Mở file theo URL trong nhật ký, chọn tab **FamilySync_Khach**.
6. Kiểm tra đủ khách theo từng Family, ngày mua/hạn, số ngày và Contact. Mở lại website, bấm **Đồng bộ ngay**; kiểm tra bố cục vẫn giữ nguyên. Có thể sửa Contact của một khách rồi đồng bộ để đối chiếu hai chiều.

Phải triển khai phiên bản mới ở bước 3 trước khi chạy bước 4: bản script cũ không đọc được cấu trúc rút gọn.

## Kết quả

Chỉ còn 7 cột hiển thị, vẫn chia khối Family với tiêu đề vàng, hàng chủ xanh lá, các member xanh dương:

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| Tên khách | Email khách | Gói mua | Ngày mua | Ngày hết hạn | Còn ngày | Contact |

- **Ngày mua và Ngày hết hạn** là giá trị ngày thực, hiển thị **dd/mm/yyyy**, dùng múi giờ hiện tại của Sheet.
- **Còn ngày = Ngày hết hạn − TODAY() − 2**. Ví dụ hôm nay 17/10/2026, hạn 20/10/2026 thì kết quả 1; hạn 19/10/2026 thì 0. Chưa nhập hạn thì để trống. Số này nhắc trước hạn 2 ngày, không thay hạn trên website.
- Công thức được tạo không dùng dấu phân cách đối số phẩy/chấm phẩy, tránh lỗi phân tích công thức do thiết lập vùng. Không cần đổi ngôn ngữ hoặc múi giờ của file.
- Bỏ khỏi bố cục 8 cột: **Thanh toán, Số tiền VND, Thành viên, Ghi chú, Gia hạn tiếp theo, Tiền gia hạn VND, Ngày nhận tiền gia hạn, Ghi chú gia hạn**. Script tự thu gọn, không cần xóa thủ công.
- Dữ liệu của 8 trường này vẫn giữ để đồng bộ; từ nay quản lý các trường đó trên website. Các cột kỹ thuật **H:K bị ẩn** chứa ID và dữ liệu đồng bộ, không xóa/sửa chúng. Khi sắp xếp hãy chọn toàn bộ dòng, gồm cột ẩn.
- Muốn thêm khách trên Sheet: điền dòng trống trong đúng khối Family, giữ trống các cột kỹ thuật; ID được cấp tự động. Chuyển Family hoặc lưu trữ khách thì thao tác trên web.

## Bản dự phòng và giới hạn kiểm chứng

Trước khi chuyển, hàm tạo tab dự phòng ẩn **Khach_du_phong_…** trong cùng file. Xem qua **Xem → Trang tính bị ẩn**. Giữ bản dự phòng đến khi đối chiếu xong; tab gốc và định danh tab được giữ nguyên. Script đối chiếu toàn bộ dữ liệu khách sau khi chuyển, chỉ báo HOÀN TẤT khi khớp. Không đọc hoặc sửa tab Kho mật khẩu/2FA.

Nếu báo lỗi, dừng thao tác và giữ bản dự phòng. Gửi thông báo lỗi, không gửi FAMILY_TOKEN, mật khẩu hoặc dữ liệu khách.

13 kiểm thử mô phỏng đã đạt: công thức không dùng dấu phân cách, lưu ngày thực, bố cục 7 cột, chuyển bảng phẳng/nhóm cũ đang lỗi công thức, giữ toàn bộ dữ liệu thanh toán/gia hạn, đồng bộ sau khi sửa, ID, xung đột và dự phòng. Chưa chạy trên tài khoản Google thật; cần bạn áp dụng và đối chiếu theo các bước trên.
