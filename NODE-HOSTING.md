# Dùng Family trên Hostinger và iPhone

Ứng dụng chạy liên tục trên hosting thì Windows có thể tắt. Máy tính và iPhone đều mở **cùng địa chỉ website**; dữ liệu nằm trên hosting. Cài trên iPhone bằng Safari → Chia sẻ → Thêm vào Màn hình chính. Đây là web app, không cần App Store; cần Internet để xem/sửa dữ liệu. Nhắc hạn hiện trong Tổng quan khi bạn mở ứng dụng, chưa có thông báo đẩy.

## Bước 1 — Xác định khả năng của gói Web Hosting hiện có

1. Đăng nhập [Hostinger hPanel](https://hpanel.hostinger.com/).
2. Mở **Websites / Trang web**, bấm **Add website / Thêm website**.
3. Kiểm tra có lựa chọn **Node.js** hoặc **Node.js Apps** không. Tên/menu có thể khác theo gói và phiên bản hPanel.
4. Nếu có, mở màn hình tạo ứng dụng và kiểm tra chọn được **Node.js 24**, chạy server bằng **npm start** và có thư mục ghi dữ liệu giữ nguyên qua restart/redeploy. Ứng dụng này dùng Node.js HTTP server và SQLite tích hợp, không có bước build frontend.
5. Nếu không thấy Node.js, chưa cần mua gì. Gửi tên gói/màn hình Add website để xác định tiếp. File Manager hoặc WordPress hosting không tự chạy được `npm start`. Nếu gói chỉ nhận PHP/WordPress, cần chọn nơi chạy Node.js có lưu trữ lâu dài, hoặc VPS.

**Chưa xác nhận khả năng của gói đang dùng thì chưa triển khai được.** Mã nguồn chuẩn bị cho Node.js 24 / Linux và Docker; chưa kiểm chứng trên tài khoản Hostinger của bạn. Thư mục dữ liệu bền vững là điều kiện cần: không đặt dữ liệu trong thư mục bị thay thế mỗi lần deploy.

## Bước 2 — Thiết lập khi hPanel có hỗ trợ ứng dụng này

Khi đã xác nhận ba điều kiện ở Bước 1:

1. Tạo website Node.js riêng, không thay thế website đang dùng.
2. Nếu hPanel có kết nối GitHub, chọn repository **haitiano1/family**, nhánh **main**, thư mục gốc repository. Nếu dùng tải mã nguồn, lấy ZIP mới từ GitHub và dùng đúng thư mục chứa `package.json`.
3. Chọn runtime **Node.js 24**. Start command là `npm start`. Không cần frontend build; nếu giao diện bắt buộc chọn framework/build command, cần xem các lựa chọn thực tế trước khi điền.
4. Chọn địa chỉ HTTPS của website. Điền biến môi trường trong cấu hình ứng dụng:

| Tên | Giá trị |
| --- | --- |
| `HOST` | `0.0.0.0` |
| `PUBLIC_ORIGIN` | Địa chỉ HTTPS chính xác, ví dụ `https://family.tenmiencuaban.com`, không kèm đường dẫn |
| `ACCESS_PASSWORD` | Mật khẩu riêng do bạn chọn, dài hơn 6 ký tự |
| `DATA_DIR` | Đường dẫn tuyệt đối tới thư mục lưu lâu dài do hosting cấp; cần xác nhận thư mục này không bị xóa khi deploy |
| `PORT` | Theo cấu hình cổng mà hosting yêu cầu/cấp; không tự cố định nếu nền tảng đã cấp cổng |

Không gửi mật khẩu qua chat hoặc đưa vào GitHub. Đường dẫn ví dụ của VPS/Docker không áp dụng tự động cho Web Hosting. Nếu hosting không cung cấp thư mục ghi bền vững hoặc Node.js 24, dừng tại đây để chọn cấu hình phù hợp.

5. Chạy deploy và kiểm tra log có `Fam Manager started on port ...`.
6. Mở địa chỉ HTTPS, nhập mật khẩu truy cập. Server không sử dụng tài khoản admin/role. Thiết bị được nhớ 30 ngày; có nút **Khóa ứng dụng**. Đổi ACCESS_PASSWORD rồi restart sẽ làm mất hiệu lực truy cập đã lưu trước đó.
7. Trước khi chuyển khách thật, thêm một Family/khách thử, restart/redeploy và kiểm tra còn dữ liệu. Xóa hồ sơ thử để ứng dụng trống, rồi mới làm Bước 3. Không dùng thông tin khách thật để thử khả năng giữ dữ liệu.

## Bước 3 — Chuyển dữ liệu đang quản lý trên Windows

1. Cập nhật ứng dụng Windows bằng ZIP mới, giữ nguyên thư mục **data** như README.
2. Mở ứng dụng trên Windows, bấm **Sao lưu / Chuyển dữ liệu → Tải file sao lưu**. Lưu file `family-backup-...json` ở máy bạn.
3. Vẫn trên máy tính, mở **địa chỉ hosting** bằng trình duyệt, nhập mật khẩu truy cập.
4. Bấm **Sao lưu / Chuyển dữ liệu**, chọn file vừa tải, bấm **Khôi phục dữ liệu**. Chỉ nhận vào ứng dụng trống để tránh ghi đè.
5. Đối chiếu số Family/khách, Contact, vài lịch sử gia hạn và sản phẩm phụ. Bản sao giữ cả khách lưu trữ và nhật ký, không chuyển mật khẩu/tài khoản admin cũ.
6. Từ đây dùng địa chỉ hosting trên cả máy tính và điện thoại. Hai bản local/hosting không tự đồng bộ. Giữ thư mục data cũ và file sao lưu để dự phòng.
7. Thường xuyên dùng **Tải file sao lưu**, nhất là trước cập nhật/chuyển hosting.

Nếu bản Windows cũ chưa có nút sao lưu, cập nhật trước; không nhập lại CSV thay cho sao lưu khi bạn đã có lịch sử gia hạn/thanh toán mới trong ứng dụng.

## Bước 4 — Thêm vào màn hình chính iPhone

1. Mở **Safari** trên iPhone.
2. Nhập đúng **địa chỉ HTTPS của hosting**; không dùng địa chỉ `127.0.0.1` trên điện thoại.
3. Bấm biểu tượng **Chia sẻ** (hình vuông, mũi tên lên).
4. Kéo danh sách thao tác, chọn **Thêm vào Màn hình chính / Add to Home Screen**.
5. Đặt tên **Family**, bấm **Thêm / Add**.
6. Mở icon Family. Nếu được hỏi, nhập mật khẩu truy cập một lần trong icon; Safari và ứng dụng màn hình chính có thể dùng vùng lưu truy cập khác nhau.
7. Mở **Tổng quan** để xem nhắc hạn; **Sản phẩm khác** để thêm Netflix/Spotify/Google One/ChatGPT/Khác. Trên điện thoại, mỗi khách hiển thị dạng thẻ với các nút thao tác.

## Phương án VPS (chỉ dùng nếu chọn VPS riêng)

Repository có Dockerfile, compose.yaml và Caddyfile. Đây là phương án dành cho VPS Linux có Docker Compose, một subdomain trỏ đúng IP VPS và cổng 80/443 dành cho ứng dụng. Không chạy lệnh này trên Web Hosting/File Manager. Không áp dụng vào VPS đã có website chiếm cổng mà chưa kiểm tra cấu hình.

Trên VPS đã đáp ứng điều kiện:

```sh
git clone https://github.com/haitiano1/family.git
cd family
nano .env
```

Tự điền hai dòng vào `.env`: `APP_DOMAIN=family.tenmiencuaban.com` và `ACCESS_PASSWORD=mật-khẩu-riêng-của-bạn`. Thay bằng thông tin của bạn, không dùng mật khẩu minh họa. `.env` bị loại khỏi Git và Docker image.

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 family
```

Caddy cấp HTTPS khi domain/DNS và cổng truy cập đúng. SQLite nằm trong named volume `family_data`, giữ qua restart/rebuild. Không dùng `docker compose down -v` vì tùy chọn `-v` xóa volume chứa dữ liệu. Sao lưu qua giao diện trước cập nhật; dùng `git pull` rồi `docker compose up -d --build` để cập nhật code. Chưa có VPS, domain hay quyền tài khoản hosting được cung cấp cho phiên làm việc này, nên chưa có website thực tế được xuất bản.
