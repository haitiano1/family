# Sửa ngày nhận tiền gia hạn — 0.18.1

## Cập nhật trên Hostinger

1. Tải bản sao dữ liệu hiện tại trên website. Đóng các tab Family trong lúc upload.
2. Giải nén **family-sua-ngay-nhan-tien.zip**. Upload nội dung thư mục **family-private** vào family-private đang dùng; nội dung **public_html** vào public_html đang dùng. Chọn ghi đè mã nguồn tương ứng. Giữ **config.php** và database hiện tại; gói không chứa cấu hình thật hay dữ liệu khách.
3. Mở lại website, nhấn Ctrl+F5. Không cần chạy SQL hoặc thay Apps Script, URL /exec, token.

## Quy tắc ngày nhận tiền

- Chờ thanh toán, Chưa liên hệ, Đã nhắc và Không gia hạn: không lưu ngày nhận tiền; ô ngày để trống và không cho nhập.
- Chuyển sang Đã thanh toán hoặc Trả một phần: mặc định ngày hiện tại theo giờ Việt Nam, tính tại lúc chọn trạng thái. Bạn có thể chọn ngày thực nhận trước đó nếu đang nhập bù.
- Ngày chờ bị lưu nhầm từ bản cũ không được lấy lại khi chuyển sang Đã thanh toán. Khi sửa cùng trạng thái đã nhận tiền, giữ ngày thực nhận đã lưu.
- Chuyển từ Trả một phần sang Đã thanh toán: mặc định hôm nay, là ngày nhận đủ; không tự dùng lại ngày trả một phần trước đó.
- API cũng xóa ngày khi lưu trạng thái chưa nhận tiền, và mặc định hôm nay khi lưu trạng thái đã nhận tiền mà bỏ trống ngày.

Ví dụ hạn cũ 10/09, chọn Chờ thanh toán 15/10, đến 23/10 mới nhận tiền và chọn Đã thanh toán: ngày nhận tiền là 23/10. Gia hạn 3 tháng vẫn nối kỳ 10/09–10/12 và thống kê lượt/tiền ở tháng 9 sau khi hoàn tất.

## Lịch sử đã hoàn tất

Bản cập nhật không tự thay các ngày nhận tiền trong lịch sử đã hoàn tất: ngày nhận tiền có thể khác ngày xác nhận khi nhập bù. Vì thế một dòng đã lưu sai từ trước vẫn cần được đối chiếu và sửa riêng. Không bấm gia hạn thêm lần nữa chỉ để sửa ngày nhận tiền, vì thao tác đó tạo thêm kỳ gia hạn.
