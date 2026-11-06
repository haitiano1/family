# 0.28.3 — Link tra cứu ngắn

Dùng **Cập nhật một chạm**. Link Copy link tra cứu giờ có dạng `https://tên-miền/?K7P2QX`. Link cũ vẫn dùng được.

# 0.28.2 — Tự lấy link mời khi khách tra cứu

Dùng **Cập nhật một chạm**. Không đổi schema hay Apps Script. Cần đã kết nối Google Sheet và cấp quyền đọc Gmail như bản 0.22.0.

# 0.28.1 — Lời văn trang tra cứu, giao link là xong

Dùng **Cập nhật một chạm**. Không đổi schema hay Apps Script.

# 0.28.0 — Trang tra cứu có tiến trình, khách báo mất Premium, Telegram

Dùng **Cập nhật một chạm**. Bảng báo lỗi của khách tự tạo khi website mở lần đầu; không cần đổi Apps Script, SQL hay config.php. Muốn nhận tin Telegram: Thêm → Tra cứu khách → Thông báo Telegram. Xem TRA-CUU-CHUYEN-NHOM.md.

# 0.27.0 — Đã fix gọn hơn, Báo lỗi không cần nội dung

Dùng **Cập nhật một chạm**. Không đổi schema, SQL hay Apps Script. Hộp Đã fix chỉ còn Giữ nguyên mail và Đổi sang Gmail chủ mới; Báo lỗi để trống nội dung thì ghi là Bị quét.

# 0.26.0 — Đổi chủ ngay trên Family cũ, khách quá hạn vẫn nhận link

Dùng **Cập nhật một chạm**. Không cần đổi Apps Script, SQL hay config.php; cột mới cho link của chủ cũ tự thêm khi website mở lần đầu. Khi có đợt quét: Báo lỗi → Đã fix → Đổi sang mail mới (chọn số mail mời) → mời các mail đó từ chủ mới → Lấy link mời. Xem TRA-CUU-CHUYEN-NHOM.md.

# 0.25.0 — Đã gửi tự động, nút Cho khách vào

Dùng **Cập nhật một chạm**. Không còn ô tick Đã gửi: web tự gắn tag khi đưa link cho khách. Hộp Đã fix có thêm nút Cho khách vào (chuyển toàn bộ khách Family cũ sang Family mới). Không đổi schema hay Apps Script. Xem TRA-CUU-CHUYEN-NHOM.md.

# 0.24.1 — Xóa mail mời tạo nhầm

Dùng **Cập nhật một chạm**. Khung mail chờ lấy link có nút × cạnh từng mail và nút Xóa tất cả. Không đổi schema hay Apps Script.

# 0.24.0 — Gen mail mời tạo ngay, trạng thái Family theo Fix lỗi

Dùng **Cập nhật một chạm**; không cần đổi Apps Script, SQL hay config.php. Gen mail mời luôn dùng haihoangrr@gmail.com và tạo ngay khi chọn số lượng. Khách mới (Đã mời, chưa vào / Mua mới) tra cứu Gmail sẽ tự nhận một link riêng của Family mình và link được tự tick Đã gửi. Báo lỗi mail quản lý tự đặt Family thành Bị quét; case Đã fix tự đưa Family về Đang hoạt động. Xem TRA-CUU-CHUYEN-NHOM.md.

# 0.23.0 — Gen mail mời, Lấy link mời và tick Đã gửi

Dùng **Cập nhật một chạm**; không cần chạy SQL hay sửa config.php. Bảng mail mời và cột Đã gửi tự thêm khi website mở lần đầu. Upload tay: dùng gói family-ma-tra-cuu-gmail.zip như 0.22.0. Code.gs của 0.22.0 vẫn chạy; dán Code.gs mới rồi Deploy → Manage deployments → Edit → New version để web tự điền Gmail nhận lời mời. Xem MA-TRA-CUU-VA-GMAIL.md.

# 0.22.0 — Mã tra cứu và lấy link mời từ Gmail

Dùng **Cập nhật một chạm**; không cần chạy SQL, sửa config.php hay .htaccess. Nếu upload tay: sao lưu dữ liệu, upload nội dung hai thư mục family-private và public_html của gói family-ma-tra-cuu-gmail.zip, giữ config.php và database, rồi Ctrl+F5. Sau đó cập nhật Apps Script: dán Code.gs và appsscript.json mới, chạy hàm capQuyenGmail để cấp quyền chỉ đọc Gmail, rồi Deploy → Manage deployments → Edit → New version. Xem MA-TRA-CUU-VA-GMAIL.md.

# 0.21.0 — Tra cứu khách & chuyển nhóm

Dùng **Cập nhật một chạm**; không cần chạy SQL, sửa config.php hay .htaccess. Nếu upload tay: sao lưu dữ liệu, upload nội dung hai thư mục family-private và public_html của gói family-tra-cuu-chuyen-nhom.zip vào đúng thư mục đang dùng, giữ config.php và database, rồi Ctrl+F5. Schema 8 giữ nguyên; các bảng tra cứu được tạo một lần khi website mở. Xem TRA-CUU-CHUYEN-NHOM.md.

