# Hải Premium — Quản lý khách hàng 0.32.12

Bản 0.32.12: trang tra cứu hướng dẫn Rời nhóm cũ bằng 2 trường hợp thu gọn: Trường hợp 1 mở ra 4 bước rời nhóm có ảnh (Rời khỏi nhóm gia đình → nhập mật khẩu → Rời khỏi → xong), Trường hợp 2 có ảnh trang chưa ở nhóm nào (nhóm không hoạt động → Rời khỏi nhóm gia đình; chưa ở nhóm nào → bỏ qua), Gmail cần vào nhóm in đỏ đậm, bỏ dòng “chỉ dùng được 1 lần”. Bản 0.32.11: lấy link theo mail lấy được cả link đã bỏ khi Đã fix (có từ trước khi Family báo lỗi) và link chưa giao nằm ở Family khác — link về Family đang thêm; danh sách ghi tên các link đã bỏ. Bản 0.32.10: lấy link theo mail không còn kiểm người gửi — có thư mời tới mail đó là link được lưu vào Family đang thêm. Bản 0.32.9: **+ Thêm link mời** chỉ cần gõ mail đã mời (dạng haihoangrr+…@gmail.com) và để trống ô Link — web đọc thư mời trong Gmail rồi tự lấy link. Bản 0.32.8: khách “Đã mời, chưa vào” được xử lý như khách đang ở nhóm — tra cứu thấy Family bình thường, không còn trang chờ link, không tự nhận link, không bị đưa vào chờ link khi Đổi Gmail chủ / Cho khách vào (muốn giao link thì chọn ở ô Khách nhận link). Bản 0.32.7: trang tra cứu luôn có bước “Rời nhóm cũ” (kèm nút mở trang Gia đình Google) trước khi bấm vào nhóm, cả với khách mới. Bản 0.32.6: link của Gen mail chỉ tự giao cho khách cần link — khách đang chờ (sau Đổi Gmail chủ / Cho khách vào) và khách Mua mới; khách đang ở nhóm không bao giờ bị gán. Hộp Gán mail có ô “Khách nhận link này” để đổi hoặc bỏ khách web đã giao. Bản 0.32.5: sau Đã fix · Đổi Gmail chủ (hoặc Cho khách vào), Gen mail rồi Lấy link mời thì mỗi link tự gán cho một khách đang chờ, trừ khách “Đã mời, chưa vào” (họ tự nhận link còn dư khi tra cứu); Gen thêm đợt sau vẫn gán tiếp cho khách còn chờ. Bản 0.32.4: link của Gen mail ở Family mới tự gán cho khách dù khách được thêm trước hay sau khi link về (Thêm khách, Chuyển Family, Lấy link mời đều gán); khách Mua mới cũng được gán, Đã mời chưa vào xếp cuối; link đã Thu hồi không tự gán lại. Bản 0.32.3: Cập nhật một chạm kiểm tra khởi động thẳng trên máy chủ khi hosting chặn website tự gọi tên miền của mình (lỗi “Connection reset by peer”); không gọi được đường nào thì kiểm tra cú pháp mã mới tại chỗ. Bản 0.32.2: ô “mail chờ lấy link” ghi rõ link của từng mail sẽ gán cho khách nào (hoặc để trong kho). Bản 0.32.1: Cập nhật một chạm gọi kiểm tra khởi động bằng địa chỉ riêng mỗi lần (không bị CDN/cache trả kết quả cũ) và khi không qua được thì ghi rõ lý do. Bản 0.32.0: **Gán link sẵn cho khách** — Gen mail mời ở Family chưa có link nào (Family mới hoặc vừa Đổi Gmail chủ) thì mỗi link về được gán cho một khách của Family (khách đang chờ link trước, rồi theo thứ tự; không gán khách “Đã mời, chưa vào” / “Mua mới”, họ tự nhận link còn lại khi tra cứu); khách tra cứu thấy đúng link của mình. Family chưa có khách: thêm khách rồi bấm Gán mail → Gán N link cho khách. Bản 0.31.1: khách đang chờ link có nút **Bỏ chờ link** (từng khách trong nút “…”, hoặc cả Family trong mục Khách nhận link) để trang tra cứu không còn báo “Shop đang tạo link riêng” khi khách vẫn ở nhóm. Bản 0.31.0: **Gán mail** cho link mời — mỗi link ghi được tối đa 5 mail khách (kèm tên, không bắt buộc), hiện ngay sau mail mời bằng chữ xanh đậm; có thể đánh dấu Đã gửi cùng lúc để web không tự giao link đó cho khách khác. Sửa link / Xóa link chuyển vào nút “…”. Khách web tự giao link cũng hiện chữ xanh ngay sau mail mời; ở Tra cứu khách, mục Link đã giao cho khách được thu gọn (đầu mục hiện số chờ link / đã nhận link) và khách chờ link đã được gán mail thì hiện link đã gán.

Bản 0.28.6: **Thông tin hiển thị cho khách** có riêng **Link Zalo** và **Link Facebook / Messenger**; trang tra cứu hiện nút Zalo và Facebook kèm biểu tượng.

Bản 0.28.5: nút **Copy link trang** và **Mở trang khách** ở Tra cứu khách dùng Link ngắn (ví dụ `https://beeflix.vn/haiytb`) khi đã điền.

Bản 0.28.4: ô **Link ngắn** nhận cả đường dẫn, ví dụ `beeflix.vn/haiytb`; link gửi khách thành `https://beeflix.vn/haiytb?MÃ`. Xem [hướng dẫn](hosting/php/LINK-NGAN.md).

Bản 0.28.3: **link tra cứu ngắn** dạng `https://tên-miền/?K7P2QX` thay cho `…/tra-cuu.html#ma=K7P2QX` (link cũ vẫn mở được), có thể dùng tên miền phụ ngắn hơn ([hướng dẫn](hosting/php/LINK-NGAN.md)). Tin nhắn gửi khách không còn tên Family.

Bản 0.28.2: **tự lấy link mời**. Khách đang chờ link mở trang tra cứu thì máy chủ tự đọc Gmail (tối đa một lần mỗi phút), nên mời xong là link tự hiện cho khách, không cần bấm Lấy link mời. Trang quản lý đang mở cũng tự kiểm tra Gmail mỗi phút khi còn mail chờ lấy link.

Bản 0.28.1: trang tra cứu dùng lời văn shop đã sửa, không hiện tên Family cho khách (thẻ cuối hiện Gmail của khách), và giao link là xong: bỏ bước Hoàn tất, nút Tôi đã vào được / Tôi không vào được và nút Đã vào.

Bản 0.28.0: **trang tra cứu mới** cho khách với thanh tiến trình (Báo lỗi → Tiếp nhận → Đang xử lý → Vào nhóm mới) có chibi chạy tới đúng bước; giao link là xong, không theo dõi khách đã vào hay chưa, trang tự làm mới 30 giây một lần. Khách thấy nhóm vẫn bình thường mà mất Premium thì bấm **Báo mất Premium cho shop**: báo lỗi hiện ở đầu **Fix lỗi**, ở Tổng quan và gửi về **Telegram** nếu bạn cài bot. Xem [hướng dẫn](hosting/php/TRA-CUU-CHUYEN-NHOM.md).

Bản 0.27.0: hộp **Đã fix** chỉ còn hai lựa chọn, **Giữ nguyên mail** và **Đổi sang Gmail chủ mới** (bỏ *Cho khách vào Family mới*). **Báo lỗi** không bắt buộc nội dung: để trống thì web ghi là *Bị quét*. **Chuyển khách sang nhóm mới** cảnh báo khi Family đích sẽ vượt 5 khách.

Bản 0.26.0: **đổi chủ ngay trên Family cũ** khi có đợt quét. Ở Fix lỗi → **Đã fix → Đổi sang mail mới**, khách ở lại Family đó và giữ nguyên trạng thái; mỗi khách tự nhận một link của chủ mới khi tra cứu Gmail. Hộp Đã fix tạo luôn mail mời bằng số khách, link và mail mời của chủ cũ được bỏ. Kho hiện mail mới và ngày trial là ngày đổi; mật khẩu, 2FA, mail khôi phục, ghi chú để trống. Khách quá hạn vẫn được cấp link như bình thường. Xem [hướng dẫn](hosting/php/TRA-CUU-CHUYEN-NHOM.md).

