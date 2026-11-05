# 0.22.0–0.23.0 — Mã tra cứu, Gen mail mời và lấy link mời từ Gmail

## Có gì mới

- **Mã tra cứu hiện ngay dưới Gmail của khách** trong bảng khách và trang Family, có nút copy mã. Menu **…** của khách vẫn có **Copy link tra cứu** (tin nhắn đầy đủ) và **Đổi mã tra cứu**.
- **Tab FamilySync_MaTraCuu trong Google Sheet** có 3 cột: Tên khách · Mail khách · Mã tra cứu. Cột ID nằm ẩn ở cột D. Tab đồng bộ hai chiều với web.
- **Gen mail mời** (0.23.0): web tạo 1–5 Gmail có dấu + với đuôi ngẫu nhiên (ví dụ `haihoangrr+k7p2qx@gmail.com`), không bao giờ trùng, để bạn mời từ tài khoản chủ Family.
- **Lấy link mời** (0.23.0; 0.22.0 có nút Lấy link từ Gmail): web tự lấy link nút **Accept invitation / Chấp nhận lời mời** trong thư mời gửi tới các Gmail đó, hiện link của từng mail và lưu vào kho link của Family.
- **Tick Đã gửi** (0.23.0) trên từng link: link đã gửi tay cho khách sẽ không bị giao cho khách khác.
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

1. **Tạo mail mời**: khi **+ Thêm Family**, chọn số mail ở ô **Gen mail mời** (1–5). Với Family đã có, mở Family → **Gen mail mời**. Ô **Gmail nhận lời mời** là Gmail đang chạy Apps Script, ví dụ `haihoangrr@gmail.com`; web nhớ cho lần sau.
2. Web hiện các mail vừa tạo, ví dụ `haihoangrr+k7p2qx@gmail.com`. Đuôi sau dấu + là ngẫu nhiên. Web lưu mọi mail đã tạo nên không bao giờ tạo trùng, kể cả với tên các link đã có. Bấm **Copy tất cả mail**.
3. Đăng nhập tài khoản chủ Family, mời các mail vừa copy. Trang Family hiện khung **mail chờ lấy link** cho tới khi có link.
4. Quay lại Family → **Lấy link mời**. Web đọc thư mời trong Gmail và hiện bảng **Mail mời · Link mời · Trạng thái**: tạo 4 mail và mời đủ thì có đủ 4 link. Mail chưa có thư thì ghi **Chưa thấy thư mời**; đợi một chút rồi bấm lại. Link được lưu luôn vào **Link mời vào Family này**.

Vẫn mời được các Gmail tự đặt như `hai+1@gmail.com`; nút **Lấy link từ Gmail** ở **Thêm → Tra cứu khách** lấy link cho mọi Family. Khi website đang mở, web tự kiểm tra Gmail 10 phút một lần.

## Tick Đã gửi (0.23.0)

- Mỗi link trong **Link mời vào Family này** có ô **Đã gửi**. Gửi link cho khách bằng tay (Zalo, Messenger…) thì tick ô này.
- Link đã tick hiện **Đã gửi** kèm giờ tick. Link này không có trong danh sách chọn khi **Chuyển khách sang nhóm mới** hoặc **Đổi link**, và Lấy link mời không thay link này.
- Bỏ tick thì link quay lại **Sẵn sàng**. Link đang giao trong lượt chuyển nhóm hoặc đã có khách vào nhóm thì không cần tick.
- Nhật ký ghi mỗi lần tick hoặc bỏ tick.

Cách web xử lý thư mời:

- Web đọc thư từ `families-noreply@google.com` trong 14 ngày gần nhất, kể cả thư bị vào Spam, và lấy link nút **Chấp nhận lời mời**.
- Mỗi link mang đúng Gmail đã nhận thư: thư gửi tới `hai+1@gmail.com` cho dòng **hai+1@gmail.com**, thư gửi tới `+2` cho dòng **hai+2@gmail.com**. Ngày gửi lấy theo ngày thư; web nhắc khi lời mời sắp hết hạn 14 ngày.
- Web biết thư thuộc Family nào bằng cách so Gmail người mời có trong thư với mail chủ Family trên web. Mail tạo bằng Gen mail mời thì web còn biết Family đã tạo mail đó. Nếu hai thông tin khác nhau, link theo Family của người mời (vì link dẫn vào nhóm của người đó) và web báo lại.
- Thư không khớp Family nào thì web chỉ báo "chưa khớp", không tự gán, để không giao nhầm link sang Family khác. Khi đó bạn dán link tay như trước.
- Google gửi thư mời mới cho cùng một Gmail:
  - Link cũ chưa ai dùng: web thay bằng link mới. Khách đang được giao link đó sẽ thấy link mới khi tra cứu lại.
  - Link cũ đã có khách vào nhóm hoặc đã tick **Đã gửi**: web giữ nguyên dòng cũ và thêm một dòng mới.
- Link bạn dán tay có ngày gửi mới hơn thư thì web giữ nguyên.
- Script chỉ đọc thư. Script không bấm link, không đánh dấu đã đọc, không xóa và không gửi thư.

## Nếu web báo lỗi

| Thông báo | Cách xử lý |
| --- | --- |
| **[gmail_permission]** | Chạy lại hàm capQuyenGmail và bấm Cho phép. |
| **[gmail_service]** | Thay appsscript.json mới hoặc thêm Gmail API ở **Dịch vụ +**, chạy capQuyenGmail, rồi triển khai New version. |
| "Apps Script đang chạy bản cũ" | Chưa làm bước 2.4 (New version). |
| "Kết nối Google Sheet trước" | Website chưa kết nối Sheet; làm theo HUONG-DAN.md. |

## Lưu ý

- Chỉ bản Hostinger (PHP) có tab Mã tra cứu và Lấy link mời. Bản Windows/Node vẫn có mã dưới Gmail khách, Gen mail mời và tick Đã gửi; link thì dán tay.
- Sao lưu vẫn là phiên bản 10, có thêm danh sách mail mời đã tạo và dấu Đã gửi. Bản sao lưu cũ vẫn khôi phục được.
- Gmail nhận lời mời phải là tài khoản Google đang chạy Apps Script đồng bộ Sheet.
- Website 0.21 vẫn dùng được với Code.gs mới; tab Mã tra cứu chỉ được ghi khi website đã lên 0.22.0.
