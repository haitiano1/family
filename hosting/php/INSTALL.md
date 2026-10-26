# Cài Family PHP + MySQL trên website Hostinger riêng

Bản 0.17.0 có **Cập nhật một chạm** từ GitHub Releases sau khi cài bộ kích hoạt. Xem **CAP-NHAT-MOT-CHAM.md** để biết cách cài lần đầu, phát hành và điều kiện PHP. Nút không tải code chưa được phát hành.

Dành cho gói Premium có PHP/MySQL. Phiên bản PHP 8.3 phù hợp, hỗ trợ PHP8.2+. Có giao diện iPhone, mật khẩu truy cập chung dài hơn6ký tự (thiết bị nhớ30ngày), không có admin/role hay thao tác Google. Không cần Node.js, SSH, npm hoặc chạy máy Windows liên tục.

## 1. Website và database riêng

Trong hPanel chọn **Websites → Create website → PHP/HTML website → Start empty**, dùng tên miền tạm để thử. Mở Dashboard của website Family mới; mọi bước sau đều áp dụng vào website mới đó.

Mở **Databases → Management** của website Family. Tạo database tên `family`, username `familyuser`, mật khẩu tự chọn/tạo bằng Hostinger. Lưu **tên đầy đủ có tiền tố** và mật khẩu riêng; không gửi mật khẩu qua chat. Ứng dụng từ chối khởi tạo vào database đã có bảng của một dự án khác.

Kiểm tra PHP version8.3 trong **Advanced → PHP Configuration** của website Family mới và extension **pdo_mysql** đã bật. HTTPS/SSL cần hoạt động trước nhập mật khẩu/dữ liệu thật. Tên miền tạm thường được Hostinger cấp HTTPS; xác nhận trình duyệt truy cập được https://địa-chỉ-website-mới.

## 2. Tải và giải nén gói PHP

Tải file **family-hostinger.zip** từ:
https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger.zip

Mở **Files → File Manager** của website Family. Nếu có lựa chọn, chọn truy cập file **website này**. Xem thư mục `public_html`. Gói ZIP có hai thư mục cùng cấp:

```text
(thư mục website Family)
├── public_html/
│   ├── index.php
│   ├── api.php
│   ├── app.js và các file giao diện
│   ├── .htaccess
│   └── .user.ini
└── family-private/
    ├── config.example.php
    ├── core.php, business.php, import.php, audit.php, issues.php
    ├── schema.sql, features.sql
    ├── cron.php
    └── .htaccess
```

Đi lên **thư mục mẹ của public_html**, tải ZIP lên đó, chọn **Extract / Giải nén** vào chính thư mục này. Thư mục `public_html` trong ZIP sẽ ghép với public_html của website mới; `family-private` phải nằm **bên cạnh**, ngoài vùng công khai. Sau giải nén kiểm tra cấu trúc như trên và xóa ZIP đã tải trên hosting. Bật hiển thị file ẩn để kiểm tra .htaccess. Nếu file manager mở thẳng public_html và không thấy đường đi lên, gửi ảnh thanh đường dẫn để được chỉ đúng vị trí; không lồng hai thư mục public_html.

## 3. Điền cấu hình riêng trên hosting

Trong `family-private`, sao chép `config.example.php` thành `config.php`. Mở **Edit** của config.php và thay các chữ YOUR_... bằng thông tin riêng:

- `public_origin`: địa chỉ HTTPS của website Family mới, không kèm đường dẫn.
- `db_host`: thường `localhost`; dùng hostname MySQL hPanel cung cấp nếu khác.
- `db_port`:3306.
- `db_name`: tên database **đầy đủ có tiền tố**.
- `db_user`: username **đầy đủ có tiền tố**.
- `db_password`: mật khẩu database đã lưu.
- `access_password`: mật khẩu riêng để mở ứng dụng, dài hơn6ký tự, có thể khác mật khẩu database.

Giữ dấu nháy quanh giá trị và dấu phẩy của mẫu. Nếu mật khẩu có ký tự `'` hoặc `\`, trong PHP phải viết thành `\'` hoặc `\\`. Không đưa config.php lên GitHub, vào bản ZIP hoặc chia sẻ qua chat. Bản ZIP phát hành không có config.php; cập nhật code giữ nguyên cấu hình này.

