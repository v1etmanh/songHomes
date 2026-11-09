# Test Cases và UAT

## Test case chức năng

| ID | Liên kết | Kịch bản | Kết quả mong đợi |
|---|---|---|---|
| TC01 | FR03 | Hai khách cùng đặt một căn/ngày | Một booking thành công; booking còn lại nhận DATES_UNAVAILABLE |
| TC02 | FR04 | Chọn thuê xe 2 ngày | Giá và snapshot dịch vụ có quantity=2 |
| TC03 | FR05 | Gửi yêu cầu đặt phòng | Hold chuyển pending, tiếp tục khóa lịch; không tạo giao dịch thật |
| TC04 | FR06 | Nhập Zalo 10–13/12 | Booking nguồn `manual:zalo`; tạo 3 unitNights |
| TC05 | FR06 | Nhập Facebook 12–14/12 cùng căn | Bị từ chối vì trùng 12/12 |
| TC06 | FR08 | Đồng bộ Airbnb 20–23 và Booking 22–24 | Thêm 2 booking; sinh 1 cảnh báo đêm 22/09 |
| TC07 | FR09 | Đồng bộ lại cùng feed | Không tạo booking/unitNight trùng |
| TC08 | FR11 | 20–23 và 23–25 | Không cảnh báo |
| TC09 | FR12 | Chuyển booking sang căn trống | Căn cũ hết cảnh báo; căn mới giữ lịch; giá không đổi |
| TC10 | FR12 | Hủy một booking trùng | Giải phóng đêm của booking bị hủy |
| TC11 | FR12 | Đã xử lý trên OTA | Cảnh báo rời hàng chờ; có timestamp/note audit |
| TC12 | FR13 | Offline căn có booking | Hệ thống từ chối |
| TC13 | FR14 | Tắt dịch vụ | Dịch vụ không còn xuất hiện với booking mới |
| TC14 | FR15 | Khách gửi thông tin lưu trú | Admin xem và xác nhận được |
| TC15 | FR16 | Một feed lỗi, một feed hợp lệ | Feed hợp lệ vẫn nhập; feed lỗi có trạng thái error |

## Truy vết kiểm thử tự động

- `convex/bookings.test.ts`: conflict transaction, hold, confirm/cancel.
- `convex/icalImport.test.ts`: idempotency, đổi ngày, hủy, trùng, boundary, xử lý.
- `convex/songHomestay.test.ts`: booking ngoài, quản lý căn/dịch vụ, thanh toán tại chỗ.
- `convex/residence.test.ts`: khai báo và xác nhận thông tin lưu trú.
- `shared/ical.test.ts`: parser iCal và sự kiện malformed/cancelled.
- `tests/e2e/song-homestay.e2e.ts`: luồng trình duyệt từ website khách đến dashboard quản trị, 5 cơ sở, 3 dịch vụ và khu vực nhập iCal.

## Kết quả kiểm tra kỹ thuật

Ngày 30/10/2026, bộ mã đã vượt qua các cổng kiểm tra sau trên môi trường local:

| Cổng kiểm tra | Kết quả |
|---|---|
| `npm run typecheck` | Đạt |
| `npm test` | Đạt — 87 tệp, 630 ca |
| `npm run build` | Đạt — ranh giới artifact production hợp lệ |
| `npm run test:e2e:song` | Đạt — 2 luồng trình duyệt Chrome (ẩn danh và tài khoản đã lưu) |
| `git diff --check` | Đạt |

Kết quả kỹ thuật không thay thế chữ ký UAT của đại diện Sóng Homestay. Phiếu dưới đây được để trống có chủ đích để người dùng nghiệp vụ nghiệm thu bằng dữ liệu và quy trình thực tế.

## Phiếu UAT

| Hạng mục | Người kiểm thử | Ngày | Pass/Fail | Ghi chú |
|---|---|---|---|---|
| Khách xem căn và lịch trống |  |  |  |  |
| Khách đặt phòng kèm dịch vụ |  |  |  |  |
| Lễ tân nhập booking Zalo/Facebook |  |  |  |  |
| Đồng bộ và phát hiện trùng |  |  |  |  |
| Lễ tân xử lý cảnh báo |  |  |  |  |
| Quản lý căn và dịch vụ |  |  |  |  |
| Xác nhận thông tin lưu trú |  |  |  |  |

**Kết luận UAT:** Chưa ký / Đạt / Đạt có điều kiện / Không đạt  
**Đại diện Sóng Homestay:** __________________  
**Đại diện Nhóm 45:** __________________

