-- MobiESB demo seed
-- Safe to re-run: fixed UUIDs use ON CONFLICT DO NOTHING.

insert into public.organizations (id, code, name, short_name, organization_type, contact_person, contact_email, owner_team, status) values
  ('10000000-0000-4000-8000-000000000001', 'DV-BTC', 'Bộ Tài chính', 'BTC', 'Cơ quan nhà nước', 'Nguyễn Minh Anh', 'anh.nm@btc.gov.vn', 'Trung tâm Dữ liệu', 'Active'),
  ('10000000-0000-4000-8000-000000000002', 'DV-DVCQG', 'Cổng DVC Quốc gia', 'DVCQG', 'Nền tảng quốc gia', 'Trần Quốc Huy', 'huy.tq@dvcqg.gov.vn', 'Đội Tích hợp', 'Active'),
  ('10000000-0000-4000-8000-000000000003', 'DV-VNEID', 'VNeID', 'VNeID', 'Nền tảng định danh', 'Lê Thu Hà', 'ha.lt@vneid.gov.vn', 'API Platform', 'Active'),
  ('10000000-0000-4000-8000-000000000004', 'DV-TCT', 'Cơ quan Thuế', 'TCT', 'Cơ quan nhà nước', 'Phạm Quốc Minh', 'minh.pq@tax.gov.vn', 'Data Services', 'Warning'),
  ('10000000-0000-4000-8000-000000000005', 'DV-HQ', 'Cơ quan Hải quan', 'HQ', 'Cơ quan nhà nước', 'Đỗ Việt Long', 'long.dv@customs.gov.vn', 'Integration', 'Paused')
on conflict (id) do nothing;

insert into public.systems (id, organization_id, code, name, technology, status, description) values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', 'SYS-DVCQG', 'DVCQG', 'REST API', 'Active', 'Hệ thống tiếp nhận hồ sơ thủ tục hành chính.'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'SYS-ODS', 'ODS Bộ Tài chính', 'PostgreSQL', 'Active', 'Operational data store phục vụ tổng hợp.'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'SYS-VNEID', 'VNeID Identity', 'OIDC', 'Active', 'Dịch vụ định danh điện tử.'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'SYS-TAX', 'Thuế doanh nghiệp', 'Oracle Database', 'Warning', 'Nguồn dữ liệu thuế môi trường UAT.')
on conflict (id) do nothing;

insert into public.system_environments (id, system_id, name, base_url, network_zone, status) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'PROD', 'https://api.dichvucong.gov.vn', 'Government WAN', 'Active'),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', 'PROD', 'postgresql://ods.prod.internal', 'Private DC', 'Active'),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'PROD', 'https://id.vneid.gov.vn', 'Government WAN', 'Active'),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'UAT', 'oracle://tax-uat.internal', 'DMZ', 'Warning')
on conflict (id) do nothing;

insert into public.connectors (id, system_environment_id, code, name, type, direction, endpoint, protocol, timeout, status, health_status, last_latency_ms, last_checked_at, secret_ref, masked_hint, expires_at) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'DVCQG-HOSO-PROD', 'DVCQG Hồ sơ PROD', 'REST API', 'Inbound', '/v2/hoso/stream', 'HTTPS', 30, 'Active', 'Healthy', 182, now(), 'secret/dvcqg/hoso/prod', 'api_••••8K9P', '2027-06-30T00:00:00Z'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'VNEID-SSO-PROD', 'VNeID SSO PROD', 'OAuth2/OIDC', 'Inbound', '/oauth2/token', 'HTTPS', 20, 'Active', 'Healthy', 94, now(), 'secret/vneid/oauth/prod', 'cl_••••4H2Q', null),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000004', 'TAX-ENTERPRISE-DB', 'Thuế doanh nghiệp UAT', 'Database', 'Inbound', 'tax-uat.internal:1521/enterprise', 'JDBC', 45, 'Active', 'Warning', 620, now(), 'secret/tax/db/uat', 'db_••••1N7R', null),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000002', 'REPORT-BTC-EVENT', 'Báo cáo BTC Event', 'Event', 'Outbound', 'mobiesb.reporting.completed', 'AMQP (mock)', 15, 'Active', 'Healthy', 41, now(), 'secret/event/report', 'ev_••••9D1A', null),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000004', 'LAND-FILE-SFTP', 'Đất đai SFTP', 'SFTP/File', 'Inbound', 'sftp://land-uat.gov.vn/inbox', 'SFTP', 60, 'Paused', 'Unknown', null, null, 'secret/land/sftp', 'sf_••••3Z6M', null)
on conflict (id) do nothing;