Mở địa chỉ HTTPS của website. Nhập **mật khẩu truy cập ứng dụng**. MySQL tự tạo bảng riêng khi truy cập đầu tiên; không cần nhập schema.sql thủ công trong phpMyAdmin. Giao diện vào Tổng quan sau khi mở bằng mật khẩu, không có bước tạo admin.

Thử thêm một Family/khách giả, tải lại trang và kiểm tra còn dữ liệu. Có thể tải file sao lưu để xác nhận. Xóa hồ sơ thử để app trống rồi chuyển dữ liệu thật.

## 4. Chuyển dữ liệu từ Windows

Nếu bản Windows có nút **Sao lưu / Chuyển dữ liệu → Tải file sao lưu**, dùng nút đó để lấy JSON.

Nếu đang dùng bản cũ với IMPORT-CSV-WINDOWS.cmd, có thể tiếp tục nhập CSV bằng cách đó trên Windows. Tải [family-windows-export.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-windows-export.zip), giải nén, chép hai file EXPORT-BACKUP-WINDOWS.cmd và export-backup.cjs vào **thư mục app cũ chứa START-WINDOWS.cmd và data**. Đóng server, chạy EXPORT-BACKUP-WINDOWS.cmd để tạo file JSON ngay trong thư mục này. Nếu data đã có khách, xuất luôn; không cần nhập lại CSV. Exporter chỉ đọc database cũ, không nâng cấp/thay đổi SQLite và không cần cập nhật app cũ.

Trên máy tính, mở **địa chỉ website Family mới**, dùng cùng nút chọn file JSON vừa tải và bấm **Khôi phục dữ liệu**. Chỉ khôi phục vào ứng dụng trống; file lỗi sẽ rollback toàn bộ. Giữ khách/Family/Contact/lịch sử gia hạn/lưu trữ/sản phẩm phụ/nhật ký; không chuyển tài khoản hoặc mật khẩu admin cũ. Đối chiếu số khách/Family và một vài hồ sơ trước tiếp tục quản lý. Không đăng bản sao lưu lên GitHub hoặc thư mục công khai của website.

Sau chuyển, máy tính và điện thoại dùng **cùng địa chỉ hosting**. Bản chạy local trên Windows và bản hosting không tự đồng bộ. File sao lưu PHP có thể khôi phục vào bản Node.js đang trống khi cần chuyển lại.

## 5. iPhone và nhắc hạn

Mở website bằng **Safari → Chia sẻ → Thêm vào Màn hình chính → Thêm**. Mở icon Family và nhập mật khẩu một lần nếu được hỏi; vùng lưu truy cập của icon có thể tách với Safari.

Cần Internet để dùng. Nhắc hạn0–2ngày theo giờ Việt Nam hiển thị trong Tổng quan khi mở app; có mẫu tin để tự gửi Zalo/Facebook, chưa có thông báo đẩy. Các sản phẩm phụ có hạn cũng được nhắc trên Tổng quan.

Gia hạn YouTube luôn nối từ hạn cũ, kể cả trả muộn. Khách chọn Không gia hạn chuyển vào Khách lưu trữ ngay khi lưu trạng thái, giữ thông tin/lịch sử. Hồ sơ Không gia hạn đang chờ từ bản cũ được xử lý bù khi mở ứng dụng. Bản PHP kiểm tra khi tải dữ liệu/mở ứng dụng (tự xử lý bù). Để kiểm tra lưu trữ cả khi không mở ứng dụng, có thể thiết lập **Advanced → Cron Jobs**, chọn PHP và đường dẫn đầy đủ tới `family-private/cron.php`; chạy mỗi ngày hoặc mỗi giờ theo tùy chọn hPanel. Cron cần PHP8.2+ và chỉ báo kết quả, không in dữ liệu khách/mật khẩu.

## 6. Cập nhật và sao lưu

