# Cập nhật YouTube Family 0.11.1

Bản này gộp đầy đủ các thay đổi trước đây chưa đóng gói và các yêu cầu mới. Dùng **gói cập nhật** cho website Family đang chạy; giữ cấu hình và dữ liệu hiện có.

## Các bước cập nhật website đang dùng

1. Trong app, chọn **Sao lưu / Chuyển dữ liệu → Tải file sao lưu** và giữ file JSON trên máy tính.
2. Tải [family-hostinger-update.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger-update.zip), rồi **giải nén trên máy tính**. Bên trong có hai thư mục `family-private`, `public_html` và hướng dẫn này.
3. Mở hPanel → Websites → Dashboard của **đúng website Family** → Files → File Manager. Mở thư mục `family-private` hiện có, đang chứa `config.php`. Upload **các file bên trong family-private của gói cập nhật**, chọn thay file trùng. **Giữ nguyên config.php**.
4. Mở `public_html` chính của website. Upload **các file bên trong public_html của gói cập nhật**, chọn thay file trùng. Đưa file vào ngay thư mục đang dùng, không tạo `public_html/public_html` hoặc `family-private/family-private`.
5. Mở lại website và nhấn **Ctrl+F5**. Trên iPhone, tải lại trang trong Safari hoặc đóng rồi mở lại Family trên màn hình chính.

Không cần tạo database, sửa SQL hay nhập lại khách. Gói không chứa config.php, mật khẩu, dữ liệu khách hoặc backup. Website giữ database hiện tại; nếu còn dùng schema cũ, ứng dụng tự thêm các cột cần thiết. Cài mới dùng [family-hostinger.zip](https://github.com/haitiano1/family/raw/refs/heads/main/downloads/family-hostinger.zip) và [INSTALL.md](INSTALL.md).

## Bổ sung trong bản 0.11.1

Bấm email trên thẻ Chờ fix/Đang fix/Đã fix sẽ mở trang chi tiết đúng Family cùng toàn bộ thành viên đang ghi nhận, áp dụng cho cả mail chủ Family và mail khách. Mail liên kết bằng ID Family nên sau đổi mail khi Done vẫn mở đúng nhóm. Icon copy bên cạnh chỉ sao chép, không chuyển trang. Family đã lưu trữ đưa về Khách lưu trữ; case không còn Family vẫn giữ email/copy.

Gói 0.11.1 đã chứa mọi thay đổi của 0.11. Dùng cùng các bước cập nhật ở trên kể cả bạn chưa cài 0.11. Nếu đã cập nhật đầy đủ 0.11 trước đó, thay `public_html/app.js` và `public_html/style.css` từ gói mới rồi tải lại trang là đủ cho bổ sung này.

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

Backup hiện tại là **v5**, nhận bản v1–v4 cũ; không dùng ứng dụng cũ để nhập backup v5. Cả ZIP cài mới, ZIP cập nhật và helper xuất Windows đã được tạo lại cho bản này. Không thể tự phục hồi sản phẩm đã bị xóa hẳn từ bản cũ trước khi tính năng lưu trữ được bổ sung.
