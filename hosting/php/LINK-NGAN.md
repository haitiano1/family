# Link tra cứu ngắn (0.28.3)

Từ 0.28.3, **Copy link tra cứu** và tin nhắn gửi khách dùng link dạng `https://tên-miền/?K7P2QX` thay cho `https://tên-miền/tra-cuu.html#ma=K7P2QX`. Link cũ vẫn mở được.

## Dùng một tên miền phụ ngắn hơn

Website Family chỉ nhận đúng tên miền trong `config.php` (`public_origin`). Vì vậy tên miền phụ không gắn thẳng vào website Family, mà **chuyển hướng** về website đó.

1. Trên Hostinger, thêm tên miền phụ thành một website riêng: **Websites → Add website → Empty website / Website trống**, chọn tên miền phụ.
2. Mở **File Manager** của website tên miền phụ, vào `public_html`, xóa file mặc định (ví dụ `default.php`), rồi tạo file `index.php` với nội dung file `link-ngan/index.php` trong gói này. Sửa dòng `$website = 'https://TEN-MIEN-WEBSITE-FAMILY';` thành tên miền website Family của bạn.
3. Bật SSL cho tên miền phụ: **Websites → tên miền phụ → Security → SSL → Install**.
4. Mở thử `https://tên-miền-phụ/?K7P2QX`: trình duyệt phải chuyển sang trang tra cứu của website Family với ô mã đã điền `K7P2QX`.
5. Trên web Family: **Thêm → Tra cứu khách → Sửa thông tin**, điền **Tên miền link ngắn** (ví dụ `haipre.vn`) rồi Lưu. Từ đó link gửi khách thành `https://haipre.vn/?MÃ`.

Không muốn tạo website riêng? Dùng **Domains → tên miền phụ → Redirect / Chuyển hướng** của Hostinger, trỏ về `https://tên-miền-website-Family`. Mở thử link ở bước 4: nếu ô mã không tự điền thì phần `?MÃ` bị mất khi chuyển hướng, hãy dùng cách tạo website ở trên.