insert into public.connector_tests (id, connector_id, result, latency_ms, checked_at, response_sample) values
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Success', 182, now(), '{"status":"ok","version":"v2"}')
on conflict (id) do nothing;

insert into public.data_assets (id, connector_id, code, name, role, technology, domain, owner, steward, classification, status, dq_score) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'DVC.HoSoThuTuc', 'Hồ sơ thủ tục hành chính', 'Source', 'API Schema', 'Dịch vụ công', 'Cổng DVC Quốc gia', 'Lê Thu Hà', 'Internal', 'Active', 98),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'INV.DuAnDauTu', 'Dự án đầu tư', 'Source', 'PostgreSQL', 'Đầu tư', 'Bộ Tài chính', 'Nguyễn Minh Anh', 'Restricted', 'Active', 96),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'TAX.ThongTinThueDN', 'Thông tin thuế doanh nghiệp', 'Source', 'Database', 'Thuế', 'Cơ quan Thuế', 'Phạm Quốc Minh', 'Restricted', 'Active', 91),
  ('50000000-0000-4000-8000-000000000004', null, 'REF.DanhMucDiaBan', 'Danh mục địa bàn', 'Both', 'API Schema', 'Tham chiếu', 'Bộ Tài chính', 'Nguyễn Minh Anh', 'Public', 'Active', 100),
  ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', 'CUSTOMS.XuatNhapKhau', 'Xuất nhập khẩu', 'Source', 'File Schema', 'Hải quan', 'Cơ quan Hải quan', 'Đỗ Việt Long', 'Restricted', 'Paused', 88),
  ('50000000-0000-4000-8000-000000000006', '40000000-0000-4000-8000-000000000004', 'ODS.HoSo', 'ODS Hồ sơ', 'Target', 'PostgreSQL', 'Dịch vụ công', 'Bộ Tài chính', 'Nguyễn Minh Anh', 'Internal', 'Active', 99)
on conflict (id) do nothing;

