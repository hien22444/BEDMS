# 📝 HƯỚNG DẪN TỪNG BƯỚC SET UP CI/CD

## **BƯỚC 1: Commit & Push lên GitHub**

### 1.1 - Kiểm tra tình trạng files
```bash
cd D:\FPT_Document\CN9\code\BEDMS
git status
```

**Bạn sẽ thấy:**
```
On branch feat/fixfacility

Untracked files:
  (use "git add <file>..." to include in what will be committed)
        .github/
```

### 1.2 - Add tất cả files
```bash
git add .
```

### 1.3 - Commit
```bash
git commit -m "Add GitHub Actions CI workflow for code quality checks"
```

### 1.4 - Push lên GitHub
```bash
git push origin feat/fixfacility
```

**Kết quả:**
```
Enumerating objects: ...
Total 3 (delta 0), reused 0 (delta 0), pack-reused 0
remote: Create a pull request for 'feat/fixfacility' on GitHub by visiting:
remote:      https://github.com/your-username/your-repo/pull/new/feat/fixfacility
```

---

## **BƯỚC 2: Tạo Pull Request (PR) trên GitHub**

### 2.1 - Vào GitHub
```
Link: https://github.com/your-org/your-repo
```

### 2.2 - Xem thông báo PR
Sau khi push, GitHub sẽ hiện nút:
```
✨ Compare & pull request
```

### 2.3 - Click vào nút đó
- **Title:** "Add CI workflow for code quality"
- **Description:**
```
## Changes
- Add ESLint & Prettier checks
- Add Security scanning (Trivy)
- Runs on push to main, develop, feat/* branches

## Testing
- Tested locally with npm run lint
```

### 2.4 - Click **Create pull request**

---

## **BƯỚC 3: Xem CI chạy**

### 3.1 - Xem Actions
```
Trên GitHub PR page:
  1. Scroll xuống → Xem "Checks" section
  2. Sẽ thấy CI chạy: "CI/CD Backend is running..."
  3. Chờ 1-2 phút
```

### 3.2 - Kết quả sẽ là một trong 2:

**✅ PASSED:**
```
✅ CI/CD Backend
   All checks passed
   - code-quality (Node 18.x) ✓
   - code-quality (Node 20.x) ✓
   - security ✓
```

**❌ FAILED:**
```
❌ CI/CD Backend
   Some checks failed
   Click "Details" để xem lỗi gì
```

### 3.3 - Nếu FAIL → Fix lỗi
```bash
# Xem lỗi chi tiết trên GitHub Actions
# Fix code locally
npm run lint:fix
npm run format

# Commit lại
git add .
git commit -m "Fix linting errors"
git push origin feat/fixfacility

# CI sẽ tự động chạy lại!
```

---

## **BƯỚC 4: Assign Reviewer & Merge**

### 4.1 - Assign reviewer
```
GitHub PR page → "Reviewers" → Chọn tech lead
```

### 4.2 - Reviewer xem code
```
Reviewer sẽ:
  1. Kiểm tra logic (CI đã check format/lint rồi)
  2. Comment suggestions (nếu có)
  3. Approve hoặc Request changes
```

### 4.3 - Merge vào main
```
Nếu approved:
  1. Click "Merge pull request"
  2. Confirm merge
  3. Delete branch (optional)
```

---

## **BƯỚC 5: Cho team members biết**

### 5.1 - Gửi instruction cho team
Gửi message họ cái này:

```
👋 Hey team! Chúng ta đã setup CI/CD workflow rồi!

📋 Khi các bạn push code:
1. GitHub tự động kiểm tra ESLint & Prettier
2. Nếu fail → fix lỗi + push lại
3. Nếu pass → được tạo PR + code review

🚀 Các bước:
  1. git checkout -b feat/your-feature
  2. Code feature của bạn
  3. Trước khi push:
     - npm run lint:fix    (fix linting errors)
     - npm run format      (auto format code)
  4. git push origin feat/your-feature
  5. Tạo PR trên GitHub
  6. Chờ CI check (1-2 phút)
  7. Assign reviewer
  8. Merge sau khi approved

📚 Chi tiết: xem file CI_CD_GUIDE.md
```

---

## **BƯỚC 6: Local Workflow cho Team (Quan trọng!)**

### 6.1 - Setup `.git/hooks/pre-commit` (Optional nhưng recommended)

Để tránh push code fail, setup pre-commit hook:

```bash
# Tạo pre-commit hook
cat > .git/hooks/pre-commit << 'EOF'
#!/bin/sh
npm run lint:fix
npm run format
git add .
EOF

chmod +x .git/hooks/pre-commit
```

**Cách hoạt động:**
- Mỗi khi `git commit`, tự động chạy lint + format
- Nếu có lỗi không fix được → prevent commit
- Nếu ok → allow commit

### 6.2 - Team member Standard Workflow

**Mỗi sáng:**
```bash
cd BEDMS
git pull origin develop     # Cập nhật latest code

# Tạo feature branch
git checkout -b feat/my-awesome-feature
```

**Làm việc:**
```bash
# Code...
# Code...

# Trước khi push
npm run lint:fix    # Auto fix linting
npm run format      # Auto format code
npm run lint        # Verify không còn lỗi
```

**Push:**
```bash
git add .
git commit -m "Add my awesome feature"
git push origin feat/my-awesome-feature

# Tạo PR trên GitHub
# Assign reviewer
# Done! ✅
```

---

## ✅ **CHECKLIST HOÀN THÀNH**

- [ ] Commit & push `.github/workflows/ci.yml` lên GitHub
- [ ] Tạo PR từ `feat/fixfacility`
- [ ] Xem CI chạy trên GitHub Actions
- [ ] Confirm CI Pass ✅
- [ ] Merge PR vào main
- [ ] Xóa branch `feat/fixfacility`
- [ ] Gửi instruction cho team
- [ ] Team setup `.git/hooks/pre-commit` (optional)
- [ ] Test: Team member tạo PR nhỏ để test CI

---

## 🎯 **NEXT STEPS**

### Tuần 1:
- ✅ Setup xong CI
- ✅ Team bắt đầu dùng CI cho daily work

### Tuần 2:
- ✅ Nếu muốn: Thêm Unit Tests
- ✅ Setup Code Coverage

### Tuần 3+:
- ✅ Nếu muốn: Thêm Deploy workflow
- ✅ Setup production environment

---

## 🆘 **TROUBLESHOOTING**

### Problem: ESLint errors khi push
**Solution:**
```bash
npm run lint:fix     # Auto fix
git add .
git commit -m "Fix linting"
git push
```

### Problem: Prettier formatting khác nhau
**Solution:**
```bash
npm run format       # Format all files
git add .
git commit -m "Format code"
git push
```

### Problem: CI lâu quá
**Solution:**
- Bình thường: 1-2 phút
- Nếu > 5 phút: Check GitHub Actions logs

### Problem: Workflow file not showing up
**Solution:**
```bash
# Verify file exist
ls -la .github/workflows/

# Check content
cat .github/workflows/ci.yml

# If missing, re-create it
```

---

## 📊 **Monitoring CI Status**

### Mỗi ngày:
```
GitHub Repo → Actions tab
  ├─ Xem tất cả PR projects
  ├─ Xem pass/fail status
  ├─ Xem logs (nếu fail)
```

### Weekly:
```
GitHub Repo → Security tab
  ├─ Xem vulnerability reports
  ├─ Fix issues nếu có
```

---

**Good luck! 🚀 Bắt đầu sử dụng CI/CD ngay hôm nay!**
