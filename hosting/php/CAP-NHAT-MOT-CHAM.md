# Cập nhật một chạm từ GitHub — bản kích hoạt 0.20.0

## Cài lần đầu trên Hostinger

1. Trong website, tải bản sao dữ liệu hiện tại rồi đóng các tab Family trong lúc upload.
2. Giải nén **family-cap-nhat-mot-cham.zip**. Upload nội dung hai thư mục **family-private** và **public_html** vào đúng hai thư mục đang dùng. Giữ **config.php** và database hiện tại.
3. Mở lại website, Ctrl+F5. Thanh trên cùng có nút **Cập nhật một chạm**. Không cần thay Apps Script hoặc mã kết nối Sheet.

Đây là lần cần upload để cài bộ cập nhật. Các bản phát hành tương thích tiếp theo được cài ngay trên website.

## Dùng nút cập nhật

Nhấn **Cập nhật một chạm** để kiểm tra bản ổn định trên GitHub **haitiano1/family**. Đọc phiên bản/nội dung rồi nhấn **Cập nhật lên …**. Website tải và kiểm tra gói, tạo bản sao dữ liệu/mã trong **family-private/.updates** (ngoài public_html), tạm dừng yêu cầu ứng dụng, thay mã rồi kiểm tra khởi động bằng một yêu cầu PHP mới. Nhấn **Tải lại website** sau khi thành công.

Nếu tải gói lỗi hoặc mã kiểm tra sai, chưa thay file. Nếu thay mã nhưng kiểm tra khởi động lỗi, bộ cập nhật thử trả lại mã cũ. Nếu bị ngắt giữa chừng, mở lại **/update.php?action=status** trên tên miền website để bộ khôi phục xử lý; nút cập nhật cũng dùng đường dẫn này. Nếu báo cần mở khóa, vào **/access**, nhập mật khẩu truy cập website rồi mở lại đường dẫn kiểm tra. Đường đăng nhập này hỗ trợ khôi phục khi phiên trình duyệt hết hạn trong lúc cập nhật bị gián đoạn. Cấu hình không nằm trong gói; bộ cập nhật không khôi phục đè database khi trả lại mã.

Có thể tải bản sao dữ liệu trước lần cập nhật thành công gần nhất ngay trong cửa sổ cập nhật. File **.json.gz** cần giải nén thành JSON trước khi dùng tính năng khôi phục dữ liệu; chỉ khôi phục theo quy tắc vào ứng dụng trống hiện có. Các bản sao riêng trong .updates không được đưa lên GitHub hoặc chuyển vào public_html.

## Để một phiên bản xuất hiện trên website

Nút chỉ thấy **GitHub Releases đã phát hành**, không tự lấy code còn trong cuộc chat hoặc những thay đổi chưa phát hành ở main.

Người quản lý repository chỉ cần gộp PR vào main:

1. Đặt số phiên bản mới trong **package.json**, ví dụ 0.17.1, cùng các thay đổi cần phát hành và nội dung **hosting/php/RELEASE-NOTES.md**.
2. Gộp (Merge) PR vào main. Workflow **Phát hành Family PHP** tự chạy. Vẫn có thể chạy tay: **Actions → Phát hành Family PHP → Run workflow**, chọn main.
3. Workflow kiểm thử, đóng gói và tạo Release **v0.17.1** với **family-php-release.zip** và **family-latest.json**. Nếu phiên bản đó đã có Release, workflow bỏ qua, không ghi đè gói cũ.
4. Sau khi workflow thành công, website có thể kiểm tra và cài bản mới. Source repository và Release cần truy cập công khai; cơ chế này chưa dùng GitHub token riêng trên Hostinger.

Các file được tạo ở workspace hoặc gửi qua chat **chưa được coi là đã phát hành**. Chỉ mã đã được gộp vào main mới được phát hành.

## Phạm vi và điều kiện

- PHP 8.2+, PDO MySQL, cURL, Phar, tokenizer và zlib; không cần SSH, Composer, npm hoặc ZipArchive trên Hostinger. PHP cần quyền ghi vào hai thư mục ứng dụng. Không dùng quyền 777 trên website thật.
- Nguồn cố định là GitHub Releases của repository này; HTTPS và mã SHA-256 được kiểm tra. Không nhập URL tải tùy ý. Người mở khóa được website có thể cài mã từ nguồn đó, nên cần giữ kín mật khẩu truy cập chung.
- Bộ cập nhật chỉ áp dụng bản cùng phiên bản cấu trúc database. Bản cần nâng cấp dữ liệu riêng sẽ bị chặn trước khi thay mã. Không thể hứa tự trả lại cấu trúc database sau mọi loại migration.
- Không tự cập nhật Apps Script, config.php, .htaccess, .user.ini hoặc bộ khôi phục nền. Các phần đó có quy trình kích hoạt riêng nếu sau này cần thay đổi.
- Đây là cập nhật do người dùng chủ động nhấn, không có cron tự cài ngầm.
- Nếu chưa có Release đúng chuẩn, website báo chưa có bản phát hành; điều này không đồng nghĩa website đang lỗi.
