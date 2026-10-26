# Cập nhật thống kê mua mới và kỳ gia hạn — 0.16.0

## Cài trên website Hostinger hiện có

1. Trên website, tải file sao lưu JSON trong **Sao lưu / Chuyển dữ liệu**, rồi đóng các tab website Family trong lúc upload.
2. Giải nén gói cập nhật. Upload các file **bên trong family-private** vào đúng thư mục family-private hiện có; chọn thay file trùng, giữ nguyên config.php. Upload tương tự nội dung **public_html** vào public_html hiện có.
3. Mở lại website, nhấn **Ctrl+F5**. Ứng dụng tự thêm bảng lịch sử mua mới, giữ dữ liệu hiện có. Không tạo database mới hoặc khôi phục/import lại khách.
4. Bản cập nhật này không cần thay Code.gs hoặc triển khai lại Apps Script; giữ kết nối Sheet đang chạy.

## Quy tắc đã chốt

- Trong hồ sơ khách, chọn **Trạng thái thành viên → Mua mới**, điền Ngày mua và số tiền đã ghi nhận rồi Lưu. Khách Mua mới vẫn chiếm một chỗ trong Family như khách Đã vào.
- Lần đầu đánh dấu tạo một bản ghi mua mới, tính vào tháng của Ngày mua. Lưu lại, đổi trạng thái, gia hạn, chuyển Family, lưu trữ/khôi phục không tạo thêm lượt hoặc chuyển lượt này sang tháng khác. Thông tin và số tiền trong lịch sử là bản chụp tại lần đánh dấu đầu tiên; hãy kiểm tra trước khi Lưu.
- Các khách cũ không tự bị gán Mua mới. Chỉ đánh dấu những hồ sơ cần ghi nhận; không suy đoán doanh số mua mới từ ngày thêm hồ sơ.
- **Khách mua mới** nằm dưới lịch sử gia hạn, phía trên **6 tháng gần nhất**. Phần 6 tháng mặc định thu gọn; nhấn tiêu đề để mở.
- Tháng thống kê và tìm kiếm dùng chung cho hai bảng, phân trang riêng. Tìm kiếm không làm thay đổi số tổng của tháng. Số khách đếm theo email khác nhau; số lượt và tiền cộng theo các bản ghi.
- Gia hạn chỉ cộng cả khách/lượt và tiền sau khi đã trả đủ và xác nhận hạn mới. Tháng thống kê là tháng của **hạn cũ**. Ví dụ hạn cũ **10/09/2026**, trả tiền **21/10/2026**, gia hạn **3 tháng**: ngày mua mới **10/09**, hạn mới **10/12**, thống kê vào **tháng 9**, ngày nhận tiền vẫn là **21/10**.
- Cách cộng hạn hiện tại được giữ nguyên. Thay đổi thống kê cũng áp dụng cho lịch sử đã có, nên tổng các tháng cũ có thể thay đổi đúng theo hạn cũ; ngày nhận tiền/ngày xác nhận trong lịch sử không bị sửa.
- Thẻ **Đã thu tiền, cần cập nhật hạn** trên Tổng quan đã được bỏ.

## Sao lưu và đồng bộ

Sao lưu mới dùng định dạng **v8**, chứa cả lịch sử mua mới. Bản cập nhật này vẫn đọc được sao lưu v1–v7; bản ứng dụng cũ chưa hỗ trợ khôi phục sao lưu v8. Hãy giữ file sao lưu trước khi cập nhật.

Đồng bộ Sheet vẫn chuyển trạng thái thành viên trong dữ liệu kỹ thuật sẵn có của tab Khách; không thêm cột hiển thị. Lịch sử thống kê mua mới được giữ trên database website và trong file sao lưu, không phải một tab Sheet mới. Không sửa các cột kỹ thuật bị ẩn.

## Kiểm tra sau cập nhật

Mở hồ sơ khách để thấy lựa chọn Mua mới; vào Thống kê để thấy bảng mới và menu 6 tháng. Với một khách đã gia hạn trễ, chọn tháng của hạn cũ và đối chiếu ngày nhận tiền. Không gia hạn lại khách chỉ để kiểm tra thống kê.
