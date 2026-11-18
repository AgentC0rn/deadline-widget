# Deadline Widget ⏰🤡

Ứng dụng desktop Windows dạng **Floating Widget** (*luôn nổi trên màn hình*), giúp quản lý Checklist công việc, đếm ngược trực tiếp tới từng giây hạn chót (**Deadline**), tự động đồng bộ đầu việc từ **Google Sheet** và bật Popup + âm báo kiểu **"troll / cà khịa"** vui nhộn khi hết giờ mà chưa hoàn thành.

## Tính năng chính

- **Hai chế độ cửa sổ nổi (Always-on-top):**
  - **Mini Pill**: Thanh nổi siêu gọn chỉ hiển thị tên + đồng hồ đếm ngược của công việc gấp nhất và số việc còn lại.
  - **Checklist Panel**: Bảng danh sách đầy đủ có nút **Ghim (Pin)**, kéo thả nhớ vị trí, chỉnh độ trong suốt (*Opacity*) và ẩn xuống **System Tray** góc phải dưới màn hình.
- **Đồng bộ 1 chiều từ Google Sheet (Không cần đăng nhập hay API Key):**
  - Chỉ cần mở Google Sheet → bấm **Share** → chọn **Anyone with the link (Viewer)** → dán link vào phần **Cài đặt (⚙)**.
  - Tự động nhận diện các cột `Tên job`, `Mô tả`, `Deadline` (và `ID`/`Mã job` nếu có); hỗ trợ chọn lại cột thủ công nếu tên cột khác lạ.
  - Hỗ trợ định dạng `DD/MM/YYYY HH:mm`, `YYYY-MM-DD HH:mm`, hoặc chỉ nhập ngày `DD/MM/YYYY` (tự gán giờ hạn chót mặc định cuối ngày).
  - Giữ nguyên trạng thái đã tick hoàn thành trên máy kể cả khi bảng tính chèn dòng mới hoặc sửa mô tả.
- **Báo động `Deadline Alert` tuỳ biến:**
  - **3 chế độ (`Alert Mode`):** `🤡 Troll` (rung lắc + câu thoại cà khịa ngẫu nhiên tự thêm/sửa được), `💼 Nghiêm túc` (lịch sự khi đang họp/share màn hình), `🔕 Im lặng`.
  - **3 hành động trên Popup:** `✅ Xong rồi!`, `⏰ Khất (Snooze)` thêm phút (hết giờ khất chưa xong sẽ réo lại), `🙈 Đóng`.
  - **Kho âm thanh:** 5 âm báo offline tích hợp sẵn (*Sad Trombone, Ba-dum-tss, Còi báo động, Game Over 8-bit, Chuông văn phòng*) + hỗ trợ chọn file `.mp3` / `.wav` từ máy tính.
  - **Chống nổ bù Popup:** Các việc cũ đã quá hạn từ lâu trên Sheet sẽ không làm nổ hàng loạt popup khi vừa kết nối, kèm nút đánh dấu xong nhanh việc cũ.

## Cấu trúc bảng Google Sheet gợi ý

| Tên job | Mô tả | Deadline |
| --- | --- | --- |
| Duyệt thiết kế KV 20/11 | Kiểm tra kích thước dọc + ngang | 20/11/2026 16:30 |
| Gửi báo giá khách hàng A | Đính kèm file PDF chiết khấu | 21/11/2026 |

## Chạy ứng dụng

```powershell
# Cài đặt thư viện (lần đầu)
npm install

# Build và mở ngay ứng dụng Desktop
npm start

# Chạy bộ kiểm thử tự động (Vitest)
npm test

# Kiểm tra kiểu TypeScript
npm run typecheck
```
