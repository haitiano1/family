# Family trên Hostinger Premium: PHP + MySQL

Gói Premium hiện có đã được xác nhận qua hPanel có PHP8.3 và MySQL. Chọn triển khai website **PHP/HTML riêng** với tên miền tạm để thử, dùng database riêng. Các website cũ trong tài khoản chỉ được dùng kiểm tra khả năng gói, không phải nơi cài Family.

[Tải gói PHP sẵn để upload](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger.zip).

**Website đã cài:** tải [gói cập nhật riêng](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger-update.zip) và làm theo [UPDATE.md](hosting/php/UPDATE.md). Thay file chương trình, giữ config.php/database; không cần tạo lại website hoặc nhập lại khách. Bản0.6 có tìm kiếm Family, Fix lỗi giữ/đổi mail và Nhật ký trước/sau.

Xem [hướng dẫn từng bước trong gói](hosting/php/INSTALL.md): tạo website và database riêng, tải ZIP lên thư mục mẹ của public_html, giải nén, điền cấu hình riêng, kiểm tra rồi chuyển dữ liệu Windows bằng file sao lưu. config.php nằm ngoài public_html; giữ riêng mật khẩu database/mật khẩu mở ứng dụng. PHP dùng MySQL tự tạo bảng, không cần npm/Node.js trên Hostinger.

Bản này dùng lại giao diện và quy tắc khách/Family/gia hạn/lưu trữ/sản phẩm phụ của bản Windows. Giao diện iPhone mở qua Safari Add to Home Screen, dữ liệu chung trên hosting khi máy Windows tắt. Chỉ phiên bản PHP đã được đóng gói ở downloads/family-hostinger.zip phù hợp hướng này; ZIP repository đầy đủ và lệnh npm start là bản Node.js để phát triển/chạy Windows.

Gói Premium vẫn có phí gia hạn hosting đang dùng. Không cần nâng cấp Business chỉ để chạy bản PHP/MySQL trong giới hạn gói đã mua. Giữ nguyên các dự án/database khác. Upload/cấu hình thực tế do người dùng thao tác trong hPanel; việc có mã nguồn và gói ZIP không có nghĩa website đã chạy.

[Hướng Node.js/VPS cũ, nếu sau này cần](NODE-HOSTING.md).

## Kiểm tra và đóng gói cho người phát triển

- Node.js24+: `npm test` kiểm tra bản Node hiện có.
- Docker engine + Python3 + Node24: `npm run test:php` dựng PHP8.3 Apache với pdo_mysql và MySQL8.4, chạy các kiểm thử qua HTTP thật và dọn containers/network/volume sau chạy. Chỉ dữ liệu giả; không cần tài khoản Hostinger/mật khẩu thật. Trên máy này CLI Docker cần config ghi được, có thể đặt FAMILY_DOCKER_CONFIG vào một thư mục dưới /tmp thay cho đường dẫn mặc định read-only.
- `npm run package:php` tạo ZIP từ source PHP và giao diện dùng chung. Loại config.php/credentials/database/customer files; chuẩn hóa file0644. Bản ZIP được cung cấp trong GitHub để người dùng tải trực tiếp. Sau sửa source PHP/giao diện, đóng gói lại trước phát hành.
- Bộ kiểm thử PHP nằm ngoài các glob mặc định của npm test; chạy test:php riêng. Frontend không nhân bản trong source PHP; builder thêm đúng assets từ public/ và domain.js khi đóng gói.
