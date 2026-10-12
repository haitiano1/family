# Fam Manager 0.3.1

Ứng dụng Windows/cục bộ quản lý khách hàng, hạn sử dụng và hồ sơ Google Family. Mặc định dịch vụ là **YouTube Premium**. Node.js 24 trở lên; không cần cài thư viện ngoài.

## Cài mới trên Windows 10 / 11

1. Cài **Node.js 24 LTS** từ https://nodejs.org/ (tệp Windows `.msi`). Giữ tùy chọn mặc định; không cần cài công cụ phát triển bổ sung.
2. Trên https://github.com/haitiano1/family chọn **Code → Download ZIP**.
3. Nhấp chuột phải ZIP → **Extract All / Giải nén tất cả**. Mở thư mục chứa `START-WINDOWS.cmd`; không chạy trực tiếp trong ZIP.
4. Nhấp đúp **START-WINDOWS.cmd**, giữ cửa sổ dòng lệnh mở. Khi thấy `Fam Manager started on port 3000`, mở Chrome hoặc Edge và nhập `http://127.0.0.1:3000` vào thanh địa chỉ.
5. Lần đầu giao diện yêu cầu tạo quản trị viên. Chỉ cần chọn tên đăng nhập và mật khẩu ứng dụng; không cần mã khởi tạo. Tài khoản đầu tiên tự có quyền quản trị viên. Bước này chỉ được phép từ máy đang chạy ứng dụng và tự đóng sau khi đã tạo tài khoản.
6. Chọn tên đăng nhập từ 3 ký tự, không dấu, và mật khẩu ứng dụng từ 7 ký tự. Đây là tài khoản ứng dụng, **không phải mật khẩu Google**. Lưu mật khẩu ở nơi an toàn.
7. Tạo quản trị viên xong, đăng nhập bằng tài khoản vừa tạo.

Những lần sau chỉ chạy `START-WINDOWS.cmd` và đăng nhập. Đóng cửa sổ dòng lệnh để dừng. Không mở hai bản cùng cổng 3000; lỗi `EADDRINUSE` nghĩa là cổng đang được sử dụng.

## Cập nhật từ bản cũ — giữ dữ liệu

1. Đóng cửa sổ dòng lệnh của ứng dụng cũ. Không chạy hai bản khi cập nhật.
2. Sao chép **toàn bộ thư mục ứng dụng cũ** sang thư mục khác để làm bản sao lưu, bao gồm `data`.
3. Tải ZIP mới từ GitHub và giải nén vào một thư mục riêng.
4. Mở thư mục mới, chọn tất cả tệp/thư mục bên trong và **Copy**. Mở thư mục ứng dụng cũ chứa `START-WINDOWS.cmd`, chọn **Paste**, rồi chọn thay thế các tệp trùng tên. Gói GitHub không chứa `data`, nên thư mục dữ liệu cũ được giữ lại. Không xóa thư mục ứng dụng cũ hoặc `data`.
5. Chạy lại `START-WINDOWS.cmd` từ thư mục ứng dụng cũ. Bản mới tự nâng cấp dữ liệu, tạo thêm bản sao lưu `data/before-v4-*.sqlite` trước khi nâng cấp. Tài khoản ứng dụng và hồ sơ cũ được giữ nguyên.
6. Nếu chưa có tài khoản ứng dụng, tạo quản trị viên bằng tên đăng nhập và mật khẩu theo hướng dẫn trên; không cần mã khởi tạo. Nếu đã có, đăng nhập như trước. Mở trang ứng dụng, nhấn **Ctrl+F5** để tải giao diện mới nếu còn hiển thị bản cũ.
7. Kiểm tra lại tài khoản, Family và khách đã nhập trước đó.

Bản sao lưu trước nâng cấp không chứa người dùng mới hoặc các thay đổi sau nâng cấp. Muốn quay về bản cũ, dừng ứng dụng và phục hồi toàn bộ bản sao đã tạo ở bước 2. Không thay dữ liệu khi ứng dụng đang chạy.

## Khách và gia hạn

