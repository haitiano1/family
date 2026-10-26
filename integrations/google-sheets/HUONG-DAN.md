# Kết nối Google Sheet hai chiều — Family PHP trên Hostinger

Chức năng mới gồm tạo Sheet từ dữ liệu website, sửa Family/khách/hạn/thanh toán ở cả hai nơi, và đồng bộ kho mật khẩu/khóa 2FA khi mở Kho. Gói giao diện cũ chưa có chức năng này.

Nếu đã kết nối và chỉ cập nhật bố cục Khách theo Family, làm theo **CAP-NHAT-BO-CUC.md**; không cần upload website hoặc tạo Sheet mới.

Để áp dụng bố cục trực tiếp trên Sheet đã có, xem **CHAY-DOI-BO-CUC.md**.

## 1. Sao lưu và cập nhật website

1. Trên website, chọn **Sao lưu / Chuyển dữ liệu → Tải file sao lưu**. Giữ file riêng ở máy bạn.
2. Giải nén `family-hostinger-update.zip` của lần cập nhật này.
3. Trong hPanel File Manager, upload đè các file **bên trong** `family-private` và `public_html` vào đúng hai thư mục hiện có.
4. **Giữ nguyên config.php và database**. Không nhập lại dữ liệu, không tạo database mới.
5. Kiểm tra PHP 8.3, pdo_mysql, OpenSSL và cURL đã bật. Nhấn Ctrl+F5 trên website. Bạn sẽ thấy **Đồng bộ Sheet** trên thanh trên cùng.

## 2. Tạo dự án Google Apps Script

1. Đăng nhập tài khoản Google sở hữu Sheet, mở https://script.google.com/ và chọn **New project / Dự án mới**.
2. Đặt tên `Family Sync`. Xóa mã mẫu trong `Code.gs` và dán toàn bộ nội dung **Code.gs trong gói kết nối này**. Không dùng script khác hoặc nhập mật khẩu tài khoản vào mã.
3. Mở **Project Settings / Cài đặt dự án**, bật **Show appsscript.json manifest file in editor**. Quay lại Editor, mở `appsscript.json` và thay bằng tệp cùng tên trong gói. Lưu dự án.
4. Chọn hàm **setupFamilySync** trên thanh chạy, bấm **Run / Chạy**. Google yêu cầu cấp quyền tạo/đọc/ghi Sheet: xem tên tài khoản và quyền, rồi cấp quyền cho script do chính bạn tạo. Nếu Google hiển thị cảnh báo ứng dụng chưa xác minh, chỉ tiếp tục với dự án của bạn và mã nguồn đã kiểm tra. Nếu tài khoản Workspace chặn triển khai, cần quản trị viên cho phép; không thay đổi chia sẻ Sheet thành công khai để xử lý.
5. Mở **Execution log / Nhật ký thực thi** và bấm URL Sheet vừa tạo. File này nằm trong Google Drive của bạn, có các tab `FamilySync_Family`, `FamilySync_Khach`, `FamilySync_Kho`. Chưa có dữ liệu website cho đến bước 4 bên dưới.
6. Có thể chạy lại setupFamilySync; script dùng lại file đã tạo. Không đổi tên tab/tiêu đề cột. Không cần chia sẻ Sheet công khai. Script không sửa tab cũ của bạn.

## 3. Triển khai script và lấy mã kết nối

1. Trong Apps Script, chọn **Deploy → New deployment → Web app**.
2. **Execute as: Me** (chạy bằng tài khoản của bạn).
3. **Who has access: Anyone** để máy chủ Hostinger gọi được endpoint. Đây là quyền gọi URL script, **không phải quyền chia sẻ Google Sheet**. Mọi yêu cầu đọc/ghi đều cần mã kết nối riêng. Giữ kín mã này và không gửi qua chat.
4. Chọn **Deploy**, sao chép **Web app URL** kết thúc bằng `/exec`. Không dùng link `/dev` hay URL trang Editor.
5. Mở **Project Settings → Script Properties**, sao chép giá trị **FAMILY_TOKEN** do hàm setup tạo. Không đưa mã này vào URL, GitHub, ảnh chụp hay tin nhắn.
6. Sau này thay mã Code.gs phải vào **Manage deployments → Edit → New version → Deploy** thì endpoint mới chạy mã mới.

## 4. Kết nối website và tạo dữ liệu trên Sheet