# Bản 0.20.2 — Sửa email Family

Đổi email quản lý từ Sửa Family sẽ ngắt liên kết Kho cũ; mail mới không kế thừa mật khẩu/2FA của mail cũ. Giữ hồ sơ mã hóa cũ riêng để tránh mất dữ liệu. Không đổi luồng Fix lỗi hoặc schema. Xem SUA-MAIL-FAMILY.md.

# Bản 0.20.0 — Đồng bộ, thứ tự case và sản phẩm

Xem DONG-BO-VA-SAN-PHAM.md: trạng thái/lịch sử đồng bộ, sắp xếp Fix lỗi, nhập Sheet sản phẩm và Nguồn mua. Cần upload hai thư mục; tự bổ sung cột database schema8, backup9 tương thích bản sao cũ.

# Bản 0.19.0 — Giao diện dịch vụ số

Làm mới giao diện cho desktop và điện thoại: hệ màu navy/xanh, biểu tượng thống nhất, Tổng quan với bốn nhóm việc hôm nay và bảng khách ưu tiên gọn. Menu chính gồm Tổng quan, Khách, Family, Kho; các mục khác nằm trong Thêm. Trên điện thoại dùng thanh điều hướng dưới cùng, danh sách dạng thẻ, nút dễ chạm. Tiện ích ở đầu trang được gom vào menu; ô ngày trong form được nhóm đúng với nhãn. Trang Thống kê giữ đầy đủ giải thích trong phần mở rộng.

Gói **family-giao-dien-hien-dai.zip** giữ các sửa lỗi trước và quy tắc gia hạn, slot, thống kê, đồng bộ hiện có. Upload hai thư mục ứng dụng, giữ config.php/database rồi Ctrl+F5. Không đổi schema hoặc Apps Script. Xem **GIAO-DIEN-HIEN-DAI.md**.

# Bản 0.18.1 — Ngày thực nhận tiền gia hạn

Trạng thái Chờ thanh toán và các trạng thái chưa nhận tiền không lưu ngày nhận tiền. Khi chuyển sang Đã thanh toán hoặc Trả một phần, form lấy ngày hiện tại theo giờ Việt Nam; vẫn cho chọn lại ngày thực nhận. Bỏ qua ngày chờ bị lưu từ bản cũ. API PHP/Node chuẩn hóa cùng quy tắc. Kỳ mới vẫn nối từ hạn cũ, thống kê vẫn về tháng của hạn cũ khi hoàn tất.

Gói **family-sua-ngay-nhan-tien.zip** gồm hai thư mục ứng dụng và hướng dẫn upload. Giữ config.php/database, Ctrl+F5. Không sửa hàng loạt ngày nhận tiền trong lịch sử đã hoàn tất, không đổi cấu trúc database hoặc Apps Script. Xem **NGAY-NHAN-TIEN-GIA-HAN.md**.

# Bản 0.18.0 — Slot và chuyển Family vượt 5

Hiển thị số khách chiếm slot theo mẫu x/5, kèm số khách **Đã mời, chưa vào**, ví dụ **3/5 (2 chưa vào)**. Bộ lọc Fam dư slot dùng cùng quy tắc. Cho phép chuyển khách vào Family đủ/vượt 5; vẫn giữ trạng thái, dữ liệu và kiểm tra trùng/stale. Hồ sơ đã vượt 5 tiếp tục sửa và đồng bộ bình thường khi không tăng thêm slot.

Gói **family-slot-va-chuyen-family.zip** gồm hai thư mục ứng dụng cùng hướng dẫn. Upload giữ config.php/database, Ctrl+F5. Không có migration hoặc thay Apps Script. Xem **SLOT-VA-CHUYEN-FAMILY.md**.

# Bản 0.17.1 — Nối lại MySQL khi chờ Google

Sửa lỗi `[php_sync] [read_remote] [db_connection]`: nối lại MySQL khi Google I/O kết thúc, lấy lại khóa và đối chiếu cấu hình/ID/mốc đồng bộ trước khi dùng kết quả. Nếu trạng thái đã đổi, khởi động lại lượt đồng bộ một lần; nếu bị tranh khóa, dừng an toàn. Giữ phản hồi ghi Google đã được xác nhận và giữ lỗi Google khi việc dọn dẹp MySQL cũng lỗi. Có chẩn đoán PHP theo bước, không gửi lỗi thô hoặc thông tin tài khoản ra màn hình.

Website đã cập nhật các bản Sheet trước có thể chỉ upload **family-private/sheets.php** từ gói **family-sheet-sua-mat-ket-noi.zip**. Giữ Code.gs v5.7, URL /exec, token, cấu hình và database; không có migration mới. Xem **HUONG-DAN.md** trong gói sửa.

