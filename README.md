# MobiESB demo console

Một prototype có thể thao tác cho MobiESB — trục tích hợp và Data Governance. Ứng dụng chạy được ngay với dữ liệu demo lưu ở trình duyệt; khi cấu hình Supabase, các mutation sẽ đồng thời được đồng bộ vào PostgreSQL.

## Chạy local

```bash
npm install
copy .env.example .env.local
npm run dev
```

Mở địa chỉ Vite hiển thị trên terminal (mặc định `http://localhost:5173`).

## Kết nối Supabase

1. Tạo một Supabase project và chạy lần lượt `supabase/migrations/001_init.sql`, sau đó `supabase/seed.sql` trong SQL Editor.
2. Điền `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` vào `.env.local`.
3. Khởi động lại `npm run dev`.

Project MobiEBS hiện đã được khởi tạo bằng migration và seed này. Khi dùng một Supabase project khác, hãy chạy hai file SQL trên trước rồi refresh ứng dụng. Nếu vẫn nhận lỗi schema cache, kiểm tra phần **Data API settings** của Supabase Dashboard để đảm bảo schema `public` được expose.

Migration bật RLS cho mọi bảng nhưng có policy CRUD rộng cho `anon`/`authenticated` để demo chạy không cần Auth. Chính sách đó chỉ phù hợp demo; phải thay bằng policy theo người dùng/tổ chức trước khi dùng ở production.

Không có credential, thanh thông tin đầu trang hiển thị **Demo cục bộ**. Luồng CRUD và mô phỏng runtime vẫn hoạt động trong localStorage; khi Supabase được cấu hình, cùng mutation đó được gửi lên bảng quan hệ tương ứng.

## Kiểm tra

```bash
npm run typecheck
npm run lint
npm run build
```

## Demo flows

- **Storyline A:** Đối tác & Kết nối → Connector test → Data Asset → Pipeline → Run → Trace/Ops.
- **Storyline B:** Asset → Policy → Approval (đổi role Data Owner) → Data Product → Grant → Preflight → Publish → Usage/Audit.

Tất cả hành động kỹ thuật (test connection, chạy pipeline, scan DQ, publish, replay) chỉ tạo/cập nhật bản ghi demo, không gọi hệ thống bên ngoài.