Bản0.8 rút bộ lọc khách còn Tất cả khách/Sắp hết hạn/Chờ thanh toán (Confirmed), gộp quá hạn chưa nhận đủ tiền gia hạn vào Confirmed và xếp hạn gần trước/hạn trống cuối. Mỗi tên/email/Contact có icon copy; Contact có link bấm mở được, ghi chú/số điện thoại giữ nguyên. Không gia hạn chuyển ngay vào Khách lưu trữ sau khi lưu, không chờ7ngày. Khôi phục hồ sơ/lịch sử vẫn có trong Khách lưu trữ.

Bản0.8 giữ tìm kiếm Family, Báo lỗi, bảng Chờ fix/Đang fix/Đã fix và Nhật ký trước/sau. Khi Đã fix, chọn Giữ nguyên hoặc Đổi mail; việc đổi đúng mail quản lý/khách và hoàn tất lỗi được lưu trong cùng transaction. Mail ban đầu và nội dung “Đã đổi từ A sang B” được giữ, các ngày/Contact/thanh toán của khách không bị thay đổi. Có chọn trạng thái trên thẻ để dùng iPhone, không bắt buộc kéo thả.

Bản0.7 thêm Ngày trial trong Family → Sửa, tự lưu Ngày lỗi khi báo lỗi theo giờ Việt Nam và số ngày sử dụng (10/08→15/08 =5 ngày). Ngày trial lấy từ hồ sơ Family tại thời điểm báo, không đổi lại cho case cũ khi sửa Family. Case Đã fix có Xóa case và nhật ký giữ dữ liệu trước xóa. Chữ trên điện thoại được tăng cỡ.

Nhật ký chi tiết ghi từ lúc cập nhật, giữ log cũ dưới dạng nội dung. Ghi các thao tác thêm/sửa/xóa/nhập/gia hạn/lưu trữ/khôi phục và chuyển trạng thái/đổi mail khi fix; refresh/xem trang không ghi thêm. Xóa Family chuyển cả hồ sơ nhóm và khách vào lưu trữ; có Khôi phục Family và nhật ký. Có tìm kiếm/phân trang/Xem chi tiết trước-sau. Nhật ký hỗ trợ đối chiếu và giữ thông tin, chưa có nút hoàn tác tự động. Mã nguồn hiện tại sao lưuv7 có sản phẩm lưu trữ và kho đã mã hóa; nhận JSONv1–v6 từ bản cũ. GóiZIP đã bao gồm các thay đổi này.

