# ĐẠI CHIẾN ÁP SUẤT — Hướng dẫn chạy game

Game đấu trường 4 người chơi trên trình duyệt (khoảng 3 phút một trận). Mỗi tổ điều khiển một kỹ thuật viên hệ thống tưới, đấu nhau bằng súng phun nước áp suất cao. Xen giữa trận là 5 "sự cố hệ thống" (5 câu hỏi về nghề). **Khi chơi không cần Internet.**

---

## Bước 1 — Cài Node.js (chỉ 1 lần, chỉ trên máy chủ)

Chỉ **máy chủ** (máy chạy game) mới cần cài. 3 máy còn lại chỉ cần trình duyệt **Chrome, Edge hoặc Cốc Cốc**.

1. Vào **https://nodejs.org**, tải bản **LTS**.
2. Mở file vừa tải, bấm **Next** liên tục rồi **Install**, xong thì bấm **Finish**.

> Bước này cần Internet, nên cài sẵn ở nhà.

## Bước 2 — Giải nén và bật server

1. Chuột phải vào `dai-chien-ap-suat.zip` → **Extract All…** → **Extract**.
2. Mở thư mục vừa giải nén, bấm đúp **`CHAY-GAME.bat`**.
3. Cửa sổ đen hiện **"SERVER ĐÃ CHẠY"** và địa chỉ, ví dụ `http://192.168.1.15:3000`.
4. **Lần đầu chạy**, Windows hiện bảng *Windows Defender Firewall*: tích **cả 2 ô** (Private và Public) → bấm **Allow access**.
5. **Không tắt cửa sổ đen** trong lúc chơi.

## Bước 3 — 4 máy vào game

1. **Cả 4 máy phải chung một Wi-Fi** (hoặc chung một router).
2. Mỗi máy mở trình duyệt, gõ địa chỉ trên cửa sổ đen, ví dụ `http://192.168.1.15:3000`. Nếu máy chủ cũng chơi thì máy đó gõ `http://localhost:3000`.
3. Nhập **tên**, chọn **tổ**, chọn **nhân vật** → bấm **VÀO PHÒNG CHỜ**.
4. Người vào đầu tiên là **chủ phòng**. Đủ 4 người thì chủ phòng bấm **BẮT ĐẦU TRẬN ĐẤU**.

> **Nên phóng to cửa sổ trình duyệt (F11 để toàn màn hình)** cho dễ chơi.

### Màn hình chiếu cho cả lớp xem (không bắt buộc)

Máy nối với máy chiếu mở địa chỉ thêm `/screen` ở cuối, ví dụ `http://192.168.1.15:3000/screen`. Màn hình này thấy toàn bộ bản đồ, cả 4 nhân vật và câu hỏi. Có nút **HỦY TRẬN** và **CHƠI LẠI** để giáo viên điều khiển.

---

## Điều khiển

| Phím | Tác dụng |
|---|---|
| `W` `A` `S` `D` hoặc phím mũi tên | Di chuyển |
| Chuột | Ngắm |
| Giữ chuột trái | Phun nước |
| `Space` hoặc `Shift` | Lướt nhanh để né |
| `1` `2` `3` `4` hoặc click | Trả lời câu hỏi khi có sự cố |

## Luật chơi

- Mỗi phát phun tốn nước. **Hết nước → chạy về TRẠM BƠM** ở giữa bản đồ để nạp rất nhanh. Bình cũng tự hồi chậm khi không bắn.
- Trúng tia nước thì mất máu. **Hết máu là bị loại.**
- Đầu trận có 15 giây chiến đấu, sau đó cứ 12 giây lại có **SỰ CỐ HỆ THỐNG** (tổng 5 câu). Trận đấu dừng lại, cả 4 người trả lời trong 10 giây:
  - **Đúng** → nhận linh kiện nâng cấp và được nạp đầy nước.
  - **Sai / hết giờ** → **rò rỉ**: mất 20 máu và hết sạch nước (có thể bị loại luôn!).
  - **Người đúng nhanh nhất** được **KHÓA VAN** một đối thủ, làm người đó đứng im 3 giây khi trận tiếp tục.
