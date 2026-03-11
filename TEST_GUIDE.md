# Unit Test Hướng Dẫn Cho BEDMS

## 📋 Cấu Trúc Một Test Case

```javascript
describe('Tên Module', () => {
  it('should do something specific', async () => {
    // 1. ARRANGE: Chuẩn bị dữ liệu mock
    const mockData = { id: 1, name: 'Test' };
    
    // 2. ACT: Thực thi function cần test
    const result = await myFunction(mockData);
    
    // 3. ASSERT: Kiểm tra kết quả
    expect(result).toEqual(expectedValue);
  });
});
```

## 🎯 3 Bước Test (AAA Pattern)

### 1. **ARRANGE** - Chuẩn bị
- Tạo mock data
- Setup mocks cho dependencies
```javascript
const mockReq = { params: { id: '123' } };
const mockRes = { success: jest.fn() };
```

### 2. **ACT** - Thực thi
- Gọi hàm/function cần test
```javascript
await userController.deleteUser(mockReq, mockRes);
```

### 3. **ASSERT** - Kiểm tra
- Kiểm tra kết quả bằng `expect()`
```javascript
expect(mockRes.success).toHaveBeenCalledWith('User Deleted', expect.any(Number));
```

## 📦 Jest Common Assertions

```javascript
// Kiểm tra giá trị
expect(value).toBe(expectedValue);        // ===
expect(value).toEqual(expectedObject);    // deep equality
expect(value).toContain('substring');

// Kiểm tra hàm được gọi
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith(arg1, arg2);
expect(mockFn).toHaveBeenCalledTimes(1);

// Kiểm tra array, object
expect(array).toHaveLength(3);
expect(obj).toHaveProperty('name');

// Kiểm tra errors
expect(() => func()).toThrow();
expect(async () => func()).rejects.toThrow();

// Kiểm tra async/promise
await expect(promise).resolves.toEqual(value);
await expect(promise).rejects.toThrow();
```

## 🔧 Mocking (Tạo dữ liệu giả)

### Mock Service
```javascript
jest.mock('../services');
const { userService } = require('../services');

// Setup mock để trả về giá trị
userService.getAllUsers.mockResolvedValue([{ id: 1 }]);

// Setup mock để throw error
userService.deleteUser.mockRejectedValue(new Error('Not found'));
```

### Mock Request/Response
```javascript
const mockReq = {
  params: { id: '123' },
  body: { name: 'John' },
  query: { page: 1 },
  file: { buffer: Buffer.from('...') }
};

const mockRes = {
  success: jest.fn(),
  json: jest.fn(),
  status: jest.fn().mockReturnThis()
};
```

## 📝 Ví Dụ Test Controllers

### Test GET endpoint
```javascript
describe('getAllUsers', () => {
  it('should return list of users', async () => {
    const mockUsers = [{ id: 1, name: 'User 1' }];
    const mockReq = { query: {} };
    const mockRes = { success: jest.fn() };
    
    userService.getAllUsers.mockResolvedValue(mockUsers);
    
    await userController.getAllUsers(mockReq, mockRes);
    
    expect(mockRes.success).toHaveBeenCalledWith(mockUsers, expect.any(Number));
  });
});
```

### Test POST endpoint
```javascript
describe('createUser', () => {
  it('should create a new user with valid data', async () => {
    const mockReq = {
      body: { name: 'John', email: 'john@example.com' }
    };
    const mockRes = { success: jest.fn() };
    
    const newUser = { id: 1, ...mockReq.body };
    userService.createUser.mockResolvedValue(newUser);
    
    await userController.createUser(mockReq, mockRes);
    
    expect(userService.createUser).toHaveBeenCalledWith(mockReq.body);
    expect(mockRes.success).toHaveBeenCalled();
  });
});
```

### Test DELETE endpoint  
```javascript
describe('deleteUser', () => {
  it('should delete user successfully', async () => {
    const mockReq = { params: { id: '123' } };
    const mockRes = { success: jest.fn() };
    
    userService.deleteUser.mockResolvedValue(null);
    
    await userController.deleteUser(mockReq, mockRes);
    
    expect(userService.deleteUser).toHaveBeenCalledWith('123');
    expect(mockRes.success).toHaveBeenCalled();
  });
});
```

## ✅ Test Cases Nên Viết

Cho mỗi function, viết test cho:
1. ✅ **Happy Path** - trường hợp thành công
2. ❌ **Error Cases** - khi có lỗi xảy ra
3. 🔍 **Edge Cases** - các trường hợp đặc biệt
4. ✔️ **Validation** - kiểm tra input validation

```javascript
describe('Function', () => {
  // ✅ Happy path
  it('should work correctly with valid input', async () => { /* */ });
  
  // ❌ Error cases
  it('should throw error when service fails', async () => { /* */ });
  it('should throw error when required field is missing', async () => { /* */ });
  
  // 🔍 Edge cases
  it('should handle empty array', async () => { /* */ });
  it('should handle null values', async () => { /* */ });
  
  // ✔️ Validation
  it('should validate email format', async () => { /* */ });
});
```

## 🚀 Chạy Tests

```bash
# Chạy tất cả tests
npm test

# Chạy tests và tự động reload khi code thay đổi
npm run test:watch

# Xem coverage (% code được test)
npm run test:coverage

# Chạy test của một file cụ thể
npm test user.controller.test.js

# Chạy test với một keyword cụ thể
npm test -- --testNamePattern="getAllUsers"
```

## 📂 Cấu Trúc Folder Được Khuyến Nghị

```
src/
  controllers/
    user.controller.js
    user.controller.test.js          ← Test file cạnh controller
  services/
    user.service.js
    __tests__/
      user.service.test.js          ← Hoặc trong folder __tests__
```

## 💡 Tips & Best Practices

1. **Một test = một behavior**
   - ❌ Sai: "test user functions"
   - ✅ Đúng: "should return all users with pagination"

2. **Clear & Descriptive Names**
   ```javascript
   // ❌ Sai
   it('works', async () => {});
   
   // ✅ Đúng
   it('should return paginated users when valid page number is provided', async () => {});
   ```

3. **Mock External Dependencies**
   - Mock database calls
   - Mock API calls
   - Mock file operations

4. **Test Isolation**
   - Mỗi test độc lập
   - Dùng `beforeEach()` để reset mocks
   - Không phụ thuộc vào test khác

5. **Avoid Testing Implementation Details**
   - Test behavior, không test implementation
   - ❌ Đừng test internal variables
   - ✅ Test output/side effects

## 🔗 Tài Liệu

- Jest Docs: https://jestjs.io/
- Jest API: https://jestjs.io/docs/api
- Supertest: https://github.com/visionmedia/supertest
