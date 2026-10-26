# Lưu và xác nhận dữ liệu Kho trước khi chỉnh hiển thị

Bản Apps Script **family-groups-compact-v5.7**. Dùng với file PHP nhập tài khoản đã cập nhật trước đó; không cần upload lại PHP, đổi Sheet, URL /exec hoặc mã kết nối.

## Thay đổi

Lỗi tại “xác nhận bố cục Kho A:I”, dòng 1 cột 1 cho biết script vẫn đọc được tiêu đề khác mẫu mới sau thao tác ghi. Các kiểm tra trước đã loại trừ khác file/phiên bản hoặc chỉ chưa tải lại giao diện theo thông tin người dùng cung cấp. Chưa xác minh trực tiếp nguyên nhân từ Google thật.

Trong mã trước, thao tác ghi tài khoản và định dạng được thực hiện trước khi gọi flush cuối. Google có cơ chế gom thao tác ghi; việc không có bước lưu/xác nhận trước lệnh trình bày gây khó xác định lỗi. Kiểm thử mô phỏng việc lỗi trình bày loại bỏ thay đổi còn chờ đã tái hiện đúng lỗi A1.

Bản v5.4 thực hiện theo thứ tự:

1. Chuẩn bị toàn bộ dữ liệu, kiểm tra ngày.
2. Ghi hàng tiêu đề chuẩn và các dòng tài khoản.
3. **Gọi flush để gửi xong dữ liệu sang Google.**
4. **Đọc lại và đối chiếu đầy đủ tiêu đề A:I cùng toàn bộ trường tài khoản trước khi định dạng.**
5. Chỉnh từng thao tác hiển thị, flush và bắt lỗi riêng. Lỗi cố định hàng không được coi là thành công của thao tác đó, nhưng cũng không thay cho kiểm tra dữ liệu.
6. Đối chiếu cuối rồi in URL đúng file/tab và xác nhận bố cục mới.

Các giá trị người dùng nhập vẫn được ghi dạng văn bản để giữ mật khẩu/khóa và tránh chạy chuỗi thành công thức. Hàng tiêu đề là các tên cột cố định, ghi trực tiếp theo đúng mẫu. Không tự xóa Google Table “Bảng_1”, các cột hoặc dữ liệu để vượt lỗi.

## Cập nhật

1. Đóng các tab website Family, chờ khoảng một phút để lượt đồng bộ đang chạy kết thúc. Giữ các bản dự phòng Kho_du_phong_….
2. Trong đúng dự án Apps Script, thay toàn bộ Code.gs bằng file trong gói, bấm Lưu. Giữ nguyên Script Properties và appsscript.json.
3. Cập nhật bản triển khai hiện tại: Triển khai → Quản lý các bản triển khai → bút chì → Phiên bản mới → Triển khai. Giữ URL /exec và quyền Bất kỳ ai. Mở đúng URL đang lưu trên web, kiểm tra phiên bản **family-groups-compact-v5.7**.
4. Chọn **apDungBoCucKho → Chạy**. Hàm tạo bản dự phòng trước khi đổi.
5. Khi nhật ký có **ĐÃ XÁC NHẬN BỐ CỤC MỚI: A=Ngày trial, B=Email, ID ở H:I**, bấm URL sau **MỞ TAB ĐÃ ĐỐI CHIẾU** và tải lại tab đó.
6. Nếu dữ liệu đã đối chiếu khớp nhưng còn cảnh báo “cố định hàng 1”, chỉ bỏ qua phần cố định hàng; phải nhìn thấy Ngày trial ở A và Email ở B trước khi nhập thêm.
7. Khi bố cục đúng, mở lại website, vào Kho, mở khóa và bấm Đồng bộ ngay.

Nếu còn lỗi, thông báo mới phân biệt rõ **lưu dữ liệu Kho vào Google**, **xác nhận bố cục trước khi định dạng**, **đối chiếu dữ liệu trước khi định dạng** với phần chỉnh hiển thị. Giữ bản dự phòng và gửi nguyên dòng lỗi, không gửi dữ liệu các hàng tài khoản. Không lặp lại thao tác hoặc tự xóa cột để vượt qua kiểm tra.

## Kiểm chứng

30 kiểm thử Apps Script và 3 kiểm thử chẩn đoán file đã đạt. Các tình huống mới gồm thay đổi chưa lưu bị hủy bởi lỗi định dạng mô phỏng, lỗi báo trễ trong flush định dạng, lỗi flush dữ liệu phải dừng trước mọi thao tác trình bày, giữ toàn bộ thông tin/ID và không ghi bí mật trong lỗi. Chưa chạy trên tài khoản Google thật; việc bản sửa xử lý được Sheet hiện tại cần người dùng áp dụng và đối chiếu.