# Bản 0.17.0 — Cập nhật một chạm

Gói **family-cap-nhat-mot-cham.zip** cài bộ cập nhật lần đầu. Sau đó website có thể lấy gói tương thích từ GitHub Releases **haitiano1/family** ngay trong nút **Cập nhật một chạm**: kiểm tra SHA-256, sao lưu dữ liệu/mã, tạm dừng yêu cầu ứng dụng, thay mã và kiểm tra khởi động ở tiến trình PHP mới. Có khôi phục mã khi thất bại hoặc gián đoạn; giữ config.php/database/kết nối Sheet.

Nguồn cập nhật chỉ nhận các Release đã phát hành đúng chuẩn; code trong chat hoặc ở main chưa tự trở thành bản cập nhật. Workflow **Phát hành Family PHP** tự chạy khi PR được gộp vào main (và vẫn chạy tay được). Bộ cài không tự nâng cấp cấu trúc database, Apps Script hoặc bộ khôi phục nền. Hướng dẫn đầy đủ: **CAP-NHAT-MOT-CHAM.md**.

# Bản 0.16.0 — khách mua mới và thống kê theo kỳ gia hạn

Thêm trạng thái **Mua mới**, lưu lịch sử mua đầu theo Ngày mua và giữ khi khách gia hạn/đổi trạng thái. Trang Thống kê có bảng Khách mua mới dưới lịch sử gia hạn; phần 6 tháng gần nhất mặc định thu gọn. Bỏ thẻ Đã thu tiền, cần cập nhật hạn trên Tổng quan.

Gia hạn hoàn tất được thống kê theo **tháng của hạn cũ**. Ví dụ hạn 10/09, nhận tiền 21/10, gia hạn 3 tháng: kỳ mới vẫn 10/09–10/12, thống kê vào tháng 9. Ngày nhận tiền/xác nhận được giữ để đối chiếu. Quy tắc này thay thế cách phân tháng theo thời điểm xác nhận mô tả ở các phiên bản cũ bên dưới.

Cập nhật đầy đủ hai thư mục, gồm cả **family-private/schema.sql**, giữ config.php/database. Schema tự nâng cấp, sao lưu mới v8 có lịch sử mua mới; vẫn đọc sao lưu v1–v7. Không cần thay Apps Script hoặc liên kết Sheet. Xem **THONG-KE-MUA-MOI.md** trong gói cập nhật để biết các bước cài và quy tắc ghi nhận.

# Bản 0.15.1 — sửa tranh chấp khóa khi đồng bộ Google Sheet

Cập nhật core.php, sheets.php, public_html/sheets.js và style.css; giữ config.php/database. Chi tiết trong SUA-KHOA-DATABASE.md của gói sửa. Nếu cập nhật từ trước 0.15.0, dùng gói cập nhật đầy đủ hai thư mục. Không cần triển khai lại Apps Script cho bản sửa này.

# Bản 0.15.0 — giao diện và đồng bộ Google Sheet

Sao lưu trước, cập nhật **đầy đủ hai thư mục** family-private và public_html; giữ config.php/database. Có file mới records.php, sheets.php và public_html/sheets.js. Không chỉ thay app.js/style.css. Tính năng tự thêm bảng family_sheet_state riêng để lưu cấu hình mã hóa, ID và dấu đối chiếu; không thay lịch sử gia hạn hoặc định dạng sao lưu khách.

Kết nối Sheet là bước riêng sau khi cập nhật website. Dùng Code.gs, appsscript.json và HUONG-DAN.md trong gói family-google-sheets.zip. Script tạo file Sheet mới trong Drive của bạn. Giữ nguyên quyền riêng tư Sheet; mã kết nối chỉ nhập trên website. Bản Node vẫn chạy chức năng quản lý hiện có, chưa có API đồng bộ Sheet.

Các hướng dẫn phiên bản cũ bên dưới chỉ áp dụng cho phiên bản tương ứng.

# Cập nhật YouTube Family 0.14.2

Bản này gộp đầy đủ các thay đổi trước đây chưa đóng gói và các yêu cầu mới. Dùng **gói cập nhật** cho website Family đang chạy; giữ cấu hình và dữ liệu hiện có.

## Các bước cập nhật website đang dùng

1. Trong app, chọn **Sao lưu / Chuyển dữ liệu → Tải file sao lưu** và giữ file JSON trên máy tính.
2. Tải [family-hostinger-update.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger-update.zip), rồi **giải nén trên máy tính**. Bên trong có hai thư mục `family-private`, `public_html` và hướng dẫn này.
3. Mở hPanel → Websites → Dashboard của **đúng website Family** → Files → File Manager. Mở thư mục `family-private` hiện có, đang chứa `config.php`. Upload **các file bên trong family-private của gói cập nhật**, chọn thay file trùng. **Giữ nguyên config.php**.
4. Mở `public_html` chính của website. Upload **các file bên trong public_html của gói cập nhật**, chọn thay file trùng. Đưa file vào ngay thư mục đang dùng, không tạo `public_html/public_html` hoặc `family-private/family-private`.
5. Mở lại website và nhấn **Ctrl+F5**. Trên iPhone, tải lại trang trong Safari hoặc đóng rồi mở lại Family trên màn hình chính.

