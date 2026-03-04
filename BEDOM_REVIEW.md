# BEDOM Backend — Review & Documentation
> Senior Code Review | Updated: 2026-03-02 (session 4)

---

## 1. TỔNG QUAN

**BEDOM** là backend của hệ thống quản lý ký túc xá FPT University.

| Thành phần | Chi tiết |
|-----------|---------|
| Runtime | Node.js + Express 4 |
| Database | MongoDB + Mongoose |
| Auth | JWT (access 1h + refresh 7d) + Google OAuth |
| Upload | Multer (Excel import) |
| Real-time | Socket.io 4 (chat) |
| Security | bcrypt, rate-limit, CORS, helmet |
| Entry point | `app.js` (root) — `nodemon app.js` |

---

## 2. TẤT CẢ API ENDPOINTS

### 2.1 Authentication — `/v1/auth`

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/auth/login` | Public | Đăng nhập (email/pass hoặc built-in admin). Rate limit: 5/15min |
| POST | `/auth/register` | Admin | Tạo tài khoản mới (chỉ admin, không tự đăng ký) |
| POST | `/auth/refresh-token` | Public | Làm mới access token. Rate limit: 10/15min |
| GET | `/auth/google` | Public | Bắt đầu Google OAuth |
| GET | `/auth/google/callback` | Public | Callback sau Google OAuth |
| GET | `/auth/profile` | Any role | Lấy thông tin profile user hiện tại |

### 2.2 User Management — `/v1/users`

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/users` | Admin | Danh sách user (pagination, filter role/search) |
| POST | `/users/import-excel` | Admin | Import hàng loạt từ file Excel (.xlsx/.xls) |
| DELETE | `/users/:id` | Admin | Xóa user theo ID |

### 2.3 Dormitory — `/v1/dorms`

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/dorms` | Admin | Danh sách ký túc xá (pagination, filter) |
| POST | `/dorms` | Admin | Tạo ký túc xá mới |
| GET | `/dorms/:id` | Admin | Chi tiết ký túc xá |
| PATCH | `/dorms/:id` | Admin | Cập nhật ký túc xá |
| DELETE | `/dorms/:id` | Admin | Xóa ký túc xá |

### 2.4 Block — `/v1/blocks`

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/blocks` | Admin | Danh sách tòa nhà (pagination, filter dorm) |
| POST | `/blocks` | Admin | Tạo tòa nhà mới trong dorm |
| GET | `/blocks/:id` | Admin | Chi tiết tòa nhà |
| PATCH | `/blocks/:id` | Admin | Cập nhật tòa nhà |
| DELETE | `/blocks/:id` | Admin | Xóa tòa nhà (giảm total_blocks của dorm) |

### 2.5 Violation — `/v1/violations`

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/violations` | Manager/Security | Tạo báo cáo vi phạm |
| GET | `/violations` | Manager/Security | Danh sách vi phạm (filter status/type/date) |
| GET | `/violations/:id` | Manager/Security | Chi tiết báo cáo |
| PUT | `/violations/:id/review` | Manager only | Xét duyệt và áp phạt |
| DELETE | `/violations/:id` | Manager only | Xóa báo cáo (chỉ status="new") |
| GET | `/violations/statistics` | Manager/Security | Thống kê vi phạm |
| GET | `/violations/search-student` | Manager/Security | Tìm sinh viên theo mã |
| GET | `/violations/student/:code/penalties` | Manager/Security | Lịch sử phạt của sinh viên |

### 2.6 Visitor — `/v1/visitors`

| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| POST | `/visitors/requests` | Student | Tạo request thăm người thân |
| GET | `/visitors/requests/my` | Student | Xem requests của mình |
| PATCH | `/visitors/requests/:id/cancel` | Student | Hủy request (chỉ status="pending") |
| GET | `/visitors/requests` | Security/Manager | Xem tất cả requests |
| GET | `/visitors/requests/:id` | Security/Manager | Chi tiết request |
| PATCH | `/visitors/requests/:id/approve` | Security | Duyệt request |
| PATCH | `/visitors/requests/:id/reject` | Security | Từ chối + lý do |
| PATCH | `/visitors/requests/:id/complete` | Security | Hoàn thành (tất cả đã checkout) |
| POST | `/visitors/requests/:id/checkin` | Security | Check-in từng người thăm |
| PATCH | `/visitors/checkins/:id/checkout` | Security | Check-out từng người thăm |
| GET | `/visitors/active` | Security | Danh sách khách đang trong KTX |

### 2.7 Equipment Management — `/v1/equipment` *(Mới từ dev)*

> Tất cả endpoint yêu cầu quyền **Admin**.

#### Categories
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/equipment/categories` | Danh sách danh mục (pagination, search) |
| POST | `/equipment/categories` | Tạo danh mục mới |
| GET | `/equipment/categories/:id` | Chi tiết danh mục |
| PUT | `/equipment/categories/:id` | Cập nhật toàn phần |
| PATCH | `/equipment/categories/:id` | Cập nhật một phần |
| DELETE | `/equipment/categories/:id` | Xóa (có cascade protection) |

#### Templates
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/equipment/templates` | Danh sách template (pagination, filter category/is_active/search) |
| POST | `/equipment/templates` | Tạo template thiết bị |
| GET | `/equipment/templates/:id` | Chi tiết template (populate category) |
| PUT | `/equipment/templates/:id` | Cập nhật toàn phần |
| PATCH | `/equipment/templates/:id` | Cập nhật một phần |
| DELETE | `/equipment/templates/:id` | Xóa (có cascade protection) |

#### Room Type Configs
| Method | Path | Mô tả |
|--------|------|-------|
| GET | `/equipment/room-type-configs` | Danh sách cấu hình theo loại phòng (deep populate) |
| POST | `/equipment/room-type-configs` | Tạo cấu hình mới |
| PUT | `/equipment/room-type-configs/:id` | Cập nhật toàn phần |
| PATCH | `/equipment/room-type-configs/:id` | Cập nhật một phần |
| DELETE | `/equipment/room-type-configs/:id` | Xóa cấu hình |

**⚠️ Lưu ý:** Không có endpoint `GET /equipment/room-type-configs/:id` — thiếu chi tiết theo ID.

---

### 2.8 Chat — `/v1/chat`

#### Student
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/chat/my-conversation` | Student | Lấy hoặc tạo mới conversation đang open |
| PATCH | `/chat/my-conversation/close` | Student | Đóng conversation hiện tại |
| GET | `/chat/my-conversations` | Student | Lấy tất cả conversations (open + closed), sorted by latest, limit 50 |

