const authRoute = require('./auth.route');
const userRoute = require('./user.route');
const dormRoute = require('./dorm.route');
const violationRoute = require('./violation.route');
const blockRoute = require('./block.route');
const visitorRoute = require('./visitor.route');
const equipmentRoute = require('./equipment.route');
const notificationRoute = require('./notification.route');
const roomRoute = require('./room.route');
const roomTypePricingRoute = require('./roomTypePricing.route');

const express = require('express');

const router = express.Router();

const defaultRoutes = [
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
  {
    path: '/dorms',
    route: dormRoute,
  },
  {
    path: '/violations',
    route: violationRoute,
  },
  {
    path: '/blocks',
    route: blockRoute,
  },
  {
    path: '/visitors',
    route: visitorRoute,
  },
  {
    path: '/rooms',
    route: roomRoute,
  },
  {
    path: '/equipment',
    route: equipmentRoute,
  },
  {
    path: '/notifications',
    route: notificationRoute,
  },
  {
    path: '/room-type-pricing',
    route: roomTypePricingRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
