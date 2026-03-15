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
const chatRoute = require('./chat.route');
const newsRoute = require('./news.route');
const bedRoute = require('./bed.route');
const statsRoute = require('./stats.route');
const bookingRoute = require('./booking.route');
const payosRoute = require('./payos.route');
const aiRulesRoute = require('./aiRules.route');
const faceRecognitionRoute = require('./faceRecognition.route');
const accessLogRoute = require('./accessLog.route');
const cameraRoute = require('./camera.route');

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
  {
    path: '/chat',
    route: chatRoute,
  },
  {
    path: '/news',
    route: newsRoute,
  },
  {
    path: '/beds',
    route: bedRoute,
  },
  {
    path: '/stats',
    route: statsRoute,
  },
  {
    path: '/bookings',
    route: bookingRoute,
  },
  {
    path: '/payos',
    route: payosRoute,
  },
  {
    path: '/ai',
    route: aiRulesRoute,
  },
  {
    path: '/face-recognition',
    route: faceRecognitionRoute,
  },
  {
    path: '/access-logs',
    route: accessLogRoute,
  },
  {
    path: '/cameras',
    route: cameraRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

module.exports = router;
