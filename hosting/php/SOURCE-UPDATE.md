# Cập nhật trực tiếp trên Hostinger, không cần ZIP

Thêm Xóa khỏi lưu trữ và chuyển hồ sơ Sản phẩm khác vào Khách lưu trữ khi chọn Xóa. Chỉ thay 4 file sau, giữ config.php và database đang dùng.

1. Trong app, Sao lưu / Chuyển dữ liệu → Tải file sao lưu.
2. Mở hPanel → Websites → Dashboard website Family → Files → File Manager.
3. Mở link mã nguồn ở bảng dưới. Ctrl+A, Ctrl+C để sao chép toàn bộ nội dung. Trong File Manager, mở đúng file tương ứng bằng Edit, Ctrl+A, Ctrl+V rồi Save. Làm theo thứ tự từ trên xuống.

| File trên Hostinger | Nội dung mới |
| --- | --- |
| family-private/business.php | [Mở mã nguồn](https://raw.githubusercontent.com/haitiano1/family/main/hosting/php/family-private/business.php) |
| family-private/audit.php | [Mở mã nguồn](https://raw.githubusercontent.com/haitiano1/family/main/hosting/php/family-private/audit.php) |
| public_html/api.php | [Mở mã nguồn](https://raw.githubusercontent.com/haitiano1/family/main/hosting/php/public_html/api.php) |
| public_html/app.js | [Mở mã nguồn](https://raw.githubusercontent.com/haitiano1/family/main/public/app.js) |

Nếu link mở hộp tải file thay vì hiển thị chữ, tải file đó rồi Upload vào đúng thư mục thay file trùng. Không tải và đưa cả thư mục lồng vào nhau. Không sửa config.php, không cần sửa PHP/MySQL/SQL hay nhập lại khách.

4. Nhấn Ctrl+F5 trên website, hoặc đóng rồi mở lại Family trên iPhone.
5. Khách lưu trữ: có Xem dữ liệu / Khôi phục / Xóa khỏi lưu trữ. Hủy trong hộp xóa giữ hồ sơ. Xác nhận xóa bỏ hồ sơ lưu trữ và khả năng khôi phục bằng nút; nhật ký giữ dữ liệu trước xóa, lịch sử gia hạn vẫn được giữ. Không xóa khách hoạt động hoặc hồ sơ đã khôi phục.
6. Sản phẩm khác: nút Xóa mở xác nhận Chuyển vào lưu trữ. Sau khi lưu, app mở Khách lưu trữ và hiện đúng tên sản phẩm. Khôi phục đưa lại vào Sản phẩm khác, giữ Contact/gói/hạn/thanh toán/ghi chú, không cần Family. Có Xóa khỏi lưu trữ để bỏ hồ sơ lưu trữ khi muốn.

Mục Khách vừa gia hạn vẫn chỉ xem các lần xác nhận trong 14 ngày; không tự xóa hoặc lưu trữ khách hoạt động. Lịch sử gia hạn và nhật ký của các thao tác mới được giữ. Không phục hồi các hồ sơ sản phẩm đã bị xóa từ phiên bản cũ trong lần cập nhật này.

Backup mới là v5, nhận cả backup v1–v4 cũ. Bản ứng dụng cũ không nhận v5; dùng mã nguồn mới để khôi phục hồ sơ sản phẩm lưu trữ đúng loại. Chưa tạo lại các ZIP cho bản cập nhật này theo yêu cầu của người dùng.
