# Hồ sơ dự án Sóng Homestay

Thư mục này là bộ hồ sơ bàn giao cho đề tài **“Xây dựng Hệ thống Quản lý Booking Tập trung và Đồng bộ Đa kênh cho Sóng Homestay”**.

| Tài liệu | Mục đích |
|---|---|
| [PROJECT_CHARTER.md](./PROJECT_CHARTER.md) | Phạm vi, mục tiêu, mốc, giả định và rủi ro |
| [BRD.md](./BRD.md) | Yêu cầu nghiệp vụ và tiêu chí chấp nhận |
| [ERD.md](./ERD.md) | Mô hình dữ liệu và quy tắc toàn vẹn |
| [DFD.md](./DFD.md) | Luồng dữ liệu đặt phòng, iCal và lưu trú |
| [WIREFRAMES.md](./WIREFRAMES.md) | Wireframe các màn hình chính |
| [TEST_CASES_UAT.md](./TEST_CASES_UAT.md) | Test case, ma trận truy vết và biên bản UAT |
| [USER_GUIDE.md](./USER_GUIDE.md) | Hướng dẫn khách hàng và quản trị viên |
| [DEMO_SCRIPT.md](./DEMO_SCRIPT.md) | Kịch bản demo trước giảng viên |

## Khởi động localhost

```powershell
npm install
npx convex dev
npm run seed
npm run dev
```

Frontend dùng `http://localhost:5173`; Convex local dùng địa chỉ trong `.env.local`. Sóng Homestay cho phép xác nhận booking theo phương thức thanh toán tại homestay nên không cần cổng thanh toán thật.

Inventory chuẩn gồm 5 cơ sở: Garden House, Sea View Apartment, Coastal Apartment, Pool Villa và Rooftop House. Booking trực tiếp được ghi nhận ở trạng thái **Chờ xác nhận** và khóa lịch cho đến khi nhân viên xác nhận hoặc hủy.

Nếu deployment local vẫn chứa bộ dữ liệu Sóng 8 căn cũ, đặt `ALLOW_SONG_RESET=true` trong Convex rồi chạy `npm run song:reset`. Lệnh chỉ reset property có slug `song-homestay`.

## Cổng kiểm soát chất lượng

```powershell
npm run typecheck
npm test
npm run build
```

Sau khi backend local đang chạy bằng `npm run convex:dev`, dùng
`npm run test:e2e:song` để kiểm tra tự động luồng giao diện công khai và khu
vực quản trị của Sóng Homestay.

