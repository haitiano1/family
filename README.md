# YouTube Family — Quản lý khách hàng 0.10

Ứng dụng quản lý cho cá nhân: **mở web là vào Tổng quan**, không cần tài khoản đăng nhập. Tập trung quản lý khách YouTube, Family, gia hạn và sản phẩm bán thêm. Không còn các mục admin, bảo mật tài khoản, Jobs hoặc thao tác Google. Có bản **PHP + MySQL dành cho Hostinger Premium** và bản Node.js chạy Windows/VPS. Có thể thêm biểu tượng vào màn hình chính iPhone; xem [hướng dẫn Hostinger](HOSTINGER.md). Bản hosting dùng một mật khẩu truy cập chung, không có tài khoản/role admin.

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

Dữ liệu khách, Family, Contact, thanh toán, gia hạn, lưu trữ và bản sao cũ được giữ. Startup nâng cấp SQLite bằng thay đổi cộng thêm, sao lưu trước nâng cấp vào `data/before-v12-*.sqlite`. Dữ liệu admin/Jobs cũ, nếu có, vẫn nằm trong bản dữ liệu cũ nhưng không được ứng dụng mới sử dụng hoặc trả qua API. Không cần tạo admin hoặc đăng nhập sau cập nhật. Bookmark cũ đến các trang đã bỏ được đưa về Tổng quan.

## Chuyển dữ liệu từ bản Windows cũ mà không cập nhật ứng dụng

Bạn vẫn dùng **IMPORT-CSV-WINDOWS.cmd** trong thư mục cũ để nhập CSV (đóng server trước). Công cụ chỉ nhập vào SQLite trên Windows. Nếu khách đã có trong ứng dụng cũ, chuyển thẳng bằng công cụ xuất, không cần nhập lại CSV.

1. Tải [family-windows-export.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-windows-export.zip), giải nén trên máy tính.
2. Chép **hai file** `EXPORT-BACKUP-WINDOWS.cmd` và `export-backup.cjs` vào thư mục cũ chứa START-WINDOWS.cmd và thư mục data. Đây chỉ là helper, không thay app hoặc dữ liệu cũ.
3. Đóng server, nhấp đúp **EXPORT-BACKUP-WINDOWS.cmd**. Khi có **Export complete**, một file `family-backup-…json` xuất hiện ngay trong thư mục đó; cửa sổ báo số khách/Family/lịch sử/lưu trữ/sản phẩm.
4. Mở website Family trên Hostinger → **Sao lưu / Chuyển dữ liệu**, chọn JSON vừa tạo → **Khôi phục dữ liệu** vào ứng dụng trống.

Exporter tự chạy bằng Node24+, không dùng source app khác, mở SQLite **read-only**, không upgrade/thay đổi database gốc, không ghi đè file backup có sẵn. Hỗ trợ schema cũ0–11; bảng/field không tồn tại được bổ sung vào JSON bằng ô trống/default cần thiết, không đoán ngày mua/hạn. Admin/jobs/mật khẩu ứng dụng cũ không được chuyển. Original Contact/notes/history/archive snapshots được giữ. Không tải file SQLite/JSON chứa khách vào File Manager hoặc GitHub; nhập JSON qua ứng dụng đã mở bằng mật khẩu. Hai bản Windows/hosting không tự đồng bộ; dùng địa chỉ hosting sau chuyển.

## Khách hàng và Family

- **Tổng quan:** mở ngay danh sách khách với tìm kiếm/bộ lọc, số Family, hạn còn 2 ngày và đã quá hạn; sản phẩm phụ đến hạn xuất hiện riêng.
- **Family:** thêm/sửa tên, email quản lý và ghi chú ngay trong form; không cần thêm email quản lý ở một trang tài khoản khác trước. Mở Family để xem/thêm khách.
- **Khách & Gia hạn:** tên, email, Contact (Facebook/Zalo/ghi chú liên hệ), gói, ngày mua, hạn, thanh toán và ghi chú. Có thể thêm khách trực tiếp và chọn Family nhận khách.
- Gói chuẩn 1/2/3/6/12 tháng; gói đã nhập tùy chỉnh như 13 tháng được giữ, hỗ trợ đến 120 tháng.
- Giữ toàn bộ hồ sơ khách đã mời nhưng chưa vào; các ghi chú “chưa vào” không mất và chưa tính vào 5 chỗ thành viên đang ghi nhận.
- **Nhắc hạn:** tạo mẫu tin và sao chép để bạn tự gửi qua Zalo/Facebook, không gửi tự động. Contact được hiển thị dưới email và trong form sửa khách.
- Ngày tính theo múi giờ Việt Nam. Còn 0–2 ngày là sắp hết hạn; ngày sau hạn mới là quá hạn. Ô không có ngày hết hạn không bị đoán ngày.

