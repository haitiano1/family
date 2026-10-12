# Fam Manager 0.2

Ứng dụng Windows/cục bộ quản lý khách hàng, hạn sử dụng và hồ sơ Google Family. Mặc định dịch vụ là **YouTube Premium**. Node.js 24 trở lên; không cần cài thư viện ngoài.

## Cài mới trên Windows 10 / 11

1. Cài **Node.js 24 LTS** từ https://nodejs.org/ (tệp Windows `.msi`). Giữ tùy chọn mặc định; không cần cài công cụ phát triển bổ sung.
2. Trên https://github.com/haitiano1/family chọn **Code → Download ZIP**.
3. Nhấp chuột phải ZIP → **Extract All / Giải nén tất cả**. Mở thư mục chứa `START-WINDOWS.cmd`; không chạy trực tiếp trong ZIP.
4. Nhấp đúp **START-WINDOWS.cmd**, giữ cửa sổ dòng lệnh mở. Khi thấy `Fam Manager started on port 3000`, mở Chrome hoặc Edge và nhập `http://127.0.0.1:3000` vào thanh địa chỉ.
5. Lần đầu giao diện yêu cầu tạo quản trị viên. Tìm dòng `First admin setup code: ...` trong cửa sổ dòng lệnh, nhập phần mã sau dấu `:` vào ô **Mã khởi tạo**. Mã đổi mỗi lần khởi động cho đến khi đã tạo quản trị viên.
6. Chọn tên đăng nhập từ 3 ký tự, không dấu, và mật khẩu ứng dụng từ 12 ký tự. Đây là tài khoản ứng dụng, **không phải mật khẩu Google**. Lưu mật khẩu ở nơi an toàn.
7. Tạo quản trị viên xong, đăng nhập bằng tài khoản vừa tạo.

Những lần sau chỉ chạy `START-WINDOWS.cmd` và đăng nhập. Đóng cửa sổ dòng lệnh để dừng. Không mở hai bản cùng cổng 3000; lỗi `EADDRINUSE` nghĩa là cổng đang được sử dụng.

## Cập nhật từ bản cũ — giữ dữ liệu

1. Đóng cửa sổ dòng lệnh của ứng dụng cũ. Không chạy hai bản khi cập nhật.
2. Sao chép **toàn bộ thư mục ứng dụng cũ** sang thư mục khác để làm bản sao lưu, bao gồm `data`.
3. Tải ZIP mới từ GitHub và giải nén vào một thư mục riêng.
4. Mở thư mục mới, chọn tất cả tệp/thư mục bên trong và **Copy**. Mở thư mục ứng dụng cũ chứa `START-WINDOWS.cmd`, chọn **Paste**, rồi chọn thay thế các tệp trùng tên. Gói GitHub không chứa `data`, nên thư mục dữ liệu cũ được giữ lại. Không xóa thư mục ứng dụng cũ hoặc `data`.
5. Chạy lại `START-WINDOWS.cmd` từ thư mục ứng dụng cũ. Bản mới tự nâng cấp dữ liệu, tạo thêm bản sao lưu `data/before-v2-*.sqlite` trước khi nâng cấp.
6. Tạo tài khoản quản trị viên theo hướng dẫn trên. Mở trang ứng dụng, nhấn **Ctrl+F5** để tải giao diện mới nếu còn hiển thị bản cũ.
7. Kiểm tra lại tài khoản, Family và khách đã nhập trước đó.

Bản sao lưu trước nâng cấp không chứa người dùng mới hoặc các thay đổi sau nâng cấp. Muốn quay về bản cũ, dừng ứng dụng và phục hồi toàn bộ bản sao đã tạo ở bước 2. Không thay dữ liệu khi ứng dụng đang chạy.

## Khách và gia hạn

- **Tài khoản**: thêm hoặc sửa email quản lý và ghi chú.
- **Family**: thêm/sửa tên nhóm, tài khoản quản lý, dịch vụ và ghi chú. Một hồ sơ chứa manager và tối đa 5 khách.
- Mở Family → **Thêm khách**: email, tên, liên hệ, ngày vào, ngày hết hạn, thanh toán, số tiền đã ghi nhận và ghi chú.
- **Khách & Gia hạn**: tìm khách, lọc sắp hết hạn, đã quá hạn, chưa thanh toán đủ hoặc chưa đặt hạn.
- **Sửa / Gia hạn**: thay ngày hết hạn và trạng thái thanh toán; lịch sử được lưu trong nhật ký.
- Nhắc gia hạn ở **Tổng quan** tính theo ngày Việt Nam. Hạn có hiệu lực hết ngày đã nhập; cảnh báo sắp hết hạn từ hôm nay đến 7 ngày tiếp theo. Ngày sau hạn mới là quá hạn.
- Cảnh báo chỉ hiển thị khi mở ứng dụng, không gửi email/SMS/thông báo nền. Không tự động thu tiền hoặc kick khách. Khách cũ chưa có ngày hết hạn được giữ nguyên và hiển thị “Chưa đặt hạn”.

## Đăng nhập và phân quyền