Không cần tạo database, sửa SQL hay nhập lại khách. Gói không chứa config.php, mật khẩu, dữ liệu khách hoặc backup. Website giữ database hiện tại; nếu còn dùng schema cũ, ứng dụng tự thêm các cột cần thiết. Cài mới dùng [family-hostinger.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger.zip) và [INSTALL.md](INSTALL.md).

## Sửa lỗi trong bản 0.14.2

Sửa lỗi **Nhật ký**: Tất cả thao tác chạy được nhưng khi chọn loại riêng (Thêm mới/Sửa/Xóa/Gia hạn/…) lại báo lỗi hệ thống. Nguyên nhân đã tái hiện trên MariaDB: collation của chuỗi mã loại trong UNION khác tham số PDO. Truy vấn mới so sánh mã loại ở dạng binary; nội dung tiếng Việt, tìm kiếm và phân trang giữ nguyên.

**Nếu đang dùng 0.14.1, chỉ cần thay một file:**

1. Giải nén gói cập nhật trên máy tính.
2. Trong File Manager của đúng website Family, mở `family-private` đang chứa `config.php` (nằm cạnh `public_html`).
3. Upload đè **file `audit.php` trong thư mục family-private của gói mới** vào đó. Giữ `config.php` và database.
4. Mở lại Nhật ký, nhấn Ctrl+F5 và chọn từng nhóm thao tác.

Không cần sửa collation, chạy SQL hoặc import dữ liệu. Bản cũ hơn 0.14.1 cập nhật đầy đủ hai thư mục theo hướng dẫn đầu tài liệu. Schema và backup v7 không đổi. Đã kiểm tra bộ lọc/tìm kiếm/phân trang bằng PDO native trên MySQL 8.4, MariaDB 10.11 và 11.4 với general_ci, unicode_ci, unicode_520_ci và bin.

## Bổ sung trong bản 0.14.1

- **Lịch sử gia hạn** nằm phía trên, **6 tháng gần nhất** nằm phía dưới. Tổng tháng, bộ chọn tháng và dữ liệu giữ nguyên.
- **Nhật ký** có nhãn màu và bộ lọc: Thêm mới, Sửa, Xóa / Lưu trữ, Gia hạn, Chuyển Family, Khôi phục, Nhập dữ liệu, Khác / Nhật ký cũ. Bộ lọc kết hợp tìm email/Family và phân trang toàn bộ lịch sử. Chi tiết trước/sau cũng có nhãn Thêm/Sửa/Xóa.
- Phân loại các nhật ký đã có khi xem, không viết lại hoặc xóa bản ghi. Nhật ký cũ thiếu loại vẫn nằm trong Khác. Schema và backup v7 không đổi.

Cập nhật đầy đủ hai thư mục theo hướng dẫn đầu tài liệu, giữ config.php/database, không nhập lại khách. Nếu chỉ thay file từ **0.14.0**, các file đổi là `public_html/statistics.js`, `public_html/app.js`, `public_html/style.css`, `family-private/audit.php`.

## Bổ sung trong bản 0.14.0

- Thêm mục riêng **Thống kê**: 6 tháng gần nhất (tháng hiện tại + 5 tháng trước), mỗi tháng từ ngày 1 đến ngày cuối tháng theo giờ Việt Nam. Đếm số email khách khác nhau, số lượt gia hạn thành công và tổng tiền mọi lượt. Tính theo thời điểm xác nhận hạn mới; ngày trả tiền và hạn cũ không quyết định tháng thống kê. Chưa xác nhận hạn mới chưa được tính.
- Chọn tháng hoặc **Toàn bộ lịch sử**, tìm tên/email/Family/ghi chú và phân trang. Toàn bộ lịch sử xem được cả các tháng cũ hơn. Tìm kiếm không thay tổng tháng. Chỉ tổng hợp lịch sử gia hạn thực có; không suy đoán từ dữ liệu Sheet hoặc cột tiền hiện tại.
- Bỏ mục Khách vừa gia hạn và logic 14 ngày. Giữ vĩnh viễn lịch sử gia hạn, kể cả khi xóa hồ sơ khách hoặc Family. Khách hoạt động không bị ảnh hưởng bởi tuổi của lịch sử.
- **Khách lưu trữ** chỉ gồm khách Không gia hạn, khách/sản phẩm vừa xóa, Family vừa xóa. Family có thêm **Xóa khỏi lưu trữ**. Xóa Family tại đây giữ khách để khôi phục riêng vào Family khác; giữ lịch sử và ghi Nhật ký. Thông tin Kho đã mã hóa vẫn giữ riêng khi bỏ liên kết Family.

