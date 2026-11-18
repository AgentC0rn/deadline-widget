# Deadline Widget

Ứng dụng checklist công việc dạng cửa sổ nổi luôn hiển thị trên màn hình, đếm ngược thời gian thực tới hạn chót, đồng bộ đầu việc từ Google Sheet và bật thông báo vui nhộn khi hết giờ.

## Language

### Công việc & Nguồn dữ liệu

**Job**:
Một đầu việc cần hoàn thành trước một thời điểm xác định, bao gồm tên, mô tả, **Deadline** và trạng thái hoàn thành.
_Avoid_: Task, Todo, Item

**Sheet Job**:
Một **Job** được quét và đồng bộ tự động từ **Source Sheet**, được nhận diện bằng khoá ổn định để giữ nguyên trạng thái hoàn thành khi bảng tính thay đổi thứ tự dòng.
_Avoid_: Remote task, Imported item

**Local Job**:
Một **Job** do người dùng tạo trực tiếp ngay trên ứng dụng, không nằm trên **Source Sheet**.
_Avoid_: Manual task, Custom todo

**Source Sheet**:
Bảng tính Google Sheet được liên kết làm nguồn cung cấp danh sách **Sheet Job** theo chiều đọc một chiều.
_Avoid_: Upstream database, Sync table

**Deadline**:
Thời điểm cụ thể (ngày và giờ) mà một **Job** phải hoàn tất; là mốc để tính thời gian còn lại hoặc thời gian quá hạn.
_Avoid_: Due date, End time

**Overdue**:
Trạng thái của một **Job** chưa hoàn thành khi thời gian hiện tại đã vượt qua **Deadline**, lúc này đồng hồ đếm thời gian trễ âm.
_Avoid_: Expired, Past due, Late

### Giao diện & Cảnh báo

**Mini Pill**:
Chế độ thu gọn tối giản của cửa sổ nổi trên màn hình, chỉ hiển thị đồng hồ đếm ngược của **Job** chưa hoàn thành gấp nhất và số lượng việc còn lại.
_Avoid_: Minimized bar, Badge view

**Checklist Panel**:
Chế độ mở rộng của cửa sổ nổi hiển thị danh sách **Job** sắp xếp theo độ gấp, mô tả, bộ đếm giờ chi tiết và ô đánh dấu hoàn thành.
_Avoid_: Main window, Full list

**Deadline Alert**:
Cửa sổ popup cảnh báo kèm âm thanh xuất hiện khi một **Job** chưa hoàn thành chạm mốc hết giờ (**Deadline**).
_Avoid_: System toast, Alarm

**Alert Mode**:
Chế độ hiển thị và hành vi của **Deadline Alert** do người dùng chọn trong cài đặt, gồm ba mức: `Troll` (cà khịa vui nhộn), `Serious` (nghiêm túc văn phòng) và `Silent` (chỉ nhấp nháy trên cửa sổ nổi, không bung popup).
_Avoid_: Notification theme, Do not disturb

**Snooze**:
Hành động tạm khất một **Deadline Alert** thêm một khoảng thời gian ngắn (ví dụ 10 phút); hết khoảng khất mà **Job** vẫn chưa hoàn thành thì **Deadline Alert** sẽ kích hoạt lại.
_Avoid_: Postpone deadline, Delay job
