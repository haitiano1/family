# Fam Manager 0.3.4

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
5. Chạy lại `START-WINDOWS.cmd` từ thư mục ứng dụng cũ. Bản mới tự nâng cấp dữ liệu, tạo thêm bản sao lưu `data/before-v7-*.sqlite` trước khi nâng cấp. Tài khoản ứng dụng và hồ sơ cũ được giữ nguyên.
6. Nếu chưa có tài khoản ứng dụng, tạo quản trị viên bằng tên đăng nhập và mật khẩu theo hướng dẫn trên; không cần mã khởi tạo. Nếu đã có, đăng nhập như trước. Mở trang ứng dụng, nhấn **Ctrl+F5** để tải giao diện mới nếu còn hiển thị bản cũ.
7. Kiểm tra lại tài khoản, Family và khách đã nhập trước đó.

Bản sao lưu trước nâng cấp không chứa người dùng mới hoặc các thay đổi sau nâng cấp. Muốn quay về bản cũ, dừng ứng dụng và phục hồi toàn bộ bản sao đã tạo ở bước 2. Không thay dữ liệu khi ứng dụng đang chạy.

## Khách và gia hạn

- **Tài khoản**: thêm hoặc sửa email quản lý và ghi chú.
- **Family**: thêm/sửa tên nhóm, tài khoản quản lý, dịch vụ và ghi chú. Một Family ghi nhận tối đa 5 chỗ thành viên cùng manager; hồ sơ khách đã mời nhưng chưa vào được giữ riêng và chưa tính chỗ.
- Mở Family → **Thêm khách**: email, tên, liên hệ, ngày vào, ngày hết hạn, thanh toán, số tiền đã ghi nhận và ghi chú.
- **Khách & Gia hạn**: tìm khách, lọc sắp hết hạn, đã quá hạn, chưa thanh toán đủ hoặc chưa đặt hạn.
- **Sửa / Gia hạn**: chỉnh hồ sơ, gói và thanh toán kỳ hiện tại. **Gia hạn**: theo dõi việc nhắc khách và tiền nhận cho lần tiếp theo; **Xác nhận hạn mới** hoàn tất và lưu lịch sử riêng.
- Nhắc gia hạn ở **Tổng quan** tính theo ngày Việt Nam. Hạn có hiệu lực hết ngày đã nhập; cảnh báo sắp hết hạn từ hôm nay đến 2 ngày tiếp theo. Ngày sau hạn mới là quá hạn.
- Cảnh báo chỉ hiển thị khi mở ứng dụng, không gửi email/SMS/thông báo nền. Không tự động thu tiền hoặc kick khách. Khách cũ chưa có ngày hết hạn được giữ nguyên và hiển thị “Chưa đặt hạn”.

## Trạng thái thanh toán gia hạn

Trong **Khách & Gia hạn**, thanh toán kỳ hiện tại và gia hạn tiếp theo là hai cột riêng. Khách đã trả tiền kỳ hiện tại không đồng nghĩa đã trả tiền cho kỳ tiếp theo.

