# Gia hạn khách và lỗi write_members tại dòng 23 — v5.6

Dòng 23 của v5.5 chỉ đọc ô A1 để nhận biết bố cục Khách, trước khi ghi khách. Google Sheets có thể áp dụng lệnh ghi/định dạng trước đó khi gặp một lệnh đọc. Vì vậy vị trí lỗi này chưa chứng minh dữ liệu Khách bị hỏng hoặc có lỗi quyền.

Đã tái hiện cùng mã `[write_members]`, dòng 23, bằng mô phỏng lỗi ghi Family bị báo trễ. Luồng cũ luôn ghi/định dạng lại Family ngay cả khi chỉ gia hạn khách. Bản v5.6 bỏ ghi Family khi nội dung không đổi; nếu Family thực sự thay đổi, script buộc Google áp dụng lệnh đó trước khi đọc Khách, để lỗi được chỉ đúng bước. Đây là sửa luồng ghi đã kiểm thử; chưa xác nhận nguyên nhân Google trên file thật.

## Áp dụng

1. Lưu bản sao Code.gs hiện tại. Gói chỉ có script và hướng dẫn; giữ file PHP đã cập nhật ở bước chẩn đoán trước.
2. Trong đúng dự án Apps Script đang dùng, thay toàn bộ nội dung **Code.gs** bằng file trong gói và nhấn **Lưu**. Không chạy setup hoặc hàm chuyển bố cục.
3. Chọn **Triển khai → Quản lý các bản triển khai → bản hiện tại → bút chì → Phiên bản mới → Triển khai**. Giữ thực thi bằng tài khoản hiện tại, quyền Bất kỳ ai và URL /exec hiện có.
4. Mở đúng URL /exec trong website, xác nhận `script_version: family-groups-compact-v5.7`.
5. Đóng Kho trên web nếu đang mở → Đồng bộ Sheet → Đồng bộ ngay. Đối chiếu giờ Family/Khách và hạn mới trên Sheet; không cần gia hạn khách lần nữa.
6. Nếu còn lỗi, gửi nguyên thông báo mới có bước và số dòng. Nếu chuyển sang `[write_families]`, lỗi xảy ra khi áp dụng thay đổi Family, trước bước xử lý Khách. Chưa tự bỏ bảo vệ, đổi kiểu cột hoặc xóa Google Table.

Giữ nguyên Sheet, mã kết nối, database và cấu hình Hostinger. Không cần upload PHP, đổi FAMILY_TOKEN hoặc tạo bản triển khai/Sheet mới. Dữ liệu Family thay đổi thực sự (kể cả xóa Family trống) vẫn được ghi; việc bỏ qua so sánh theo nội dung, không phụ thuộc thứ tự dòng hoặc thứ tự trường.
