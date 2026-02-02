const express = require('express');

const { authenticate } = require('../../middleware/auth');
const { orderController } = require('../../controllers');

const router = express.Router();

router.route('/').post(authenticate, orderController.createOrder).get(authenticate, orderController.getAllOrder);

router.route('/ordersByDate').get(authenticate, orderController.getAllOrdersByDate);

module.exports = router;