1. Bấm **Gia hạn** ở dòng khách. Chọn **Chưa nhắc gia hạn**, **Đã nhắc khách**, **Chờ thanh toán**, **Đã trả một phần**, **Đã thanh toán gia hạn** hoặc **Không gia hạn**.
2. Ghi số tiền đã nhận, ngày nhận tiền và ghi chú. Với trả một phần/đã thanh toán, cần số tiền lớn hơn 0 và ngày nhận tiền không ở tương lai. Đây là dữ liệu bạn ghi nhận, không kết nối ngân hàng hoặc kiểm tra chuyển khoản.
3. Chọn gói gia hạn. Mặc định bật **Tự cập nhật ngày mua và hạn khi đã thanh toán đủ**. Khi trạng thái Đã thanh toán gia hạn, bấm **Lưu gia hạn** sẽ ghi tiền, tự cập nhật ngày mua/hạn và lưu lịch sử trong một lần. Chờ tiền/trả một phần chỉ ghi nhận trạng thái, không đổi ngày. Bỏ dấu chọn nếu chỉ muốn ghi nhận tiền trước, chưa tăng hạn.
4. Với khách đã trả đủ tiền nhưng chưa tăng hạn, vẫn có **Xác nhận hạn mới**: chọn gói và xem trước ngày tự tính rồi xác nhận. Ngày mua mới là ngày bắt đầu kỳ mới, không phải ngày nhận tiền. Luôn nối kỳ từ ngày hết hạn cũ, kể cả khách trả tiền muộn hoặc đã quá hạn; ngày nhận tiền không thay đổi mốc kỳ. Ví dụ hết hạn 05/01/2026, trả tiền 15/01/2026 và gia hạn 3 tháng thì kỳ mới là 05/01/2026–05/04/2026. Nếu chưa có hạn cũ, cần bổ sung ngày hết hạn trước khi gia hạn. Ví dụ kỳ 05/10/2026–05/01/2027, gia hạn sớm gói 3 tháng thành 05/01/2027–05/04/2027. Ngày cuối tháng được giới hạn đúng số ngày của tháng, kể cả năm nhuận.
5. Hệ thống lưu ngày mua cũ/mới, hạn cũ/mới, gói, số tiền, ngày nhận tiền riêng, ghi chú và người thực hiện trong **Lịch sử**; cập nhật thanh toán/số tiền của kỳ hiện tại bằng lần vừa gia hạn. Việc tăng hạn ở đây không đổi đăng ký/gói trên Google.
6. Sau xác nhận, lần gia hạn tiếp theo trở về **Chưa nhắc**, số tiền/ngày nhận tạm được làm trống; lần đã hoàn tất vẫn có trong **Lịch sử**. Số tiền ở cột kỳ hiện tại là của kỳ hiện tại, không phải tổng doanh thu.

Không tự động nhắc qua Zalo/Facebook hoặc kick khách. Nhân viên và quản trị viên được ghi nhận gia hạn; tài khoản chỉ xem được đọc lịch sử. Khách nhập từ CSV ban đầu có trạng thái gia hạn Chưa nhắc; cột Ngày pay đếm ngược không suy ra thanh toán. Nhập lại CSV hay sửa hồ sơ không xóa trạng thái/lịch sử gia hạn đã ghi nhận; nếu thông tin khách thay đổi khi hộp thoại đang mở, phải tải lại để tránh xác nhận nhầm. Chỉnh ngày hết hạn trực tiếp trong Sửa hồ sơ chỉ là sửa dữ liệu, không tạo lịch sử gia hạn hoàn tất.

## Nhắc khách trước 2 ngày và khách lưu trữ

- **Tổng quan** và bộ lọc sắp hết hạn hiển thị khách còn từ 0 đến 2 ngày, tính theo ngày Việt Nam. Quá hạn hiển thị riêng. Không gửi tin tự động.
- Bấm **Nhắc hạn** ở dòng khách để tạo mẫu tin có tên, email và hạn hiện tại. Chọn **Sao chép**, rồi dán và tự gửi qua Zalo/Facebook. Sao chép không tự đánh dấu đã gửi; sau khi gửi bạn có thể chọn trạng thái Đã nhắc khách.
- Khách chọn **Không gia hạn** được chuyển sang **Khách lưu trữ** sau 7 ngày lịch kể từ ngày chọn theo ngày Việt Nam, dù ngày hết hạn là ngày nào. Đổi sang trạng thái khác trước thời điểm đó sẽ hủy lịch lưu trữ. Khách đã mang trạng thái Không gia hạn từ bản cũ, chưa có ngày chọn, bắt đầu đếm 7 ngày từ lần nâng cấp này.
- Việc chuyển lưu trữ được kiểm tra khi khởi động, khi tải dữ liệu và mỗi phút khi ứng dụng chạy. Nếu ứng dụng đóng, các khách đủ thời gian được chuyển khi mở lại. Không tự kick khách hoặc xóa tài khoản Google.
- Dữ liệu không bị mất: bản chụp toàn bộ hồ sơ và lịch sử ở cùng cơ sở dữ liệu **data/family.sqlite**. Tab **Khách lưu trữ** có **Xem dữ liệu** và **Khôi phục**. Tệp CSV gốc không cần lưu để khôi phục.
- Khôi phục vào một Family hiện có và còn chỗ; thông tin khách, hạn, thanh toán và lịch sử được giữ, trạng thái gia hạn tiếp theo trở về Chưa nhắc. Nhân viên/quản trị viên được khôi phục; người chỉ xem có thể đọc dữ liệu lưu trữ. Lưu trữ giải phóng chỗ trong hồ sơ nội bộ, không chứng minh nhóm Google đã trống chỗ.
- Không xóa thư mục data hoặc đưa nó lên GitHub. Sao lưu khi ứng dụng đã dừng. Lịch sử ngày mua của các lần gia hạn trước bản 0.3.2 có thể trống vì bản cũ chưa lưu thông tin đó.

