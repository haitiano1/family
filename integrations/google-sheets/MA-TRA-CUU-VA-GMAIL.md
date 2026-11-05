# 0.22.0–0.23.0 — Mã tra cứu, Gen mail mời và lấy link mời từ Gmail

## Có gì mới

- **Mã tra cứu hiện ngay dưới Gmail của khách** trong bảng khách và trang Family, có nút copy mã. Menu **…** của khách vẫn có **Copy link tra cứu** (tin nhắn đầy đủ) và **Đổi mã tra cứu**.
- **Tab FamilySync_MaTraCuu trong Google Sheet** có 3 cột: Tên khách · Mail khách · Mã tra cứu. Cột ID nằm ẩn ở cột D. Tab đồng bộ hai chiều với web.
- **Gen mail mời** (0.23.0): web tạo 1–5 Gmail có dấu + với đuôi ngẫu nhiên (ví dụ `haihoangrr+k7p2qx@gmail.com`), không bao giờ trùng, để bạn mời từ tài khoản chủ Family.
- **Lấy link mời** (0.23.0; 0.22.0 có nút Lấy link từ Gmail): web tự lấy link nút **Accept invitation / Chấp nhận lời mời** trong thư mời gửi tới các Gmail đó, hiện link của từng mail và lưu vào kho link của Family.
- **Tag Đã gửi** (tự động từ 0.25.0): link đã đưa cho khách tự có tag Đã gửi và không bị giao cho khách khác.
- Tiêu đề web đổi thành **Hải Premium** (0.23.0).

## Cập nhật (làm một lần)

Đã lên 0.22.0 và làm xong bước 2 trước đó? Khi lên 0.23.0 chỉ cần dán lại `Code.gs` (bước 2.1) và triển khai New version (bước 2.4). Không cần thay appsscript.json hay chạy lại capQuyenGmail. Code.gs của 0.22.0 vẫn chạy; bản mới chỉ thêm việc tự điền Gmail nhận lời mời.

1. **Website**: dùng **Cập nhật một chạm** như bình thường; schema 8 giữ nguyên. Nếu upload tay, dùng gói `family-ma-tra-cuu-gmail.zip`: upload hai thư mục `family-private` và `public_html`, giữ `config.php` và database, rồi Ctrl+F5.
2. **Apps Script** (script.google.com, mở dự án đang dùng để đồng bộ Sheet):
   1. Mở `Code.gs`, xóa hết rồi dán toàn bộ `Code.gs` mới. Bấm Lưu.
   2. Mở `appsscript.json` và thay bằng tệp mới. Nếu chưa thấy tệp này: **Project Settings / Cài đặt dự án** → bật **Show appsscript.json manifest file in editor**. Bấm Lưu. Tệp mới thêm quyền chỉ đọc Gmail và dịch vụ Gmail API.
   3. Trên thanh chạy, chọn hàm **capQuyenGmail** → **Run / Chạy**. Google sẽ hỏi quyền. Chọn đúng tài khoản Gmail nhận lời mời. Gặp màn hình "Google chưa xác minh ứng dụng này" thì bấm **Nâng cao**, rồi chọn dòng truy cập dự án của bạn. Cuối cùng bấm **Cho phép**. Quyền mới là **xem email của bạn** (chỉ đọc). Execution log hiện **ĐÃ CÓ QUYỀN ĐỌC GMAIL** là xong.
   4. **Deploy → Manage deployments**, bấm biểu tượng bút chì, chọn **Version: New version** → **Deploy**. URL `/exec` giữ nguyên, trên web không cần đổi gì.

   Làm bước 2.3 trước bước 2.4. Nếu triển khai khi chưa cấp quyền, đồng bộ Sheet sẽ báo "Google trả về trang đăng nhập". Khi đó chạy capQuyenGmail, cho phép rồi đồng bộ lại.
3. **Trên web**: mở **Đồng bộ Sheet** → **Đồng bộ ngay**. Trong Sheet sẽ có tab `FamilySync_MaTraCuu`. Mục **Thông tin kết nối** hiện:
   - Phiên bản Google: `family-ma-tra-cuu-v5.8`
   - Lấy link từ Gmail: Có
   - Tab Mã tra cứu: Đang đồng bộ

Nếu bước 2.3 báo lỗi Gmail: ở cột trái của Apps Script bấm **Services / Dịch vụ +** → **Gmail API** → **Add / Thêm**, rồi chạy lại capQuyenGmail.

## Tab Mã tra cứu

- Mỗi Gmail khách có một dòng, theo thứ tự tab Khách. Khách của Family đã lưu trữ không có trong tab.
- **Web → Sheet**: khi bạn thêm khách, đổi tên khách hoặc bấm **Đổi mã tra cứu**, tab cập nhật sau vài giây (website cần đang mở).
- **Sheet → Web**: gõ mã mới vào ô **Mã tra cứu**, web sẽ dùng mã đó ở lượt đồng bộ tiếp theo (tối đa khoảng 30 giây). Mã và link tra cứu cũ hết tác dụng, khách đang mở trang tra cứu phải nhập lại.
  - Mã gồm đúng 6 ký tự: chữ A–Z trừ I, L, O và số 2–9. Gõ chữ thường hoặc có dấu cách cũng được, web tự viết hoa.
  - Mã sai mẫu thì lượt đồng bộ dừng và báo Gmail của dòng đó. Sửa lại ô đó là đồng bộ tiếp.