Bản 0.25.0: tag **Đã gửi** hoàn toàn tự động (bỏ ô tick); link khách đã vào nhóm hiện Gmail của khách thay cho mail haihoangrr+…; hộp **Đã fix** ở Fix lỗi có thêm nút **Cho khách vào**: chuyển toàn bộ khách của Family bị quét sang Family mới (ghi đè hồ sơ trùng Gmail), khách tra cứu sẽ nhận link của Family mới. Xem [hướng dẫn](hosting/php/TRA-CUU-CHUYEN-NHOM.md).

Bản 0.24.1 thêm nút xóa trong khung **mail chờ lấy link**: nút × cạnh từng mail và nút **Xóa tất cả** để bỏ mail tạo nhầm.

Bản 0.24.0: **Gen mail mời** luôn dùng Gmail nhận lời mời `haihoangrr@gmail.com` và tạo ngay khi chọn số lượng (1–5). **Fix lỗi** tự cập nhật trạng thái cho khách: báo lỗi mail quản lý thì Family thành **Bị quét**, case chuyển sang Đã fix thì Family về **Đang hoạt động**. Khách **Đã mời, chưa vào** hoặc **Mua mới** tra cứu Gmail sẽ tự nhận một link riêng trong kho link của Family mình (không trùng ai), và link khách đã xem tự được tick **Đã gửi**. Xem [hướng dẫn](hosting/php/TRA-CUU-CHUYEN-NHOM.md).

Bản 0.23.0 đổi tiêu đề web thành **Hải Premium**, thêm **Gen mail mời** (khi Thêm Family hoặc trong trang Family: 1–5 Gmail có dấu + với đuôi ngẫu nhiên, không bao giờ trùng), nút **Lấy link mời** hiện link của từng mail đã tạo và lưu vào kho link của Family, và ô **Đã gửi** trên từng link để link đã gửi tay không bị giao cho khách khác. Xem [hướng dẫn](integrations/google-sheets/MA-TRA-CUU-VA-GMAIL.md).

Bản 0.22.0 hiện **mã tra cứu ngay dưới Gmail khách** (có nút copy), thêm tab **FamilySync_MaTraCuu** đồng bộ hai chiều với Google Sheet (Tên khách · Mail khách · Mã tra cứu), và nút **Lấy link từ Gmail**: Apps Script đọc thư mời Family gửi tới các Gmail có dấu + (chỉ đọc) và xếp link vào đúng Family. Cần cập nhật cả website và Code.gs/appsscript.json.

Bản 0.21.0 thêm **Tra cứu khách & chuyển nhóm**: trạng thái Family hiển thị cho khách, kho link mời theo Family, chuyển hàng loạt khách sang nhóm mới với mỗi khách một link, theo dõi tiến độ, và trang `/tra-cuu.html` để khách nhập Gmail + mã tra cứu tự lấy link vào nhóm mới. Giữ schema 8 nên cài được bằng Cập nhật một chạm; sao lưu lên phiên bản 10. Xem [hướng dẫn](hosting/php/TRA-CUU-CHUYEN-NHOM.md).

Bản 0.20.2 sửa thao tác đổi email trong Sửa Family: mail mới không kế thừa thông tin Kho của mail cũ. [Hướng dẫn](hosting/php/SUA-MAIL-FAMILY.md).

Bản 0.20.1 cho phép hoàn tất Fix lỗi bằng mail đã nhập vào Kho từ Sheet, giữ thông tin tài khoản mới và lưu trữ mail cũ. Xem [đổi mail từ Kho](hosting/php/DOI-MAIL-TU-KHO.md).

Bản 0.20.0 thêm trạng thái/lịch sử đồng bộ, sắp xếp case, nhập Sheet sản phẩm và Nguồn mua. Xem [hướng dẫn cập nhật](hosting/php/DONG-BO-VA-SAN-PHAM.md).

Bản 0.19.0 làm mới giao diện theo phong cách dịch vụ số: Tổng quan tập trung việc hôm nay, menu gọn, bảng và form dễ đọc, điều hướng dưới cùng trên điện thoại. Xem [cập nhật giao diện](hosting/php/GIAO-DIEN-HIEN-DAI.md).

Bản 0.18.1 sửa ngày nhận tiền gia hạn: Chờ thanh toán để trống ngày nhận tiền; khi chuyển sang Đã thanh toán, mặc định ngày hiện tại theo giờ Việt Nam. Xem [hướng dẫn cập nhật](hosting/php/NGAY-NHAN-TIEN-GIA-HAN.md).

Bản 0.18.0 hiển thị slot Family theo x/5, tách khách Đã mời, chưa vào, và cho phép chuyển khách vào nhóm đã đủ/vượt 5. Bộ lọc Fam dư slot dùng số khách chiếm slot; xem [slot và chuyển Family](hosting/php/SLOT-VA-CHUYEN-FAMILY.md).

Ứng dụng quản lý cho cá nhân: **mở web là vào Tổng quan**, không cần tài khoản đăng nhập. Tập trung quản lý khách YouTube, Family, gia hạn và sản phẩm bán thêm. Không còn các mục admin, bảo mật tài khoản, Jobs hoặc thao tác Google. Có bản **PHP + MySQL dành cho Hostinger Premium** và bản Node.js chạy Windows/VPS. Có thể thêm biểu tượng vào màn hình chính iPhone; xem [hướng dẫn Hostinger](HOSTINGER.md). Bản hosting dùng một mật khẩu truy cập chung, không có tài khoản/role admin.

Tab Khách Google Sheet có bản rút gọn 7 cột: ngày dd/mm/yyyy, Còn ngày = hạn − TODAY() − 2; giữ dữ liệu thanh toán/gia hạn trong phần kỹ thuật ẩn và quản lý trên web. Xem [cách áp dụng vào Sheet hiện tại](integrations/google-sheets/GON-COT-VA-CON-NGAY.md).

Tab Kho Google Sheet hỗ trợ nhập tài khoản mới trực tiếp: một dòng tạo cả Family và tài khoản Kho khi web đang mở khóa ở mục Kho. Ngày trial dd/mm/yyyy; ID ẩn tự cấp; chống tạo trùng khi thử lại. Cần cập nhật cả PHP và Apps Script v5; xem [hướng dẫn nhập tài khoản](integrations/google-sheets/NHAP-TAI-KHOAN.md).

Apps Script v5.7 bỏ qua dòng Kho đã xóa toàn bộ phần nhập nhưng còn ID ẩn, tránh chặn đồng bộ vì thiếu Email. Xem [bản sửa dòng Kho trống](integrations/google-sheets/SUA-DONG-KHO-TRONG.md); kết nối hiện tại chỉ cần thay script và cập nhật bản triển khai đang dùng.

Bản PHP 0.17.1 nối lại MySQL khi kết nối bị đóng trong lúc chờ Google, kiểm tra lại khóa/mốc dữ liệu và giữ phản hồi đã được xác nhận. Xem [bản sửa mất kết nối MySQL](integrations/google-sheets/SUA-MAT-KET-NOI-MYSQL.md); website đã dùng bộ đồng bộ hiện tại chỉ cần cập nhật sheets.php.

Các tab đồng bộ nên dùng vùng ô thường. Google Table có thể chặn ghi vì kiểu cột/định dạng hoặc xác thực dữ liệu; đã xác nhận việc chuyển Bảng_2 ở tab Family về vùng ô thường giúp đồng bộ thành công. Khi đã đồng bộ được bằng v5.7, giữ nguyên script và kết nối; xem [ghi Family và Google Table](integrations/google-sheets/SUA-GHI-FAMILY-TABLE.md).

## Bản 0.15.1: sửa chờ database khi đồng bộ

Không giữ khóa database trong khi chờ Google; các tab đồng bộ dùng khóa riêng, còn đọc/sửa khách tiếp tục hoạt động. Giữ các thay đổi web phát sinh trong lúc gửi, và bỏ lượt ghi Google nếu dữ liệu/bố cục không đổi. Xem [hướng dẫn cập nhật bản sửa khóa](integrations/google-sheets/SUA-KHOA-DATABASE.md). Không cần đổi URL /exec hoặc triển khai lại Apps Script.

## Bản 0.15.0: việc cần làm và đồng bộ Google Sheet

Tổng quan tập trung vào hạn/thanh toán cần xử lý, điều hướng có mục Thêm, thao tác phụ nằm trong menu “…”. Danh sách Khách/Family/Sản phẩm có 25 hồ sơ mỗi trang, tìm không dấu và giữ trang/bộ lọc/vị trí cuộn khi quay lại trong cùng phiên.

