const authRoute = require("./auth.route");
const orderRoute = require("./order.route");
const userRoute = require("./user.route");
const dormRoute = require("./dorm.route");
const violationRoute = require("./violation.route");
const blockRoute = require("./block.route");
const roomRoute = require("./room.route");

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
  {
    path: "/violations",
    route: violationRoute,
  },
  {
    path: "/blocks",
    route: blockRoute,
  },
  {
    path: "/rooms",
    route: roomRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