- Để trống ô mã thì mã cũ được giữ và web ghi lại. Sửa Tên khách hoặc Mail khách ở tab này không có tác dụng; sửa ở tab Khách hoặc trên web. Xóa dòng thì web ghi lại dòng đó. Dòng bạn tự thêm (không có ID ẩn) bị bỏ qua.
- Không thêm cột hoặc công thức vào tab này. Muốn ghi chú, dùng tab khác.
- Muốn đổi sang một mã ngẫu nhiên, bấm **Đổi mã tra cứu** trên web.
- Nếu web và Sheet cùng đổi mã của một khách, web hỏi bạn giữ **bản web** hay **bản Sheet**, giống các tab khác.
- Ai đọc được Sheet cũng thấy mã của khách. Chỉ chia sẻ file cho người bạn tin.

## Gen mail mời → mời → Lấy link mời (0.23.0)

1. **Tạo mail mời**: khi **+ Thêm Family**, chọn số mail ở ô **Gen mail mời** (1–5); mail được tạo ngay khi lưu. Với Family đã có, mở Family → **Gen mail mời** → bấm số mail (1–5) là tạo luôn. Từ 0.24.0, Gmail nhận lời mời cố định là `haihoangrr@gmail.com`.
2. Web hiện các mail vừa tạo, ví dụ `haihoangrr+k7p2qx@gmail.com`. Đuôi sau dấu + là ngẫu nhiên. Web lưu mọi mail đã tạo nên không bao giờ tạo trùng, kể cả với tên các link đã có. Bấm **Copy tất cả mail**.
3. Đăng nhập tài khoản chủ Family, mời các mail vừa copy. Trang Family hiện khung **mail chờ lấy link** cho tới khi có link. Tạo nhầm thì bấm × cạnh mail đó hoặc **Xóa tất cả** (từ 0.24.1); chỉ xóa được mail chưa có link.
4. Quay lại Family → **Lấy link mời**. Web đọc thư mời trong Gmail và hiện bảng **Mail mời · Link mời · Trạng thái**: tạo 4 mail và mời đủ thì có đủ 4 link. Mail chưa có thư thì ghi **Chưa thấy thư mời**; đợi một chút rồi bấm lại. Link được lưu luôn vào **Link mời vào Family này**.

Vẫn mời được các Gmail tự đặt như `hai+1@gmail.com`; nút **Lấy link từ Gmail** ở **Thêm → Tra cứu khách** lấy link cho mọi Family. Khi website đang mở, web tự kiểm tra Gmail 10 phút một lần.

## Tag Đã gửi (tự động từ 0.25.0)

- Không còn ô tick. Link nào web đã đưa cho khách (khách tra cứu Gmail, hoặc khi chuyển khách sang nhóm mới) tự có tag **Đã gửi**, kèm tên khách và giờ khách xem.
- Link Đã gửi không có trong danh sách chọn khi chuyển nhóm hay đổi link, và không giao cho khách khác.
- Khách vào nhóm bằng link nào thì dòng đó hiện **Gmail của khách** thay cho mail haihoangrr+…, kèm dòng nhỏ *Mail mời: …* và trạng thái **Đã dùng**.
- **Thu hồi link** đưa link về **Sẵn sàng**. Link cũ sau khi **Đổi link** vẫn giữ tag Đã gửi; nếu chắc chưa ai dùng, bấm **Đưa lại vào kho**.
- Từ 0.26.0, khi **Đã fix → Đổi sang Gmail chủ mới**, link của chủ cũ được giữ ẩn (không giao cho khách). Lấy link mời gặp lại thư cũ của các link đó thì bỏ qua; thư mời mới của chủ mới được lưu bình thường.

## Nếu web báo lỗi

| Thông báo | Cách xử lý |
| --- | --- |
| **[gmail_permission]** | Chạy lại hàm capQuyenGmail và bấm Cho phép. |
| **[gmail_service]** | Thay appsscript.json mới hoặc thêm Gmail API ở **Dịch vụ +**, chạy capQuyenGmail, rồi triển khai New version. |
| "Apps Script đang chạy bản cũ" | Chưa làm bước 2.4 (New version). |
| "Kết nối Google Sheet trước" | Website chưa kết nối Sheet; làm theo HUONG-DAN.md. |

## Lưu ý

- Chỉ bản Hostinger (PHP) có tab Mã tra cứu và Lấy link mời. Bản Windows/Node vẫn có mã dưới Gmail khách, Gen mail mời và tag Đã gửi; link thì dán tay.
- Sao lưu vẫn là phiên bản 10, có thêm danh sách mail mời đã tạo và dấu Đã gửi. Bản sao lưu cũ vẫn khôi phục được.
- Gmail nhận lời mời phải là tài khoản Google đang chạy Apps Script đồng bộ Sheet.
- Website 0.21 vẫn dùng được với Code.gs mới; tab Mã tra cứu chỉ được ghi khi website đã lên 0.22.0.
