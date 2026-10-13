# Cập nhật Family lên bản 0.10

1. Trong website Family đang chạy, chọn **Sao lưu / Chuyển dữ liệu → Tải file sao lưu**.
2. Tải [family-hostinger-update.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger-update.zip) và **giải nén trên máy tính**.
3. Mở hPanel → File Manager của **đúng website Family**. Mở `family-private` đang chứa `config.php`. Upload toàn bộ **file bên trong family-private của gói cập nhật** và thay file trùng. Giữ `config.php` hiện có.
4. Mở `public_html` chính. Upload toàn bộ **file bên trong public_html của gói cập nhật** và thay file trùng. Không tạo thêm public_html/public_html hoặc family-private/family-private.
5. Mở lại website, nhấn **Ctrl+F5**. Trên iPhone, đóng rồi mở lại Family hoặc tải lại trang trong Safari.

Không cần tạo database hoặc nhập lại khách. Gói không chứa dữ liệu hay config.php. MySQL tự thêm cột lưu trữ/gói tháng khi mở app; dữ liệu cũ và các hạn đã nhập được giữ. Backup v4 nhận cả JSON v1/v2/v3; không dùng bản ứng dụng cũ để nhập backup v4.

## Khách vừa gia hạn mới ở bản 0.10

Trong **Khách lưu trữ** có thêm **Khách vừa gia hạn · 14 ngày gần nhất**. Sau khi xác nhận gia hạn thành công, khách hiện ở đây cùng thời điểm thao tác, gói/kỳ mới, tiền nhận và tên/email/Contact có nút copy. Mỗi khách hiện lần xác nhận mới nhất. Mốc 14 ngày tính từ thao tác thành công, không lấy ngày mua/hạn cũ/nhận tiền; khách trả muộn vẫn xuất hiện ngay.

Sau đủ 14 ngày, chỉ bản ghi trong mục này rời danh sách. **Hồ sơ khách hoạt động và lịch sử vẫn được giữ**, không tự chuyển sang lưu trữ hay xóa khách. Trang mở tự cập nhật mỗi 10 giây. Chỉ mở hộp thoại Gia hạn hoặc chưa xác nhận hạn mới không tính là đã gia hạn. Lịch sử cũ gần đây cũng được hiển thị; không cần sửa database, tạo cron hay nhập lại data. Luồng lưu trữ/khôi phục và gói mua/bộ lọc của bản 0.9 vẫn được giữ.

## Kiểm tra sau cập nhật

- **Thêm khách / Sản phẩm khác:** chọn 1/2/3/6/12 tháng, hạn tự nhảy theo ngày mua. Ví dụ 13/10/2026, gói 3 tháng → 13/01/2027. Đổi ngày mua sẽ tính lại; vẫn sửa hạn thủ công được. Mở Sửa hồ sơ giữ hạn đang có cho đến khi bạn đổi gói/ngày mua. Gia hạn YouTube tiếp tục nối từ hạn cũ, kể cả khách trả muộn.
- **Family:** Tất cả xếp trial từ cũ đến mới, chưa nhập trial ở cuối. Fam dư slot chỉ có số Khách đang ghi nhận 0–4, tính cả hồ sơ đã mời/chưa vào. Theo tên xếp Family 48, Family 47, Family 46… Tìm kiếm dùng cùng bộ lọc.
- **Xóa hồ sơ khách:** chuyển vào Khách lưu trữ, giữ thông tin/Contact/hạn/thanh toán/lịch sử. **Xóa hồ sơ Family:** cả nhóm và khách về Khách lưu trữ. Nhóm trống vẫn có trong phần Family lưu trữ. **Khôi phục Family** khôi phục nhóm cùng khách còn lưu trữ từ lần xóa, giữ trial/ghi chú/mail quản lý; khách đã khôi phục sang nhóm khác không được tạo lại. Email quản lý của nhóm lưu trữ vẫn gắn với hồ sơ đó; dùng Khôi phục Family để sử dụng lại.
- **Sản phẩm khác:** gói tháng hiện trong danh sách; copy tên sản phẩm/tên khách/email/Contact/ngày mua/hạn/ghi chú; link Facebook/Zalo mở được. Hạn và nhắc hạn vẫn hiện trên Tổng quan.
- **Nhật ký:** lưu cả chuyển hồ sơ vào lưu trữ và khôi phục. Giữ các tính năng Fix lỗi/ngày trial/đổi mail/copy/ba bộ lọc khách của bản trước. Khách chọn Không gia hạn vẫn lưu trữ ngay. Chỉ quá hạn chưa hủy gia hạn vẫn ở danh sách hoạt động.

Gói cập nhật cần cả `import.php`, `business.php`, `core.php`, `issues.php`, `audit.php`, `features.sql`, `cron.php` trong family-private và các file mới trong public_html. Chỉ thay source; giữ cấu hình và database của website đang dùng. Gói đầy đủ `family-hostinger.zip` dành cho cài mới.