#### Manager
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/chat/conversations` | Manager | Danh sách conversations (filter status, pagination) |
| PATCH | `/chat/conversations/:id/assign` | Manager | Tự assign mình vào conversation |
| PATCH | `/chat/conversations/:id/close` | Manager | Đóng conversation |

#### Shared
| Method | Path | Auth | Mô tả |
|--------|------|------|-------|
| GET | `/chat/conversations/:id/messages` | Student/Manager | Lấy messages (pagination) |
| PATCH | `/chat/conversations/:id/read` | Student/Manager | Mark all messages as read |

#### Socket.io Events
| Event (emit) | Payload | Mô tả |
|-------------|---------|-------|
| `join_conversation` | `{ conversationId }` | Vào room, tự mark as read |
| `leave_conversation` | `{ conversationId }` | Rời room |
| `send_message` | `{ conversationId, text }` | Gửi tin nhắn |
| `mark_read` | `{ conversationId }` | Đánh dấu đã đọc |

| Event (listen) | Payload | Mô tả |
|---------------|---------|-------|
| `new_message` | `{ message, conversationId, manager_unread, student_unread }` | Tin nhắn mới |
| `conversation_updated` | `{ conversation, conversationId, manager_unread, last_message_at }` | Badge update + full conversation (prepend nếu mới) cho manager list |
| `conversation_read` | `{ conversationId, by }` | Đối phương đã đọc |
| `conversation_closed` | `{ conversationId }` | Conversation bị đóng |

**Auth Socket:** JWT qua `socket.handshake.auth.token`. Manager tự động join room `'managers'` để nhận badge updates khi student gửi tin.

---

**Tổng số endpoint đang hoạt động: 63** (55 cũ + 7 chat + 1 student chat history)

---

## 3. DATABASE SCHEMAS

### User
| Field | Type | Ghi chú |
|-------|------|---------|
| email | String, unique | Bắt buộc |
| password_hash | String | Optional (OAuth users không có) |
| google_id | String | Google OAuth ID |
| fullname | String | — |
| role | Enum | student / manager / security / admin |
| is_active | Boolean | default: true |
| last_login | Date | — |

### Student
| Field | Type | Ghi chú |
|-------|------|---------|
| user | ObjectId → User | unique, required |
| student_code | String, unique | Mã sinh viên |
| full_name | String | Bắt buộc |
| date_of_birth | Date | — |
| gender | Enum | male / female / other |
| phone | String | — |
| citizen_id | String, sparse unique | CCCD |
| major / cohort | String | Ngành / Khóa |
| behavioral_score | Number | default: 10.0, min: 0, max: 10 |
| violations_current_semester | Number | default: 0 |
| is_banned_permanently | Boolean | default: false |
| ban_until_semester | String | VD: "Spring2026" |

### Staff
| Field | Type | Ghi chú |
|-------|------|---------|
| user | ObjectId → User | unique, required |
| staff_code | String, unique | — |
| full_name | String | Bắt buộc |
| date_of_birth / gender / phone | — | — |
| position | String | Vị trí công việc |

### Dorm
| Field | Type | Ghi chú |
|-------|------|---------|
| dorm_name | String | Bắt buộc |
| dorm_code | String, unique | Bắt buộc |
| total_blocks | Number | default: 0, auto-update |
| description | String | — |
| is_active | Boolean | default: true |

### Block
| Field | Type | Ghi chú |
|-------|------|---------|
| dorm | ObjectId → Dorm | Bắt buộc |
| block_name / block_code | String | Unique per dorm |
| floor_count / total_rooms | Number | — |
| gender_type | Enum | male / female / mixed |
| is_active | Boolean | default: true |

### ViolationReport
| Field | Type | Ghi chú |
|-------|------|---------|
| report_code | String, unique | Format: VRYYMMDDxxxx |
| reported_student | ObjectId → Student | Bắt buộc |
| reporter | ObjectId → User | Bắt buộc |
| reporter_type | Enum | student / security / manager |
| violation_type | Enum | policy_violation / other |
| description | String | Bắt buộc |
| evidence_urls | [String] | Danh sách URL ảnh bằng chứng |
| violation_date | Date | Bắt buộc |
| location | String | — |
| status | Enum | new / under_review / resolved_penalized / resolved_no_action / rejected |
| reviewed_at / reviewed_by / review_notes | — | Thông tin xét duyệt |

### Penalty
| Field | Type | Ghi chú |
|-------|------|---------|
| student | ObjectId → Student | Bắt buộc |
| report | ObjectId → ViolationReport | — |
| penalty_type | Enum | severe / minor |
| points_deducted | Number | Số điểm trừ |
| reason | String | Bắt buộc |
| semester | String | Format: "Spring2026" |
| issued_by | ObjectId → Staff | Bắt buộc |
| issued_at | Date | default: now |

### VisitorRequest
| Field | Type | Ghi chú |
|-------|------|---------|
| request_code | String, unique | Format: VR-YYYYMMDD-xxxx |
| user | ObjectId → User | Student tạo request |
| visit_date | Date | Bắt buộc |
| visit_time_from / to | String | default: "07:00" / "17:00" |
| purpose | String | Bắt buộc |
| status | Enum | pending / approved / rejected / completed / cancelled |
| rejection_reason | String | — |
| reviewed_at / reviewed_by | — | Thông tin duyệt |

### Visitor
| Field | Type | Ghi chú |
|-------|------|---------|
| request | ObjectId → VisitorRequest | Bắt buộc |
| full_name / citizen_id / phone | String | Bắt buộc |
| relationship | Enum | parent / sibling / friend / other |
| relationship_other | String | Nếu "other" |

### VisitorCheckin
| Field | Type | Ghi chú |
|-------|------|---------|
| request | ObjectId → VisitorRequest | — |
| visitor | ObjectId → Visitor | — |
| check_in_time | Date | Bắt buộc |
| check_out_time | Date | null nếu chưa checkout |
| checked_in_by / checked_out_by | ObjectId → User | Bảo vệ thực hiện |
| notes | String | — |

### EquipmentCategory *(Mới)*
| Field | Type | Ghi chú |
|-------|------|---------|
| id | ObjectId | _id ẩn trong JSON output |
| category_name | String, unique | Bắt buộc (e.g., "Furniture", "Electronics") |
| description | String | Optional |
| created_at | Date | default: Date.now |

### EquipmentTemplate *(Mới)*
| Field | Type | Ghi chú |
|-------|------|---------|
| id | ObjectId | _id ẩn trong JSON output |
| category | ObjectId → EquipmentCategory | Bắt buộc |
| equipment_name | String | Bắt buộc |
| brand / model / specifications | String | Optional |
| estimated_lifespan_years | Number | Optional |
| unit_price | Number | Optional |
| is_active | Boolean | default: true |
| createdAt / updatedAt | Date | Auto (timestamps: true) |

### RoomTypeEquipmentConfig *(Mới)*
| Field | Type | Ghi chú |
|-------|------|---------|
| room_type | Enum | 2_person / 4_person / 6_person / 8_person |
| template | ObjectId → EquipmentTemplate | Bắt buộc |
| standard_quantity | Number | Bắt buộc — số lượng tiêu chuẩn |
| is_mandatory | Boolean | default: true |
| created_at | Date | default: Date.now |
| **Index** | Compound unique | `(room_type, template)` — không trùng |

### RoomEquipment *(Mới — chưa có endpoint)*
| Field | Type | Ghi chú |
|-------|------|---------|
| room | ObjectId → Room | Bắt buộc |
| template | ObjectId → EquipmentTemplate | Bắt buộc |
| equipment_code | String, unique | Mã kiểm kê tài sản |
| quantity | Number | default: 1 |
| status | Enum | good / normal / damaged / broken / missing |
| condition_notes | String | Ghi chú bảo dưỡng |
| purchase_date / warranty_expiry | Date | — |
| last_maintenance_date / next_maintenance_date | Date | — |
| assigned_at | Date | default: Date.now |

### EquipmentHistory *(Mới — chưa có endpoint)*
| Field | Type | Ghi chú |
|-------|------|---------|
| equipment | ObjectId → RoomEquipment | Bắt buộc |
| action_type | Enum | added / removed / repaired / replaced / status_changed / moved |
| old_status / new_status | String | Optional |
| old_room / new_room | ObjectId → Room | Optional |
| notes | String | — |
| performed_by | ObjectId → Staff | Optional (nullable) |
| performed_at | Date | default: Date.now |

### InspectionEquipmentDetail *(Mới — chưa có endpoint)*
| Field | Type | Ghi chú |
|-------|------|---------|
| inspection | ObjectId → RoomInspection | Bắt buộc |
| equipment | ObjectId → RoomEquipment | Bắt buộc |
| status_at_inspection | Enum | good / normal / damaged / broken / missing |
| notes | String | — |
| photo_url | String | — |

---

## 4. WORKFLOW & NGHIỆP VỤ

### 4.1 Xác thực (Authentication)
```
Đăng nhập thông thường:
  POST /auth/login { email, password }
    → Validate email format + password
    → findOne(email) → comparePassword()
    → Nếu !is_active → lỗi "Account locked"
    → Tạo Access Token (1h) + Refresh Token (7d)
    → Trả về { token, refreshToken, user, profile }