**Kể cả đã có 0.13.6, vẫn cập nhật đầy đủ hai thư mục** theo các bước đầu tài liệu. Có file mới `public_html/statistics.js`, `family-private/statistics.php` và thanh điều hướng mới trong `public_html/index.html`. Không thay config.php, không tạo database mới, không import lại; schema và backup v7 giữ nguyên. Các ghi chú phiên bản phía dưới là lịch sử thay đổi; mục Thống kê hiện thay thế hướng dẫn 14 ngày của bản cũ.

## Bổ sung trong bản 0.13.6

Email quản lý ở đầu trang Family bấm được, mở đúng hồ sơ trong **Kho tài khoản** theo ID nhóm, chỉ hiện nhóm đã chọn. Có đủ mail/ngày trial/mật khẩu/2FA/mã 6 số/mail khôi phục/Note; vẫn Hiện/Ẩn/copy/sửa như trước. **Xem tất cả Family** trở về danh sách Kho. Nhóm chưa có thông tin Kho hiện trống để bổ sung.

Phiên Kho còn hạn thì vào ngay; hết 30 phút/chưa mở/đã khóa thì hỏi pass và chỉ hiển thị thông tin sau khi nhập đúng. Giữ nhóm đã chọn qua bước nhập pass và tải lại trang. Liên kết không gia hạn phiên; khóa thủ công vẫn có hiệu lực. Ngày trial/khách/mật khẩu đã lưu không bị sửa bởi điều hướng.

Nếu đã cài đủ **0.13.5**, thay **public_html/app.js** và **public_html/vault.js** từ gói mới rồi Ctrl+F5. Bản cũ hơn cập nhật đầy đủ hai thư mục theo hướng dẫn đầu tài liệu. Giữ config.php/database, không nhập lại khách. Schema và backup v7 không đổi; gói 0.13.6 gồm toàn bộ thay đổi trước đó.

## Bổ sung trong bản 0.13.5

**Đã fix → Đổi sang mail mới** cho mail chủ Family: Kho chỉ còn **mail mới và ngày trial mới**. Các trường **mật khẩu, khóa 2FA, mã 6 số, mail khôi phục và Note** của mail cũ để trống để bạn nhập từ Sheet sau. Thực hiện được khi Kho đang khóa. **Giữ nguyên mail** vẫn giữ đủ thông tin cũ; đổi mail member không xóa Kho của chủ. Chỉnh lại ghi chú case Done không xóa dữ liệu đã nhập cho mail mới. Xử lý mail/trial/thông tin Kho/case cùng giao dịch, lỗi lưu sẽ hoàn tác; giữ khách, lịch sử và Nhật ký không chứa thông tin bí mật. Mục Kho đang mở cũng bỏ cache của mail cũ khi nhận mail chủ mới. Không tự xóa dữ liệu của các lượt fix trước khi cập nhật.

Nếu đã cài đủ **0.13.4**, thay **family-private/issues.php**, **public_html/app.js** và **public_html/vault.js** từ gói mới rồi Ctrl+F5. Bản cũ hơn nên cập nhật đầy đủ hai thư mục như hướng dẫn đầu tài liệu. Giữ config.php/database, không nhập lại khách. Schema và backup v7 không đổi; gói 0.13.5 đã có toàn bộ tính năng cũ.

## Bổ sung trong bản 0.13.4

**Đã fix → Đổi sang mail mới** cho **mail chủ Family** sẽ đặt ngày trial về đúng ngày xác nhận đổi mail theo giờ Việt Nam. Mail và ngày trial mới hiện tại Family/Kho. **Giữ nguyên mail** giữ ngày trial cũ; đổi mail member không thay ngày trial của chủ. Case cũ giữ ngày trial và số ngày đã sử dụng trước khi fix, còn kết quả fix ghi thêm ngày trial mới. Nhật ký giữ đầy đủ trước/sau; lượt báo lỗi kế tiếp lấy trial mới. Lỗi ghi hoặc mail trùng không đổi mail/ngày trial một phần. Không tự sửa ngày của các lượt fix đã hoàn tất trước cập nhật.

Nếu đã có đủ **0.13.3**, thay **family-private/issues.php** và **public_html/app.js** từ gói mới rồi Ctrl+F5. Bản cũ hơn nên cập nhật đủ hai thư mục theo các bước đầu tài liệu. Giữ config.php/database, không nhập lại khách. Schema và backup v7 không đổi; gói 0.13.4 gồm mọi tính năng trước đó.

## Bổ sung trong bản 0.13.3

