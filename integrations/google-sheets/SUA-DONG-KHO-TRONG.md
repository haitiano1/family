# Bỏ qua dòng Kho đã xóa phần nhập — Apps Script v5.7

## Nguyên nhân

Khi đã nhập thử ở `FamilySync_Kho`, bộ đồng bộ có thể đã cấp ID vào hai cột ẩn H:I. Xóa nội dung A:G để lại ID này. Script cũ vẫn coi đó là dòng tài khoản, thấy Email trống rồi báo `vault_email`, chẳng hạn dòng 50, cột 2. Lượt đồng bộ Kho dừng trước khi ghi, nên email mới trên web chưa được gửi sang tab Kho.

Bản `family-groups-compact-v5.7` bỏ qua dòng hoàn toàn trống ở phần nhập, kể cả khi ID còn trong cột ẩn. Dòng còn ngày trial, mật khẩu, khóa 2FA, mail khôi phục, Note hoặc nhãn mà thiếu Email vẫn bị chặn để tránh bỏ sót thông tin đã nhập. Email sai, trùng và công thức cũng vẫn bị chặn. Script không ghi thông tin tài khoản vào nhật ký.

## Áp dụng trên kết nối hiện tại

1. Lưu bản sao nội dung Code.gs đang dùng. Trong đúng dự án Apps Script của URL `/exec` trên website, thay toàn bộ nội dung **Code.gs** bằng file trong gói và nhấn **Lưu**.
2. Chọn **Triển khai → Quản lý các bản triển khai**. Chọn bản ứng dụng web đang dùng, nhấn **bút chì**, ở mục **Phiên bản** chọn **Phiên bản mới**, rồi nhấn **Triển khai**. Giữ thực thi bằng tài khoản hiện tại và quyền **Bất kỳ ai**.
3. Mở URL `/exec` đang lưu trong website. Cần thấy `script_version: family-groups-compact-v5.7`.
4. Vào **Kho** trên website, **mở khóa Kho**, rồi chọn **Đồng bộ Sheet → Đồng bộ ngay**. Kiểm tra giờ **Kho** vừa cập nhật và email mới trong `FamilySync_Kho`.
5. Nếu thay email chủ Family qua Fix lỗi, mật khẩu/khóa 2FA cũ trên web đã được xóa. Sau khi đồng bộ thành công, dòng Kho nhận email mới và để trống thông tin cũ; nhập thông tin của tài khoản mới rồi đồng bộ lại nếu cần.

Giữ nguyên Sheet, `FAMILY_TOKEN`, `FAMILY_SPREADSHEET_ID` và URL `/exec`. Không chạy setup hoặc hàm chuyển bố cục. Không cần upload file PHP lên Hostinger. Nút cập nhật trên website không tự triển khai Apps Script.

## Xử lý ngay khi chưa thay script

Nếu chắc chắn hàng 50 chỉ là dòng nhập thử đã xóa, bấm chuột phải vào **số hàng 50** ở mép trái Sheet rồi chọn **Xóa hàng** để bỏ cả ID còn sót. Không xóa hai cột H:I. Sau đó mở khóa Kho trên web và đồng bộ lại.

Xóa nội dung hoặc dòng trong Sheet không xóa tài khoản đã lưu trên web. Tài khoản đã lưu có thể được web ghi lại khi đồng bộ; thao tác xóa tài khoản thực hiện trên web theo luồng hiện có.
