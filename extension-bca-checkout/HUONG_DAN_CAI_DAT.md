# 🚪📅 HƯỚNG DẪN CÀI ĐẶT & SỬ DỤNG TIỆN ÍCH "BCA AUTO CHECK-OUT & GIA HẠN" (v1.2.0)

Tiện ích mở rộng Chrome/Cốc Cốc/Edge hỗ trợ 2 tính năng chính trên trang Quản lý lưu trú của Bộ Công An (ASM / Dịch vụ công):
1. **🚪 Check-out (Trả phòng / Kết thúc lưu trú)** cho danh sách bệnh nhân ra viện.
2. **📅 Gia hạn lưu trú (Extend Stay)**: Tự động tìm bệnh nhân, tích chọn ô vuông, bấm nút Gia hạn, điền ngày gia hạn mong muốn và xác nhận.

---

## 📌 BƯỚC 1: CÀI ĐẶT EXTENSION VÀO TRÌNH DUYỆT (CHROME / CỐC CỐC / EDGE)

1. Mở trình duyệt Chrome (hoặc Cốc Cốc, Edge, Brave).
2. Truy cập vào trang quản lý tiện ích:
   - **Chrome**: Nhập vào thanh địa chỉ `chrome://extensions/` rồi bấm **Enter**.
   - **Cốc Cốc**: Nhập `coccoc://extensions/`
   - **Edge**: Nhập `edge://extensions/`
3. Ở góc trên cùng bên phải, **bật công tắc "Chế độ dành cho nhà phát triển" (Developer mode)**.
4. Bấm vào nút **"Tải tiện ích đã giải nén" (Load unpacked)** (hoặc nếu đã cài trước đó, chỉ cần bấm biểu tượng **🔄 Tải lại / Reload**).
5. Chọn thư mục tiện ích:
   ```
   C:\Users\MINHTRUONG\.gemini\antigravity-ide\scratch\kblt-converter\extension-bca-checkout
   ```
6. Tiện ích **"BCA Auto Check-out & Gia Hạn | Bộ Công An" (v1.2.0)** sẽ xuất hiện trên thanh công cụ! (Bấm biểu tượng mảnh ghép 🧩 và ghim 📌 tiện ích ra ngoài).

---

## 🚀 BƯỚC 2: CÁCH DÙNG TÍNH NĂNG GIA HẠN LƯU TRÚ

1. Mở trang web **Quản lý thông báo lưu trú (Bộ Công An)**.
2. Bảng điều khiển sẽ tự động hiển thị ở góc phải màn hình.
3. Ở đầu Tab 1 (📥 Nạp DS), chọn nút:
   - **📅 Gia hạn lưu trú** (nút sẽ chuyển sang màu xanh lá).
4. **Chọn ngày gia hạn**:
   - Nhập ngày trực tiếp theo định dạng `DD/MM/YYYY` (ví dụ: `09/10/2026`).
   - Hoặc click vào biểu tượng 📅 lịch để chọn ngày.
   - Hoặc click nhanh các nút gợi ý: `+3 ngày`, `+7 ngày`, `+10 ngày`, `+14 ngày`, `+30 ngày`.
5. **Nạp danh sách bệnh nhân**:
   - Kéo thả file Excel bệnh nhân còn nằm viện hoặc dán danh sách tên vào ô văn bản.
6. Bấm nút **"➡️ Nạp & Chuyển Sang Tiến Trình"**.
7. Bấm **"▶️ BẮT ĐẦU GIA HẠN"**:
   - 🤖 Tiện ích tự động tìm bệnh nhân theo Tên / CCCD.
   - ☑️ Tự động tích chọn checkbox của bệnh nhân trên bảng.
   - 📅 Bấm nút **"Gia hạn"** (trên thanh công cụ hoặc cột Hành động).
   - 📋 Hộp thoại **"GIA HẠN LƯU TRÚ"** mở ra.
   - ✍️ Tự động điền ngày gia hạn đã chọn (ví dụ: `09/10/2026`).
   - 🟢 Bấm nút xanh lá **"Gia hạn"** xác nhận trong hộp thoại.
   - ⏭️ Chờ xử lý xong và tự động chuyển sang bệnh nhân kế tiếp!

---

## 🚪 BƯỚC 3: CÁCH DÙNG TÍNH NĂNG TRẢ PHÒNG (CHECK-OUT)

1. Chọn chế độ **🚪 Trả phòng (Check-out)** ở Tab 1.
2. Kéo thả file Excel `DS_Ra_Vien_...xlsx` hoặc dán danh sách tên.
3. Bấm **"➡️ Nạp & Chuyển Sang Tiến Trình"**.
4. Bấm **"▶️ BẮT ĐẦU TRẢ PHÒNG"**:
   - Tiện ích tự tìm BN, tích chọn checkbox, bấm Trả phòng và tự động ấn "Có / Xác nhận".

---

## ⚙️ CÁC TÍNH NĂNG NÂNG CAO

- **Chế độ từng bước (Step-by-step)**: Bấm nút `⏭️ Bước` nếu bạn muốn kiểm tra từng người một cách cẩn thận.
- **Tùy chỉnh thời gian chờ (Delay)**: Có thể chỉnh 1.2s - 3.5s tùy theo tốc độ mạng của bệnh viện.
- **Tùy chỉnh Bộ chọn (Element Picker)**: Nếu giao diện web có thay đổi, chuyển sang tab `⚙️ Tùy Chỉnh Nút` và bấm nút `🎯 Chọn` để click trực tiếp vào nút trên màn hình.
- **Xuất báo cáo kết quả**: Sau khi chạy xong, có nút bấm tải file Excel báo cáo chi tiết ai đã gia hạn / trả phòng thành công, ai không tìm thấy.

