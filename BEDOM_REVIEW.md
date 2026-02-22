# BEDOM Backend — Review & Documentation
> Senior Code Review | Updated: 2026-02-22

---

## 1. TỔNG QUAN

**BEDOM** là backend của hệ thống quản lý ký túc xá FPT University.

| Thành phần | Chi tiết |
|-----------|---------|
| Runtime | Node.js + Express 5 |
| Database | MongoDB + Mongoose |
| Auth | JWT (access 1h + refresh 7d) + Google OAuth |
| Upload | Multer (Excel import) |
| Security | bcrypt, rate-limit, CORS, helmet |

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

---

## 5. SENIOR CODE REVIEW — VẤN ĐỀ

### 🔴 CRITICAL

#### C1. NoSQL Injection trong Dorm Search
**File:** `src/services/dorm.service.js`
**Vấn đề:** User input trực tiếp làm RegExp pattern, không escape:
```js
// NGUY HIỂM:
const regex = new RegExp(query.search, "i");
filter.$or = [{ dorm_name: regex }, { dorm_code: regex }];
```
**Hậu quả:** Attacker inject `(.*)` để bypass filter, hoặc ReDoS attack làm chậm server.
**Fix:**
```js
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const regex = new RegExp(escapeRegex(query.search), "i");
```

#### C2. Token lộ trên URL (Google OAuth)
**File:** `src/controllers/auth.controller.js`
**Vấn đề:** Redirect kèm token trong query string:
```js
res.redirect(`${frontendUrl}/auth/google/callback?token=${token}&refreshToken=${refreshTkn}&user=${encodedUser}`);
```
**Hậu quả:** Token nằm trong browser history, server logs, referer header, CDN cache.
**Fix:** Dùng short-lived state code → FE đổi lấy token qua POST.

#### C3. Default password hardcoded trong code
**File:** `src/services/user.service.js`
**Vấn đề:**
```js
const DEFAULT_PASSWORD = "Student@123";
```
**Fix:** Chuyển vào `.env → DEFAULT_USER_PASSWORD`

#### C4. Admin credentials so sánh plaintext
**File:** `src/services/auth.service.js`
**Vấn đề:**
```js
if (adminPassword && email === adminUsername && password === adminPassword)
```
`adminPassword` là plaintext từ `.env`, so sánh trực tiếp với input.
**Fix:** Lưu hash trong .env, so sánh bằng `bcrypt.compare()`.

---

### 🟠 HIGH

#### H1. Race condition trong tạo report/request code
**Files:** `violation.service.js`, `visitor.service.js`
**Vấn đề:** Dùng `findOne().sort()` → đọc → tính seq → write, không atomic.
**visitor.service.js** có retry loop (tốt hơn), nhưng violation.service.js không có.
**Fix:** MongoDB atomic counter hoặc unique index với retry.

#### H2. Thiếu check ban khi tạo visitor request
**File:** `src/services/visitor.service.js`
**Vấn đề:** Sinh viên bị ban vẫn tạo được visitor request vì không check `ban_until_semester`.
**Fix:** Thêm vào `createVisitorRequest()`:
```js
const student = await Student.findOne({ user: userId });
if (student?.ban_until_semester) {
  throw new Error(`Bạn bị cấm đặt phòng đến hết học kỳ ${student.ban_until_semester}`);
}
```

#### H3. Xóa user không kiểm tra liên kết
**File:** `src/services/user.service.js`
**Vấn đề:** Chỉ check `totalOrder` (field không tồn tại trong schema!) → delete luôn luôn thành công dù có visitor requests, violations.
**Fix:** Check `VisitorRequest`, `ViolationReport` trước khi xóa.

#### H4. Không validate visitor request của đúng student
**File:** `src/services/visitor.service.js`
**Vấn đề:** `createVisitorRequest(userId)` không kiểm tra `userId` có phải student đang active, có hợp đồng hiện tại không.
**Fix:** Check student tồn tại và is_active trước khi tạo.

#### H5. Block có thể move sang dorm khác không kiểm tra
**File:** `src/services/block.service.js`
**Vấn đề:** `updateBlock()` cho phép chuyển `dorm` sang dorm khác mà không kiểm tra quyền hoặc tính hợp lệ.

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

#### M4. Evidence URLs không validate
```js
evidence_urls: body.evidence_urls || []
// Không check URL format, không giới hạn domain
```

#### M5. Google OAuth tokens trong URL (đã nêu ở C2)

#### M6. Dorm xóa không xóa/check blocks con
Xóa dorm nhưng blocks vẫn còn → orphaned data.

#### M7. Thiếu BehavioralScoreHistory tracking
Trừ điểm nhưng không ghi lịch sử vào collection `behavioralScoreHistories`.

#### M8. Không có rate limit cho violation & visitor endpoints
Login có rate limit nhưng các endpoint quan trọng khác thì không.

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

#### L6. `totalOrder` field không tồn tại trong User model
```js
const user = await User.findById(id).populate({ path: "totalOrder" });
if (!!user.totalOrder) { ... }
// Field này không có trong schema → luôn undefined → check này vô dụng
```

#### L7. Không có Audit Log
Duyệt vi phạm, phạt điểm, approve/reject visitor — không có audit trail.

#### L8. Inconsistent response format
Một số service trả `{ data: items }`, một số trả `{ items }` — FE phải handle cả hai.

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
| EquipmentTemplate | Template thiết bị |
| RoomEquipment | Thiết bị trong phòng |
| News | Tin tức/thông báo |
| Notification | Thông báo cá nhân |
| ChatConversation | Cuộc trò chuyện |
| ChatMessage | Tin nhắn |
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

---

## 8. SCORECARD

| Hạng mục | Điểm | Nhận xét |
|---------|------|---------|
| Architecture | 7/10 | Layered rõ ràng (routes → controllers → services → models) |
| Security | 4/10 | NoSQL injection, token in URL, plaintext password compare |
| Code Quality | 7/10 | catchAsync pattern tốt, ESLint clean, naming nhất quán |
| Feature Completeness | 3/10 | Nhiều model chưa có endpoint, nhiều tính năng placeholder |
| Error Handling | 6/10 | Backend có catchAsync, nhưng error messages tiết lộ info |
| Database Design | 8/10 | Schema đầy đủ, indexes cơ bản có, quan hệ rõ ràng |
| API Design | 6/10 | RESTful OK, nhưng response format không nhất quán |
| Performance | 5/10 | Thiếu pagination limits, thiếu compound indexes cho query phổ biến |

**Tổng issues tìm thấy: 26** (4 Critical, 5 High, 8 Medium, 9 Low)