**Bản PHP trên Hostinger** có kết nối Google Sheet hai chiều qua Apps Script do chủ tài khoản tự triển khai. Có thể tạo Sheet mới từ dữ liệu website, không cần bố cục Sheet cũ. Family/khách/hạn/thanh toán được kiểm tra mỗi 30 giây khi web mở; Kho chỉ đồng bộ khi đang mở khóa và đang ở mục Kho. Mật khẩu/khóa 2FA đọc được trên Sheet theo lựa chọn của người dùng, vẫn mã hóa trong database website. Xung đột cần chọn bản giữ; xóa dòng Sheet không xóa dữ liệu web. Sửa ngày/tiền trên Sheet không tự ghi lịch sử gia hạn; gia hạn dùng luồng Gia hạn trên web.

Xem [hướng dẫn kết nối từng bước](integrations/google-sheets/HUONG-DAN.md). Cần cấp quyền Google, triển khai Apps Script, rồi điền URL /exec và mã kết nối trên website; không gửi bí mật qua chat. Chưa có đồng bộ Sheet cho backend Node. Việc có mã nguồn/gói ZIP không có nghĩa tài khoản Google hoặc website Hostinger đã kết nối.

## Chạy trên Hostinger Premium

Tải [family-hostinger.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger.zip), rồi làm theo [hướng dẫn PHP + MySQL](hosting/php/INSTALL.md). Cài vào website PHP/HTML riêng và database riêng; dùng file sao lưu của bản Windows để chuyển đầy đủ dữ liệu. Không cần nâng cấp Business để mở Node.js khi dùng bản PHP. Gói Premium hiện có vẫn cần gia hạn như bình thường.

## Chạy trên Windows 10 / 11

1. Cài **Node.js 24 LTS** từ https://nodejs.org/ với tùy chọn mặc định.
2. Tải **Code → Download ZIP** tại https://github.com/haitiano1/family, giải nén.
3. Mở thư mục chứa **START-WINDOWS.cmd**, nhấp đúp tệp đó và giữ cửa sổ dòng lệnh mở.
4. Khi thấy `Fam Manager started on port 3000`, mở Chrome/Edge, nhập `http://127.0.0.1:3000`.
5. Giao diện vào ngay Tổng quan và danh sách khách. Đóng cửa sổ dòng lệnh khi dùng xong.

Lần sau chạy lại START-WINDOWS.cmd và mở cùng địa chỉ. Nếu `EADDRINUSE`, một bản ứng dụng đang giữ cổng 3000; dừng bản cũ trước khi chạy lại. Giữ địa chỉ mặc định trên máy cục bộ.

## Cập nhật và giữ dữ liệu cũ

1. Đóng cửa sổ ứng dụng.
2. Sao lưu **toàn bộ thư mục ứng dụng**, bao gồm `data`.
3. Tải ZIP mới, giải nén riêng và sao chép toàn bộ nội dung bên trong thư mục mới sang thư mục ứng dụng cũ. Thay thế tệp trùng tên, **giữ nguyên thư mục data**.
4. Chạy START-WINDOWS.cmd và nhấn **Ctrl+F5** trên trình duyệt.

Dữ liệu khách, Family, Contact, thanh toán, gia hạn, lưu trữ và bản sao cũ được giữ. Startup nâng cấp SQLite bằng thay đổi cộng thêm, sao lưu trước nâng cấp vào `data/before-v15-*.sqlite`. Dữ liệu admin/Jobs cũ, nếu có, vẫn nằm trong bản dữ liệu cũ nhưng không được ứng dụng mới sử dụng hoặc trả qua API. Không cần tạo admin hoặc đăng nhập sau cập nhật. Bookmark cũ đến các trang đã bỏ được đưa về Tổng quan.

## Chuyển dữ liệu từ bản Windows cũ mà không cập nhật ứng dụng

Bạn vẫn dùng **IMPORT-CSV-WINDOWS.cmd** trong thư mục cũ để nhập CSV (đóng server trước). Công cụ chỉ nhập vào SQLite trên Windows. Nếu khách đã có trong ứng dụng cũ, chuyển thẳng bằng công cụ xuất, không cần nhập lại CSV.

1. Tải [family-windows-export.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-windows-export.zip), giải nén trên máy tính.
2. Chép **hai file** `EXPORT-BACKUP-WINDOWS.cmd` và `export-backup.cjs` vào thư mục cũ chứa START-WINDOWS.cmd và thư mục data. Đây chỉ là helper, không thay app hoặc dữ liệu cũ.
3. Đóng server, nhấp đúp **EXPORT-BACKUP-WINDOWS.cmd**. Khi có **Export complete**, một file `family-backup-…json` xuất hiện ngay trong thư mục đó; cửa sổ báo số khách/Family/lịch sử/lưu trữ/sản phẩm.
4. Mở website Family trên Hostinger → **Sao lưu / Chuyển dữ liệu**, chọn JSON vừa tạo → **Khôi phục dữ liệu** vào ứng dụng trống.

Exporter tự chạy bằng Node24+, không dùng source app khác, mở SQLite **read-only**, không upgrade/thay đổi database gốc, không ghi đè file backup có sẵn. Hỗ trợ schema0–15; bảng/field không tồn tại được bổ sung vào JSON bằng ô trống/default cần thiết, không đoán ngày mua/hạn. Admin/jobs/mật khẩu ứng dụng cũ không được chuyển. Original Contact/notes/history/archive snapshots được giữ. Không tải file SQLite/JSON chứa khách vào File Manager hoặc GitHub; nhập JSON qua ứng dụng đã mở bằng mật khẩu. Hai bản Windows/hosting không tự đồng bộ; dùng địa chỉ hosting sau chuyển.

## Khách hàng và Family

- **Tổng quan:** mở ngay danh sách khách với tìm kiếm/bộ lọc, số Family, hạn còn 2 ngày và đã quá hạn; sản phẩm phụ đến hạn xuất hiện riêng.
- **Family:** thêm/sửa tên, email quản lý và ghi chú ngay trong form; không cần thêm email quản lý ở một trang tài khoản khác trước. Mở Family để xem/thêm khách.
- **Khách & Gia hạn:** tên, email, Contact (Facebook/Zalo/ghi chú liên hệ), gói, ngày mua, hạn, thanh toán và ghi chú. Có thể thêm khách trực tiếp và chọn Family nhận khách.
- Gói chuẩn 1/2/3/6/12 tháng; gói đã nhập tùy chỉnh như 13 tháng được giữ, hỗ trợ đến 120 tháng.
- Giữ toàn bộ hồ sơ khách đã mời nhưng chưa vào; các ghi chú “chưa vào” không mất và chưa tính vào 5 chỗ thành viên đang ghi nhận.
- **Nhắc hạn:** Tổng quan vẫn báo khách còn 0–2 ngày và chờ thanh toán. Trong thao tác khách, nút Nhắc hạn được thay bằng Chuyển Family; dùng copy tên/email/Contact để liên hệ. Sản phẩm khác vẫn có mẫu tin nhắc hạn để tự gửi.
- Ngày tính theo múi giờ Việt Nam. Còn 0–2 ngày là sắp hết hạn; ngày sau hạn mới là quá hạn. Ô không có ngày hết hạn không bị đoán ngày.

## Thanh toán và gia hạn

Thanh toán kỳ hiện tại tách với gia hạn tiếp theo: Chưa nhắc / Đã nhắc / Chờ thanh toán / Đã trả một phần / Đã thanh toán gia hạn / Không gia hạn.

1. Bấm **Gia hạn**, chọn trạng thái, gói, tiền đã nhận, ngày nhận tiền và ghi chú.
2. Mặc định bật tự cập nhật kỳ khi đã thanh toán đủ. Bấm **Lưu gia hạn** ghi tiền, cập nhật ngày mua/hạn và lưu lịch sử trong một lần. Chờ tiền/trả một phần chưa đổi ngày.
3. Kỳ mới **luôn nối từ ngày hết hạn cũ**, kể cả trả tiền muộn. Ví dụ hạn 05/01/2026, nhận tiền 15/01/2026, gói 3 tháng → kỳ mới 05/01/2026–05/04/2026. Ngày nhận tiền nằm riêng trong lịch sử. Nếu chưa có hạn cũ, cần bổ sung trước khi gia hạn.
4. Nếu bỏ tùy chọn cập nhật ngày, chỉ ghi nhận tiền trước. Dùng **Xác nhận hạn mới** sau đó để áp dụng.
5. Ngày cuối tháng được giới hạn đúng tháng, kể cả năm nhuận. Lịch sử giữ ngày mua/hạn cũ/mới, tiền, ngày nhận và ghi chú. Số tiền cột kỳ hiện tại là của kỳ hiện tại, không phải tổng doanh thu.