1. Mở website Family → **Đồng bộ Sheet**.
2. Dán URL `/exec` và mã `FAMILY_TOKEN` vào hai ô trên chính website của bạn, rồi chọn **Kết nối và tạo dữ liệu trên Sheet**. Mã được giữ dạng mã hóa trong database; không được trả lại cho trình duyệt hoặc ghi vào Nhật ký.
3. Lần đầu dữ liệu Family/khách hiện có trên website được đưa lên Sheet mới. Chọn **Mở Google Sheet** để xem.
4. Mở **Kho tài khoản**, nhập mật khẩu kho riêng. Khi Kho đang mở và không có hộp thoại nhập liệu, mật khẩu/khóa 2FA được đồng bộ sang tab Kho. Không gửi mật khẩu mở Kho hoặc mật khẩu truy cập website cho Google.
5. Mật khẩu/khóa 2FA trên Sheet là **văn bản đọc được**, đúng lựa chọn của bạn. Người có quyền đọc Sheet có thể đọc các thông tin đó. Khóa Kho trên web chỉ chặn lần đồng bộ tiếp theo, **không xóa dữ liệu đã có trong Sheet**. Chỉ chia sẻ file với người được phép đọc các thông tin này.

## 5. Thử bằng một thay đổi nhỏ

1. Sửa ghi chú của một khách giả trên web. Chờ vài giây hoặc chọn **Đồng bộ ngay**, đối chiếu trên Sheet.
2. Sửa ghi chú của khách đó trên Sheet. Giữ website mở, đợi tối đa khoảng 30 giây và tải lại danh sách để đối chiếu.
3. Sửa thông tin Kho trên Sheet khi Kho web đang khóa: web chưa nhận thông tin đó. Mở lại Kho, chờ đồng bộ và đối chiếu. Thử xong hãy xóa thông tin giả trong ứng dụng.
4. Nếu có xung đột, mở **Đồng bộ Sheet** và chọn **Dùng bản web** hoặc **Dùng bản Sheet** cho các hồ sơ xung đột. Chọn lại nếu dữ liệu vừa thay đổi. Màn hình không hiển thị giá trị mật khẩu trong phần xung đột.

## Quy tắc dữ liệu

- Cột **ID** là khóa ổn định; không sửa, không copy ID sang dòng khác. Sắp xếp dòng không làm đổi liên kết.
- Thêm Family/khách trên Sheet: để trống ID, điền các trường bắt buộc; script tự cấp ID. Trong tab Khách, nhập dòng trống trong đúng khối Family; script tự lấy ID Family của khối. Family mới cần tên và email quản lý; khách mới cần email và liên kết Family.
- Kho được sinh từ Family hiện có. Có thể thêm tài khoản mới ngay trong FamilySync_Kho sau khi cập nhật PHP và Apps Script v5; xem NHAP-TAI-KHOAN.md. Một dòng mới tự tạo cả Family và hồ sơ Kho. Không sửa ID/ID Family/email ở tab Kho; đổi email quản lý ở tab Family. Có thể sửa mật khẩu, khóa 2FA, mail khôi phục, nhãn, Note và ngày trial; email của hồ sơ đã liên kết đổi tại Family. Mã 6 số thay đổi liên tục được web tính từ khóa 2FA, không đồng bộ từng mã.
- Các tài khoản Kho chưa ghép Family đã có vẫn được đồng bộ riêng. Thông tin Kho của Family đã lưu trữ không được tự đưa lên Sheet.
- Dịch vụ: `youtube`, `google_one`, `google_ai`, `other`.
- Các trường thanh toán/thành viên/gia hạn được quản lý trên web và giữ trong dữ liệu kỹ thuật ẩn của tab Khách. Không sửa trực tiếp phần kỹ thuật. Thanh toán kỳ hiện tại: `unknown`, `unpaid`, `partial`, `paid`.
- Gia hạn tiếp theo: `not_contacted`, `reminded`, `awaiting_payment`, `partial`, `paid`, `declined`. Trạng thái `partial`/`paid` cần tiền lớn hơn 0 và ngày nhận tiền không ở tương lai. Chọn `declined` chủ động lưu trữ khách theo quy tắc hiện có. `paid` chỉ ghi nhận tiền, cần **Xác nhận hạn mới** trên web để hoàn tất kỳ và lưu lịch sử.
- Thành viên: `unknown`, `active`, `invited`, `new` (Mua mới); người đã mời/chưa vào chưa tính vào 5 chỗ.
- Tab Khách được chia từng khối Family với hàng tiêu đề nhóm xanh lá và dòng khách xanh dương. Chỉ có 7 cột hiển thị: Tên khách, Email khách, Gói mua, Ngày mua, Ngày hết hạn, Còn ngày, Contact. H:K chứa ID/dữ liệu kỹ thuật bị ẩn; không sửa/xóa cột ẩn. Ngày mua và hết hạn là ngày thực, hiển thị `dd/mm/yyyy`. Còn ngày = hạn − TODAY() − 2; chưa nhập hạn thì để trống. Ngày trial ở tab Family vẫn dùng `yyyy-mm-dd`. Số tiền là số nguyên VND, không nhập dấu phân cách hoặc ký hiệu tiền. Gói tháng 0 (chưa đặt) đến 120.
- Sửa hạn trên Sheet tương đương **Sửa hồ sơ**, không tự tạo lịch sử gia hạn. Muốn ghi nhận kỳ gia hạn trong thống kê, dùng **Gia hạn** trên web.
- Xóa dòng trên Sheet **không xóa dữ liệu web**; dòng được tạo lại khi đồng bộ. Muốn lưu trữ/xóa hãy thao tác trên web. Dữ liệu hoạt động sau đó được phản ánh lại trên Sheet; lịch sử lưu trữ vẫn giữ ở website.
- Xóa thông tin Kho ở web đưa các ô thông tin về trống trên Sheet sau khi mở lại Kho và đồng bộ. Muốn xóa mật khẩu từ Sheet, để trống đúng ô rồi đồng bộ khi Kho mở.
- Sản phẩm khác, lịch sử gia hạn, Nhật ký và file sao lưu chưa nằm trong phạm vi đồng bộ. Chỉ các trường đã liệt kê được gửi.
- Không nhập công thức vào các tab đồng bộ; riêng cột Còn ngày trong tab Khách dùng công thức do script tạo, không sửa cột này. Dùng tab khác để làm báo cáo/công thức; không đổi cấu trúc các tab này. Script ghi ngày mua/hạn dạng ngày thực, các chuỗi người dùng nhập được giữ dạng văn bản, không thực thi thành công thức.
- Tối đa 10.000 dòng mỗi tab. Để web mở: kiểm tra mỗi 30 giây, và sau thao tác lưu. Đóng web thì thay đổi từ Sheet sẽ được nhận khi mở lại. Kho chỉ đồng bộ khi đang mở khóa và đang ở mục Kho.
- Mất kết nối: database web vẫn giữ dữ liệu, lần sau đọc lại cả hai phía và thử lại. Nếu cả hai cùng sửa một hồ sơ thì dừng để chọn bản giữ; không tự đoán theo giờ máy.
- Tránh sửa trực tiếp Sheet ngay trong vài giây đang bấm Đồng bộ. Google Sheet không có giao dịch khóa chỉnh sửa của người dùng; connector kiểm tra phiên bản trước khi ghi để phát hiện các thay đổi đã xảy ra.

