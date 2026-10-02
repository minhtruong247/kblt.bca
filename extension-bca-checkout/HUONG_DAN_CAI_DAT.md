# 🚪 HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG TIỆN ÍCH "BCA AUTO CHECK-OUT"

Tiện ích mở rộng Chrome/Cốc Cốc/Edge hỗ trợ **tự động tìm kiếm và thực hiện Check-out (Trả phòng / Kết thúc lưu trú)** cho danh sách bệnh nhân ra viện trên trang Quản lý lưu trú của Bộ Công An (ASM / Dịch vụ công).

---

## 📌 BƯỚC 1: CÀI ĐẶT EXTENSION VÀO TRÌNH DUYỆT (CHROME / CỐC CỐC / EDGE)

1. Mở trình duyệt Chrome (hoặc Cốc Cốc, Edge, Brave).
2. Truy cập vào trang quản lý tiện ích:
   - **Chrome**: Nhập vào thanh địa chỉ `chrome://extensions/` rồi bấm **Enter**.
   - **Cốc Cốc**: Nhập `coccoc://extensions/`
   - **Edge**: Nhập `edge://extensions/`
3. Ở góc trên cùng bên phải, **bật công tắc "Chế độ dành cho nhà phát triển" (Developer mode)**.
4. Bấm vào nút **"Tải tiện ích đã giải nén" (Load unpacked)** ở góc trên bên trái.
5. Chọn thư mục tiện ích:
   ```
   C:\Users\MINHTRUONG\.gemini\antigravity-ide\scratch\kblt-converter\extension-bca-checkout
   ```
6. Tiện ích **"BCA Auto Check-out | Tự Động Trả Phòng Bộ Công An"** sẽ xuất hiện trên thanh công cụ! (Bạn có thể bấm biểu tượng mảnh ghép 🧩 và ghim 📌 tiện ích ra ngoài).

---

## 🚀 BƯỚC 2: CÁCH SỬ DỤNG TỰ ĐỘNG TRẢ PHÒNG

1. Mở trang web Quản lý lưu trú của Bộ Công An (ví dụ: trang danh sách khách đang lưu trú).
2. Ngay trên màn hình web, một **Bảng điều khiển thông minh (BCA Auto Check-out)** sẽ tự động xuất hiện ở góc phải màn hình:
   - Bạn có thể **kéo thả** bảng điều khiển đến vị trí bất kỳ để không bị che khuất.
   - Bấm nút `_` để thu nhỏ thành nút bấm gọn gàng.
3. **Nạp danh sách bệnh nhân ra viện**:
   - **Cách 1**: Kéo thả file Excel `DS_Ra_Vien_...xlsx` hoặc `BCA_Ra_Vien_...xlsx` (vừa tải từ công cụ so sánh) vào ô nạp file.
   - **Cách 2**: Dán danh sách Họ tên / CCCD trực tiếp vào ô văn bản (mỗi người 1 dòng).
4. Chọn chế độ tìm kiếm: **Họ và tên** (mặc định) hoặc **Số CCCD / CMND**.
5. Bấm nút **"➡️ Nạp & Chuyển Sang Tiến Trình"**.
6. Bấm **"▶️ BẮT ĐẦU TỰ ĐỘNG"**:
   - 🤖 Tiện ích sẽ tự động dán từng tên vào ô tìm kiếm.
   - 🔍 Bấm nút Tìm kiếm & chờ trang tải kết quả.
   - 🎯 Tìm chính xác dòng của bệnh nhân và làm nổi bật (Highlight màu vàng).
   - 🚪 Bấm nút **"Trả phòng" / "Check-out"**.
   - 💬 Tự động ấn **"Xác nhận / Đồng ý"** trên hộp thoại popup.
   - ⏭️ Tự động chuyển tiếp đến người tiếp theo cho đến khi hoàn thành hết danh sách!

---

## ⚙️ CÁC TÍNH NĂNG NÂNG CAO

- **Chế độ từng bước (Step-by-step)**: Bấm nút `⏭️ Bước` nếu bạn muốn kiểm tra từng người một cách cẩn thận.
- **Tùy chỉnh thời gian chờ (Delay)**: Có thể chỉnh 1.2s - 3.5s tùy theo tốc độ mạng của bệnh viện.
- **Tùy chỉnh Bộ chọn (Element Picker)**: Nếu giao diện web có thay đổi, chuyển sang tab `⚙️ Cấu Hình` và bấm nút `🎯 Chọn` để click trực tiếp vào ô tìm kiếm hoặc nút trả phòng trên màn hình.
- **Xuất báo cáo kết quả**: Sau khi chạy xong, có nút bấm tải file Excel báo cáo chi tiết ai đã trả phòng thành công, ai không tìm thấy.