Admin đặc biệt:
  POST /auth/login { email: ADMIN_USERNAME, password: ADMIN_PASSWORD }
    → Match với .env variables
    → Tìm hoặc tạo user admin@dorm.local
    → Trả về token admin

Google OAuth:
  GET /auth/google → Redirect Google consent screen
  GET /auth/google/callback
    → Tìm user theo google_id hoặc email
    → Nếu email chưa tồn tại → lỗi (không tự đăng ký)
    → Redirect FE: /auth/google/callback?token=...&user=...

Refresh Token:
  POST /auth/refresh-token { refreshToken }
    → Verify JWT → tìm user → kiểm tra is_active
    → Trả về { token } mới (refresh token KHÔNG rotate)
```

### 4.2 Import Excel Users
```
Admin upload file .xlsx / .xls
    ↓
Multer nhận file → memoryStorage (không lưu disk)
    ↓
Đọc TẤT CẢ sheets trong workbook
    ↓
Mapping columns (case-insensitive):
  "Email" → email (required)
  "Full Name" / "fullname" → full_name (required)
  "Role" → role (required: student/manager/security)
  "Student Code" → student_code (required cho student)
  "Staff Code" → staff_code (required cho staff)
  "Date of Birth" / "dob" → date_of_birth (required)
  "Gender" → gender (required)
  "Phone" → phone (required)
  "Major" → major (optional, student only)
  "Cohort" → cohort (optional, student only)
    ↓
Validate từng row:
  - Email hợp lệ + không trùng trong batch + không trùng DB
  - Full name: Unicode letters, spaces, hyphens, dots, apostrophes
  - Role: chỉ student/manager/security (không tạo admin)
  - Phone: 8-15 digits
  - Code không trùng
    ↓
Tạo User (password_hash = "Student@123", pre-save hook hash bcrypt)
Tạo Student profile hoặc Staff profile
  → Nếu tạo profile lỗi → rollback (xóa User vừa tạo)
    ↓
Response: {
  summary: { total, success, failed },
  imported: [{ row, sheet, email, role, code }],
  errors: [{ row, sheet, email, error }],
  warnings: [string]  // sheet trống, cột thiếu
}
```

### 4.3 Vi phạm (Violation)
```
Manager/Security tìm SV:
  GET /violations/search-student?code=SE001
    → Trả về { student_code, full_name, behavioral_score, ... }
    ↓
Tạo báo cáo:
  POST /violations { student_code, violation_type, description, violation_date, location, evidence_urls }
    → Tìm student → tạo ViolationReport
    → report_code: VRYYMMDDxxxx (sequence tự sinh)
    → status: "new"
    ↓
Manager xét duyệt:
  PUT /violations/:id/review
    → status: "resolved_penalized" / "resolved_no_action" / "rejected"

  Nếu "resolved_penalized":
    → Tạo Penalty { type: severe/minor, points_deducted, reason }
    → student.behavioral_score -= points_deducted (min: 0)
    → student.violations_current_semester += 1
    → Tính semester hiện tại (Jan-Apr: Spring, May-Aug: Summer, Sep-Dec: Fall)
    → Nếu score < 4 OR violations >= 3 → student.ban_until_semester = next semester
    ↓
Xóa báo cáo:
  DELETE /violations/:id → chỉ được khi status === "new"

Thống kê:
  GET /violations/statistics
    → Total reports, by status, by type, recent 30 days
    → Active penalties trong semester hiện tại
```

### 4.4 Visitor Request (Thăm người thân)
```
Student tạo request:
  POST /visitors/requests {
    visit_date,   // >= today, format ISO
    purpose,
    visitors: [{  // 1-5 người
      full_name, citizen_id, phone, relationship
    }]
  }
    → [Mới] Verify user.is_active → nếu không → lỗi
    → [Mới] Lookup Student profile → nếu không phải student → lỗi
    → [Mới] Check is_banned_permanently → nếu bị cấm vĩnh viễn → lỗi
    → [Mới] Check ban_until_semester → nếu đang bị cấm → lỗi + tên học kỳ
    → Validate visit_date >= today
    → Max 5 visitors
    → visit_time_from/to cố định: "07:00" / "17:00"
    → request_code: VR-YYYYMMDD-xxxx (race-condition safe, có retry)
    → Tạo VisitorRequest → Tạo từng Visitor record
    → Nếu Visitor tạo lỗi → rollback xóa VisitorRequest
    ↓
Bảo vệ xem và duyệt:
  GET /visitors/requests (filter status/date)
  PATCH /visitors/requests/:id/approve → status: "approved"
  PATCH /visitors/requests/:id/reject { reason } → status: "rejected"
    ↓
Ngày thăm — Bảo vệ check-in từng người:
  POST /visitors/requests/:id/checkin { visitorId }
    → Kiểm tra request đã approved
    → Kiểm tra visitor chưa checkin
    → Tạo VisitorCheckin { check_in_time: now }
    ↓
Khách rời — Bảo vệ check-out:
  PATCH /visitors/checkins/:checkinId/checkout
    → check_out_time = now
    ↓
Kết thúc buổi thăm:
  PATCH /visitors/requests/:id/complete
    → Kiểm tra tất cả visitors đã checkout
    → status: "completed"

Student hủy:
  PATCH /visitors/requests/:id/cancel
    → Chỉ được khi status === "pending"
    → Chỉ được hủy request của mình

Danh sách đang trong KTX:
  GET /visitors/active
    → Tất cả VisitorCheckin có check_out_time = null
    → Populate visitor info + request info + student info
```

### 4.5 Quản lý Dorm & Block
```
Dorm (CRUD):
  - Tạo dorm → total_blocks default 0
  - Xóa dorm → hard delete (không kiểm tra blocks còn không)

Block (CRUD):
  - Tạo block trong dorm → dorm.total_blocks += 1
  - Unique constraint: (dorm, block_code)
  - Xóa block → dorm.total_blocks -= 1
  - Cập nhật block → cho phép chuyển sang dorm khác
```

### 4.6 Quản lý Thiết bị (Equipment Management) *(Mới từ dev)*
```
Thiết lập danh mục:
  POST /equipment/categories { category_name, description }
    → Validate category_name required, unique (case-insensitive trim)
    → Tạo EquipmentCategory

Thiết lập template thiết bị:
  POST /equipment/templates { equipment_name, category, brand, model, ... }
    → Validate equipment_name + category required
    → Verify category tồn tại
    → Tạo EquipmentTemplate

