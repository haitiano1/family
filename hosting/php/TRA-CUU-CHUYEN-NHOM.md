# 0.21.0 — Tra cứu khách & chuyển nhóm

Khi mail chủ Family gặp sự cố (bị quét, bị vô hiệu hoá…), khách tự mở trang tra cứu, nhập Gmail và mã tra cứu để xem tình trạng nhóm và lấy link vào nhóm mới. Bạn không cần gửi link cho từng khách.

## Cập nhật

- **Hostinger:** dùng **Cập nhật một chạm** như bình thường. Bản này giữ schema 8. Các bảng mới (trạng thái nhóm, kho link mời, lượt chuyển nhóm, mã tra cứu) tự tạo khi website mở lần đầu sau cập nhật, không cần chạy SQL hay sửa `.htaccess`/`config.php`. Nếu upload tay, dùng gói `family-tra-cuu-chuyen-nhom.zip`: upload hai thư mục `family-private` và `public_html`, giữ `config.php` và database rồi Ctrl+F5.
- **Windows/Node:** thay mã như các bản trước. Bảng mới được thêm vào `data/family.sqlite`, không đổi `user_version`.
- Sao lưu mới là **phiên bản 10**, chứa thêm trạng thái nhóm, link mời, lượt chuyển nhóm và mã tra cứu. Vẫn khôi phục được bản sao lưu 1–9.

## Trang cho khách

Địa chỉ: `https://tên-miền-của-bạn/tra-cuu.html`. Trang này không cần mật khẩu truy cập website. Khách chỉ thấy thông tin của chính mình: lời chào kèm Gmail, tên Family, trạng thái, lời nhắn của shop, hạn dùng và link vào nhóm. Trang không hiện tên khách bạn đặt trong web, mail chủ Family hay mail của khách khác.

Mỗi Gmail khách có một **mã tra cứu 6 ký tự** cố định. Từ 0.22.0, mã hiện ngay dưới Gmail của khách, kèm nút copy. Tab Google Sheet `FamilySync_MaTraCuu` liệt kê mã của từng khách và đồng bộ hai chiều (xem integrations/google-sheets/MA-TRA-CUU-VA-GMAIL.md). Menu **…** của khách → **Copy link tra cứu** vẫn copy tin nhắn đầy đủ. Nội dung copy gồm link riêng có sẵn mã (`/tra-cuu.html#ma=…`), Gmail và mã. Nên gửi cho khách lúc bán hoặc gia hạn, để khi nhóm lỗi khách tự vào xem.

- Nhập sai 8 lần trong 15 phút thì Gmail đó bị khóa tra cứu 15 phút. Một địa chỉ IP sai quá 40 lần cũng bị khóa.
- Mã bị lộ hoặc gửi nhầm: menu **…** của khách → **Đổi mã tra cứu**. Mã và link cũ hết tác dụng, phiên đang mở bị đăng xuất; copy link tra cứu mới để gửi lại.
- Mã được tính từ Gmail và một khóa bí mật nằm trong database và file sao lưu. Chuyển dữ liệu giữa Windows và Hostinger bằng file sao lưu thì mã của khách giữ nguyên.

Vào **Thêm → Tra cứu khách → Sửa thông tin** để đặt tên shop, link liên hệ (Messenger, Zalo…) và ghi chú hiển thị cho khách.

## Trang tra cứu có tiến trình (0.28.0)

- Khách thấy một thẻ trạng thái với thanh tiến trình màu xanh và nhân vật chibi đội mũ chữ N chạy tới đúng bước đang xử lý. Các bước khi nhóm gặp sự cố: **Báo lỗi → Tiếp nhận → Đang xử lý → Vào nhóm mới**. Khách mới: **Đăng ký → Chuẩn bị → Vào nhóm**.
- Đưa link cho khách là bước cuối: web không theo dõi khách đã vào nhóm hay chưa. Trang khách không còn nút *Tôi đã vào được / Tôi không vào được*, trang Family không còn nút *Đã vào*. Tra cứu khách hiện **Khách chờ link** và **Khách đã nhận link**.
- Bên dưới là **Chi tiết tiến trình**: bước đã xong có dấu tích và giờ, bước hiện tại ghi *Đang làm* hoặc *Bạn thao tác*. Hướng dẫn và nút **Vào nhóm mới** nằm ngay trong bước Vào nhóm.
- Khi shop đang xử lý, trang tự làm mới 30 giây một lần và khi khách quay lại trang, nên link hiện ra mà khách không cần tải lại.
- Máy bật chế độ giảm chuyển động thì chibi và thanh tiến trình đứng yên.

