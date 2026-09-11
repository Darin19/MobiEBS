# MobiESB demo console

Một prototype có thể thao tác cho MobiESB — trục tích hợp và Data Governance. Ứng dụng chạy được ngay với dữ liệu demo lưu ở trình duyệt; khi có Supabase Auth + Scope phù hợp, dữ liệu và quyền được thực thi tại PostgreSQL qua RLS.

## Chạy local

~~~
npm install
copy .env.example .env.local
npm run dev
~~~

Mở địa chỉ Vite hiển thị trên terminal (mặc định là http://localhost:5173).

## Kết nối Supabase

1. Điền VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào .env.local.
2. Link CLI với project, sau đó áp dụng schema:

   ~~~
   npx supabase db push --linked
   npx supabase db push --linked --include-seed
   ~~~

3. Đảm bảo schema public được expose trong Data API settings.
4. Đăng nhập bằng Supabase Auth. Admin gán auth.users.id của người dùng vào public.user_organization_roles, sau đó gán Scope và Stewardship tương ứng.

Không có Auth session có Scope, giao diện hiển thị **Demo cục bộ · Cần Auth/Scope** và dùng dữ liệu localStorage. Role Switcher chỉ dành cho mô phỏng UX; database không tin vào role ở frontend.

### Scope & stewardship

Các migration Scope & Stewardship bổ sung:

- data_domains, governance_scopes, stewardship_assignments
- scope_change_requests, user_organization_roles, governance_notifications
- Organization / Domain / Asset scope, validity, pause/revoke, acceptance và transfer
- Audit trigger, governance coverage / conflict / expiry views
- RLS cho Data Asset, Catalog fields, DQ, Policies, Data Products và Scope records

Chuỗi kiểm tra quyền là:

~~~
auth.uid()
→ UserOrganizationRole
→ GovernanceScope đang Active + còn hiệu lực
→ StewardshipAssignment
→ Data Domain / Data Asset
~~~

Data Steward chỉ xem/sửa asset trong Scope Active của mình. Admin tích hợp quản lý Scope, Owner, Steward, request và audit; mọi dữ liệu còn lại bị RLS chặn tại Data API.

## Kiểm tra

~~~
npm run typecheck
npm run lint
npm test
npm run build
npx supabase db advisors --linked --type all --level warn
~~~

## Demo flows

- **Storyline A:** Đối tác & Kết nối → Connector test → Data Asset → Pipeline → Run → Trace/Ops.
- **Storyline B:** Asset trong Scope → Policy → Approval → Data Product → Grant → Preflight → Publish → Usage/Audit.
- **Storyline C:** Admin gán Scope / Owner / Steward → Steward Accept → Steward đề xuất thay đổi → Admin review → Audit.

Tất cả hành động kỹ thuật (test connection, chạy pipeline, scan DQ, publish, replay) chỉ tạo/cập nhật bản ghi demo, không gọi hệ thống bên ngoài.