## Thanh toán và gia hạn

Thanh toán kỳ hiện tại tách với gia hạn tiếp theo: Chưa nhắc / Đã nhắc / Chờ thanh toán / Đã trả một phần / Đã thanh toán gia hạn / Không gia hạn.

1. Bấm **Gia hạn**, chọn trạng thái, gói, tiền đã nhận, ngày nhận tiền và ghi chú.
2. Mặc định bật tự cập nhật kỳ khi đã thanh toán đủ. Bấm **Lưu gia hạn** ghi tiền, cập nhật ngày mua/hạn và lưu lịch sử trong một lần. Chờ tiền/trả một phần chưa đổi ngày.
3. Kỳ mới **luôn nối từ ngày hết hạn cũ**, kể cả trả tiền muộn. Ví dụ hạn 05/01/2026, nhận tiền 15/01/2026, gói 3 tháng → kỳ mới 05/01/2026–05/04/2026. Ngày nhận tiền nằm riêng trong lịch sử. Nếu chưa có hạn cũ, cần bổ sung trước khi gia hạn.
4. Nếu bỏ tùy chọn cập nhật ngày, chỉ ghi nhận tiền trước. Dùng **Xác nhận hạn mới** sau đó để áp dụng.
5. Ngày cuối tháng được giới hạn đúng tháng, kể cả năm nhuận. Lịch sử giữ ngày mua/hạn cũ/mới, tiền, ngày nhận và ghi chú. Số tiền cột kỳ hiện tại là của kỳ hiện tại, không phải tổng doanh thu.

Sau gia hạn, lần tiếp theo trở về Chưa nhắc; lịch sử không mất. Việc tính sai ở những bản cũ không tự sửa hồi tố. Chỉnh ngày trực tiếp bằng form sửa hồ sơ không tạo lịch sử gia hạn hoàn tất.

## Family, Fix lỗi và Nhật ký

**Family** có tìm kiếm theo tên/email quản lý/email khách/ghi chú và nút **Báo lỗi** cạnh Sửa/Xóa hồ sơ. Chọn mail quản lý hoặc mail khách trong Family, nhập nội dung và ghi chú; thẻ xuất hiện ở **Fix lỗi**.

Bảng **Chờ fix → Đang fix → Đã fix** hỗ trợ kéo thả, chọn trạng thái và nút Đã fix trên iPhone. Khi hoàn tất, bắt buộc chọn **Giữ nguyên mail** hoặc **Đổi sang mail mới**. Đổi cập nhật đúng hồ sơ quản lý/khách đã báo lỗi trong cùng lần lưu; thẻ Done ghi rõ mail cũ→mới và giữ mail báo lỗi ban đầu. Không đổi ngày mua/hạn/Contact/thanh toán. Mail trùng hoặc hồ sơ đã thay đổi/xóa sẽ không gây cập nhật một phần; trạng thái và đổi mail cùng rollback. Lỗi vẫn được giữ khi Family bị xóa. Thay đổi đồng thời có revision guard, cần tải lại khi có xung đột.

**Nhật ký** tìm kiếm/phân trang, lưu thời gian/người thao tác/nội dung và **Xem chi tiết trước-sau** cho các thay đổi từ bản này. Ghi thêm/sửa/xóa/import/gia hạn/lưu trữ/khôi phục/sửa lỗi/đổi mail; không ghi refresh/xem trang. Khi xóa Family, cả hồ sơ nhóm và khách được chuyển vào lưu trữ; nhật ký ghi thay đổi và hồ sơ khách đã lưu. Log cũ vẫn đọc được; dữ liệu trước-sau không thể tạo lại cho thao tác đã xảy ra trước bản cập nhật. Nhật ký hiện giúp đối chiếu, chưa có hoàn tác tự động. Bản sao lưu v5 giữ cả lỗi/nhật ký/ngày trial, Family lưu trữ, sản phẩm phụ đang bán và lưu trữ; vẫn nhận v1/v2/v3/v4.

