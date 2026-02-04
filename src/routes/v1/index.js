const authRoute = require("./auth.route");
const orderRoute = require("./order.route");
const userRoute = require("./user.route");
const dormRoute = require("./dorm.route");

const express = require("express");

const router = express.Router();

const defaultRoutes = [
  {
    path: "/auth",
    route: authRoute,
  },
  {
    path: "/orders",
    route: orderRoute,
  },
  {
    path: "/users",
    route: userRoute,
  },
  {
    path: "/dorms",
    route: dormRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