Để cập nhật website đã cài, xem [UPDATE.md](https://github.com/haitiano1/family/blob/main/hosting/php/UPDATE.md) và tải family-hostinger-update.zip. MySQL schema1–6 nâng cấp cộng thêm lên7 tự động; giữ database và config.php. SQLite phát triển lên15 có backup before-v15.

Dữ liệu nằm trong database MySQL riêng, không nằm trong thư mục file giao diện. Tải sao lưu JSON qua ứng dụng trước cập nhật và định kỳ. Cập nhật bằng gói PHP mới đúng website Family, giữ config.php và database; không xóa database.

Lỗi kết nối: kiểm tra tên database/user đầy đủ, mật khẩu và hostname MySQL; lỗi thiếu cấu hình: kiểm tra family-private/config.php nằm bên cạnh public_html. Nếu API trả404, kiểm tra .htaccess trong public_html và bật hiển thị file ẩn. Không gửi config.php/mật khẩu vào chat khi báo lỗi; gửi thông báo giao diện.

Bản PHP được kiểm tra độc lập trên PHP8.3 Apache + MySQL8.4. Cài đặt thực tế trên Hostinger cần upload/cấu hình trong tài khoản của bạn rồi kiểm tra; mã nguồn phát hành không đồng nghĩa đã deploy thành công.

Bản 0.9: gói mua khách Family/sản phẩm khác có 1/2/3/6/12 tháng, tự tính hạn khi chọn gói/đổi ngày mua, vẫn sửa hạn được. Tất cả Family xếp trial cũ đến mới; chưa có trial ở cuối. Fam dư slot lọc số Khách đang ghi nhận dưới 5, tính cả đã mời/chưa vào; Theo tên giảm dần như Family 48/47/46. Xóa hồ sơ khách/Family chuyển vào Khách lưu trữ và có khôi phục; Family trống cũng được giữ. Family lưu trữ giữ mail quản lý/trial/ghi chú, khôi phục nhóm đưa khách còn lưu trữ cùng lần xóa trở lại. Mọi thông tin sản phẩm phụ có icon copy và Contact bấm mở link được. Mở form sửa không thay hạn thủ công đang có; gia hạn khách YouTube vẫn từ ngày hết hạn cũ.

Bản 0.14.0 thay Khách vừa gia hạn 14 ngày bằng mục **Thống kê** riêng: xem 6 tháng gần nhất, số khách theo email khác nhau, số lượt gia hạn thành công và tổng tiền theo thời điểm xác nhận (giờ Việt Nam). Chọn **Toàn bộ lịch sử** để tìm/phân trang các tháng cũ hơn. Lịch sử giữ vĩnh viễn; không có dọn 14 ngày. Khách lưu trữ chỉ gồm hồ sơ không gia hạn/vừa xóa; khách/Family đều có khôi phục và xóa. Xóa Family lưu trữ giữ khách để khôi phục riêng, giữ lịch sử và Nhật ký. Cập nhật đủ hai thư mục theo UPDATE.md, giữ config/database; schema và backup v7 không đổi.

Bản 0.11 gộp đầy đủ Xóa khỏi lưu trữ và chuyển sản phẩm khác vào lưu trữ/khôi phục đúng loại. Mỗi Family chỉ có một case Chờ fix/Đang fix; tìm mail khách/chủ Family sẽ thấy trạng thái và nút Xem lỗi. Có copy email trong Fix lỗi, reset nội dung tìm kiếm khi chuyển mục và logo YouTube trên thanh điều hướng. Case Done có thể báo sự cố mới; case trùng từ trước vẫn được giữ để xử lý. Gói cài mới và cập nhật đều đã được tạo lại; website đã cài dùng [UPDATE.md](UPDATE.md), giữ config.php và database, không nhập lại khách.

Bản 0.11.1 cho phép bấm email trong Fix lỗi để mở đúng Family và toàn bộ thành viên; icon copy vẫn sao chép riêng. Gói cài mới/cập nhật đã gồm thay đổi này cùng toàn bộ chức năng 0.11.

Bản 0.12 thay nút Nhắc hạn của khách bằng Chuyển Family: tìm mail chủ nhóm/chọn nhóm, giữ hồ sơ/hạn/thanh toán/lịch sử, xóa case đúng mail khách và ghi dữ liệu trước xóa vào Nhật ký. Chỉ chuyển hồ sơ nội bộ; báo hạn 2 ngày trên Tổng quan vẫn giữ. Gói cài mới và cập nhật đều đã gồm thay đổi này; website đang chạy cập nhật cả PHP/giao diện theo UPDATE.md, giữ config.php/database.

Bản0.13.1: Kho tự liên kết với toàn bộ Family, chỉ lấy mail chủ/ngày trial; mật khẩu/2FA/recovery/Note tự nhập. Đổi mail ở Family hoặc Kho đều đồng bộ và ghi Nhật ký mail cũ → mới. Mật khẩu kho từ5 ký tự. MySQL schema6/SQLite14 tự nâng cấp; backupv7 giữ liên kết và kho mã hóa, nhậnv1–v6. Cập nhật cả hai thư mục cùng vault.php/vault.sql/vault.js/vault-sheet.js/vault-families.js, giữ config/database. Sau cập nhật, mở kho bằng mật khẩu cũ để tự ghép dữ liệu đã lưu.

Bản0.13.2: Kho che khóa2FA mặc định, có tag/bộ lọc Fam đang lỗi (Chờ fix/Đang fix); mã6số vẫn hiển thị. Phiên giữ30phút qua chuyển mục/tải lại trang, khóa chủ động tức thì. Nhập Sheet nhận Mail/Pass/Auth, xem trước thêm/cập nhật, giữ cột không chọn và tùy chọn giữ ô trống; không ghi thông tin bí mật vào nhật ký. Cập nhật đầy đủ cả PHP/giao diện, giữ config.php/database.