- Sau mỗi sự cố, **vùng hạn hán** (màu cam, đất nứt) thu hẹp vào giữa. Đứng ngoài vùng xanh sẽ mất máu. Vòng chấm trắng là vùng an toàn kế tiếp.
- Sau câu 5 là **VÒNG CUỐI**: hạn hán thu hẹp tới tâm. **Người cuối cùng còn đứng là nhà vô địch.**

### 4 nhân vật

| Nhân vật | Điểm mạnh |
|---|---|
| **THỢ ỐNG** | Nhiều máu nhất (70) |
| **KỸ SƯ BƠM** | Tia nước mạnh nhất |
| **CHUYÊN GIA IOT** | Bình nước to, hồi nước nhanh, bắn liên tục |
| **THỢ ĐIỆN** | Chạy nhanh nhất, lướt gần như liên tục |

### 5 linh kiện (thưởng khi trả lời đúng câu 1 → 5)

| Câu | Linh kiện | Tác dụng |
|---|---|---|
| 1 | Bơm tăng áp | +35% sát thương |
| 2 | Bình chứa lớn | +50 sức chứa nước, hồi nước nhanh hơn |
| 3 | Van điện từ | Khiên chặn 25 sát thương |
| 4 | Béc phun xoay | Phun 3 tia cùng lúc |
| 5 | Bộ điều khiển IoT | +20% tốc độ, lướt hồi nhanh gấp đôi |

---

## Sửa câu hỏi

Mở **`questions.json`** bằng Notepad. Mỗi câu có dạng:

```json
{
  "topic": "Nhiệm vụ 3 · Thu nhập",
  "question": "Nội dung câu hỏi?",
  "options": ["Đáp án A", "Đáp án B", "Đáp án C", "Đáp án D"],
  "correct": 1,
  "explain": "Giải thích hiện ra sau khi công bố đáp án."
}
```

- `"correct"` là số thứ tự đáp án đúng, **đếm từ 0**: A = 0, B = 1, C = 2, D = 3.
- Giữ nguyên dấu `"` và dấu `,` giữa các câu. Khi lưu, chọn Encoding **UTF-8**.
- Sửa xong thì tắt server và bật lại `CHAY-GAME.bat`.

## Chỉnh thời gian / độ khó

Mở `server.js` bằng Notepad, tìm phần **CÀI ĐẶT TRẬN ĐẤU** ở đầu file:

| Tên | Ý nghĩa | Mặc định |
|---|---|---|
| `FIRST_COMBAT` | Giây chiến đấu trước sự cố đầu tiên | 15 |
| `COMBAT` | Giây chiến đấu giữa các sự cố | 12 |
| `QUIZ_TIME` | Giây trả lời câu hỏi | 10 |
| `LEAK_DAMAGE` | Máu mất khi trả lời sai | 20 |
| `LOCK_DURATION` | Giây bị khóa van | 3 |
| `DROUGHT_DPS` | Máu mất mỗi giây trong vùng hạn hán | 15 |
| `MIN_PLAYERS` | Số người tối thiểu để bấm Bắt đầu | 2 |

---

## Gặp lỗi thì sao?

| Hiện tượng | Cách sửa |
|---|---|
| Báo **chưa cài Node.js** | Làm lại Bước 1 rồi khởi động lại máy |
| Máy khác **không vào được** | ① Kiểm tra 4 máy cùng một Wi-Fi. ② *Windows Defender Firewall* → *Allow an app through firewall* → tích **Node.js** ở cả Private và Public. ③ Thử địa chỉ khác trong danh sách trên cửa sổ đen. ④ Wi-Fi trường có thể chặn các máy kết nối với nhau → dùng **điện thoại phát Wi-Fi (hotspot)** cho cả 4 máy bắt |
| Báo **cổng 3000 đang bị dùng** | Server đã bật ở cửa sổ khác, đóng cửa sổ đó rồi chạy lại |
| Lỡ **tải lại trang** giữa trận | Mở lại đúng tab đó, game tự vào lại. Nếu đã đóng tab: mở lại địa chỉ game, bấm nút **VÀO LẠI** ở cuối màn hình |
| Game giật | Đóng bớt chương trình khác. Nên để máy chủ cắm điện |

> **Chạy thử ở nhà:** mở 2–4 cửa sổ trình duyệt tại `http://localhost:3000` trên cùng một máy, mỗi cửa sổ chọn một tổ và một nhân vật khác nhau.
