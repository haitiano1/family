# Cập nhật YouTube Family 0.13.1

Bản này gộp đầy đủ các thay đổi trước đây chưa đóng gói và các yêu cầu mới. Dùng **gói cập nhật** cho website Family đang chạy; giữ cấu hình và dữ liệu hiện có.

## Các bước cập nhật website đang dùng

1. Trong app, chọn **Sao lưu / Chuyển dữ liệu → Tải file sao lưu** và giữ file JSON trên máy tính.
2. Tải [family-hostinger-update.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger-update.zip), rồi **giải nén trên máy tính**. Bên trong có hai thư mục `family-private`, `public_html` và hướng dẫn này.
3. Mở hPanel → Websites → Dashboard của **đúng website Family** → Files → File Manager. Mở thư mục `family-private` hiện có, đang chứa `config.php`. Upload **các file bên trong family-private của gói cập nhật**, chọn thay file trùng. **Giữ nguyên config.php**.
4. Mở `public_html` chính của website. Upload **các file bên trong public_html của gói cập nhật**, chọn thay file trùng. Đưa file vào ngay thư mục đang dùng, không tạo `public_html/public_html` hoặc `family-private/family-private`.
5. Mở lại website và nhấn **Ctrl+F5**. Trên iPhone, tải lại trang trong Safari hoặc đóng rồi mở lại Family trên màn hình chính.

Không cần tạo database, sửa SQL hay nhập lại khách. Gói không chứa config.php, mật khẩu, dữ liệu khách hoặc backup. Website giữ database hiện tại; nếu còn dùng schema cũ, ứng dụng tự thêm các cột cần thiết. Cài mới dùng [family-hostinger.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger.zip) và [INSTALL.md](INSTALL.md).

## Bổ sung trong bản 0.13.1

Kho tự hiện toàn bộ Family. Chỉ lấy **Mail Family** và **Ngày trial**; Mật khẩu/2FA/mã2FA/Mail khôi phục/Note bạn tự nhập. Không có cột số khách. Có Nhập thông tin/Sửa/copy; tìm mail và bộ lọc như Family.

**Đổi mail tại Family hoặc Kho đều cập nhật hai bên**, giữ mật khẩu/2FA/Note theo hồ sơ nhóm. Đổi mail khi kho đang khóa vẫn cập nhật đúng khi mở lại. Nhật ký ghi rõ mail cũ → mail mới, không ghi mật khẩu/khóa. Trùng mail/stale form/lỗi lưu sẽ không ghi một phần. Thông tin0.13 cũ tự liên kết khi mở kho lần đầu; không cần nhập lại48 Family. Lưu trữ/khôi phục Family vẫn giữ thông tin kho; Xóa thông tin kho giữ nguyên Family/khách.

Mật khẩu kho từ **5 ký tự**, mật khẩu cũ vẫn dùng; có Đổi mật khẩu kho. Cập nhật đầy đủ public_html/family-private, gồm **vault-families.js** mới; giữ **config.php/database**. MySQL schema6/SQLite14 thêm liên kết; tự nâng cấp. Sao lưu/helper Windows hiện **v7**, nhậnv1–v6; giữ mật khẩu kho để giải mã khi chuyển dữ liệu. Không nhậpv7 vào app cũ.

## Bổ sung trong bản 0.13

Có mục **Kho tài khoản** với mật khẩu riêng. Sau cập nhật, mở mục này, đặt mật khẩu kho từ 5 ký tự khác mật khẩu website. Chọn Thêm tài khoản, nhập tài khoản/mật khẩu/khóa bí mật 2FA/mail khôi phục/Note. Có thể chọn một Family đang quản lý để điền mail chủ nhóm. Kho có cột **2FA** hiển thị khóa và **Mã 2FA** tự tạo 6 số, đếm ngược/copy như Google Authenticator. Có copy các trường khác, Hiện/Ẩn mật khẩu, sửa/xóa, tìm kiếm và Đổi mật khẩu kho.

Có tìm mail/Family/Note và bộ lọc **Tất cả, Fam dư slot, Theo tên** như mục Family. Note được mã hóa và copy được.

Chọn **Nhập từ Sheet** để dán bảng có dòng tiêu đề (Tài khoản, Mật khẩu, 2FA, Mail khôi phục, Note; có thể thêm Tên Family) hoặc chọn CSV/TSV. Đối chiếu cột, nhấn **Xem trước** rồi **Nhập … tài khoản**. Chỉ Tài khoản bắt buộc; tối đa 500 dòng/lần, file1MB. Mail trùng hoặc khóa sai được báo theo dòng; dừng cả lượt, không ghi đè hay nhập thiếu. Nhập vào kho không tạo Family/khách.

Khóa dạng nhóm4ký tự có khoảng trắng được chuẩn hóa. Khóa Base32 chỉ nhận A–Z và 2–7; không dùng mã dự phòng hay mã6số. Mã lấy theo giờ máy chủ, mặc định đổi30giây. Chỉ người đã mở kho mới thấy thông tin; kho tự khóa khi rời mục hoặc sau15phút. Thông tin lưu mã hóa AES-GCM, không hiện trong nhật ký. Nhật ký chỉ ghi thao tác/ID. Giữ mật khẩu kho riêng vì ứng dụng không khôi phục được mật khẩu đã quên.

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