## Nhập nhanh toàn bộ bảng Family trên Windows

Dùng cho bảng cũ có nhiều Family xếp nối tiếp trong cùng tab, với dòng email quản lý/mật khẩu ở đầu mỗi nhóm và tên/email khách bên dưới.

1. Cập nhật mã nguồn mới, giữ nguyên thư mục `data` và sao lưu thư mục ứng dụng.
2. **Đóng cửa sổ đang chạy Fam Manager** trước khi nhập.
3. Nhấp đúp **IMPORT-CSV-WINDOWS.cmd** trong cùng thư mục với START-WINDOWS.cmd.
4. Chọn tệp CSV gốc trong cửa sổ chọn tệp. Công cụ tự tách nhóm, ghép khách, tạo Family/tài khoản quản lý còn thiếu và nhập dữ liệu trong một giao dịch. Không cần ghép cột thủ công.
5. Đợi dòng **Import complete**; nếu tệp đã nhập rồi, hiện **Already imported** và giữ nguyên các hồ sơ đã có. Mở lại START-WINDOWS.cmd và kiểm tra danh sách khách.

Công cụ chạy trên máy bạn, không tải dữ liệu lên GitHub hoặc Google, không yêu cầu mật khẩu quản trị viên vì đây là công cụ làm việc trực tiếp với tệp dữ liệu của chủ máy. Cần quyền đọc/ghi thư mục ứng dụng. Tài khoản đăng nhập, lịch sử và dữ liệu cũ được giữ; trước khi ghi, sao lưu SQLite vào `data/before-csv-*.sqlite`. Khách trùng email trong cùng Family được bỏ qua mặc định, không ghi đè hồ sơ đã được bạn sửa/gia hạn. Công cụ chưa được chạy trên Windows trong môi trường kiểm thử, nhưng phần nhập Node đã được kiểm thử với CSV thực tế và kiểm thử tự động; giao diện chọn tệp dùng Windows PowerShell có sẵn.

Các dòng mật khẩu/xác minh của quản lý, dòng trống, tiêu đề lặp và cột đếm ngược không nhập. Tên, email, gói, ngày và Contact/ghi chú khách được giữ. “1 năm” được chuẩn hóa thành 12 tháng; gói tùy chỉnh như 13 tháng giữ nguyên. Ô trống không bị đoán thêm dữ liệu. Ngày mua thiếu năm chỉ được bổ sung nếu gói và hạn xác định được cùng ngày/tháng; ví dụ 10/8 và hạn 10/02/2027 với gói 6 tháng xác định năm 2026. Khách ghi “chưa vào” vẫn có hồ sơ và ghi chú, chưa tính vào chỗ thành viên; không thêm cảnh báo vào hồ sơ đó. Mật khẩu không được nhập hoặc giữ trong bản sao dữ liệu mới.

## Nhập khách từ Google Sheets

