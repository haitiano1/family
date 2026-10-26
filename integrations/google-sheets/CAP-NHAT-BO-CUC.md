# Cập nhật tab Khách theo từng Family

**Với Code.gs v5 trong gói này: cập nhật family-private/sheets.php trên Hostinger trước theo NHAP-TAI-KHOAN.md. Sau đó mới triển khai Apps Script.**

Bản hiện tại là `family-groups-compact-v5.7`: 7 cột hiển thị, ngày dd/mm/yyyy, Còn ngày = hạn − TODAY() − 2.

Làm theo **GON-COT-VA-CON-NGAY.md** trong gói đầy đủ. Nếu gói chỉ có file này và Code.gs, thực hiện:

1. Đóng các tab website Family, chờ đồng bộ kết thúc.
2. Thay toàn bộ Code.gs trong đúng dự án Apps Script đang dùng bằng file trong gói, bấm Lưu. Giữ nguyên Script Properties, FAMILY_TOKEN và FAMILY_SPREADSHEET_ID.
3. Triển khai → Quản lý các bản triển khai → bản hiện tại → bút chì → Phiên bản mới → Triển khai. Giữ nguyên URL /exec và quyền Bất kỳ ai. Kiểm tra /exec trả phiên bản `family-groups-compact-v5.7`.
4. Trong Editor chọn hàm **apDungBoCucKhach**, bấm Chạy. Hàm tự sao lưu tab Khách vào một tab ẩn trước khi đổi, giữ nguyên tab gốc và đối chiếu dữ liệu sau khi chuyển.
5. Chờ **HOÀN TẤT**, mở Sheet theo URL trong nhật ký, kiểm tra khách đúng Family và ngày/hạn/Contact. Mở lại web và thử Đồng bộ ngay.

Tab Khách gồm tiêu đề Family vàng, hàng chủ xanh lá, các member xanh dương, một dòng trắng phân cách. Family trống có dòng nhập trống. Chỉ hiển thị Tên khách, Email khách, Gói mua, Ngày mua, Ngày hết hạn, Còn ngày, Contact.

Tám cột thanh toán/thành viên/ghi chú/gia hạn được bỏ khỏi bố cục; dữ liệu vẫn giữ trong phần kỹ thuật để đồng bộ, quản lý chúng trên web. H:K bị ẩn, không xóa/sửa; khi sắp xếp chọn toàn bộ dòng gồm cột ẩn. Không sửa riêng công thức Còn ngày.

Mật khẩu/2FA vẫn ở tab Kho. Tab Trang tính1/Sheet1 mặc định có thể xóa nếu trống; giữ ba tab FamilySync_*. Bản v5 cần cập nhật file PHP đồng bộ theo NHAP-TAI-KHOAN.md; giữ nguyên Sheet và mã kết nối. Không tự xóa thêm cột trong các tab đồng bộ. Kiểm thử mô phỏng đã đạt; việc đổi Sheet thật cần bạn chạy hàm trên.
