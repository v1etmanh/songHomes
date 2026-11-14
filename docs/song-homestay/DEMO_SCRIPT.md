# Kịch bản demo 8–10 phút

## Chuẩn bị

```powershell
npx convex dev
npm run seed
npm run dev
```

Mở hai tab: `/p/song-homestay` và `/admin/command`.

## Demo

1. **Bài toán (45 giây):** 5 cơ sở, nhiều nguồn, Excel và nguy cơ double booking.
2. **Khách đặt web (2 phút):** chọn căn/ngày, thuê xe hoặc vé Bà Nà, nhập khách, xác nhận thanh toán tại homestay.
3. **Lịch tập trung (1 phút):** yêu cầu vừa tạo xuất hiện ở trạng thái Chờ xác nhận và khóa ngày.
4. **Booking Zalo (1 phút):** admin nhập booking ngoài; thử nhập ngày trùng để chứng minh hệ thống từ chối.
5. **Double booking iCal (2 phút):** mở `/admin/ical` (lần đầu bấm **Kết nối nền tảng giả lập**). Bấm **Mở trên Airbnb** ở một cơ sở, thêm đặt phòng trùng ngày với một booking đang có (hoặc bấm **Tạo xung đột**), rồi **Sang OpenStays đồng bộ ngay** → **Đồng bộ ngay**. Chỉ ra ô báo xung đột, email cảnh báo trong **Hộp thư cảnh báo** và dòng mới ở `/admin/conflicts`. Bấm **Giả lập link lỗi** rồi đồng bộ để thấy cảnh báo "Đồng bộ lỗi"; bật lại để thấy "Đã khôi phục". Lịch còn tự kéo mỗi 30 phút và nền tảng giả lập tự sinh thay đổi mỗi ngày lúc 00:30.
6. **Xử lý (1 phút):** chuyển một booking sang căn còn trống; cảnh báo biến mất, giá giữ nguyên.
7. **Lưu trú và quản trị (1 phút):** mở danh sách khai báo, quản lý căn và dịch vụ.
8. **Giới hạn (30 giây):** API OTA thật và cổng thanh toán thật ngoài scope; nền tảng ở `/sim` là mô phỏng nhưng phát link iCal thật qua HTTP, và database, lịch, đồng bộ, conflict logic là thật. Trên bản demo email cảnh báo chỉ ghi log và hiện trong hộp thư.

## Câu trả lời ngắn cho phản biện

- **Vì sao checkout 23 và checkin 23 không trùng?** Vì đêm lưu trú dùng khoảng nửa mở `[check-in, check-out)`.
- **Nếu hai khách bấm cùng lúc?** Convex chạy mutation transaction; chỉ một booking chiếm được `unitNights`.
- **Tại sao iCal vẫn có thể double booking?** iCal một chiều và có độ trễ; hệ thống phát hiện/cảnh báo chứ không thể khóa tức thời trên OTA.
- **Có dùng API Airbnb thật không?** Không; đó là out of scope do thiếu tài khoản Host/Developer.
- **Dữ liệu CCCD có gửi OTA không?** Không; iCal export chỉ có ngày và trạng thái Reserved.

