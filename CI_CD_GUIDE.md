# CI/CD GitHub Actions Hướng Dẫn

## 📋 Tổng Quan

Project của bạn hiện có 1 workflow GitHub Actions:
- **CI.yml**: Kiểm tra code quality (linting, formatting, security)

---

## 🔧 Cấu Hình CI Workflow (ci.yml)

### Triggers
Workflow chạy tự động khi:
```
- Push code vào branches: main, develop, feat/*
- Tạo/update Pull Request vào main hoặc develop
```

### Jobs

#### 1. **code-quality**
- **Chạy trên**: Ubuntu Latest
- **Node versions**: 18.x, 20.x (test trên 2 phiên bản)
- **Các bước**:
  - ✅ Checkout code
  - ✅ Setup Node.js
  - ✅ Cache npm dependencies
  - ✅ Install dependencies
  - ✅ Run ESLint
  - ✅ Check Prettier formatting

#### 2. **security**
- **Chạy trên**: Ubuntu Latest
- **Các bước**:
  - ✅ Scan vulnerabilities bằng Trivy
  - ✅ Upload results vào GitHub Security tab

---

## � Thiết Lập (Không cần thiết cho CI)

## 📝 Cách Sử Dụng

### Lần đầu tiên:
```bash
# Push code lên GitHub
git add .
git commit -m "Add GitHub Actions CI"
git push origin feat/fixfacility
```

### Tạo Pull Request:
- Workflow **ci.yml** tự động chạy
- Kiểm tra kết quả ở tab **Actions**
- Nếu pass ✅ → được merge vào main
- Nếu fail ❌ → sửa lỗi linting/formatting rồi push lại

---

## ✅ Checklist Thiết Lập

- [ ] File ci.yml đã được tạo
- [ ] Commit và push lên GitHub
- [ ] Vào GitHub Actions xem workflows
- [ ] Tạo PR để test workflow chạy
- [ ] Kiểm tra lint/format pass hay fail

---

## 🔧 Tùy Chỉnh Workflows

### Nếu bạn có test suite:
Thêm vào `ci.yml` trong job `code-quality`:
```yaml
- name: Run tests
  run: npm test
  working-directory: ./BEDMS
```

### Nếu bạn có database setup:
```yaml
services:
  mongodb:
    image: mongo:latest
    options: >-
      --health-cmd mongosh
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

---

## 📊 Monitoring

### Xem kết quả workflows:
1. Vào **GitHub repo**
2. Tab **Actions**
3. Click workflow muốn xem
4. Chi tiết mỗi step

### Common Issues:

| Vấn đề | Giải pháp |
|--------|----------|
| ESLint errors | Chạy `npm run lint:fix` locally trước khi push |
| Prettier formatting | Chạy `npm run format` để tự động format |
| Slow builds | Dùng `cache: 'npm'` để cache dependencies |

---

## 🎯 Next Steps

1. **Test lần đầu**: Tạo PR nhỏ để test workflow chạy
2. **Monitor**: Xem GitHub Actions sau mỗi push
3. **Fix lỗi**: Sửa eslint/prettier errors nếu có
4. **Khi cần deploy**: Sẽ thêm deploy workflow sau

---

## 📚 Tài Liệu Tham Khảo

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [ESLint](https://eslint.org/)
- [Prettier](https://prettier.io/)
- [Heroku Deploy Action](https://github.com/akhileshns/heroku-deploy)
- [Trivy Security Scanner](https://github.com/aquasecurity/trivy-action)