Cấu hình thiết bị theo loại phòng:
  POST /equipment/room-type-configs {
    room_type,         // "2_person" | "4_person" | "6_person" | "8_person"
    template,          // ObjectId của EquipmentTemplate
    standard_quantity, // Số lượng tiêu chuẩn
    is_mandatory       // default: true
  }
    → Verify template tồn tại
    → Kiểm tra không trùng (room_type + template) — compound unique index
    → Tạo RoomTypeEquipmentConfig

Xóa có cascade protection:
  - DELETE category → bị chặn nếu còn templates tham chiếu
  - DELETE template → bị chặn nếu còn RoomEquipment hoặc RoomTypeConfig tham chiếu
  - DELETE room-type-config → KHÔNG có cascade check (lỗ hổng)

Tìm kiếm & phân trang:
  GET /equipment/categories?page=1&limit=10&search=furni
  GET /equipment/templates?page=1&limit=10&search=bed&category=<id>&is_active=true
  GET /equipment/room-type-configs?page=1&limit=50&room_type=4_person
```

---

## 5. SENIOR CODE REVIEW — VẤN ĐỀ CÒN MỞ

### 🟠 HIGH

#### H5. Block có thể move sang dorm khác không kiểm tra 🔴
**File:** `src/services/block.service.js`
**Vấn đề:** `updateBlock()` cho phép chuyển `dorm` sang dorm khác mà không kiểm tra phòng, giường đang có sinh viên.

#### H6. Equipment: EquipmentHistory không bao giờ được tự động ghi 🔴
**File:** `src/models/equipmentHistory.model.js`
**Vấn đề:** Model đầy đủ fields nhưng không có service nào tự động tạo record. Toàn bộ audit trail thiết bị bị mất.

---

### 🟡 MEDIUM

#### M1. Behavioral score không có cap max
**File:** `violation.service.js`
```js
const newScore = Math.max(0, student.behavioral_score - penaltyData.points_deducted);
// Thiếu: Math.min(10, newScore)
```

#### M2. BehavioralScoreHistory không được ghi
**Vấn đề:** Model `BehavioralScoreHistory` tồn tại trong DB nhưng không bao giờ được tạo khi điểm thay đổi.

#### M3. Pagination không giới hạn limit
```js
const limit = Number(query.limit) > 0 ? Number(query.limit) : 10;
// Không có max → user gửi limit=999999 → DoS
```
**Fix:** `Math.min(Number(query.limit) || 10, 100)`
**Ảnh hưởng:** Tất cả services: dorm, block, violation, visitor, **equipment** (categories limit=10, templates limit=10, configs **limit=50**).

#### M4. Evidence URLs không validate
```js
evidence_urls: body.evidence_urls || []
// Không check URL format, không giới hạn domain
```

#### M6. Dorm xóa không xóa/check blocks con
Xóa dorm nhưng blocks vẫn còn → orphaned data.

#### M7. Thiếu BehavioralScoreHistory tracking
Trừ điểm nhưng không ghi lịch sử vào collection `behavioralScoreHistories`.

#### M8. Không có rate limit cho violation & visitor endpoints
Login có rate limit nhưng các endpoint quan trọng khác thì không.

#### M9. Equipment: Thiếu GET by ID cho Room Type Config
**File:** `src/routes/v1/equipment.route.js`
**Vấn đề:** Không có route `GET /equipment/room-type-configs/:id`. Không có method tương ứng trong service và controller.
**Fix:** Thêm `getRoomTypeConfigById()` vào service + controller + route.

#### M10. Equipment: Không validate giá trị số âm
**File:** `src/services/equipment.service.js`
**Vấn đề:** Không kiểm tra:
- `standard_quantity <= 0`
- `unit_price < 0`
- `estimated_lifespan_years <= 0`
Mongoose schema cũng không có `min: 0` constraint.

#### M11. Equipment: Config xóa không kiểm tra cascade
**File:** `src/services/equipment.service.js` — `deleteRoomTypeConfig()`
**Vấn đề:** Khi xóa một config, không kiểm tra xem config này đã được dùng trong bất kỳ booking hoặc room assignment nào chưa. Category và Template có protection nhưng Config thì không.

---

### 🟢 LOW

#### L1. Error message tiết lộ thông tin
```js
throw new Error("Account not authorized...");    // user không tồn tại
throw new Error("Account has been locked...");   // user bị khóa
```
Attacker có thể dùng để enumerate valid emails. Fix: dùng generic "Invalid credentials".

#### L2. Thiếu Swagger/API docs
Chỉ có `GET /v1` liệt kê routes, không có schema/example.

#### L3. Thiếu CSRF protection
Không có middleware CSRF cho state-changing requests.

#### L4. Timestamp fallback yếu trong visitor request code
```js
const fallbackSeq = Date.now().toString().slice(-6);
// Vẫn collision nếu nhiều requests cùng millisecond
```

#### L5. Frontend URL không validate trước redirect
`res.redirect(process.env.FRONTEND_URL + "/...")` — không whitelist validation.

#### L7. Không có Audit Log
Duyệt vi phạm, phạt điểm, approve/reject visitor — không có audit trail.

#### L8. Inconsistent response format
Một số service trả `{ data: items }`, một số trả `{ items }` — FE phải handle cả hai.

#### L9. Equipment: Không có input sanitization
**File:** `src/services/equipment.service.js`
**Vấn đề:** Chỉ `trim()` cho `category_name`, các fields khác như `equipment_name`, `brand`, `model` không được sanitize. Regex search trên templates cũng không escape (tương tự lỗi C1 ở dorm).
```js
// Tiềm ẩn ReDoS:
new RegExp(search, "i");  // search không được escape
```

#### L10. Equipment: `performed_by` trong History luôn null
**File:** `src/models/equipmentHistory.model.js`
**Vấn đề:** Field `performed_by` có `default: null`, nhưng không có mechanism nào tự điền user hiện tại khi tạo history record. Phải truyền thủ công — dễ bỏ sót.

---

## 5B. ĐÃ SỬA — FIXED ISSUES

> Các vấn đề đã được xử lý hoàn toàn. Ghi lại để tham khảo và review lại nếu cần.

---

### ✅ C1. NoSQL Injection / ReDoS trong Dorm Search

**File:** [src/services/dorm.service.js](src/services/dorm.service.js)
**Mức độ:** Critical
**Ngày fix:** 2026-02-22

**Vấn đề:**
`query.search` từ URL được truyền thẳng vào `new RegExp(query.search, "i")` mà không escape. Attacker có thể gửi regex phức tạp gây ReDoS (CPU spike) hoặc khai thác NoSQL injection.

**Giải pháp:**
Thêm helper `escapeRegex()` (giống pattern đã có ở `user.service.js` và `violation.service.js`) để sanitize input trước khi tạo RegExp:
```js
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Trong getDorms():
const regex = new RegExp(escapeRegex(query.search), "i");
```

---

### ✅ C2. OAuth Token lộ trên URL (Google OAuth)

**Files:**
- [src/services/auth.service.js](src/services/auth.service.js) — `storeOAuthData()`, `exchangeOAuthCode()`
- [src/controllers/auth.controller.js](src/controllers/auth.controller.js) — `googleCallback`, `exchangeOAuthCode`
- [src/routes/v1/auth.route.js](src/routes/v1/auth.route.js) — route `GET /google/exchange`
- FEDOM [src/pages/auth/google-callback/index.tsx](../FEDOM/src/pages/auth/google-callback/index.tsx)

**Mức độ:** Critical
**Ngày fix:** 2026-02-22

**Vấn đề:**
Sau Google OAuth thành công, BE redirect về FE với `?token=<jwt>&refreshToken=<rt>&user=<json>` trong URL. Token xuất hiện trong:
- Browser history (người dùng khác cùng máy có thể đọc)
- Server access logs
- `Referer` header khi FE click link ngoài
- Bất kỳ browser extension nào đọc URL

**Giải pháp — In-memory one-time code exchange:**

**BE (`auth.service.js`):**
```js
const crypto = require("crypto");
const _oauthStore = new Map(); // TTL store: code → { data, expiresAt }

