const express = require("express");

const { authenticate, authorize } = require("../../middleware/auth");
const roomTypePricingController = require("../../controllers/roomTypePricing.controller");

const router = express.Router();

router
  .route("/")
  .get(authenticate, authorize("admin", "manager"), roomTypePricingController.getRoomTypePricing)
  .put(authenticate, authorize("admin"), roomTypePricingController.updateRoomTypePricing);

module.exports = router;