Cập nhật Hostinger bằng [gói cập nhật riêng](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger-update.zip) và [hướng dẫn](hosting/php/UPDATE.md), giữ nguyên config.php/database. Không cần nhập lại khách. MySQL nâng cấp1/2→3 bằng thêm bảng/cột; Node schema11 sao lưu trước nâng cấp. Các bản app cũ không dùng được dữ liệu Node schema11; exporter độc lập hỗ trợ đến11.

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

## Khách vừa gia hạn (bản 0.10)

Trong **Khách lưu trữ** có thêm mục **Khách vừa gia hạn · 14 ngày gần nhất**. Sau khi xác nhận gia hạn thành công, khách xuất hiện ở đây với tên/email/Contact có copy, Family, gói, thời điểm gia hạn, kỳ mới, tiền và ngày nhận tiền. Mỗi khách hiện lần xác nhận mới nhất; các lần cũ vẫn có trong Lịch sử.

Thời gian 14 ngày tính từ **lúc xác nhận gia hạn thành công trên ứng dụng**, đủ 14 × 24 giờ, không lấy ngày mua, ngày hết hạn cũ hay ngày nhận tiền. Chỉ mở hộp thoại Gia hạn hoặc ghi nhận Chờ tiền/Trả một phần/Đã trả tiền nhưng chưa xác nhận hạn mới chưa đưa khách vào mục này. Khách trả tiền muộn vẫn được ghi nhận từ lúc thao tác; kỳ sử dụng mới vẫn nối từ hạn cũ theo quy tắc hiện có.

Sau 14 ngày, bản ghi tự rời **Khách vừa gia hạn** khi trang cập nhật (tự làm mới mỗi 10 giây khi đang xem). **Hồ sơ khách hoạt động, Family, Contact, hạn, thanh toán, lịch sử gia hạn và nhật ký được giữ**, không tự chuyển khách sang lưu trữ theo mốc này. Danh sách được tính lại từ các lần gia hạn thành công nên không cần cron riêng hoặc thay database; lịch sử cũ trong 14 ngày gần nhất cũng xuất hiện sau cập nhật. Backup/khôi phục hiện có giữ mốc này qua lịch sử gia hạn.

## Cập nhật trực tiếp: xóa lưu trữ và lưu trữ sản phẩm khác

**Khách lưu trữ** có nút **Xóa khỏi lưu trữ** cạnh Xem dữ liệu/Khôi phục. Hộp xác nhận nêu rõ hồ sơ bị bỏ khỏi danh sách và không còn khôi phục bằng nút Khôi phục. Nhật ký giữ bản trước xóa; lịch sử gia hạn vẫn được giữ để đối chiếu. Xóa không tác động đến khách hoạt động. Hồ sơ đã được khôi phục hoặc danh sách cũ không bị xóa nhầm. Family lưu trữ chỉ khôi phục những khách còn lưu trữ, không tạo lại hồ sơ đã chọn Xóa khỏi lưu trữ.

**Sản phẩm khác → Xóa** chuyển toàn bộ hồ sơ vào Khách lưu trữ, giữ tên sản phẩm, tên/email khách, Contact, gói, ngày mua/hạn, thanh toán, số tiền, ghi chú và thời điểm tạo. Xem dữ liệu hỗ trợ đúng hồ sơ sản phẩm; Khôi phục đưa lại vào Sản phẩm khác, không cần Family và không đổi hạn. Có thể Xóa khỏi lưu trữ như hồ sơ khách Family. Hồ sơ khách Family/lịch sử có trùng số ID nội bộ vẫn được giữ nguyên. Mục Khách vừa gia hạn tiếp tục là danh sách xem 14 ngày, không tự lưu trữ/xóa khách hoạt động.

Người dùng yêu cầu cập nhật bằng mã nguồn, **không tạo lại ZIP** cho thay đổi này. Trong hPanel, thay đúng 4 file trên website đang chạy: `family-private/business.php`, `family-private/audit.php`, `public_html/api.php`, `public_html/app.js` (nguồn file cuối là `public/app.js`). Xem [SOURCE-UPDATE.md](hosting/php/SOURCE-UPDATE.md) để sao chép nội dung và cập nhật. Không thay config.php/database, không nhập lại khách. Các ZIP hiện có vẫn là bản trước cập nhật trực tiếp này. Backup v5 phân biệt hồ sơ sản phẩm lưu trữ với khách Family; mã mới nhận cả v1–v4, bản cũ không nhận v5. Exporter mã nguồn cũng xuất v5; gói helper ZIP chưa được tạo lại.

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
