# Fam Manager

Ứng dụng quản lý nội bộ tài khoản và hồ sơ Google Family, giao diện tiếng Việt theo mẫu được cung cấp. Dữ liệu SQLite được lưu tại `data/family.sqlite`.

## Dành cho Windows 10 / 11

1. Cài **Node.js 24 LTS** từ trang chính thức https://nodejs.org/ (tệp cài đặt Windows `.msi`). Giữ tùy chọn mặc định; không cần cài công cụ phát triển bổ sung.
2. Trên trang GitHub của kho này, chọn **Code → Download ZIP**.
3. Nhấp chuột phải vào ZIP, chọn **Extract All / Giải nén tất cả**. Mở thư mục chứa `START-WINDOWS.cmd` bên trong thư mục vừa giải nén; không chạy trực tiếp từ ZIP.
4. Nhấp đúp **START-WINDOWS.cmd**. Giữ cửa sổ dòng lệnh mở.
5. Khi thấy `Fam Manager started on port 3000`, mở Chrome hoặc Edge và nhập `http://127.0.0.1:3000` vào thanh địa chỉ.
6. Thêm tài khoản, tạo hồ sơ Family, rồi ghi nhận thành viên. Các yêu cầu Google chỉ được lưu ở trạng thái chờ tích hợp.

Những lần sau, chạy lại `START-WINDOWS.cmd` và mở cùng địa chỉ. Đóng cửa sổ dòng lệnh để dừng. Dữ liệu được lưu trong thư mục `data`; sau khi dừng ứng dụng, sao lưu cả thư mục ứng dụng để giữ dữ liệu.

Nếu không tìm thấy Node.js, cài lại Node.js rồi mở lại tệp khởi động. Nếu báo `EADDRINUSE`, kiểm tra cửa sổ ứng dụng đã mở trước đó: chỉ cần chạy một bản trên cổng 3000.

## Chạy

Yêu cầu Node.js 24 trở lên. Không cần cài thư viện ngoài.

```sh
cd /workspace/family
npm start
```

Mặc định lắng nghe trên `127.0.0.1:3000`. `npm run dev` bật tự khởi động lại khi sửa mã. Có thể cấu hình `PORT`, `HOST`, `DATA_DIR`.

```sh
npm test
```

## Chức năng hiện tại

- Thêm tài khoản email và ghi chú, tìm kiếm và lọc theo hồ sơ Family.
- Tạo và xóa hồ sơ Family nội bộ, ghi nhận tối đa 5 thành viên cùng tài khoản quản lý.
- Xem chi tiết tài khoản, danh sách Jobs và nhật ký hoạt động.
- Ghi nhận yêu cầu mời/kick thành viên, xóa Google Family, đổi mật khẩu, thiết lập 2FA, kiểm tra trial và healthcheck.

**Chưa tích hợp Google.** Mọi yêu cầu Google có trạng thái `blocked` (Chờ tích hợp); không có tác vụ nào được chạy hoặc báo thành công giả. Danh sách thành viên là dữ liệu nhập thủ công. Không thu thập mật khẩu, OTP hoặc mã khôi phục.

## Phạm vi triển khai

Bản đầu tiên dùng cho phát triển và chạy cục bộ, chưa có xác thực người dùng. Giữ địa chỉ mặc định trên loopback. Trước khi cung cấp cho nhiều người hoặc public cần thêm xác thực, phân quyền, bảo vệ CSRF, sao lưu và chính sách lưu trữ dữ liệu.

Tích hợp thực tế cần xác định công cụ/API được cấp quyền cho từng khả năng, phương thức xác thực và worker thực thi; không mặc định Google có API công khai cho mọi thao tác Family.

## Môi trường cloud

Dùng checkout có sẵn `/workspace/family`; môi trường đã được cô lập, không cần tạo Git worktree. Tiến trình phải khởi động lại trong task mới. Kiểm tra `GET /api/state` sau khi chạy `npm start`.