- Trang chi tiết Family có **Copy tất cả mail** ở góc phải phần **Khách trong Family**. Sao chép email của mọi khách đang ghi nhận trong nhóm, mỗi mail một dòng theo thứ tự danh sách; gồm khách quá hạn và đã mời/chưa vào. Không kèm mail chủ, tên, Contact, khách nhóm khác hoặc hồ sơ lưu trữ. Nhóm trống không hiện nút. Có ô chọn để copy thủ công nếu trình duyệt chặn clipboard; thao tác không sửa dữ liệu.
- Trong **Kho tài khoản**, sao chép thông tin ở hàng nào thì mail hàng đó chuyển **màu cam**. Áp dụng cho mọi icon copy: mail, ngày trial, mật khẩu, khóa 2FA, mã 6 số, mail khôi phục và Note. Copy hàng khác đưa mail trước về màu cũ. Dấu nhận biết theo hàng copy thành công gần nhất trong lần mở mục Kho, giữ khi lọc/tìm/làm mới dữ liệu hoặc mã 2FA tự đổi; khóa hoặc rời mục sẽ bỏ dấu. Không sửa dữ liệu hay ghi Nhật ký.

Nếu đã cài đủ **0.13.2**, chỉ cần thay **public_html/app.js**, **public_html/vault.js** và **public_html/style.css** từ gói mới rồi Ctrl+F5. Nếu đang dùng bản cũ hơn, cập nhật đủ cả hai thư mục theo hướng dẫn trên. Gói 0.13.3 gồm toàn bộ thay đổi trước đó; giữ config.php và database, không nhập lại khách.

## Bổ sung trong bản 0.13.2

- Khóa 2FA mặc định hiển thị `********`, có Hiện/Ẩn/copy như mật khẩu; mã 2FA 6 số vẫn hiện và tự đổi. Rời mục/ẩn ứng dụng che lại giá trị đã bấm Hiện.
- **Tag Fam đang lỗi** cho case Chờ fix/Đang fix; bộ lọc Kho là **Tất cả / Fam đang lỗi / Theo tên**. Done bỏ tag và khỏi bộ lọc. Mục Family vẫn có Fam dư slot như trước.
- **Phiên Kho30phút kể từ lúc mở**: chuyển mục/tải lại trang không yêu cầu pass lại trong phiên. Khóa kho/Khóa ứng dụng vẫn khóa ngay; hết30phút mở lại bằng pass.
- **Nhập từ Sheet** nhận tự động **Mail, Pass, Auth**. Copy cả tiêu đề/dữ liệu, dán hoặc chọn CSV, xem trước số dòng thêm/cập nhật rồi xác nhận. Có cập nhật tài khoản đã có; cột không chọn giữ nguyên. Mặc định giữ ô trống khi cập nhật; bỏ chọn để xóa trường bằng ô trống. Mail trùng trong sheet/khóa sai/hồ sơ thay đổi sau preview sẽ dừng cả lượt. Ghi Nhật ký số lượng, không ghi thông tin bí mật.

Cập nhật cả **public_html và family-private** để có cập nhật hàng loạt và phiên30phút. Giữ config.php/database; không nhập lại Family/khách. Schema14/6 và backupv7 không đổi. Gói0.13.2 đã có đầy đủ0.13.1 và trước đó.

## Bổ sung trong bản 0.13.1

Kho tự hiện toàn bộ Family. Chỉ lấy **Mail Family** và **Ngày trial**; Mật khẩu/2FA/mã2FA/Mail khôi phục/Note bạn tự nhập. Không có cột số khách. Có Nhập thông tin/Sửa/copy; tìm mail và bộ lọc như Family.

**Đổi mail tại Family hoặc Kho đều cập nhật hai bên**, giữ mật khẩu/2FA/Note theo hồ sơ nhóm. Đổi mail khi kho đang khóa vẫn cập nhật đúng khi mở lại. Nhật ký ghi rõ mail cũ → mail mới, không ghi mật khẩu/khóa. Trùng mail/stale form/lỗi lưu sẽ không ghi một phần. Thông tin0.13 cũ tự liên kết khi mở kho lần đầu; không cần nhập lại48 Family. Lưu trữ/khôi phục Family vẫn giữ thông tin kho; Xóa thông tin kho giữ nguyên Family/khách.

Mật khẩu kho từ **5 ký tự**, mật khẩu cũ vẫn dùng; có Đổi mật khẩu kho. Cập nhật đầy đủ public_html/family-private, gồm **vault-families.js** mới; giữ **config.php/database**. MySQL schema6/SQLite14 thêm liên kết; tự nâng cấp. Sao lưu/helper Windows hiện **v7**, nhậnv1–v6; giữ mật khẩu kho để giải mã khi chuyển dữ liệu. Không nhậpv7 vào app cũ.

## Bổ sung trong bản 0.13