## Link khách chưa bấm thì giao khách khác (0.29.0)

Web không cần biết khách đã vào nhóm hay chưa. Tín hiệu duy nhất là khách có bấm nút **Vào nhóm mới** trên trang tra cứu hay không: khách muốn vào nhóm thì phải bấm.

- Bảng **Link mời vào Family này** ghi **Khách đã bấm link** (kèm giờ) hoặc **Khách chưa bấm link** (kèm số ngày đã giao).
- Khi Family hết link Sẵn sàng, link đã giao quá **3 ngày** mà khách chưa bấm sẽ tự chuyển cho khách tra cứu tiếp theo. Khách cũ chuyển về chờ link mới; mở lại trang sẽ thấy Shop đang chuẩn bị link.
- Muốn làm ngay: bấm **Thu hồi về kho** trên dòng link. Link về Sẵn sàng, khách cũ chờ link mới.
- Đổi số ngày hoặc tắt (điền 0) ở **Thêm → Tra cứu khách → Sửa thông tin → Tự thu hồi link khách chưa bấm sau (ngày)**.
- Link khách đã bấm không bao giờ bị thu hồi tự động. Khách bấm mà không vào được thì khách liên hệ shop.

## Khách báo mất Premium (0.28.0)

Khi nhóm vẫn hiện bình thường mà khách mất Premium, khách bấm **Báo mất Premium cho shop**, chọn lỗi (mất Premium hoặc hiện quảng cáo, bị đưa ra khỏi nhóm, lỗi khác) và ghi chú nếu muốn.

- Khách thấy tiến trình ở bước **Tiếp nhận**: "Shop đang kiểm tra nhóm của bạn". Mỗi khách chỉ có một báo lỗi đang mở.
- Bạn thấy báo lỗi ở đầu trang **Fix lỗi** (nhóm theo Family) và một dòng đỏ ở **Tổng quan**.
  - Nhiều khách cùng Family báo thì thường mail chủ bị quét: bấm **Báo lỗi mail chủ**. Family thành Bị quét, các báo lỗi của Family đó tự đóng và khách chuyển sang bước **Nhóm mới**.
  - Chỉ một khách bị: xử lý xong bấm **Đã xử lý**, có thể để lại lời nhắn (ví dụ "Shop đã mời lại bạn, kiểm tra Gmail"). Khách thấy lời nhắn trong 3 ngày.
- Nếu Family đã được đặt sự cố, khách không cần báo: trang hiện thẳng tiến trình shop đang xử lý.

### Thông báo Telegram

Vào **Thêm → Tra cứu khách → Thông báo Telegram → Cài thông báo Telegram**:

1. Mở Telegram, tìm **@BotFather**, gửi `/newbot`, đặt tên và tên đăng nhập kết thúc bằng `bot`.
2. Copy mã bot BotFather gửi (dạng `123456789:AAE…`) và dán vào ô **Mã bot**.
3. Mở bot vừa tạo, bấm **Bắt đầu / Start**. Muốn nhận trong nhóm chat thì thêm bot vào nhóm và gửi một tin bất kỳ.
4. Bấm **Kết nối**. Web gửi một tin thử về Telegram.

Mỗi lần khách báo mất Premium, bot gửi Gmail khách, Family, mail chủ, loại lỗi, ghi chú, số khách cùng Family đang báo và link mở Fix lỗi. Mã bot chỉ lưu trên máy chủ của bạn. Có nút **Gửi tin thử**, **Đổi bot** và **Tắt**. Telegram lỗi thì báo lỗi của khách vẫn được lưu.

## Khách mới tự nhận link (0.24.0)