| Vai trò | Quyền |
| --- | --- |
| Quản trị viên | Toàn bộ hồ sơ, yêu cầu Google, xóa hồ sơ Family/tài khoản và quản lý người dùng |
| Nhân viên | Xem, thêm/sửa hồ sơ, quản lý khách, ghi nhận yêu cầu/kết quả; không xóa Family/tài khoản quản lý hoặc yêu cầu xóa Google Family |
| Chỉ xem | Đọc dữ liệu; không tạo/sửa/xóa hồ sơ hoặc kết quả |

Vào **Người dùng** bằng tài khoản quản trị viên để tạo tài khoản, sửa quyền, khóa người dùng hoặc đặt mật khẩu mới. Không thể tự khóa/hạ quyền tài khoản quản trị viên đang sử dụng hoặc bỏ quản trị viên hoạt động cuối cùng. Mọi vai trò hiện xem được toàn bộ khách; chưa có phân công khách riêng cho nhân viên.

Vào **Tài khoản ứng dụng** để đổi mật khẩu của mình. Đổi mật khẩu/quyền hoặc khóa tài khoản sẽ đăng xuất các phiên của người đó. Phiên có thời hạn 8 giờ. Mật khẩu được băm bằng scrypt với salt riêng; cookie HttpOnly/SameSite và CSRF bảo vệ yêu cầu thay đổi. Máy cục bộ vẫn là phạm vi được hỗ trợ; chưa triển khai truy cập Internet hoặc nhiều máy. Bản sao SQLite chứa dữ liệu khách và hash mật khẩu, cần giữ riêng tư. Nếu quên mật khẩu và không còn quản trị viên khác, hiện chưa có quy trình khôi phục tự phục vụ; không xóa cơ sở dữ liệu để thử sửa lỗi.

## Google / YouTube Premium

**Chưa có tự động hóa hoặc đồng bộ trực tiếp với Google.** API YouTube công khai được kiểm tra không có thao tác quản lý Family Premium hoặc kiểm tra ưu đãi trial. API `members`/`membershipsLevels` dành cho hội viên kênh, không phải Family Premium.

1. Từ Family hoặc tài khoản, tạo yêu cầu mời/kick, xóa nhóm, đổi mật khẩu, thiết lập 2FA, kiểm tra trial hoặc healthcheck.
2. Trang chi tiết Job hiển thị tài khoản cần đăng nhập và nút **Mở trang Google**.
3. Đăng nhập **đúng tài khoản** trên Google, kiểm tra đúng đối tượng, tự thực hiện thao tác và xác minh kết quả ở đó.
4. Quay lại Job → **Ghi nhận kết quả**, chọn đã làm/thất bại/hủy và nhập ghi chú.
5. Kết quả có nhãn **tự xác nhận**, không phải kết quả ứng dụng đã xác minh. Hồ sơ thành viên không tự thay đổi; chỉ chỉnh hồ sơ khi bạn đã kiểm tra thực tế.

Ứng dụng không thu thập mật khẩu Google, OTP, mã khôi phục hoặc cookie Google; không lưu chúng trong ghi chú. Đọc điều kiện YouTube về gói Family, nơi cư trú, nhóm gia đình và việc đổi nhóm trước khi sử dụng. Việc mở liên kết không tự chọn tài khoản Google hoặc thực hiện thao tác.

Nguồn để đối chiếu khả năng và điều kiện:
- https://github.com/googleapis/discovery-artifact-manager/blob/master/discoveries/youtube.v3.json
- https://github.com/googleapis/discovery-artifact-manager/blob/master/discoveries/index.json
- https://developers.google.com/youtube/v3/docs
- https://support.google.com/youtube/answer/7507349?hl=vi

Các trang Google đăng nhập và kết quả Premium thực tế cần được kiểm thử trên máy/tài khoản của bạn. Chưa có credentials hoặc công cụ được cấp quyền để triển khai thao tác tự động. Không coi danh sách API công khai là bằng chứng Google không có API nội bộ.

## Phát triển và cloud

```sh
cd /workspace/family
npm test
npm start
```

`npm run dev` bật tự khởi động lại khi sửa mã. Dùng checkout có sẵn; môi trường cloud đã cô lập, không tạo Git worktree trừ khi được yêu cầu. Node.js 24+ cung cấp `node:sqlite`. Không cần `npm install`. `DATA_DIR` và `PORT` có thể đổi nơi lưu và cổng. Mặc định giữ `HOST=127.0.0.1`; Host header ngoài localhost/loopback bị từ chối. Không expose bản này trực tiếp ra Internet.

Dữ liệu ở `data/family.sqlite`, bị loại khỏi Git. Session nằm trong SQLite nên có thể còn hiệu lực sau khởi động lại đến khi hết hạn; tiến trình server phải khởi động lại trong task mới. `GET /api/auth/status` là kiểm tra khởi động công khai; `GET /api/state` yêu cầu đăng nhập. Kiểm thử dùng cơ sở dữ liệu tạm và bao gồm nâng cấp bản cũ, quyền truy cập, CSRF, phiên đăng nhập, giới hạn thử đăng nhập, khách/gia hạn, tác vụ thủ công và tính lặp lại.