Sau gia hạn, lần tiếp theo trở về Chưa nhắc; lịch sử không mất. Việc tính sai ở những bản cũ không tự sửa hồi tố. Chỉnh ngày trực tiếp bằng form sửa hồ sơ không tạo lịch sử gia hạn hoàn tất.

## Sửa lỗi trong bản 0.14.2

Sửa lỗi **Nhật ký**: Tất cả thao tác vẫn xem được nhưng các nhóm riêng trả lỗi hệ thống trên một số cấu hình MariaDB. So sánh mã loại bằng dạng binary để không xung đột collation giữa chuỗi trong UNION và tham số PDO. Giữ tìm kiếm tiếng Việt, phân trang và dữ liệu trước/sau. Không đổi schema, cấu hình hoặc viết lại lịch sử.

Nếu đã cài **0.14.1**, chỉ thay `family-private/audit.php` từ gói mới, giữ `config.php` và database, rồi Ctrl+F5. Bộ lọc được kiểm tra trên MySQL 8.4 và MariaDB 10.11/11.4 với bốn collation kết nối. Bộ kiểm thử PHP hỗ trợ `FAMILY_PHP_DATABASE_IMAGE=mariadb:10.11` hoặc `mariadb:11.4` để chạy lại ca này.

## Bổ sung trong bản 0.14.1

Trong **Thống kê**, thứ tự là tổng số của tháng đang chọn → **Lịch sử gia hạn** → **6 tháng gần nhất**. Các nút chọn tháng và lịch sử lâu dài giữ nguyên.

**Nhật ký** có một bộ lọc loại thao tác: Tất cả, Thêm mới, Sửa, Xóa / Lưu trữ, Gia hạn, Chuyển Family, Khôi phục, Nhập dữ liệu và Khác / Nhật ký cũ. Nhãn màu giúp nhận biết nhanh; chi tiết cũng đánh dấu từng dữ liệu Thêm/Sửa/Xóa. Kết hợp bộ lọc với tìm email/Family và phân trang trên toàn bộ nhật ký. Phân loại từ tên thao tác đã ghi, không từ nội dung ghi chú; nhật ký cũ thiếu loại vẫn giữ nguyên trong Khác. Không sửa/xóa lịch sử cũ hoặc đổi schema/backup.

## Bổ sung trong bản 0.14.0

**Thống kê** là mục riêng, thay danh sách Khách vừa gia hạn 14 ngày. Hiển thị tháng hiện tại và 5 tháng trước, từ ngày đầu đến ngày cuối mỗi tháng theo giờ Việt Nam. Mỗi tháng có số email khách khác nhau, số lượt xác nhận gia hạn thành công và tổng tiền các lượt đó. Một email gia hạn hai lần: 1 khách, 2 lượt, cộng đủ tiền cả hai. Tính theo lúc xác nhận hạn mới, không theo ngày nhận tiền hoặc ngày hết hạn. Chờ tiền/trả một phần/đã thu nhưng chưa áp dụng hạn chưa được tính. Không suy đoán lượt gia hạn từ số tiền hiện tại hoặc dữ liệu nhập Sheet.

Có bộ chọn tháng, tìm tên/email/Family/ghi chú và phân trang lịch sử. **Toàn bộ lịch sử** xem cả các tháng cũ hơn 6 tháng. Tìm kiếm chỉ lọc danh sách, không đổi tổng tháng. Lịch sử gia hạn được giữ lâu dài khi lưu trữ, khôi phục hoặc xóa hẳn hồ sơ khách/Family; không còn dọn theo mốc 14 ngày. Khách gia hạn vẫn ở danh sách hoạt động.

**Khách lưu trữ** chỉ dành cho khách Không gia hạn, hồ sơ khách/sản phẩm vừa xóa và Family vừa xóa. Khách và Family đều có **Khôi phục / Xóa khỏi lưu trữ**. Xóa Family khỏi lưu trữ chỉ bỏ nhóm; giữ các khách để khôi phục riêng vào Family khác. Nhật ký lưu dữ liệu trước/sau; lịch sử gia hạn giữ nguyên. Thông tin Kho đã mã hóa được giữ riêng khi bỏ liên kết Family.

Cập nhật đầy đủ **hai thư mục** theo [UPDATE.md](hosting/php/UPDATE.md), giữ config.php/database, không nhập lại khách. Không thay schema hoặc định dạng backup v7.

## Bổ sung trong bản 0.13.6

Bấm **email quản lý ở đầu trang chi tiết Family** để mở đúng Family trong **Kho tài khoản**, gồm đủ các cột mail/trial/mật khẩu/khóa 2FA/mã 6 số/mail khôi phục/Note và các thao tác hiện có. Liên kết theo ID Family, giữ đúng hồ sơ sau đổi mail; chỉ hiện hàng của nhóm đã chọn. Có **Xem tất cả Family** để quay về danh sách Kho. Mật khẩu/khóa vẫn che mặc định; nhóm chưa nhập Kho hiện các trường trống.

Nếu phiên Kho còn hạn thì mở ngay; nếu khóa/chưa mở/hết 30 phút thì phải nhập mật khẩu trước. Sau nhập đúng vẫn vào đúng nhóm đã chọn, kể cả tải lại trang. Đi theo liên kết không kéo dài phiên; Khóa kho/Khóa ứng dụng vẫn khóa ngay. Family không còn hoạt động không tự chuyển sang hồ sơ khác.

## Bổ sung trong bản 0.13.5

Khi **Đã fix → Đổi sang mail mới** cho chủ Family, Kho chỉ giữ mail mới/ngày trial mới lấy từ Family. Mật khẩu, khóa 2FA, mã 2FA, mail khôi phục và Note cũ được bỏ khỏi hồ sơ Kho của nhóm trong cùng giao dịch, kể cả khi Kho đang khóa. Bạn có thể nhập lại từ Sheet theo mail mới. **Giữ nguyên mail** hoặc đổi mail member không xóa thông tin Kho của chủ. Sửa ghi chú case đã Done không xóa lại thông tin đã nhập. Dữ liệu khách/Family/lịch sử lỗi vẫn giữ; Nhật ký chỉ ghi đã làm trống Kho, không chứa mật khẩu/khóa/Note. Không tự xử lý hồi tố các lượt đổi mail trước cập nhật.

Khi một mục Kho đang mở nhận được mail chủ mới qua cập nhật dữ liệu, giao diện bỏ thông tin cache của mail cũ và nạp lại Kho, tránh gắn mật khẩu/2FA của mail cũ vào mail mới. Phiên mở Kho vẫn giữ 30 phút.

## Bổ sung trong bản 0.13.4

Khi hoàn tất Fix lỗi bằng **Đổi sang mail mới** cho **mail chủ Family**, ngày trial của Family được đặt về ngày xác nhận theo giờ Việt Nam, cùng giao dịch với đổi mail và hoàn tất case. Kho tự hiện mail/ngày trial mới. Chọn **Giữ nguyên mail** hoặc đổi mail member không đổi ngày trial của mail chủ. Sửa lại ghi chú case đã Done không đặt lại ngày trial. Thẻ lỗi cũ giữ ngày trial/ngày báo lỗi/số ngày sử dụng ban đầu; kết quả fix và Nhật ký ghi mail cũ → mới, ngày trial mới cùng dữ liệu trước/sau. Lượt báo lỗi tiếp theo dùng ngày trial mới; lỗi lưu/conflict hoàn tác cả mail/ngày trial/case.

## Bổ sung trong bản 0.13.3

Trang chi tiết Family có **Copy tất cả mail** ở góc phải phần **Khách trong Family**: email của mọi khách đang ghi nhận trong nhóm, mỗi mail một dòng theo thứ tự danh sách, gồm khách đã mời/chưa vào và khách quá hạn. Không kèm mail chủ/tên/Contact/khách lưu trữ hoặc nhóm khác. Nhóm trống không hiện nút; có cách copy thủ công khi clipboard bị chặn.

Trong Kho, copy bất kỳ trường nào thành công sẽ tô **màu cam** mail của hàng đó; copy hàng khác trả mail trước về màu cũ. Dấu giữ khi tìm/lọc/làm mới dữ liệu hay mã 2FA đổi; khóa hoặc rời mục thì bỏ dấu. Chỉ là nhận biết trên giao diện, không sửa hồ sơ hay ghi Nhật ký.

