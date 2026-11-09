# Project Charter — Sóng Homestay

## Thông tin chung

- Nhóm: 45 — Lớp 49K22.2.
- Thành viên: Nguyễn Thị Bảo Ngọc, Nguyễn Thị Mai Linh, Trần Thị Thanh Thảo.
- Sponsor: Chủ Sóng Homestay.
- GVHD: Trương Hồng Tuấn.
- Thời gian: tuần 8–14; hạn demo dự kiến 29/11/2026.
- Phương pháp: Vibe Coding có kiểm thử, làm MVP trước, chạy localhost.

## Business need

Sóng Homestay vận hành 5 cơ sở lưu trú và nhận booking từ Airbnb, Booking.com, Zalo, Facebook và khách trực tiếp. Lịch phân tán trong Excel làm tăng nguy cơ double booking, đặc biệt trong mùa cao điểm. Dịch vụ thuê xe máy, vé Bà Nà Hills và đưa đón sân bay cũng chưa được quản lý cùng booking.

## Mục tiêu SMART

| ID | Mục tiêu | Chỉ số | Thời hạn |
|---|---|---|---|
| O1 | Giảm double booking | 4 xuống 0 vụ/tháng | 6 tháng sau go-live |
| O2 | Rút ngắn đồng bộ lịch | khoảng 1 giờ xuống dưới 5 phút | 6 tháng |
| O3 | Rút ngắn xử lý sự cố | khoảng 2 giờ xuống dưới 15 phút | 6 tháng |
| O4 | Giảm cập nhật lịch thủ công | giảm ít nhất 80% thao tác | 6 tháng |
| O5 | Tăng booking web | đạt 10% tổng booking | 6 tháng |
| O6 | Tăng doanh thu dịch vụ | ít nhất 20% booking web có dịch vụ | 6 tháng |

## Phạm vi

### Trong phạm vi

- Website xem căn, lịch trống, giá, chọn ngày và tạo booking.
- Dịch vụ thuê xe, vé Bà Nà Hills, đưa đón sân bay.
- Dashboard booking và calendar tập trung cho 5 cơ sở.
- Nhập booking Zalo, Facebook, điện thoại, khách vãng lai.
- iCal giả lập Airbnb/Booking.com, đồng bộ thủ công và định kỳ.
- Phát hiện, cảnh báo và xử lý double booking.
- Thu thập thông tin khách để nhân viên hỗ trợ khai báo lưu trú thủ công.
- Quản lý căn, nguồn iCal và danh mục dịch vụ.

### Ngoài phạm vi

- API chính thức trực tiếp của Airbnb/Booking.com.
- Thanh toán trực tuyến thật.
- Kết nối cơ quan công an/dịch vụ công.
- Ứng dụng di động, đa ngôn ngữ, nhiều chi nhánh.
- Channel manager Channex và các tính năng thử nghiệm của OpenStays không thuộc nội dung nghiệm thu.

## Sản phẩm bàn giao

1. Website khách hàng.
2. Hệ thống quản trị trung tâm.
3. Module iCal và cảnh báo double booking.
4. Schema, ERD và demo data.
5. BRD, wireframe và DFD.
6. Test case/UAT và hướng dẫn sử dụng.

## Rủi ro chính

| Rủi ro | Ứng phó |
|---|---|
| iCal một chiều, có độ trễ | Hiển thị lần đồng bộ; nút đồng bộ ngay; nêu rõ giới hạn |
| Logic ngày sai | Dùng khoảng nửa mở `[check-in, check-out)` và test trường hợp biên |
| Vibe Coding thiếu ổn định | Typecheck, unit/integration test và build trước mỗi mốc |
| Lộ dữ liệu CCCD/hộ chiếu | Phân quyền admin; giới hạn dữ liệu; chính sách lưu/xóa; không đưa vào iCal |
| Phạm vi phình to | Chỉ demo module Sóng Homestay; chức năng ngoài scope bị ẩn |

