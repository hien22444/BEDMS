const express = require("express");

const { authenticate, authorize } = require("../../middleware/auth");
const roomTypePricingController = require("../../controllers/roomTypePricing.controller");

const router = express.Router();

// Admin-only
router.use(authenticate, authorize("admin"));

router
  .route("/")
  .get(roomTypePricingController.getRoomTypePricing)
  .put(roomTypePricingController.updateRoomTypePricing);

module.exports = router;