insert into public.asset_fields (id, asset_id, technical_name, business_name, data_type, nullable, is_primary_key, classification, definition, dq_score) values
  ('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'ma_ho_so', 'Mã hồ sơ', 'varchar(36)', false, true, 'Internal', 'Định danh duy nhất của hồ sơ.', 100),
  ('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'ma_tthc', 'Mã thủ tục hành chính', 'varchar(20)', false, false, 'Internal', 'Mã thủ tục theo danh mục DVC.', 99),
  ('51000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', 'trang_thai', 'Trạng thái xử lý', 'varchar(32)', false, false, 'Internal', 'Trạng thái mới nhất của hồ sơ.', 98),
  ('51000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000001', 'ngay_tiep_nhan', 'Ngày tiếp nhận', 'timestamptz', false, false, 'Internal', 'Thời điểm tiếp nhận tại DVCQG.', 97),
  ('51000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000001', 'cccd', 'Số CCCD', 'varchar(12)', true, false, 'Personal Data', 'Số định danh cá nhân của người nộp hồ sơ.', 95),
  ('51000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000002', 'ma_du_an', 'Mã dự án', 'varchar(32)', false, true, 'Restricted', 'Định danh dự án đầu tư.', 100),
  ('51000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000002', 'ten_du_an', 'Tên dự án', 'text', false, false, 'Restricted', 'Tên đầy đủ của dự án.', 98),
  ('51000000-0000-4000-8000-000000000008', '50000000-0000-4000-8000-000000000002', 'trang_thai_du_an', 'Trạng thái dự án', 'varchar(32)', false, false, 'Internal', 'Trạng thái phê duyệt và triển khai.', 97),
  ('51000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000002', 'tong_muc_dau_tu', 'Tổng mức đầu tư', 'numeric(18,2)', true, false, 'Sensitive', 'Tổng mức đầu tư được phê duyệt.', 94),
  ('51000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000002', 'chu_dau_tu', 'Chủ đầu tư', 'text', true, false, 'Sensitive', 'Tên chủ đầu tư.', 96)
on conflict (id) do nothing;

insert into public.schema_snapshots (id, asset_id, version, changes) values
  ('52000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000003', '2026.09.09.1', '[{"kind":"Added","field":"ma_chi_nhanh","detail":"varchar(20)"},{"kind":"Added","field":"ngay_khoa_so","detail":"date"}]'::jsonb)
on conflict (id) do nothing;

insert into public.pipelines (id, code, name, source_asset_id, target_asset_id, sync_mode, trigger, schedule, status, dq_gate, runtime_config) values
  ('60000000-0000-4000-8000-000000000001', 'PL-001', 'Đồng bộ hồ sơ DVCQG', '50000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000006', 'Incremental', 'Webhook', null, 'Active', true, '{"maxRetry":3,"timeoutSeconds":60,"checkpointEnabled":true,"reconcileMode":"Count"}'::jsonb),
  ('60000000-0000-4000-8000-000000000002', 'PL-002', 'Đồng bộ dữ liệu thuế', '50000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000006', 'CDC', 'Schedule', '*/5 * * * *', 'Active', true, '{"maxRetry":4,"timeoutSeconds":90,"checkpointEnabled":true,"reconcileMode":"Hash"}'::jsonb),
  ('60000000-0000-4000-8000-000000000003', 'PL-003', 'Đồng bộ danh mục dùng chung', '50000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000006', 'Incremental', 'Schedule', '0 1 * * *', 'Active', true, '{"maxRetry":2,"timeoutSeconds":45,"checkpointEnabled":true,"reconcileMode":"Count"}'::jsonb),
  ('60000000-0000-4000-8000-000000000004', 'PL-004', 'Nạp dữ liệu đất đai', '50000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000006', 'Full', 'File arrival', null, 'Paused', true, '{"maxRetry":1,"timeoutSeconds":120,"checkpointEnabled":false,"reconcileMode":"None"}'::jsonb),
  ('60000000-0000-4000-8000-000000000005', 'PL-005', 'Đồng bộ xuất nhập khẩu', '50000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000006', 'Incremental', 'Schedule', '*/15 * * * *', 'Draft', false, '{"maxRetry":3,"timeoutSeconds":60,"checkpointEnabled":true,"reconcileMode":"Count"}'::jsonb)
on conflict (id) do nothing;

insert into public.pipeline_mappings (id, pipeline_id, source_field, target_field, data_type, transform_type, transform_expression, required) values
  ('61000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', 'ma_ho_so', 'ma_ho_so', 'varchar(36)', 'Direct', null, true),
  ('61000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000001', 'ma_tthc', 'ma_tthc', 'varchar(20)', 'Direct', null, true),
  ('61000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000001', 'trang_thai', 'trang_thai', 'varchar(32)', 'Direct', null, true),
  ('61000000-0000-4000-8000-000000000004', '60000000-0000-4000-8000-000000000001', 'ngay_tiep_nhan', 'ngay_tiep_nhan', 'timestamptz', 'Cast', 'to_timestamp(value)', true),
  ('61000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000001', 'cccd', 'cccd_hash', 'varchar(64)', 'Expression', 'sha256(value)', false)
on conflict (id) do nothing;

insert into public.dq_rules (id, asset_id, name, type, threshold, action_on_fail, status) values
  ('70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Mã hồ sơ bắt buộc', 'Required', 99, 'Reject', 'Active'),
  ('70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'Mã dự án duy nhất', 'Unique', 99, 'Quarantine', 'Active')
on conflict (id) do nothing;

insert into public.dq_runs (id, asset_id, score, dimension_scores, violations, run_at) values
  ('71000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 96, '{"Completeness":98,"Validity":95,"Uniqueness":97,"Consistency":94}'::jsonb, 14, now())
on conflict (id) do nothing;

insert into public.policies (id, code, name, asset_id, status, data_steward, owner, purpose, allowed_organizations, field_allowlist, row_filter, masking, min_dq_score, valid_from, valid_to, version) values
  ('80000000-0000-4000-8000-000000000001', 'POL-031', 'Chia sẻ hồ sơ TTHC cho Bộ Tài chính', '50000000-0000-4000-8000-000000000001', 'Approved', 'Lê Thu Hà', 'Nguyễn Minh Anh', 'Đối soát dịch vụ công', array['DV-BTC'], array['ma_ho_so','ma_tthc','trang_thai','ngay_tiep_nhan'], 'trang_thai IN (''Đã tiếp nhận'',''Đã hoàn thành'')', '{"cccd":"Hash"}'::jsonb, 95, '2026-07-01', '2026-10-01', '1.3'),
  ('80000000-0000-4000-8000-000000000002', 'POL-032', 'Khai thác dữ liệu dự án đầu tư', '50000000-0000-4000-8000-000000000002', 'Approved', 'Nguyễn Minh Anh', 'Nguyễn Minh Anh', 'Tổng hợp và giám sát đầu tư công', array['DV-BTC'], array['ma_du_an','ten_du_an','trang_thai_du_an','tong_muc_dau_tu'], 'trang_thai_du_an = ''Đang triển khai''', '{"chu_dau_tu":"Partial"}'::jsonb, 93, '2026-01-01', '2027-01-01', '2.3'),
  ('80000000-0000-4000-8000-000000000003', 'POL-033', 'Dữ liệu thuế doanh nghiệp', '50000000-0000-4000-8000-000000000003', 'Pending Approval', 'Phạm Quốc Minh', 'Nguyễn Minh Anh', 'Phân tích nghĩa vụ thuế', array['DV-BTC'], array['ma_so_thue','nam_tai_chinh'], 'nam_tai_chinh >= 2025', '{}'::jsonb, 95, '2026-09-01', null, '1.0'),
  ('80000000-0000-4000-8000-000000000004', 'POL-034', 'Danh mục địa bàn dùng chung', '50000000-0000-4000-8000-000000000004', 'Approved', 'Nguyễn Minh Anh', 'Nguyễn Minh Anh', 'Dùng chung toàn hệ sinh thái', array['DV-BTC','DV-DVCQG','DV-VNEID'], array['ma_dia_ban','ten_dia_ban'], 'true', '{}'::jsonb, 90, '2026-01-01', null, '4.0')
on conflict (id) do nothing;

insert into public.policy_fields (id, policy_id, asset_field_id, masking) values
  ('82000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'None'),
  ('82000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 'None'),
  ('82000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000006', 'None'),
  ('82000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000002', '51000000-0000-4000-8000-000000000009', 'None')
on conflict (id) do nothing;

insert into public.approvals (id, entity_type, entity_id, title, status, requester) values
  ('81000000-0000-4000-8000-000000000001', 'Policy', '80000000-0000-4000-8000-000000000003', 'POL-033 · Dữ liệu thuế doanh nghiệp', 'Pending Approval', 'Phạm Quốc Minh')
on conflict (id) do nothing;

insert into public.data_products (id, code, name, asset_id, policy_id, owner, steward, description, status) values
  ('90000000-0000-4000-8000-000000000001', 'DP-INV-001', 'Hồ sơ dự án đầu tư chuẩn hóa', '50000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', 'Nguyễn Minh Anh', 'Nguyễn Minh Anh', 'Data product chuẩn hóa phục vụ tổng hợp đầu tư.', 'Active'),
  ('90000000-0000-4000-8000-000000000002', 'DP-TAX-001', 'Thông tin thuế doanh nghiệp', '50000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000003', 'Phạm Quốc Minh', 'Phạm Quốc Minh', 'Dữ liệu thuế đã kiểm duyệt.', 'Active'),
  ('90000000-0000-4000-8000-000000000003', 'DP-REF-001', 'Danh mục địa bàn', '50000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000004', 'Nguyễn Minh Anh', 'Nguyễn Minh Anh', 'Danh mục công khai, dùng chung.', 'Active'),
  ('90000000-0000-4000-8000-000000000004', 'DP-DVC-001', 'Trạng thái xử lý hồ sơ', '50000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', 'Nguyễn Minh Anh', 'Lê Thu Hà', 'Trạng thái xử lý hồ sơ cho hệ thống tiêu thụ.', 'Active'),
  ('90000000-0000-4000-8000-000000000005', 'DP-LAND-001', 'Thực trạng giao/thuê đất FDI', '50000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000004', 'Đỗ Việt Long', 'Đỗ Việt Long', 'Sản phẩm dữ liệu đất đai thử nghiệm.', 'Draft')
on conflict (id) do nothing;

insert into public.product_versions (id, data_product_id, version, compatibility, contract_snapshot, status) values
  ('91000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '2.3', 'Compatible', '[{"name":"ma_du_an","type":"string","required":true,"description":"Mã dự án"},{"name":"ten_du_an","type":"string","required":true,"description":"Tên dự án"},{"name":"trang_thai_du_an","type":"string","required":true,"description":"Trạng thái"},{"name":"tong_muc_dau_tu","type":"number","required":false,"description":"Tổng mức đầu tư"}]'::jsonb, 'Published'),
  ('91000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000004', '1.9', 'Compatible', '[{"name":"ma_ho_so","type":"string","required":true,"description":"Mã hồ sơ"},{"name":"trang_thai","type":"string","required":true,"description":"Trạng thái xử lý"}]'::jsonb, 'Published')
on conflict (id) do nothing;

insert into public.channels (id, data_product_id, type, name, path, environment, status) values
  ('92000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', 'API Pull', 'Investment API v2', '/api/v2/data-products/investment-projects', 'PROD', 'Published'),
  ('92000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000001', 'Event', 'Investment project event', 'investment.project.normalized', 'PROD', 'Active'),
  ('92000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000002', 'API Pull', 'Tax API v1', '/api/v1/tax/enterprise', 'PROD', 'Published'),
  ('92000000-0000-4000-8000-000000000004', '90000000-0000-4000-8000-000000000004', 'Push', 'DVC status callback', '/v1/hoso/status', 'PROD', 'Active')
on conflict (id) do nothing;

insert into public.consumers (id, organization_id, system_id, name, client_id, credential_type, secret_ref, masked_hint, status) values
  ('93000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'CSDL tổng hợp Bộ Tài chính', 'mobiesb_btc_analytics', 'API Key', 'secret/consumer/btc-analytics', 'key_••••7JQ2', 'Active'),
  ('93000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'DVCQG Performance Monitor', 'dvcqg_monitor', 'mTLS', 'secret/consumer/dvcqg-monitor', 'cert_••••V4R1', 'Active')
on conflict (id) do nothing;

insert into public.grants (id, consumer_id, data_product_id, product_version_id, channel_id, purpose, valid_from, valid_to, quota_per_day, rate_limit_per_minute, status) values
  ('94000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'Tổng hợp và giám sát đầu tư công', '2026-07-01', '2027-01-01', 30000, 120, 'Active')
on conflict (id) do nothing;

insert into public.runtime_runs (id, pipeline_id, data_product_id, type, name, correlation_id, source, target, status, started_at, ended_at, latency_ms, records_read, records_written, records_rejected) values
  ('a0000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', null, 'Pipeline', 'PL-001 · Đồng bộ hồ sơ DVCQG', 'CORR-DVC-20260909-0482', 'DVC.HoSoThuTuc', 'ODS.HoSo', 'Success', '2026-09-09T08:47:12Z', '2026-09-09T08:47:14.182Z', 2182, 1248, 1248, 0),
  ('a0000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000004', null, 'File', 'PL-004 · Nạp dữ liệu đất đai', 'CORR-LAND-20260909-0231', 'LAND-FILE-SFTP', 'ODS.HoSo', 'Failed', '2026-09-09T07:21:05Z', '2026-09-09T07:22:42Z', 97000, 0, 0, 0),
  ('a0000000-0000-4000-8000-000000000003', null, '90000000-0000-4000-8000-000000000001', 'API', 'Investment API v2', 'CORR-API-20260909-1931', 'CSDL tổng hợp Bộ Tài chính', 'DP-INV-001', 'Success', '2026-09-09T08:53:10Z', '2026-09-09T08:53:10.127Z', 127, 1, 1, 0)
on conflict (id) do nothing;

insert into public.runtime_events (id, runtime_run_id, step, status, started_at, ended_at, message, record_count) values
  ('a1000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Receive', 'Success', '2026-09-09T08:47:12Z', '2026-09-09T08:47:12.210Z', 'Webhook payload accepted.', 1248),
  ('a1000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Map', 'Success', '2026-09-09T08:47:12.210Z', '2026-09-09T08:47:12.640Z', '5 mapping rules applied.', 1248),
  ('a1000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Validate', 'Success', '2026-09-09T08:47:12.640Z', '2026-09-09T08:47:13.020Z', 'DQ gate passed: 98.4%.', 1248),
  ('a1000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Load', 'Success', '2026-09-09T08:47:13.020Z', '2026-09-09T08:47:14.182Z', 'Upsert completed.', 1248)
on conflict (id) do nothing;

insert into public.alerts (id, severity, source_type, source_id, message, assignee, status) values
  ('b0000000-0000-4000-8000-000000000001', 'High', 'Pipeline', '60000000-0000-4000-8000-000000000004', 'Pipeline PL-004 fail 3 lần liên tiếp.', 'Ngọc Trần', 'New'),
  ('b0000000-0000-4000-8000-000000000002', 'Medium', 'Schema', '50000000-0000-4000-8000-000000000003', 'Schema drift: phát hiện 2 cột mới ở TAX.ThongTinThueDN.', 'Minh Phạm', 'Acknowledged'),
  ('b0000000-0000-4000-8000-000000000003', 'Medium', 'Connector', '40000000-0000-4000-8000-000000000003', 'TAX-ENTERPRISE-DB latency vượt SLA 500 ms.', null, 'New'),
  ('b0000000-0000-4000-8000-000000000004', 'Low', 'Policy', '80000000-0000-4000-8000-000000000001', 'POL-031 sẽ hết hiệu lực trong 22 ngày.', null, 'New')
on conflict (id) do nothing;

insert into public.audit_logs (id, actor, role, action, entity_type, entity_id, after) values
  ('c0000000-0000-4000-8000-000000000001', 'Nguyễn Minh Anh', 'Admin tích hợp', 'Run pipeline', 'Pipeline', '60000000-0000-4000-8000-000000000001', '{"status":"Success","correlationId":"CORR-DVC-20260909-0482"}'::jsonb),
  ('c0000000-0000-4000-8000-000000000002', 'Nguyễn Minh Anh', 'Data Owner / Reviewer', 'Approve policy', 'Policy', '80000000-0000-4000-8000-000000000002', '{"status":"Approved"}'::jsonb)
on conflict (id) do nothing;