- **Tài khoản**: thêm hoặc sửa email quản lý và ghi chú.
- **Family**: thêm/sửa tên nhóm, tài khoản quản lý, dịch vụ và ghi chú. Một hồ sơ chứa manager và tối đa 5 khách.
- Mở Family → **Thêm khách**: email, tên, liên hệ, ngày vào, ngày hết hạn, thanh toán, số tiền đã ghi nhận và ghi chú.
- **Khách & Gia hạn**: tìm khách, lọc sắp hết hạn, đã quá hạn, chưa thanh toán đủ hoặc chưa đặt hạn.
- **Sửa / Gia hạn**: chỉnh hồ sơ, gói và thanh toán kỳ hiện tại. **Gia hạn**: theo dõi việc nhắc khách và tiền nhận cho lần tiếp theo; **Xác nhận hạn mới** hoàn tất và lưu lịch sử riêng.
- Nhắc gia hạn ở **Tổng quan** tính theo ngày Việt Nam. Hạn có hiệu lực hết ngày đã nhập; cảnh báo sắp hết hạn từ hôm nay đến 7 ngày tiếp theo. Ngày sau hạn mới là quá hạn.
- Cảnh báo chỉ hiển thị khi mở ứng dụng, không gửi email/SMS/thông báo nền. Không tự động thu tiền hoặc kick khách. Khách cũ chưa có ngày hết hạn được giữ nguyên và hiển thị “Chưa đặt hạn”.

## Trạng thái thanh toán gia hạn

Trong **Khách & Gia hạn**, thanh toán kỳ hiện tại và gia hạn tiếp theo là hai cột riêng. Khách đã trả tiền kỳ hiện tại không đồng nghĩa đã trả tiền cho kỳ tiếp theo.

1. Bấm **Gia hạn** ở dòng khách. Chọn **Chưa nhắc gia hạn**, **Đã nhắc khách**, **Chờ thanh toán**, **Đã trả một phần**, **Đã thanh toán gia hạn** hoặc **Không gia hạn**.
2. Ghi số tiền đã nhận, ngày nhận tiền và ghi chú. Với trả một phần/đã thanh toán, cần số tiền lớn hơn 0 và ngày nhận tiền không ở tương lai. Đây là dữ liệu bạn ghi nhận, không kết nối ngân hàng hoặc kiểm tra chuyển khoản.
3. **Lưu** chỉ đổi trạng thái, chưa tăng hạn. Khách trả một phần vẫn ở hạn hiện tại. Có bộ lọc chờ tiền/trả một phần, đã nhận tiền nhưng chưa cập nhật hạn, và không gia hạn.
4. Khi đã thanh toán đủ, bấm **Xác nhận hạn mới**, chọn gói và nhập ngày hết hạn mới sau hạn hiện tại, rồi xác nhận.
5. Hệ thống lưu hạn cũ/hạn mới, gói, số tiền, ngày nhận, ghi chú và người thực hiện trong **Lịch sử**; cập nhật thanh toán/số tiền của kỳ hiện tại bằng lần vừa gia hạn. Việc tăng hạn ở đây không đổi đăng ký/gói trên Google.
6. Sau xác nhận, lần gia hạn tiếp theo trở về **Chưa nhắc**, số tiền/ngày nhận tạm được làm trống; lần đã hoàn tất vẫn có trong **Lịch sử**. Số tiền ở cột kỳ hiện tại là của kỳ hiện tại, không phải tổng doanh thu.

Không tự động nhắc qua Zalo/Facebook hoặc kick khách. Nhân viên và quản trị viên được ghi nhận gia hạn; tài khoản chỉ xem được đọc lịch sử. Khách nhập từ CSV ban đầu có trạng thái gia hạn Chưa nhắc; cột Ngày pay đếm ngược không suy ra thanh toán. Nhập lại CSV hay sửa hồ sơ không xóa trạng thái/lịch sử gia hạn đã ghi nhận; nếu thông tin khách thay đổi khi hộp thoại đang mở, phải tải lại để tránh xác nhận nhầm. Chỉnh ngày hết hạn trực tiếp trong Sửa hồ sơ chỉ là sửa dữ liệu, không tạo lịch sử gia hạn hoàn tất.