const storeOAuthData = (data) => {
  const code = crypto.randomBytes(32).toString("hex"); // 64-char opaque hex
  _oauthStore.set(code, { data, expiresAt: Date.now() + 5 * 60 * 1000 }); // 5 phút TTL
  return code;
};

const exchangeOAuthCode = (code) => {
  const entry = _oauthStore.get(code);
  if (!entry) throw new Error("Invalid or expired OAuth code");
  if (Date.now() > entry.expiresAt) {
    _oauthStore.delete(code);
    throw new Error("OAuth code expired");
  }
  _oauthStore.delete(code); // Single-use: xóa ngay sau khi dùng
  return entry.data;
};
```

**BE (`auth.controller.js`):**
```js
// googleCallback: không put token vào URL nữa
const code = authService.storeOAuthData({ token, refreshToken: refreshTkn, user: userData, profile });
res.redirect(`${frontendUrl}/auth/google/callback?code=${code}`);

// Thêm controller mới:
const exchangeOAuthCode = catchAsync(async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ success: false, message: "Missing code" });
  const data = authService.exchangeOAuthCode(code);
  res.success(data, 200);
});
```

**BE (`auth.route.js`):**
```js
router.get("/google/exchange", authController.exchangeOAuthCode);
```

**FE (`google-callback/index.tsx`):**
```tsx
// Trước: parse ?token= từ URL
// Sau: dùng fetch để exchange code → token (token không bao giờ ở URL)
const code = searchParams.get("code");
const resp = await fetch(`${baseUrl}/v1/auth/google/exchange?code=${encodeURIComponent(code)}`);
const json = await resp.json();
const { token, refreshToken, user, profile } = json.data ?? json;
```

---

### ✅ C3. Default Password Hardcoded trong Source Code

**File:** [src/services/user.service.js](src/services/user.service.js)
**Mức độ:** Critical
**Ngày fix:** 2026-02-22

**Vấn đề:**
`const DEFAULT_PASSWORD = "Student@123"` — password mặc định khi import Excel hardcode thẳng trong source code. Bất kỳ ai đọc repo đều biết password mặc định của toàn bộ sinh viên mới import.

**Giải pháp:**
```js
const DEFAULT_PASSWORD = process.env.DEFAULT_USER_PASSWORD || "Student@123";
```
Thêm vào `.env`:
```
DEFAULT_USER_PASSWORD=Student@DMS2025!
```
> Fallback giữ nguyên để dev local không cần `.env` setup phức tạp, nhưng production bắt buộc set env var.

---

### ✅ C4. Admin Password So Sánh Plaintext (Timing Attack)

**File:** [src/services/auth.service.js](src/services/auth.service.js)
**Mức độ:** Critical
**Ngày fix:** 2026-02-22

**Vấn đề:**
```js
if (email === adminUsername && password === adminPassword)
```
So sánh chuỗi thông thường không constant-time → timing attack: attacker có thể đo response time để đoán từng ký tự của password.

**Giải pháp — bcrypt lazy hash + `bcrypt.compare()`:**
```js
const bcrypt = require("bcryptjs");

let _adminPasswordHash = null;
const getAdminPasswordHash = async () => {
  if (_adminPasswordHash !== null) return _adminPasswordHash;
  const raw = process.env.ADMIN_PASSWORD;
  if (!raw) { _adminPasswordHash = false; return false; } // Sentinel: disable admin login khi không có env
  _adminPasswordHash = await bcrypt.hash(raw, 10); // Hash một lần, cache lại
  return _adminPasswordHash;
};

// Trong login():
const adminPasswordHash = await getAdminPasswordHash();
if (adminPasswordHash && email === adminUsername && await bcrypt.compare(password, adminPasswordHash)) {
  // Admin login
}
```
- Hash chỉ tính một lần tại first call (không impact startup time)
- `bcrypt.compare()` là constant-time → immune với timing attack
- Khi `ADMIN_PASSWORD` không set → admin login bị disable hoàn toàn (an toàn hơn)

---

### ✅ H1. Race Condition Trong Tạo Violation Report Code

**File:** [src/services/violation.service.js](src/services/violation.service.js)
**Mức độ:** High
**Ngày fix:** 2026-02-22

**Vấn đề:**
`generateReportCode()` thực hiện read-compute-write mà không có protection. Khi 2 requests đến cùng lúc, cả 2 đọc cùng `lastReport` → generate cùng `seq` → MongoDB unique constraint violation gây crash.

**Giải pháp — Retry loop + duplicate key guard:**
```js
const generateReportCode = async (maxRetries = 5) => {
  // ... compute prefix ...
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const lastReport = await ViolationReport.findOne({
      report_code: { $regex: `^${prefix}` }
    }).sort({ report_code: -1 });

    const sequence = lastReport ? parseInt(lastReport.report_code.slice(-4)) + 1 : 1;
    const code = `${prefix}${String(sequence).padStart(4, "0")}`;

    const exists = await ViolationReport.findOne({ report_code: code });
    if (!exists) return code; // Safe to use
    // Code bị lấy mất bởi concurrent request → retry
  }
  return `${prefix}${Date.now().toString().slice(-4)}`; // Fallback
};

// Trong createViolationReport():
try {
  await violationReport.save();
} catch (err) {
  if (err.code === 11000) throw new Error("Report code conflict. Please try again.");
  throw err;
}
```
Pattern này mirror theo `generateRequestCode()` đã có sẵn trong `visitor.service.js`.

---

### ✅ H2. Sinh Viên Bị Ban Vẫn Tạo Được Visitor Request

**File:** [src/services/visitor.service.js](src/services/visitor.service.js)
**Mức độ:** High
**Ngày fix:** 2026-02-22

**Vấn đề:**
`createVisitorRequest()` không kiểm tra trạng thái ban của sinh viên. Sinh viên có `is_banned_permanently = true` hoặc `ban_until_semester` vẫn có thể tạo request.

**Giải pháp:**
Thêm ban check ngay đầu hàm, sau khi lookup student (kết hợp với H4):
```js
if (student.is_banned_permanently) {
  throw new Error("Your account has been permanently banned from making visitor requests.");
}
if (student.ban_until_semester) {
  throw new Error(`You are banned from making requests until the end of semester ${student.ban_until_semester}.`);
}
```

---

### ✅ H3. Xóa User Không Kiểm Tra Dữ Liệu Liên Kết

**File:** [src/services/user.service.js](src/services/user.service.js)
**Mức độ:** High
**Ngày fix:** 2026-02-22

**Vấn đề:**
`deleteUser()` check `user.totalOrder` — field này **không tồn tại** trong User schema. Kết quả: guard luôn falsy → user bị xóa kể cả khi còn visitor requests hay violation reports liên kết → orphaned data.
```js
// Code cũ (bị lỗi):
const user = await User.findById(id).populate({ path: "totalOrder" });
if (!!user.totalOrder) { throw new Error("Cannot delete..."); } // Luôn undefined!
```

**Giải pháp:**
```js
const { User, Student, Staff, VisitorRequest, ViolationReport } = require("../models");

