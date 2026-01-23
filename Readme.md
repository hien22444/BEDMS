1. npm install
2. create env file and add value

NODE_ENV=develop
PORT=3001
MONGODB_URI=mongodb://localhost:27017/Lam-laptoporder
JWT_SECRET=fallback_secret

3. npm run dev

4. api routes

auth

http://localhost:3001/v1/auth/login
http://localhost:3001/v1/auth/register

user (token require)

http://localhost:3001/v1/users
http://localhost:3001/v1/users/:userId

order (token require)

http://localhost:3001/v1/orders (Get)
http://localhost:3001/v1/orders (Post) create Order => body is quantity and laptopId