- Khách có trạng thái thành viên **Đã mời, chưa vào** hoặc **Mua mới** trong một Family đang hoạt động (từ 0.26.0 kể cả khách đã quá hạn), tra cứu Gmail trên `/tra-cuu.html` sẽ tự nhận **một** link *Sẵn sàng* trong **Link mời vào Family này** của chính Family đó.
- Web chọn link còn hạn có ngày gửi sớm nhất. Link được giữ cho khách đó: chưa vào được ngay (kể cả khi bấm *Tôi không vào được*) thì lần tra cứu sau vẫn là link đó, cho tới khi khách được chuyển sang nhóm mới. Link không bao giờ giao cho khách khác. Google gửi lại thư mời cho đúng mail của link đó thì Lấy link mời thay link mới vào chỗ của khách. Link tự được tick **Đã gửi**; trang Family hiện khách trong mục **Khách nhận link vào Family này**.
- Khách bấm **Tôi đã vào được** (hoặc bạn bấm **Đã vào**) thì khách chuyển sang *Đã vào* và link thành *Đã dùng*.
- Family hết link thì khách thấy "Shop đang chuẩn bị link vào nhóm". Thêm link (Gen mail mời → Lấy link mời) là khách tra cứu lại sẽ nhận được.
- Khách đang ở nhóm (*Đã vào*) hoặc Family đang có sự cố thì không nhận link tự động, trừ khách đang **Chờ link** sau khi đổi Gmail chủ. Từ 0.26.0, khách quá hạn vẫn nhận link vì khách vẫn gia hạn, chỉ chưa chuyển tiền.
- Link đã đưa cho khách tự có tag **Đã gửi** (từ 0.25.0 không còn ô tick). Khách vào nhóm bằng link nào thì dòng đó hiện Gmail của khách thay cho mail haihoangrr+…. **Thu hồi link** đưa link về Sẵn sàng; link cũ sau **Đổi link** giữ tag Đã gửi, bấm **Đưa lại vào kho** nếu chắc chưa ai dùng.

## Đợt quét: đổi chủ ngay trên Family cũ (0.26.0, nên dùng)

Không cần tạo Family mới. Một đợt quét chỉ còn 3 bước:

1. **Báo lỗi** mail quản lý ở Fix lỗi. Không cần điền nội dung lỗi: để trống thì web ghi là *Bị quét* (từ 0.27.0). Family tự thành **Bị quét**, khách thấy lời nhắn.
2. Có Gmail chủ mới: **Fix lỗi → Đã fix → Đổi sang Gmail chủ mới** (trước 0.27.0 tên là *Đổi sang mail mới*), nhập Gmail chủ mới. Ô **Gen mail mời cho chủ mới** chọn sẵn số mail bằng số khách (tối đa 5). Bấm Xác nhận. Web sẽ:
   - đổi mail chủ, đưa Family về **Đang hoạt động**, ngày trial là hôm nay;
   - giữ nguyên khách và trạng thái thành viên của từng khách; mỗi khách có một dòng **Chờ link · khách tra cứu là nhận** trong mục *Khách nhận link vào Family này*;
   - bỏ các link và mail mời tạo trước lúc Báo lỗi (của chủ cũ). Link cũ được giữ ẩn để Lấy link mời không nhập lại và không giao cho ai;
   - trong **Kho**, Family này hiện mail mới và ngày trial là ngày đổi; mật khẩu, 2FA, mail khôi phục và ghi chú để trống để bạn nhập sau;
   - hiện các mail mời vừa tạo kèm nút **Copy tất cả mail**.
3. Đăng nhập Gmail chủ mới, mời các mail đó, rồi bấm **Lấy link mời** ở Family (website đang mở thì web cũng tự lấy 10 phút một lần). Khách tra cứu Gmail sẽ thấy hướng dẫn rời nhóm cũ và nút **Vào nhóm mới** với link riêng. Chưa có link thì khách thấy "Shop đang chuẩn bị link cho bạn" và link tự hiện khi có.

Ghi chú:
- Link và mail mời tạo **sau** lúc Báo lỗi được giữ, vì đó là của chủ mới. Bạn có thể Gen mail và mời trước khi bấm Đã fix.
- Nếu Gmail chủ mới đã có một Family chuẩn bị sẵn (có Kho, chưa có khách), web dùng Kho và ngày trial của Family đó như trước, và chuyển luôn link và mail mời của nó sang Family này.
- Muốn tự giao link cho khách đang chờ: dòng của khách → **…** → **Đổi link**. **Thu hồi link** bỏ lượt chờ của khách đó.

## Dồn khách sang một Family khác

Từ 0.27.0, hộp Đã fix chỉ còn hai lựa chọn: **Giữ nguyên mail** (Google đã mở lại, khách không cần làm gì) và **Đổi sang Gmail chủ mới**. Lựa chọn *Cho khách vào Family mới* của 0.25.0–0.26.0 đã bỏ vì trùng với Đổi sang Gmail chủ mới.

Hiếm khi cần dồn khách sang một Family khác đang có khách: mở Family lỗi → **Chuyển khách sang nhóm mới**, chọn Family đích và link cho từng khách. Nếu Family đích sẽ vượt 5 khách, hộp thoại báo số khách cần bỏ chuyển bớt.