## Nếu đã triển khai nhưng vẫn dùng bố cục cũ hoặc gặp lỗi kết nối

Xem **SUA-KET-NOI.md**. Bản mới hiển thị link đang kết nối, phiên bản script và bố cục; có thể đổi sang URL /exec mới của cùng Sheet mà không ngắt kết nối. Có thể mở URL /exec ẩn danh để kiểm tra phiên bản công khai, không cần gửi mã bí mật.

## Nếu không kết nối được

- Kiểm tra URL `/exec`, mã FAMILY_TOKEN, phiên bản deployment mới và quyền **Anyone**.
- Không đổi Sheet sang công khai. Tài khoản Workspace có thể hạn chế Apps Script: cần chủ tài khoản/quản trị viên xử lý.
- Lỗi cột/ID/công thức: khôi phục đúng tiêu đề, bỏ công thức trong các tab đồng bộ, không tạo trùng ID. Chưa có thay đổi web từ lượt nhập lỗi.
- Kiểm tra cURL/OpenSSL trên Hostinger, HTTPS và kết nối ra `script.google.com`, `script.googleusercontent.com`. Không tắt kiểm tra TLS.
- Nút **Ngắt kết nối** giữ nguyên dữ liệu web và file Sheet; chỉ bỏ cấu hình/baseline trên web. Kết nối lại với Sheet có dữ liệu có thể báo xung đột lần đầu, cần chọn bản đúng.
- Nếu đổi mật khẩu database/mật khẩu truy cập website khiến cấu hình mã hóa cũ không đọc được: ngắt rồi kết nối lại trên web.

## Phạm vi kiểm chứng

Bộ kiểm thử chạy trên dữ liệu giả, bao gồm logic merge và Apps Script bằng mô phỏng, cùng PHP/MySQL. Việc cấp quyền Google, triển khai Apps Script, tạo Sheet thực tế và kết nối website Hostinger phải hoàn tất trong tài khoản của bạn; không được coi là đã kết nối trước khi bước 5 thành công.

## Thu gọn tab Khách và sửa Còn ngày

Xem **GON-COT-VA-CON-NGAY.md**. Cập nhật PHP và triển khai bản `family-groups-compact-v5.7` theo NHAP-TAI-KHOAN.md trước khi chạy **apDungBoCucKhach**, giữ nguyên Sheet và URL /exec.

Nếu đã xóa phần nhập của một dòng Kho nhưng đồng bộ vẫn báo thiếu Email, xem **SUA-DONG-KHO-TRONG.md**. Bản v5.7 bỏ qua dòng chỉ còn ID ẩn, vẫn chặn dòng nhập dở hoặc email không hợp lệ.

## Nhập tài khoản mới trực tiếp trong Sheet

Xem **NHAP-TAI-KHOAN.md**. Bản v5 cần cập nhật **cả family-private/sheets.php và Code.gs**, rồi chạy **apDungBoCucKho**. Tab Kho có 7 cột nhập và 2 cột ID ẩn; không cần tạo Family trước.
