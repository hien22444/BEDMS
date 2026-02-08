const express = require("express");

const { authenticate, authorize } = require("../../middleware/auth");
const blockController = require("../../controllers/block.controller");

const router = express.Router();

// All routes require authentication and admin role
router
  .route("/")
  .get(authenticate, authorize("admin"), blockController.getAllBlocks)
  .post(authenticate, authorize("admin"), blockController.createBlock);

router
  .route("/:id")
  .get(authenticate, authorize("admin"), blockController.getBlockById)
  .patch(authenticate, authorize("admin"), blockController.updateBlock)
  .delete(authenticate, authorize("admin"), blockController.deleteBlock);

module.exports = router;