1. Dừng ứng dụng và sao lưu thư mục ứng dụng gồm cả `data` trước khi cập nhật lên bản 0.3. Chạy lại và đăng nhập quản trị viên.
2. Trong Google Sheets, mở tab Family muốn nhập: **Tệp → Tải xuống → Giá trị được phân tách bằng dấu phẩy (.csv)**. Mỗi tệp chỉ chứa tab đang mở.
3. Vào **Khách & Gia hạn → Nhập khách từ CSV**, chọn tệp vừa tải.
4. Ứng dụng nhận dạng bảng cũ có email quản lý ở ô đầu, mật khẩu ở ô thứ hai, rồi Gói mua / Ngày mua / Ngày đến hạn. Có thể có nhiều dòng quản lý và nhiều Family trong một tab. Ô mật khẩu đầu bảng được bỏ; cột tên và email khách phía dưới được giữ nguyên. Các cột mang tên pass/password/mật khẩu không cho chọn. Chỉ cột được chọn mới gửi tới máy ứng dụng; không lưu tệp CSV gốc.
5. Kiểm tra ghép cột: tên khách → Tên khách, mail → Email khách, gói mua → Gói mua, ngày mua → Ngày mua, ngày đến hạn → Ngày hết hạn, Contact → Liên hệ. **Ngày pay đếm ngược không nhập**; số ngày còn lại tính lại từ hạn theo ngày Việt Nam. Không gán cột này cho thanh toán hoặc số tiền.
6. Nếu có Family trùng email quản lý, hệ thống đề xuất Family đó. Nếu chưa có, quản trị viên có thể bật **Cho phép tạo hồ sơ Family/tài khoản quản lý còn thiếu**, kiểm tra email quản lý mặc định và nhập tên Family. Không tạo nhóm trên Google. CSV nhiều Family cần cột tên Family và/hoặc email quản lý; mỗi dòng phải xác định được nhóm. Nếu tên Family trùng nhau thì cần email quản lý để phân biệt.
7. Chọn **Bỏ qua** khách trùng (mặc định) hoặc **Cập nhật cột đã chọn**. Khi cập nhật, cột không chọn và ô trống giữ nguyên thông tin cũ; không chuyển khách qua Family khác. Email trùng trong cùng Family của CSV giữ dòng đầu; email ở Family khác là hồ sơ riêng.
8. Bấm **Xem trước dữ liệu**. Kiểm tra số khách, Family mới, gói, ngày mua, ngày hết hạn và dòng lỗi, rồi chọn **Xác nhận nhập**. Xem trước không ghi cơ sở dữ liệu. Nếu có dòng lỗi hoặc Family quá 5 khách thì không nhập dòng nào; sửa tệp và xem trước lại. Nếu dữ liệu ứng dụng thay đổi sau xem trước, phải xem trước lại.
9. Kiểm tra danh sách khách; tiếp tục với tab Family khác. Không gửi mật khẩu hoặc tệp khách lên GitHub. Bạn không cần chia sẻ Google Sheet hoặc cung cấp thông tin đăng nhập Google cho ứng dụng.

Nhận ngày `dd/mm/yyyy` hoặc `yyyy-mm-dd`; gói từ 1 đến 120 tháng, kể cả “1 năm” (12 tháng) và 13 tháng; thanh toán “Đã thanh toán”, “Chưa thanh toán”, “Thanh toán một phần” nếu sheet có cột riêng. Nếu không có thanh toán, khách mới có trạng thái **Chưa ghi nhận**, không bị coi là chưa trả tiền. Số tiền nhận số nguyên VND như `100000`, `100.000`, `100,000`. Contact giữ nguyên liên kết Facebook/Zalo hoặc ghi chú (tối đa 1000 ký tự). Giới hạn mỗi tệp 1 MB, 10.000 khách, 100 cột; xem trước hiển thị tối đa 200 dòng và 200 lỗi đầu. Bộ nhập ghép Family theo email quản lý và giữ tên hồ sơ cũ nếu đã có. Hỗ trợ nhiều Family xếp nối tiếp trong một tab, CSV UTF-8, dấu phẩy/chấm phẩy/tab, dấu nháy và ô có xuống dòng; chưa nhập trực tiếp XLSX hoặc tự đồng bộ Google Sheets.

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