## Kho tài khoản Family (bản 0.13.2)

Chọn **Kho tài khoản**, đặt mật khẩu riêng lần đầu (từ 5 ký tự, khác mật khẩu vào website). Phiên kho giữ **30 phút kể từ lúc mở**; chuyển mục, tải lại trang hoặc quay lại trong phiên không phải nhập lại mật khẩu. Sau30phút cần mở lại; **Khóa kho/Khóa ứng dụng** khóa ngay. Rời mục chỉ xóa thông tin đang hiển thị, không gia hạn thời gian phiên. Trang khách/Family/Tổng quan vẫn hoạt động như trước.

Kho **tự hiển thị toàn bộ Family đang quản lý**, kể cả nhóm chưa nhập thông tin kho. Chỉ lấy **Mail Family** và **Ngày trial** từ Family; không hiển thị số khách/ghi chú nhóm. Các cột Mật khẩu, 2FA, Mã2FA, Mail khôi phục, Note để bạn tự nhập. Nhấn mail để mở Family và các thành viên; có copy mail/ngày trial và các thông tin đã lưu.

Nhấn **Nhập thông tin** hoặc **Sửa** trên hàng Family, nhập mật khẩu tài khoản, khóa bí mật2FA, mail khôi phục (nếu có) và **Note**. Mail chủ được sửa tại Family hoặc Kho: **hai bên cập nhật theo cùng hồ sơ Family**, kể cả đổi mail khi kho đang khóa. Mật khẩu/2FA/recovery/Note đã lưu vẫn giữ với hồ sơ đó; không tạo hồ sơ trùng. Mỗi lần đổi mail có Nhật ký mail cũ → mail mới; mật khẩu/khóa/Note không ghi vào nhật ký. Mail trùng chủ Family khác hoặc khách cùng nhóm bị từ chối; lỗi lưu sẽ hoàn tác cả hai bên. Form đã mở với mail cũ bị chặn để tránh ghi đè thay đổi mới.

Mật khẩu kho từ **5 ký tự**, không yêu cầu chữ hoa/ký tự đặc biệt; mật khẩu cũ vẫn dùng. Tìm mail/Note và lọc **Tất cả** (trial cũ đến mới), **Fam đang lỗi**, **Theo tên**. Fam có case Chờ fix/Đang fix được gắn tag cùng trạng thái, kể cả chưa nhập thông tin kho; Done sẽ hết tag và khỏi bộ lọc lỗi. Dùng cùng trạng thái với mục Family, gồm case mail chủ hoặc member. Fam dư slot chỉ còn ở mục Family. Mật khẩu và **khóa2FA mặc định che**, có Hiện/Ẩn và copy; **mã6số vẫn hiển thị**, tự đổi/đếm ngược/copy. Rời mục hoặc ẩn ứng dụng sẽ che lại các giá trị đã bấm Hiện.

Thông tin0.13 cũ được tự ghép với Family đúng mail khi bạn mở kho lần đầu sau cập nhật. Thông tin chưa ghép vẫn được giữ riêng trong mục thu gọn. Khi lưu trữ Family, thông tin kho giữ liên kết; khôi phục nhóm sẽ hiện lại đúng dữ liệu. **Xóa thông tin kho** chỉ bỏ thông tin đăng nhập/Note đã lưu; Family và khách vẫn giữ, hàng trở về trống.

**Nhập từ Sheet:** copy cả dòng tiêu đề và dữ liệu gồm **Mail, Pass, Auth** từ Google Sheet/Excel rồi dán, hoặc chọn CSV/TSV tối đa1MB. Cột Mail chủ Family/Tài khoản/Email, Pass/Mật khẩu, Auth/2FA được nhận diện tự động; mail bắt buộc để ghép đúng Family đang quản lý. Có thể thêm Note/recovery. Chọn cột → **Xem trước** (báo thêm mới/cập nhật từng dòng, ẩn khóa/mật khẩu) → **Nhập … tài khoản**. Không thay mail/trial của Family theo thứ tự hàng; ghép theo mail.

Mặc định bật **Cập nhật tài khoản đã có** và **Giữ dữ liệu cũ cho ô trống**. Mật khẩu/Auth mới cập nhật đúng hồ sơ; các cột không chọn (ví dụ Note/recovery) luôn được giữ khi cập nhật. Ô trống trong cột đã chọn được giữ nếu bật Giữ ô trống; bỏ chọn nếu muốn xóa giá trị bằng ô trống. Bỏ chọn Cập nhật tài khoản đã có thì mail đã có bị từ chối. Tối đa500 dòng/lượt; mail không có Family/trùng trong sheet/khóa sai đều báo dòng và dừng cả lượt. Thay dữ liệu/cột/tùy chọn phải xem trước lại; nếu có người sửa hồ sơ/đổi mail/thêm hồ sơ từ lúc xem trước, cả lượt bị từ chối để tránh ghi đè. Lỗi lưu hoàn tác cả dòng sửa và thêm. Nhật ký chỉ ghi số lượng thêm/cập nhật, không chứa mật khẩu/khóa/Note.

Khóa Base32 nhận A–Z và 2–7, không phân biệt hoa/thường; tự bỏ khoảng trắng giữa nhóm ký tự. Nhập khóa bí mật, không nhập mã 6 số hoặc mã dự phòng. Không đoán sửa ký tự 0/1/8/9 thành chữ khác. Hỗ trợ liên kết otpauth://totp, 6 số, SHA1/SHA256/SHA512, chu kỳ15–120giây; khóa chữ mặc định SHA1/30giây như Google Authenticator. Mã lấy từ giờ máy chủ và đồng hồ đếm ngược được đồng bộ, không phụ thuộc giờ điện thoại.

Tài khoản/mật khẩu/khóa/mail khôi phục/tên nhận biết/Note được mã hóa AES-256-GCM; khóa dữ liệu ngẫu nhiên được bảo vệ bằng mật khẩu kho qua PBKDF2-SHA256600000 vòng. Private session30phút có cookie HttpOnly/SameSite và Secure khi hosting; cookie chỉ mang khóa đã bọc, database phiên chỉ giữ hash/expiry, khóa phiên không nằm trong bản sao lưu. Mỗi API kho kiểm tra phiên; khóa/đổi mật khẩu thu hồi phiên, mở sai nhiều lần bị giới hạn. Thông tin kho không có trong state/journal hoặc danh sách khách; nhật ký chỉ ghi thao tác/ID, không lưu mật khẩu hoặc khóa. Kho là nơi cần mở bằng mật khẩu riêng để xem thông tin đó.

**Sao lưu / Chuyển dữ liệu** và helper Windows xuất **v7**, gồm toàn bộ kho ở dạng mã hóa, nhận cả v1–v6 cũ. Khôi phục trên Node hoặc PHP vẫn mở kho bằng mật khẩu đã đặt; không dùng app cũ để nhập v7. Phải giữ mật khẩu kho riêng: ứng dụng không khôi phục mật khẩu đã quên. Đổi mật khẩu kho bọc lại khóa dữ liệu, không làm mất hồ sơ. File sao lưu chứa dữ liệu khách cũ như trước; phần kho chỉ có ciphertext. Khôi phục chỉ vào app trống để tránh ghi đè cả dữ liệu khách và kho.

SQLite nâng cấp13→14 có before-v14 backup; PHP schema5→6 bổ sung liên kết kho-Family, không thay dữ liệu khách. Hostinger cần PDO MySQL và OpenSSL (PHP8.3 có thể dùng); không cần thêm mật khẩu kho vào config.php hay cài npm. Gói cập nhật phải có public_html/vault.js, vault-sheet.js, vault-families.js, family-private/vault.php và vault.sql cùng các file đã đổi. Giữ config.php/database, tải lại trang và tạo mật khẩu kho trong ứng dụng.

## Chuyển khách sang Family khác (bản 0.12)

Trong Tổng quan, Khách & Gia hạn hoặc chi tiết Family, bấm **Chuyển Family** (thay nút Nhắc hạn, kể cả khách chưa có ngày hết hạn). Nhập mail chủ nhóm trong **Tìm mail chủ Family** hoặc chọn từ menu **Family nhận khách**. Menu hiển thị tất cả nhóm đang hoạt động, mail chủ nhóm và tên Family; nhóm hiện tại được ghi rõ và không thể chọn lại. Gõ đúng email chủ nhóm sẽ tự chọn Family tương ứng; hộp thoại hiện nhóm đích và số khách để đối chiếu. Bấm Chuyển Family để mở nhóm đích cùng toàn bộ thành viên.