const deleteUser = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new Error("User not found");
  if (user.role === "admin") throw new Error("Admin accounts cannot be deleted"); // Guard thêm

  const student = await Student.findOne({ user: id });
  if (student) {
    const [visitorCount, violationCount] = await Promise.all([
      VisitorRequest.countDocuments({ user: id }),
      ViolationReport.countDocuments({ reported_student: student._id }),
    ]);
    if (visitorCount > 0) throw new Error(`Cannot delete user: has ${visitorCount} visitor request(s).`);
    if (violationCount > 0) throw new Error(`Cannot delete user: has ${violationCount} violation report(s).`);
  }

  await user.deleteOne();
};
```
Dùng `Promise.all` để đếm song song, không tuần tự.

---

### ✅ H4. Không Verify Caller Là Student Active Khi Tạo Visitor Request

**File:** [src/services/visitor.service.js](src/services/visitor.service.js)
**Mức độ:** High
**Ngày fix:** 2026-02-22

**Vấn đề:**
`createVisitorRequest(userId, body)` không kiểm tra:
- User có `is_active = true` không
- `userId` có tương ứng với một Student profile không

Kết quả: staff account hoặc inactive user có thể gọi API tạo visitor request.

**Giải pháp:**
Thêm validation block ở đầu hàm (kết hợp với H2):
```js
const createVisitorRequest = async (userId, body) => {
  // Verify active user
  const user = await User.findById(userId);
  if (!user || !user.is_active) {
    throw new Error("Your account is inactive. Please contact the dormitory management office.");
  }
  // Verify student profile exists
  const student = await Student.findOne({ user: userId });
  if (!student) {
    throw new Error("Only registered students can create visitor requests.");
  }
  // Ban checks (H2)
  if (student.is_banned_permanently) { ... }
  if (student.ban_until_semester) { ... }
  // ... tiếp tục logic cũ
};
```

---

## 6. MODELS TỒN TẠI NHƯNG CHƯA CÓ ENDPOINT

Các model đã định nghĩa trong DB nhưng chưa có routes/services:

| Model | Mô tả |
|-------|-------|
| Room | Phòng trong block |
| Bed | Giường trong phòng |
| BookingRequest | Đặt phòng |
| Contract | Hợp đồng thuê phòng |
| ContractExtension | Gia hạn hợp đồng |
| RoomTransferRequest | Đổi phòng |
| Invoice | Hóa đơn tháng |
| Payment | Giao dịch thanh toán |
| PricingConfig | Cấu hình giá |
| UtilityReading | Chỉ số điện/nước |
| MaintenanceRequest | Yêu cầu bảo trì |
| MaintenanceFeedback | Đánh giá bảo trì |
| RoomEquipment | Thiết bị thực tế trong phòng *(Category/Template/Config đã có endpoint)* |
| EquipmentHistory | Lịch sử thay đổi thiết bị |
| InspectionEquipmentDetail | Chi tiết kiểm tra thiết bị |
| News | Tin tức/thông báo |
| Notification | Thông báo cá nhân |
| ~~ChatConversation~~ | ✅ Đã có endpoint (chat module) |
| ~~ChatMessage~~ | ✅ Đã có endpoint (chat module) |
| SystemConfig | Cấu hình hệ thống |
| BehavioralScoreHistory | Lịch sử điểm hành vi |

---

## 7. ENVIRONMENT VARIABLES YÊU CẦU

| Biến | Bắt buộc | Mô tả |
|------|---------|-------|
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `JWT_SECRET` | ✅ | Signing key cho JWT |
| `JWT_EXPIRES_IN` | — | default: "1h" |
| `JWT_REFRESH_EXPIRES_IN` | — | default: "7d" |
| `ADMIN_USERNAME` | — | default: "admin" |
| `ADMIN_PASSWORD` | ✅ | Không có default → admin login bị disable |
| `GOOGLE_CLIENT_ID` | — | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | — | Google OAuth |
| `GOOGLE_CALLBACK_URL` | — | Google OAuth callback |
| `FRONTEND_URL` | — | default: http://localhost:5173 |
| `PORT` | — | default: 3001 |
| `ALLOWED_ORIGINS` | — | CORS whitelist, comma-separated. default: `http://localhost:5173,http://127.0.0.1:5173` |

---

## 8. SCORECARD

| Hạng mục | Điểm | Nhận xét |
|---------|------|---------|
| Architecture | 7/10 | Layered rõ ràng (routes → controllers → services → models) |
| Security | 7/10 | ✅ C1-C4 đã fix: NoSQL injection, token URL, plaintext compare, hardcode password |
| Code Quality | 7/10 | catchAsync pattern tốt, ESLint clean, naming nhất quán |
| Feature Completeness | 4/10 | Equipment management thêm vào, nhưng Room/Booking/Payment vẫn chưa có |
| Error Handling | 7/10 | ✅ H1-H4 đã fix: race condition, ban check, student validation, user delete guard |
| Database Design | 8/10 | Schema đầy đủ, indexes cơ bản có, quan hệ rõ ràng |
| API Design | 6/10 | RESTful OK, nhưng response format không nhất quán, thiếu GET by ID ở room-type-configs |
| Performance | 5/10 | Thiếu pagination limits, thiếu compound indexes cho query phổ biến |

**Tổng issues:** 31 tìm thấy | ✅ 8 đã fix (C1-C4, H1-H4) | 🔴 21 còn mở (2 High, 10 Medium, 9 Low) | 2 duplicate đã loại (M5=C2, L6=H3)

### Fix Log