## Khi Family gặp sự cố

0. Từ 0.24.0, **Báo lỗi** cho mail quản lý ở mục Fix lỗi sẽ tự đặt Family thành **Bị quét** kèm lời nhắn mẫu, nên khách thấy ngay trên trang tra cứu. Khi case chuyển sang **Đã fix** (đổi sang mail mới hoặc giữ mail), Family tự về **Đang hoạt động**. Mở lại case thì Family lại thành Bị quét. Báo lỗi mail khách không đổi trạng thái Family. Nếu bạn đã tự đặt trạng thái khác (ví dụ *Bị vô hiệu hoá*), báo lỗi không ghi đè trạng thái đó.
1. Muốn chọn trạng thái hoặc lời nhắn khác: mở Family lỗi → **Đổi trạng thái**, chọn *Đang kiểm tra*, *Bị quét* hoặc *Bị vô hiệu hoá* và viết lời nhắn cho khách. Ô lời nhắn có sẵn câu mẫu khi còn trống.
2. Ở Family mới: gửi lời mời từ tài khoản chủ tới các mail của bạn (ví dụ `mail+1@gmail.com`, `mail+2@gmail.com`…). Trong email của Google, chuột phải nút **Chấp nhận lời mời** → sao chép link, rồi bấm **+ Thêm link mời** và dán link vào. Nhập ngày gửi để web nhắc khi lời mời sắp hết hạn (Google cho 2 tuần).
3. Quay lại Family lỗi → **Chuyển khách sang nhóm mới**. Chọn Family mới; web tự ghép mỗi khách với một link sẵn sàng, kể cả khách quá hạn (từ 0.26.0). Có thể đổi link hoặc chọn *Không chuyển* cho từng khách trước khi xác nhận.
4. Khách được chuyển ở trạng thái **Đã mời, chưa vào**. Gói, ngày mua, hạn, Contact, thanh toán và lịch sử giữ nguyên. Case Fix lỗi gắn với mail khách được xóa như khi Chuyển Family. Nhật ký ghi thao tác vào nhóm **Chuyển Family**.

## Theo dõi tiến độ

Family mới có mục **Khách chuyển đến Family này**. Mục **Tra cứu khách** gom tất cả lượt chuyển và các Family có sự cố.

- **Đã giao link · chưa mở → Khách đã mở link**: web ghi nhận khi khách bấm *Vào nhóm mới*.
- **Không vào được**: khách đã chọn lỗi Google báo (chỉ được đổi nhóm 1 lần trong 12 tháng, lời mời đã dùng/hết hạn, đang ở nhóm khác, lỗi khác) và ghi chú. Tổng quan hiện số khách báo lỗi.
- **Đã vào nhóm**: khách bấm *Tôi đã vào được* hoặc bạn bấm **Đã vào**. Khách chuyển sang đang ở nhóm, link được đánh dấu *Đã dùng*.
- **Copy tin nhắn**: tin gửi khách có link tra cứu riêng, dùng khi khách chưa có link.
- **Đổi link**: giao link khác của Family mới; link cũ trở lại kho. Nếu link cũ đã bị dùng, xóa nó khỏi kho.
- **Thu hồi link**: link trở lại kho; khách vẫn ở Family mới với trạng thái Đã mời, chưa vào để bạn sửa hoặc chuyển tiếp.
- **Ẩn**: bỏ lượt đã xong khỏi danh sách; dữ liệu vẫn còn trong sao lưu và nhật ký.

Google đổi link khi để lâu: bấm **Sửa** trên dòng link và dán link mới. Khách đang giữ link đó thấy link mới ngay khi tra cứu lại.

## Lưu ý

- Từ 0.22.0, nút **Lấy link từ Gmail** tự lấy link từ thư mời gửi tới Gmail có dấu + và xếp vào đúng Family (cần kết nối Google Sheet và Apps Script v5.8). Vẫn dán tay được như trước.
- Messenger và Zalo mở link bằng trình duyệt trong ứng dụng, nơi Google không cho đăng nhập. Trang tra cứu nhận ra trường hợp này và hướng dẫn khách mở bằng Chrome/Safari.
- Khách gửi ảnh chụp lỗi qua link liên hệ của shop; trang chưa có chỗ tải ảnh lên.
- Trên bản Windows, trang tra cứu chỉ mở được trên chính máy đó. Khách dùng được khi website chạy trên Hostinger hoặc chế độ hosting của Node.