Có mục **Kho tài khoản** với mật khẩu riêng. Sau cập nhật, mở mục này, đặt mật khẩu kho từ 5 ký tự khác mật khẩu website. Chọn Thêm tài khoản, nhập tài khoản/mật khẩu/khóa bí mật 2FA/mail khôi phục/Note. Có thể chọn một Family đang quản lý để điền mail chủ nhóm. Kho có cột **2FA** hiển thị khóa và **Mã 2FA** tự tạo 6 số, đếm ngược/copy như Google Authenticator. Có copy các trường khác, Hiện/Ẩn mật khẩu, sửa/xóa, tìm kiếm và Đổi mật khẩu kho.

Có tìm mail/Family/Note và bộ lọc **Tất cả, Fam dư slot, Theo tên** như mục Family. Note được mã hóa và copy được.

Chọn **Nhập từ Sheet** để dán bảng có dòng tiêu đề (Tài khoản, Mật khẩu, 2FA, Mail khôi phục, Note; có thể thêm Tên Family) hoặc chọn CSV/TSV. Đối chiếu cột, nhấn **Xem trước** rồi **Nhập … tài khoản**. Chỉ Tài khoản bắt buộc; tối đa 500 dòng/lần, file1MB. Mail trùng hoặc khóa sai được báo theo dòng; dừng cả lượt, không ghi đè hay nhập thiếu. Nhập vào kho không tạo Family/khách.

Khóa dạng nhóm4ký tự có khoảng trắng được chuẩn hóa. Khóa Base32 chỉ nhận A–Z và 2–7; không dùng mã dự phòng hay mã6số. Mã lấy theo giờ máy chủ, mặc định đổi30giây. Chỉ người đã mở kho mới thấy thông tin; kho tự khóa sau30phút hoặc khi chủ động bấm Khóa kho. Thông tin lưu mã hóa AES-GCM, không hiện trong nhật ký. Nhật ký chỉ ghi thao tác/ID. Giữ mật khẩu kho riêng vì ứng dụng không khôi phục được mật khẩu đã quên.

Sao lưu hiện tại **v7** giữ cả kho đã mã hóa; nhận v1–v6 cũ và mở lại bằng cùng mật khẩu trên Node/PHP. Helper Windows đã cập nhật. Không dùng app cũ để nhập backup v7. PHP schema6 thêm các bảng kho khi mở app, giữ toàn bộ khách/Family/Contact/hạn/thanh toán/lịch sử/Fix lỗi. Không cần tạo database/import lại hay thêm mật khẩu kho trong config.php.

**Cần upload đầy đủ các file trong cả family-private và public_html**, gồm các file mới **vault.php, vault.sql, vault.js, vault-sheet.js và vault-families.js**. Bật OpenSSL trong PHP Configuration nếu kho báo thiếu extension; giữ config.php và database hiện có. Gói đầy đủ/cập nhật đã bao gồm các chức năng0.12 và trước đó.

## Bổ sung trong bản 0.12

- Nút **Chuyển Family** thay Nhắc hạn tại thao tác khách trong Tổng quan, Khách & Gia hạn và chi tiết Family; khách chưa có hạn cũng chuyển được.
- Nhập mail chủ nhóm để tìm hoặc mở menu tất cả Family đang hoạt động. Gõ đúng mail chủ nhóm sẽ tự chọn; xem tên nhóm/mail/số khách rồi bấm Chuyển Family. Mở ngay nhóm nhận khách cùng toàn bộ thành viên.
- Giữ nguyên hồ sơ/gói/ngày mua/hạn/Contact/tiền/trạng thái/lịch sử; chỉ đổi nhóm. Nhật ký ghi rõ Family cũ và mới.
- Tag lỗi trên dòng member theo mail chủ nhóm hiện tại: sang B thì bỏ tag lỗi của chủ A. Chủ A và các member còn ở A vẫn giữ trạng thái của nhóm A; nếu chủ B đang lỗi thì hiện tag của chủ B.
- Case Fix lỗi của mail khách được xóa khỏi bảng khi chuyển, kể cả case đang chờ/đang fix/đã fix. Nhật ký giữ toàn bộ thông tin case trước xóa. Case mail chủ nhóm và khách khác vẫn giữ. Chuyển hồ sơ và xóa case cùng giao dịch; lưu lỗi không mất dữ liệu.
- Chặn chuyển trùng email, sang nhóm lưu trữ/đủ 5 thành viên đang ghi nhận, cửa sổ cũ và gửi lặp; giữ quy tắc hồ sơ đã mời/chưa vào chưa chiếm chỗ. Nhắc hạn 2 ngày ở Tổng quan, copy Contact, gia hạn từ hạn cũ, Khách vừa gia hạn14ngày và các chức năng 0.11/0.11.1 vẫn hoạt động.

**Lần này cần upload cả file PHP trong family-private và file trong public_html theo các bước trên. Chỉ thay app.js/style.css như bản 0.11.1 chưa đủ.** Giữ config.php/database; không tạo SQL hoặc nhập lại khách. Đây là chuyển hồ sơ quản lý trong app. Gói 0.12 đã gồm tất cả thay đổi cũ, dùng được dù chưa cài 0.11/0.11.1.