| Issue | File | Ngày fix | Mô tả |
|-------|------|---------|-------|
| C1 | `dorm.service.js` | 2026-02-22 | Thêm `escapeRegex()` cho dorm search |
| C2 | `auth.controller.js`, `auth.route.js`, FE `google-callback` | 2026-02-22 | In-memory one-time code exchange thay thế token trong URL |
| C3 | `user.service.js` | 2026-02-22 | `DEFAULT_USER_PASSWORD` từ env |
| C4 | `auth.service.js` | 2026-02-22 | bcrypt hash + `bcrypt.compare()` cho admin login |
| H1 | `violation.service.js` | 2026-02-22 | Retry loop (5 attempts) + duplicate key guard cho report code |
| H2 | `visitor.service.js` | 2026-02-22 | Check `ban_until_semester` + `is_banned_permanently` trước khi tạo request |
| H3 | `user.service.js` | 2026-02-22 | Thay `totalOrder` bằng check thực `VisitorRequest` + `ViolationReport`, guard admin delete |
| H4 | `visitor.service.js` | 2026-02-22 | Verify student tồn tại + `is_active` trước khi tạo visitor request |
| Feature | `visitor.service.js` | 2026-02-22 | Phone (10 số) + CCCD (12 số) format validation; `relationship_other` required khi "other" |
| Feature | `visitor.service.js` | 2026-02-22 | `visit_time_from`/`to` selectable (07:00–17:00 window), không còn hardcode |
| Feature | `notification.service.js` (new) | 2026-02-22 | Notification system: 4 endpoints GET/PATCH read/PATCH read-all/DELETE |
| Feature | `visitor.service.js` | 2026-02-22 | Auto-notify student khi visitor request được approve/reject |
| Fix | `visitor.service.js` | 2026-02-23 | Nới rộng phone regex từ `/^0[35789]\d{8}$/` → `/^0\d{9}$/` (chấp nhận thêm landline 02x) |
| Feature | `src/services/chat.service.js` (new) | 2026-03-01 | Chat service: getOrCreateConversation, closeConversation, getConversations, assignConversation, getMessages, saveMessage, markAsRead |
| Feature | `src/controllers/chat.controller.js` (new) | 2026-03-01 | 7 handlers cho chat REST API |
| Feature | `src/routes/v1/chat.route.js` (new) | 2026-03-01 | 7 chat endpoints: student (2), manager (3), shared (2) |
| Feature | `src/sockets/index.js` (new) | 2026-03-01 | Socket.io init: JWT auth middleware, managers global room, httpServer integration |
| Feature | `src/sockets/chat.socket.js` (new) | 2026-03-01 | Socket events: join/leave/send_message/mark_read |
| Feature | `src/models/chatConversation.model.js` | 2026-03-01 | Thêm manager_unread, student_unread, last_message_at; thêm indexes; đổi ref sang USER |
| Feature | `src/models/chatMessage.model.js` | 2026-03-01 | Thêm compound indexes cho query hiệu quả |
| Struct | `app.js` (root) | 2026-03-01 | Thêm helmet, cookieParser, scheduleVisitorExpiry, ALLOWED_ORIGINS env CORS, dev/prod error handler, httpServer + initSocket |
| Struct | `src/app.js` | 2026-03-01 | Xóa — không bao giờ được chạy (entry point là root app.js), nay redundant |
| Struct | `src/services/index.js` | 2026-03-01 | Bỏ orderService — model Order/Laptop không tồn tại, dead code |
| Struct | `src/controllers/index.js` | 2026-03-01 | Bỏ orderController — tương tự |
| Struct | `.eslintrc.js` | 2026-03-01 | Xóa — trùng với eslint.config.js (flat config v9) |
| Security | `src/services/chat.service.js` | 2026-03-01 | `saveMessage`: thêm student access control (student chỉ gửi vào conversation của mình); thêm BE message length validation (1–1000 chars) |
| Fix | `src/services/chat.service.js` | 2026-03-01 | `assignConversation`: atomic `findOneAndUpdate({staff:null})` — tránh race condition 2 manager cùng pick up; phân biệt lỗi 404/400/409 |
| Fix | `src/services/chat.service.js` | 2026-03-01 | `closeConversation`: thêm check `status==='closed'` trả 400 |
| Fix | `src/services/chat.service.js` | 2026-03-01 | `getConversations`+`getMessages`: clamp limit max 100, page min 1 — chặn DoS |
| Feature | `src/sockets/chat.socket.js` | 2026-03-01 | Thêm `close_conversation` event: broadcast `conversation_closed` toàn room rồi leave |
| Feature | `src/services/chat.service.js` | 2026-03-01 | `closeConversation`: sau khi close, tạo DB notification cho student ("Conversation Closed") — student thấy trong notification bell |
| Fix | `src/sockets/index.js` | 2026-03-01 | Mọi user khi connect đều join personal room `user_${id}` — cho phép push notification real-time đến bất kỳ user nào dù ở trang nào |
| Fix | `src/sockets/chat.socket.js` | 2026-03-01 | `close_conversation`: sau khi broadcast `conversation_closed` vào room, thêm emit `new_notification` đến `user_${studentId}` — fix bug student k nhận notify khi không ở chat page |
| Bug fix | `src/services/notification.service.js` | 2026-03-01 | `getMyNotifications`: xóa `.lean()` — lean() bỏ qua toJSON schema (virtuals + transform), khiến `id` = undefined ở FE → CastError khi mark/delete; thêm guard `notifId === 'undefined'` cho markAsRead + deleteNotification |
| Security | `src/services/chat.service.js` | 2026-03-01 | `saveMessage`: thêm guard staff — nếu conversation đã có `staff` assign và sender không phải manager đó → throw 403 "already handled by another manager" (Sáng kiến 2: Claim trước chat sau) |
| Security | `src/services/chat.service.js` | 2026-03-01 | `closeConversation`: thêm guard — nếu `conversation.staff` tồn tại và không phải `managerUserId` hiện tại → throw 403 "Only the assigned manager can close" |
| Security | `src/services/chat.service.js` | 2026-03-01 | `saveMessage`: thêm guard — nếu `senderType==='staff'` và `conversation.staff === null` → throw 403 "Pick up the conversation first" — manager phải pickup trước khi gửi tin |
| Fix | `src/sockets/chat.socket.js` | 2026-03-01 | `send_message`: thay `.select().lean()` bằng full `.populate()` fetch; truyền full `conversation` doc vào `conversation_updated` event → FE có thể prepend conversation mới vào list real-time; fix error emit — pass `err.message` thay vì hardcode "Failed to send message" |
| Feature | `src/services/chat.service.js` | 2026-03-01 | `getStudentConversations(studentUserId, { page, limit })` — trả về tất cả conversations (open + closed) của một student, sorted by latest; limit max 50 |
| Feature | `src/controllers/chat.controller.js` | 2026-03-01 | Thêm `getMyConversations` handler → gọi `chatService.getStudentConversations` |
| Feature | `src/routes/v1/chat.route.js` | 2026-03-01 | Thêm `GET /chat/my-conversations` (student only) — lấy lịch sử tất cả conversations của student |
| Fix | `src/services/chat.service.js` | 2026-03-02 | `getConversations` (manager): thêm filter `last_message_at: { $ne: null }` — ẩn conversations rỗng (student visit trang nhưng chưa gửi tin) khỏi danh sách manager |
| Feature | `src/models/notification.model.js` | 2026-03-02 | Thêm `"chat"` vào category enum — dùng cho notification khi student nhắn tin |
| Feature | `src/sockets/chat.socket.js` | 2026-03-02 | Import Notification + User models; trong `send_message`: khi `manager_unread === 1` (first unread batch) — nếu unassigned: tạo DB notification + emit `new_notification` cho tất cả managers; nếu assigned: tạo notification + emit cho manager đó — error wrapped trong try/catch riêng không làm crash main flow |
| Bug fix | `src/sockets/chat.socket.js` | 2026-03-02 | `send_message`: trước khi tạo notification, kiểm tra `io.sockets.adapter.rooms.get('conv_id')` — nếu có manager socket trong room (đang xem hội thoại) → reset `manager_unread=0` + skip notification; chỉ notify khi manager KHÔNG có mặt trong room |
| Feature | `src/sockets/chat.socket.js` | 2026-03-02 | `send_message`: thêm block đối xứng cho `senderType === 'staff'` khi `student_unread === 1` — kiểm tra student có trong room không; nếu không → tạo DB notification + emit `new_notification` đến `user_${studentId}`; nếu có → reset `student_unread=0` silently |

---

## 9. MODULE SUMMARY