## Nhập khách từ Google Sheets

1. Dừng ứng dụng và sao lưu thư mục ứng dụng gồm cả `data` trước khi cập nhật lên bản 0.3. Chạy lại và đăng nhập quản trị viên.
2. Trong Google Sheets, mở tab Family muốn nhập: **Tệp → Tải xuống → Giá trị được phân tách bằng dấu phẩy (.csv)**. Mỗi tệp chỉ chứa tab đang mở.
3. Vào **Khách & Gia hạn → Nhập khách từ CSV**, chọn tệp vừa tải.
4. Ứng dụng nhận dạng bảng cũ có email quản lý ở ô đầu, mật khẩu ở ô thứ hai, rồi Gói mua / Ngày mua / Ngày đến hạn. Ô mật khẩu đầu bảng được bỏ; cột tên và email khách phía dưới được giữ nguyên. Các cột mang tên pass/password/mật khẩu không cho chọn. Chỉ cột được chọn mới gửi tới máy ứng dụng; không lưu tệp CSV gốc.
5. Kiểm tra ghép cột: tên khách → Tên khách, mail → Email khách, gói mua → Gói mua, ngày mua → Ngày vào, ngày đến hạn → Ngày hết hạn, Contact → Liên hệ. **Ngày pay đếm ngược không nhập**; số ngày còn lại tính lại từ hạn theo ngày Việt Nam. Không gán cột này cho thanh toán hoặc số tiền.
6. Nếu có Family trùng email quản lý, hệ thống đề xuất Family đó. Nếu chưa có, quản trị viên có thể bật **Cho phép tạo hồ sơ Family/tài khoản quản lý còn thiếu**, kiểm tra email quản lý mặc định và nhập tên Family. Không tạo nhóm trên Google. CSV nhiều Family cần cột tên Family và/hoặc email quản lý; mỗi dòng phải xác định được nhóm. Nếu tên Family trùng nhau thì cần email quản lý để phân biệt.
7. Chọn **Bỏ qua** khách trùng (mặc định) hoặc **Cập nhật cột đã chọn**. Khi cập nhật, cột không chọn và ô trống giữ nguyên thông tin cũ; không chuyển khách qua Family khác. Email trùng trong cùng Family của CSV giữ dòng đầu; email ở Family khác là hồ sơ riêng.
8. Bấm **Xem trước dữ liệu**. Kiểm tra số khách, Family mới, gói, ngày mua, ngày hết hạn và dòng lỗi, rồi chọn **Xác nhận nhập**. Xem trước không ghi cơ sở dữ liệu. Nếu có dòng lỗi hoặc Family quá 5 khách thì không nhập dòng nào; sửa tệp và xem trước lại. Nếu dữ liệu ứng dụng thay đổi sau xem trước, phải xem trước lại.
9. Kiểm tra danh sách khách; tiếp tục với tab Family khác. Không gửi mật khẩu hoặc tệp khách lên GitHub. Bạn không cần chia sẻ Google Sheet hoặc cung cấp thông tin đăng nhập Google cho ứng dụng.

Nhận ngày `dd/mm/yyyy` hoặc `yyyy-mm-dd`; gói `1, 2, 3, 6, 12 tháng`; thanh toán “Đã thanh toán”, “Chưa thanh toán”, “Thanh toán một phần” nếu sheet có cột riêng. Nếu không có thanh toán, khách mới có trạng thái **Chưa ghi nhận**, không bị coi là chưa trả tiền. Số tiền nhận số nguyên VND như `100000`, `100.000`, `100,000`. Contact giữ nguyên liên kết Facebook/Zalo hoặc ghi chú (tối đa 1000 ký tự). Giới hạn mỗi tệp 1 MB, 10.000 khách, 100 cột; xem trước hiển thị tối đa 200 dòng và 200 lỗi đầu. Hỗ trợ CSV UTF-8, dấu phẩy/chấm phẩy/tab, dấu nháy và ô có xuống dòng; chưa nhập trực tiếp XLSX hoặc tự đồng bộ Google Sheets.

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