Chỉ đổi liên kết nhóm của hồ sơ, giữ ID khách, tên/mail/Contact, gói, ngày mua/hạn, tiền, thanh toán, trạng thái gia hạn/chưa vào và lịch sử. Lịch sử và thống kê gia hạn giữ tên Family tại thời điểm gia hạn. Đây là chuyển hồ sơ quản lý trong ứng dụng.

Tag lỗi trên dòng member lấy từ case Chờ fix/Đang fix của **mail chủ Family hiện tại**, không từ hồ sơ khách. Chuyển từ A sang B bỏ tag của chủ A; nếu chủ B đang có lỗi, hiện trạng thái đúng của chủ B. Case lỗi của chủ A vẫn ở nhóm A; các member còn ở A vẫn có tag. Case của mail khách không gắn tag lỗi cho toàn bộ member trong nhóm.

**Theo yêu cầu mới, case Fix lỗi gắn với mail khách được xóa khi chuyển**, áp dụng cả Chờ fix/Đang fix/Đã fix và case trùng cũ của chính khách. Nhật ký Chuyển Family lưu Family cũ/mới và toàn bộ case trước khi xóa. Không chuyển case theo khách sang nhóm mới. Case mail chủ nhóm hoặc khách khác được giữ. Xóa case và chuyển khách lưu trong cùng giao dịch; nếu lưu lỗi, tất cả được giữ nguyên. Một Family đích có case đang mở vẫn có thể nhận khách; case đó không bị thay đổi.

Backend kiểm tra Family đang hoạt động, mail không trùng chủ nhóm/khách đã có, 5 thành viên đang ghi nhận (Đã mời, chưa vào vẫn chưa chiếm chỗ). Không ghi một phần nếu bị từ chối. Guard nguồn/mail/revision và mail chủ nhóm đích chặn cửa sổ cũ hoặc gửi lặp; hai khách tranh chỗ cuối chỉ một khách được chuyển. Không cần nâng cấp schema hay nhập lại data. Gói cập nhật 0.12 cần thay cả PHP và giao diện theo [UPDATE.md](hosting/php/UPDATE.md), giữ config.php/database.

## Family, Fix lỗi và Nhật ký

**Family** có tìm kiếm theo tên/email quản lý/email khách/ghi chú và nút **Báo lỗi** cạnh Sửa/Xóa hồ sơ. Mỗi Family chỉ có một case Chờ fix/Đang fix; dòng Family và khách hiện mail đã báo lỗi cùng trạng thái, nút đổi thành **Xem lỗi**. Chọn mail quản lý hoặc mail khách, nhập nội dung và ghi chú; thẻ xuất hiện ở **Fix lỗi**. Case Done cho phép báo một sự cố mới; case trùng đã có trước cập nhật vẫn được giữ để xử lý. Backend chặn cả gửi đồng thời và mở lại Done khi Family đã có case khác đang mở. Bấm email trên thẻ Chờ fix/Đang fix/Đã fix mở đúng trang Family với toàn bộ khách trong nhóm. Dùng ID Family của case nên vẫn mở đúng nhóm khi mail đổi. Family đã lưu trữ đưa về Khách lưu trữ; hồ sơ Family không còn tồn tại vẫn giữ email và nút copy. Email trên thẻ lỗi có icon copy; sau đổi mail có thể copy cả mail ban đầu. Nội dung tìm kiếm được reset khi chuyển mục, vẫn giữ khi làm mới/đổi bộ lọc trong cùng mục. Logo đầu thanh điều hướng là YouTube đỏ/trắng.

Bảng **Chờ fix → Đang fix → Đã fix** hỗ trợ kéo thả, chọn trạng thái và nút Đã fix trên iPhone. Khi hoàn tất, bắt buộc chọn **Giữ nguyên mail** hoặc **Đổi sang mail mới**. Đổi cập nhật đúng hồ sơ quản lý/khách đã báo lỗi trong cùng lần lưu; thẻ Done ghi rõ mail cũ→mới và giữ mail báo lỗi ban đầu. Không đổi ngày mua/hạn/Contact/thanh toán. Mail trùng hoặc hồ sơ đã thay đổi/xóa sẽ không gây cập nhật một phần; trạng thái và đổi mail cùng rollback. Lỗi vẫn được giữ khi Family bị xóa. Thay đổi đồng thời có revision guard, cần tải lại khi có xung đột.

**Nhật ký** tìm kiếm/phân trang, lưu thời gian/người thao tác/nội dung và **Xem chi tiết trước-sau** cho các thay đổi từ bản này. Ghi thêm/sửa/xóa/import/gia hạn/lưu trữ/khôi phục/sửa lỗi/đổi mail; không ghi refresh/xem trang. Khi xóa Family, cả hồ sơ nhóm và khách được chuyển vào lưu trữ; nhật ký ghi thay đổi và hồ sơ khách đã lưu. Log cũ vẫn đọc được; dữ liệu trước-sau không thể tạo lại cho thao tác đã xảy ra trước bản cập nhật. Nhật ký hiện giúp đối chiếu, chưa có hoàn tác tự động. Bản sao lưu hiện tại v6 giữ lỗi/nhật ký/ngày trial, Family lưu trữ, sản phẩm phụ và kho đã mã hóa; vẫn nhận v1–v6.

Cập nhật Hostinger bằng [gói cập nhật riêng](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger-update.zip) và [hướng dẫn](hosting/php/UPDATE.md), giữ nguyên config.php/database. Không cần nhập lại khách. MySQL schema1–6 nâng cấp cộng thêm lên7; Node schema15 sao lưu before-v15 trước nâng cấp. Exporter độc lập hỗ trợ schema0–15.

## Bộ lọc và thao tác khách (bản0.8)

Danh sách khách ở Tổng quan và Khách & Gia hạn chỉ còn **Tất cả khách**, **Sắp hết hạn**, **Chờ thanh toán (Confirmed)**. Sắp hết hạn giữ mốc0–2ngày. Confirmed gộp khách chờ tiền/trả một phần với khách quá hạn; không tính trùng và không đưa khách đã ghi nhận thanh toán đủ gia hạn vào nhóm chờ tiền. Đây là cách nhóm danh sách, không tự thay đổi trạng thái xác nhận/thanh toán đã lưu. Khách chưa đặt hạn vẫn có trong Tất cả khách.

Danh sách xếp ngày hết hạn tăng dần: khách quá hạn/hạn gần lên trước, còn nhiều ngày xuống sau, chưa đặt hạn cuối danh sách. Thẻ tổng quan Đã quá hạn được thay bằng Chờ thanh toán (Confirmed); sản phẩm khác giữ nhắc hạn riêng.

Tên, email và Contact có icon **Sao chép** riêng. Copy lấy đúng nội dung đã hiển thị, giữ cả xuống dòng/ghi chú; lỗi quyền clipboard có ô chọn để copy thủ công. Contact có URL HTTP/HTTPS/Facebook/Zalo hiện thẻ liên kết mở tab mới, giữ nguyên ghi chú và số điện thoại ở dạng văn bản. Không biến javascript/data hoặc ghi chú tùy ý thành liên kết. Các thao tác copy không sửa hồ sơ khách. Thông tin ở Khách lưu trữ cũng có copy/liên kết.

Không gia hạn chuyển ngay vào lưu trữ, cùng transaction với lưu trạng thái và nhật ký. Lỗi lưu trữ rollback cả lần lưu; không xóa hồ sơ một phần. Case lỗi cũ của khách lưu trữ không được đổi nhầm mail của khách mới khi một ID nội bộ được sử dụng lại.

## Ngày trial và case đã fix (bản0.7)

Trong **Family → Sửa → Ngày trial**, tự nhập ngày bắt đầu trial của mail quản lý; cột Ngày trial và trang chi tiết Family hiển thị ngày này. Không suy ra từ ngày mua/hạn của khách. Để trống nếu chưa biết; sửa hồ sơ mà không gửi trial_date qua API giữ nguyên ngày đã nhập, gửi chuỗi rỗng để bỏ ngày.

