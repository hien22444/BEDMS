const express = require('express');

const auth = require('../../middleware/auth');
const { orderController } = require('../../controllers');

const router = express.Router();

router.route('/').post(auth, orderController.createOrder).get(auth, orderController.getAllOrder);

router.route('/ordersByDate').get(auth, orderController.getAllOrdersByDate);

module.exports = router;