| Module | Routes | Service | Controller | Trạng thái |
|--------|--------|---------|------------|-----------|
| Auth | ✅ 6 endpoints | ✅ | ✅ | Hoạt động |
| User | ✅ 3 endpoints | ✅ | ✅ | Hoạt động |
| Dorm | ✅ 5 endpoints | ✅ | ✅ | Hoạt động |
| Block | ✅ 5 endpoints | ✅ | ✅ | Hoạt động |
| Violation | ✅ 8 endpoints | ✅ | ✅ | Hoạt động |
| Visitor | ✅ 11 endpoints | ✅ | ✅ | Hoạt động |
| Equipment | ✅ 17 endpoints | ✅ | ✅ | Hoạt động (từ dev) |
| Room/Bed | ✅ 5 endpoints | ✅ | ✅ | Hoạt động |
| Booking | ❌ | ❌ | ❌ | Chưa có |
| Payment | ❌ | ❌ | ❌ | Chưa có |
| Maintenance | ❌ | ❌ | ❌ | Chưa có |
| Notification | ✅ 4 endpoints | ✅ | ✅ | Hoạt động (GET/mark-read/delete) |
| Chat | ✅ 8 endpoints + Socket.io | ✅ | ✅ | Hoạt động — REST + real-time |

---

## 10. BED MANAGEMENT — AUTO-CREATION FIX (2026-03-03)

### Problem

Khi tạo phòng mới (e.g. C501-5, 10 người, 5 giường có sẵn), hệ thống KHÔNG tự tạo các document `Bed` trong MongoDB.
Kết quả: `GET /beds/room/:roomId` trả về mảng rỗng → FE hiển thị "No beds found in this room".

**Root cause:** `createRoom` trong `room.service.js` chỉ save Room document và auto-assign equipment,
nhưng không bao giờ gọi `Bed.insertMany()` để tạo giường.

### Solution

Sửa `src/services/room.service.js`:

#### 1. `createRoom` — Auto-create beds sau khi lưu room

```js
// Auto-create Bed documents: beds 1..available_beds → available, rest → maintenance
if (totalBeds > 0) {
  const bedDocs = Array.from({ length: totalBeds }, (_, i) => ({
    room: room._id,
    bed_number: String(i + 1),
    status: i < availableBeds ? 'available' : 'maintenance',
  }));
  await Bed.insertMany(bedDocs, { ordered: false });
}
```

Ví dụ: `total_beds=10, available_beds=5`
→ Bed #1–5: `available`, Bed #6–10: `maintenance`

#### 2. `updateRoom` — Sync beds khi `total_beds` thay đổi

```js
const oldTotalBeds = Number(room.total_beds);
Object.assign(room, body);
await room.save();

const newTotalBeds = Number(room.total_beds);
if (newTotalBeds !== oldTotalBeds) {
  const existingBeds = await Bed.find({ room: id }).sort({ bed_number: 1 });
  const currentCount = existingBeds.length;

  if (newTotalBeds > currentCount) {
    // Thêm giường mới (status: maintenance)
    const newBedDocs = Array.from({ length: newTotalBeds - currentCount }, (_, i) => ({
      room: id,
      bed_number: String(currentCount + i + 1),
      status: 'maintenance',
    }));
    await Bed.insertMany(newBedDocs, { ordered: false });
  } else if (newTotalBeds < currentCount) {
    // Xóa giường dư (chỉ nếu không bị occupied/reserved)
    const toRemove = existingBeds.slice(newTotalBeds);
    const blocked = toRemove.filter((b) => b.status === 'occupied' || b.status === 'reserved');
    if (blocked.length > 0) throw new AppError('Cannot reduce total_beds: some beds are occupied or reserved', 400);
    await Bed.deleteMany({ _id: { $in: toRemove.map((b) => b._id) } });
  }
}
```

#### 3. `deleteRoom` — Xóa tất cả beds của phòng trước khi xóa phòng

```js
await Bed.deleteMany({ room: id });
await room.deleteOne();
```

### Files Changed

| File | Thay đổi |
|------|---------|
| `src/services/room.service.js` | Import `Bed`; thêm bed auto-create trong `createRoom`; thêm bed sync trong `updateRoom`; thêm bed cleanup trong `deleteRoom` |

### Bed Numbering Convention

- `bed_number` là string số nguyên tuần tự: `"1"`, `"2"`, ..., `"N"`
- Dùng cho việc booking và hiển thị: "Bed #1", "Bed #2", ...
- Index unique: `{ room, bed_number }` → không thể trùng số giường trong cùng phòng

---

## 11. BLOCK MANAGEMENT — FE IMPROVEMENTS (2026-03-04)

### Không có thay đổi BE

Tính năng mới trên FE (Set Status / Change Gender) dùng hoàn toàn endpoint hiện có:

| Tính năng FE | API sử dụng | Endpoint |
|-------------|------------|---------|
| Set Maintenance / Set Available | `updateBlock` | `PATCH /v1/blocks/:id { is_active }` |
| Set Female / Set Male | `updateBlock` | `PATCH /v1/blocks/:id { gender_type }` |

Service `block.service.js` đã xử lý đúng cả hai field:
- `is_active` update trực tiếp
- `gender_type` update với guard không cho phép `"mixed"`

### Lưu ý nghiệp vụ

- `is_active: false` trên FE hiển thị là **Maintenance** (không phải Inactive)
- `block_code` chỉ nhận số nguyên (enforce ở FE via input filter); BE đã có logic suy floor từ chữ số đầu
- Thay đổi `gender_type` không trigger kiểm tra phòng bên trong → manager cần tự đảm bảo phòng không còn sinh viên khác giới trước khi đổi

---

## 12. ROOM MANAGEMENT — FE FIXES (2026-03-04)

### Không có thay đổi BE

Tính năng quick-change status trên Room dùng endpoint hiện có:

| Tính năng FE | API sử dụng | Endpoint |
|-------------|------------|---------|
| Set Maintenance / Set Available | `updateRoom` | `PATCH /v1/rooms/:id { status }` |

### Lưu ý

- Room có 4 status: `available`, `full`, `maintenance`, `inactive`
- Quick-change chỉ cho phép toggle `available ↔ maintenance`; status `full` không cho đổi thủ công (auto theo available_beds = 0)
- `description` và `has_private_bathroom` vẫn tồn tại trong schema (`room.model.js`) nhưng bị ẩn khỏi UI — dữ liệu cũ giữ nguyên trong DB
- Bug fix block picker: FE-only issue (z-index / portal lifecycle), không liên quan BE

---

## 13. MANAGER PAGE SYNC + BLOCK FORM FIX — FE ONLY (2026-03-04)

### Không có thay đổi BE

Tất cả thay đổi trong session này là FE-only. Các endpoint hiện có đã đủ.

| Tính năng FE | API sử dụng | Endpoint |
|-------------|------------|---------|
| Set Status block (manager) | `updateBlock` | `PATCH /v1/blocks/:id { is_active }` |
| Change Gender block (manager) | `updateBlock` | `PATCH /v1/blocks/:id { gender_type }` |
| Set Status room (manager) | `updateRoom` | `PATCH /v1/rooms/:id { status }` |

### Lưu ý

- Manager blocks giờ giống hoàn toàn admin blocks (Set Status, Change Gender, numeric Block Code)
- Manager rooms giờ giống hoàn toàn admin rooms (không có Description/Private Bathroom, có Set Status, block picker fixed)
- Fix validation block field: FE-only — `Form.Item noStyle` + `<Select disabled>`, không thay đổi payload gửi lên BE