Khi **Báo lỗi**, hệ thống tự lưu **Ngày lỗi** theo ngày Việt Nam và chụp **Ngày trial của Family** ở thời điểm đó, áp dụng cho mail quản lý hoặc mail khách được chọn trong nhóm. Thẻ ở cả Chờ fix/Đang fix/Đã fix hiện hai ngày và số ngày sử dụng. Ví dụ10/08/2026→15/08/2026 là **5 ngày**; cùng ngày là0. Số ngày chốt lúc báo, không tăng theo thời gian/chuyển cột/sửa trial trong Family. Case cũ giữ ngày báo từ thời gian tạo; không đoán ngày trial cũ bằng ngày mới nhập. Chưa có trial hoặc trial ở tương lai thì chưa có số ngày sử dụng. Ngày trial do người dùng điền, không phải kiểm tra trial Google.

Case ở **Đã fix** có **Xóa case** và hộp xác nhận. Chỉ xóa thẻ lỗi; hồ sơ Family/mail/khách vẫn giữ, nhật ký giữ đầy đủ case trước khi xóa. Case đang fix hoặc đã thay đổi trên thiết bị khác không bị xóa từ phiên bản cũ. Bản0.7 tăng chữ trên màn hình điện thoại: nội dung chính16px, ghi chú/nút14px, ô nhập16px để dễ đọc và tránh zoom khi nhập trên iPhone.

## Sản phẩm khác

Mục **Sản phẩm khác** dành cho Netflix, Spotify, Google One, ChatGPT và tên sản phẩm tự nhập khi chọn **Khác**.

- Bấm **Thêm sản phẩm đã bán**, nhập tên/email khách, Contact, ngày mua, hạn, thanh toán, số tiền và ghi chú. Không cần Family; chỉ cần tên hoặc email khách.
- Có thể chọn một khách Family để lấy sẵn tên/email/Contact; hồ sơ sản phẩm phụ là bản ghi riêng, không sửa hồ sơ YouTube của khách đó.
- Để trống hạn nếu sản phẩm không có hạn. Sản phẩm còn 0–2 ngày hoặc đã quá hạn tự xuất hiện ở **Tổng quan** khi mở ứng dụng, với nút **Nhắc hạn** để sao chép tin.
- Có tìm kiếm, lọc theo hạn và sửa hồ sơ. Xóa hồ sơ sản phẩm sẽ chuyển vào Khách lưu trữ để khôi phục hoặc xóa khỏi lưu trữ. Nếu khách mua nhiều sản phẩm, thêm từng bản ghi riêng.
- Mục này dùng để lưu thông tin/ghi chú và theo dõi hạn; chưa có luồng thanh toán gia hạn riêng như khách YouTube. Sửa ngày trong form khi gia hạn sản phẩm phụ.

## Khách lưu trữ

Khách chọn **Không gia hạn** được chuyển vào **Khách lưu trữ ngay trong lần lưu trạng thái**, giữ hồ sơ, Contact và lịch sử gia hạn. Giao diện tự mở Khách lưu trữ sau khi lưu thành công. Bản0.8 thay chính sách chờ7ngày của bản cũ; các hồ sơ đã chọn Không gia hạn từ trước được chuyển khi mở lại/tải dữ liệu. Khách chỉ quá hạn mà chưa chọn Không gia hạn vẫn nằm trong danh sách hoạt động.

Thông tin và lịch sử nằm trong `data/family.sqlite`. Có **Xem dữ liệu** và **Khôi phục** vào Family còn chỗ. Sau khôi phục khách Không gia hạn, trạng thái gia hạn về Chưa nhắc. Khách lưu trữ bằng Xóa hồ sơ giữ trạng thái gia hạn đang có. Hạn, thanh toán, Contact và lịch sử được giữ. Sản phẩm phụ không tự lưu trữ theo quy tắc này.

## Gói mua, thứ tự Family và lưu trữ (bản 0.9)

- Form thêm/sửa khách Family và sản phẩm khác có gói 1/2/3/6/12 tháng. Chọn gói hoặc đổi ngày mua sẽ cập nhật ô ngày hết hạn ngay. Cuối tháng được chốt vào ngày hợp lệ cuối cùng, ví dụ 31/01/2024 + 1 tháng = 29/02/2024. Vẫn có thể sửa hạn thủ công. Mở form sửa không tự đổi hạn cũ; CSV giữ quy tắc không đoán ô trống. Gia hạn YouTube vẫn nối từ hạn cũ, ngày nhận tiền lưu riêng.
- Family có tìm kiếm và đúng 3 lựa chọn: **Tất cả**, **Fam dư slot**, **Theo tên**. Tất cả xếp ngày trial từ cũ đến mới, ngày chưa nhập ở cuối. Fam dư slot lấy số ở cột Khách đang ghi nhận dưới 5 (kể cả 0), gồm cả hồ sơ đã mời/chưa vào; cùng thứ tự trial. Theo tên xếp giảm dần tự nhiên: Family 48, Family 47, Family 46…
- **Xóa hồ sơ khách** chuyển khách vào Khách lưu trữ; giữ đầy đủ ghi chú, Contact, ngày mua/hạn, tiền và lịch sử. **Xóa hồ sơ Family** lưu cả nhóm, email quản lý/ngày trial/ghi chú và tất cả khách. Family trống cũng được lưu. Xóa từ danh sách hoạt động luôn chuyển vào lưu trữ; thao tác Xóa khỏi lưu trữ được mô tả bên dưới.
- Trong **Khách lưu trữ → Family lưu trữ → Khôi phục Family**, khôi phục cả nhóm và khách còn lưu trữ cùng lần xóa. Khách đã chuyển sang Family khác không bị tạo trùng. Có thể khôi phục từng khách vào Family đang hoạt động. Email quản lý của Family lưu trữ vẫn thuộc hồ sơ đó; hãy khôi phục Family trước khi sử dụng lại email cho nhóm này. Case lỗi giữ liên kết sau khôi phục và mọi thao tác có nhật ký.
- Sản phẩm khác hiện gói tháng, copy tên sản phẩm/tên khách/email/Contact/ngày mua/hạn/ghi chú. Contact là link bấm mở khi có URL, còn nội dung gốc vẫn được copy đầy đủ. Nhắc hạn ở Tổng quan vẫn áp dụng cho sản phẩm phụ.

## Thống kê và lịch sử gia hạn

Từ 0.14.0 dùng mục **Thống kê** riêng thay Khách vừa gia hạn. Chọn một trong 6 tháng gần nhất hoặc **Toàn bộ lịch sử**; các lượt gia hạn cũ được giữ lâu dài. Xem quy tắc tính tại phần 0.14.0 ở trên.

## Cập nhật trực tiếp: xóa lưu trữ và lưu trữ sản phẩm khác

**Khách lưu trữ** có nút **Xóa khỏi lưu trữ** cạnh Xem dữ liệu/Khôi phục. Hộp xác nhận nêu rõ hồ sơ bị bỏ khỏi danh sách và không còn khôi phục bằng nút Khôi phục. Nhật ký giữ bản trước xóa; lịch sử gia hạn vẫn được giữ để đối chiếu. Xóa không tác động đến khách hoạt động. Hồ sơ đã được khôi phục hoặc danh sách cũ không bị xóa nhầm. Family lưu trữ chỉ khôi phục những khách còn lưu trữ, không tạo lại hồ sơ đã chọn Xóa khỏi lưu trữ.

**Sản phẩm khác → Xóa** chuyển toàn bộ hồ sơ vào Khách lưu trữ, giữ tên sản phẩm, tên/email khách, Contact, gói, ngày mua/hạn, thanh toán, số tiền, ghi chú và thời điểm tạo. Xem dữ liệu hỗ trợ đúng hồ sơ sản phẩm; Khôi phục đưa lại vào Sản phẩm khác, không cần Family và không đổi hạn. Có thể Xóa khỏi lưu trữ như hồ sơ khách Family. Hồ sơ khách Family/lịch sử có trùng số ID nội bộ vẫn được giữ nguyên. Mục Thống kê giữ các lượt gia hạn lâu dài; không tự lưu trữ/xóa khách hoạt động.

Bản **0.11 đã đóng gói lại toàn bộ** thay đổi này cùng chặn báo lỗi trùng/reset tìm kiếm/copy mail lỗi/logo YouTube. Dùng [family-hostinger-update.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger-update.zip) cho website đang chạy và làm theo [UPDATE.md](hosting/php/UPDATE.md); giữ config.php/database, không nhập lại khách. ZIP cài mới cũng có đầy đủ các thay đổi. Từ bản0.11, backupv5 phân biệt sản phẩm lưu trữ với khách Family. Bản0.13/helper Windows hiện xuấtv6 có kho mã hóa và nhậnv1–v6; app cũ không nhập đượcv6.