## Bổ sung trong bản 0.11.1

Bấm email trên thẻ Chờ fix/Đang fix/Đã fix sẽ mở trang chi tiết đúng Family cùng toàn bộ thành viên đang ghi nhận, áp dụng cho cả mail chủ Family và mail khách. Mail liên kết bằng ID Family nên sau đổi mail khi Done vẫn mở đúng nhóm. Icon copy bên cạnh chỉ sao chép, không chuyển trang. Family đã lưu trữ đưa về Khách lưu trữ; case không còn Family vẫn giữ email/copy.

Gói 0.11.1 đã chứa mọi thay đổi của 0.11. Dùng cùng các bước cập nhật ở trên kể cả bạn chưa cài 0.11. Bổ sung 0.11.1 trước đây chỉ cần app.js/style.css; để có Chuyển Family của 0.12, hãy cập nhật cả PHP như hướng dẫn ở đầu file.

## Thay đổi trong bản 0.11

- **Một case đang mở cho mỗi Family:** dù chọn mail khách hay mail quản lý, Family có case Chờ fix/Đang fix không thể báo thêm. Khi tìm bằng mail khách hoặc chủ Family, dòng Family hiện **Mail đã báo lỗi — chờ fix/đang fix**, kèm email thực sự gặp lỗi. Nút Báo lỗi đổi thành **Xem lỗi**, mở và đánh dấu thẻ đang xử lý. Báo lỗi từ Fix lỗi chỉ cho chọn Family chưa có case đang mở. Khi đã Done, có thể báo một sự cố mới. Chặn cả gửi đồng thời hoặc mở lại case Done khi Family đang có case khác. Case trùng đã tồn tại ở bản cũ vẫn được giữ để bạn xử lý, không tự xóa dữ liệu.
- **Tìm kiếm:** chuyển sang mục khác sẽ xóa nội dung các ô tìm kiếm. Ví dụ tìm mail → Báo lỗi → quay lại Family, ô tìm kiếm trống để tìm mail tiếp. Làm mới dữ liệu, mở form hoặc đổi bộ lọc trong cùng mục vẫn giữ nội dung đang tìm.
- **Fix lỗi:** icon copy ngay sau email trên thẻ Chờ fix, Đang fix và Đã fix. Nếu đổi mail khi Done, có thể copy cả mail mới và mail báo lỗi ban đầu. Giữ ngày lỗi/trial/số ngày đã sử dụng, kéo thả, lựa chọn giữ/đổi mail và đồng bộ mail với Family.
- **Logo:** biểu tượng ở đầu thanh điều hướng là logo YouTube đỏ với nút phát trắng, hiển thị trên máy tính và iPhone.
- **Sản phẩm khác → Xóa:** chuyển toàn bộ hồ sơ vào Khách lưu trữ, giữ sản phẩm, khách/email/Contact, gói, ngày mua/hạn, thanh toán, tiền và ghi chú. Khôi phục đưa lại vào Sản phẩm khác, không cần chọn Family.
- **Khách lưu trữ:** thêm **Xóa khỏi lưu trữ** với hộp xác nhận. Hủy giữ hồ sơ; xác nhận bỏ hồ sơ lưu trữ và khả năng khôi phục bằng nút. Nhật ký giữ dữ liệu trước xóa, lịch sử gia hạn vẫn được giữ. Không xóa khách đang hoạt động hoặc hồ sơ đã khôi phục.

## Các tính năng đã có tiếp tục được giữ

- Gia hạn khách YouTube nối từ ngày hết hạn cũ, kể cả khách trả muộn; ngày nhận tiền được ghi riêng.
- **Khách vừa gia hạn** hiển thị lần xác nhận mới nhất của mỗi khách trong 14 ngày từ lúc xác nhận thành công. Sau 14 ngày, chỉ dòng ở mục này rời danh sách; khách hoạt động và lịch sử vẫn giữ.
- Gói 1/2/3/6/12 tháng tự tính ngày hết hạn theo ngày mua cho khách và sản phẩm khác. Hạn nhập thủ công được giữ khi chỉ mở form sửa.
- Ba bộ lọc khách; Family xếp trial cũ đến mới, Fam dư slot dưới 5 hồ sơ, Theo tên giảm dần; copy thông tin và Contact bấm mở được.
- Xóa hồ sơ khách/Family và chọn Không gia hạn chuyển vào lưu trữ. Family trống vẫn lưu trữ và khôi phục được. Nhật ký, CSV và bản sao lưu tiếp tục hoạt động.

Backup hiện tại là **v7**, nhận bản v1–v6 cũ; không dùng ứng dụng cũ để nhập backup v7. Cả ZIP cài mới, ZIP cập nhật và helper xuất Windows đã được tạo lại cho bản này. Không thể tự phục hồi sản phẩm đã bị xóa hẳn từ bản cũ trước khi tính năng lưu trữ được bổ sung.