Kiểm tra PHP trực tiếp từ mã nguồn, không tạo ZIP: `FAMILY_PHP_SOURCE_ONLY=1 npm run test:php`. Chế độ này chép nguồn PHP/frontend vào các fixture riêng, bỏ config.php thật; không đụng database/config đang dùng. Chạy `npm run test:php` không có biến này vẫn kiểm tra luồng đóng gói khi cần.

## Nhập Google Sheets CSV

**Cách đơn giản trên Windows:** đóng ứng dụng, nhấp đúp **IMPORT-CSV-WINDOWS.cmd**, chọn CSV gốc. Khi thấy **Import complete**, mở lại START-WINDOWS.cmd. Công cụ sao lưu vào `data/before-csv-*.sqlite`, giữ dữ liệu cũ và bỏ qua khách trùng. Không cần ghép cột hoặc tài khoản đăng nhập.

**Nhập trong web:** vào **Nhập khách CSV**, chọn tệp, kiểm tra cột và nhóm, bấm Xem trước rồi Xác nhận nhập. Có thể cập nhật các cột được chọn của khách đã có; ô trống và cột không chọn giữ nguyên dữ liệu cũ. Nếu có lỗi, không ghi dòng nào; nếu dữ liệu thay đổi sau xem trước, phải xem trước lại.

Google Sheets: **Tệp → Tải xuống → Giá trị được phân tách bằng dấu phẩy (.csv)**. Hỗ trợ nhiều Family xếp nối tiếp trong cùng tab: dòng email quản lý được dùng ghép nhóm, các ô mật khẩu/xác minh ở dòng đó được bỏ. Tên, email, gói, ngày, Contact và ghi chú của khách được giữ; cột Ngày pay đếm ngược được tính lại từ hạn, không suy ra thanh toán. “1 năm” chuyển thành 12 tháng, 13 tháng giữ nguyên. Ngày thiếu năm chỉ được bổ sung khi gói và hạn xác định được cùng ngày/tháng. Ô trống giữ nguyên; không tự đoán dữ liệu.

CSV UTF-8 tối đa 1 MB, 10.000 dòng, 100 cột; nhận dấu phẩy/chấm phẩy/tab và ô có nháy/xuống dòng. Ngày dd/mm/yyyy hoặc yyyy-mm-dd; Contact tối đa 1000 ký tự. Chưa nhập XLSX: các link ẩn dưới tên trong sheet có thể không còn URL trong CSV. Không lưu tệp CSV gốc hoặc đưa dữ liệu khách lên GitHub. Nhập CSV hiện dành cho khách Family, không nhập sản phẩm phụ.

## Phát triển và cloud

```sh
cd /workspace/family
npm test
npm start
```

Node.js 24+ cung cấp node:sqlite, không cần npm install hoặc dịch vụ ngoài. `npm run dev` bật watch. Dùng checkout sẵn; môi trường task đã cô lập, không tạo Git worktree trừ khi được yêu cầu. Dữ liệu trong data bị loại khỏi Git. `DATA_DIR` và `PORT` có thể đổi nơi lưu/cổng. Tiến trình phải khởi động lại trong task mới.

Mặc định chỉ lắng nghe 127.0.0.1, mở ngay Tổng quan không cần cookie. Host ngoài localhost/loopback bị từ chối. Yêu cầu thay đổi dùng JSON, Origin cùng địa chỉ và header X-Fam-Request. Endpoint auth/users/jobs cũ không còn hoạt động.

Chế độ hosting: cần `HOST=0.0.0.0`, `PUBLIC_ORIGIN=https://dia-chi-website` và `ACCESS_PASSWORD` dài hơn 6 ký tự, cùng HTTPS proxy và thư mục `DATA_DIR` được giữ qua cập nhật. Không có những cấu hình này, server từ chối mở ra bên ngoài. Mật khẩu nhập trong bảng cấu hình hosting, không lưu vào Git. Cookie HTTPS giữ truy cập 30 ngày; đổi mật khẩu hosting sẽ vô hiệu hóa cookie cũ. Nút **Khóa ứng dụng** xóa cookie trên thiết bị hiện tại. Trang `/healthz` chỉ báo server hoạt động, không trả dữ liệu khách. Docker/Compose chuẩn bị cho VPS; không tải Dockerfile vào File Manager của Web Hosting để chạy.

**Sao lưu / Chuyển dữ liệu:** tải JSON ngay trong ứng dụng, khôi phục qua cùng nút ở ứng dụng đang trống. Giữ đầy đủ khách, Family, Contact, lịch sử gia hạn, lưu trữ, sản phẩm phụ và nhật ký; không chuyển admin/mật khẩu cũ. Khôi phục lỗi sẽ hủy toàn bộ thao tác; nếu đã có dữ liệu, ứng dụng từ chối để tránh ghi đè. Tệp sao lưu có thông tin khách, nên giữ riêng. Hai bản chạy cục bộ và hosting không tự đồng bộ; sau chuyển, dùng địa chỉ hosting trên cả máy tính và điện thoại.

Trên iPhone: mở địa chỉ HTTPS bằng Safari → Chia sẻ → Thêm vào Màn hình chính → Thêm. Có icon và chế độ mở riêng như ứng dụng. Cần Internet, chưa có thông báo đẩy hoặc làm việc offline; nhắc hạn hiển thị khi mở Tổng quan. Không cần đưa lên App Store.

Kiểm thử dùng SQLite tạm: CRUD, nhập CSV, chống trùng/thay đổi khi xem trước, nâng cấp dữ liệu cũ, kỳ gia hạn từ hạn cũ, lưu trữ/khôi phục, mở trực tiếp không đăng nhập, tạo Family bằng email, sản phẩm phụ và nhắc hạn. Có thêm kiểm thử truy cập hosting, asset iPhone, sao lưu/khôi phục đầy đủ và tránh ghi đè. Windows batch chưa được chạy trên Linux; phần nhập Node đã được kiểm thử độc lập.

## Thống kê mua mới và kỳ gia hạn (0.16.0)

Chọn trạng thái thành viên **Mua mới** để lưu lượt mua đầu vào tháng của Ngày mua. Lịch sử này giữ nguyên khi đổi trạng thái, gia hạn hoặc lưu trữ khách. Trang Thống kê hiển thị Khách mua mới dưới lịch sử gia hạn; 6 tháng gần nhất mở/đóng bằng menu thu gọn.

Gia hạn chỉ tính sau khi trả đủ và xác nhận hạn mới, vào tháng của **hạn cũ**. Hạn 10/09, nhận tiền 21/10, gia hạn 3 tháng vẫn ra kỳ 10/09–10/12 và thống kê tháng 9. Ngày nhận tiền/ngày xác nhận vẫn giữ riêng. Quy tắc này thay thế cách phân tháng theo thời điểm xác nhận của các phiên bản cũ.

Bản cập nhật Hostinger và quy tắc ghi nhận chi tiết: [THONG-KE-MUA-MOI.md](hosting/php/THONG-KE-MUA-MOI.md). Sao lưu v8 thêm lịch sử mua mới; khôi phục vẫn hỗ trợ v1–v7.

## Cập nhật một chạm trên Hostinger (0.17.0)

Cài gói kích hoạt một lần rồi dùng nút **Cập nhật một chạm** để tải bản ổn định từ GitHub Releases `haitiano1/family`. Bộ cài kiểm tra gói, sao lưu dữ liệu/mã, giữ cấu hình và kết nối Sheet, khóa yêu cầu ứng dụng khi thay mã và khôi phục mã nếu kiểm tra khởi động thất bại. Chỉ tự áp dụng gói cùng cấu trúc database; Apps Script và bộ khôi phục nền có quy trình riêng.

Khi một PR được gộp vào main, workflow **Phát hành Family PHP** tự kiểm thử, đóng gói và phát hành nếu số phiên bản trong package.json chưa có Release (gộp PR không đổi phiên bản thì không phát hành gì). Sau khoảng 5 phút website nhìn thấy bản mới. Tạo gói trong workspace không phải là phát hành. Xem [CAP-NHAT-MOT-CHAM.md](hosting/php/CAP-NHAT-MOT-CHAM.md). Đóng gói: `python3 scripts/package-php.py`, sau đó `python3 scripts/package-release.py`. Kiểm thử PHP với image có sẵn có thể dùng `FAMILY_PHP_USE_EXISTING_IMAGE=1`; mặc định bộ test dựng image từ Dockerfile.
