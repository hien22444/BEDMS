const express = require("express");

const { authenticate, authorize } = require("../../middleware/auth");
const roomController = require("../../controllers/room.controller");

const router = express.Router();

// All routes require authentication and admin role
router
  .route("/")
  .get(authenticate, authorize("admin"), roomController.getAllRooms)
  .post(authenticate, authorize("admin"), roomController.createRoom);

router
  .route("/:id")
  .get(authenticate, authorize("admin"), roomController.getRoomById)
  .patch(authenticate, authorize("admin"), roomController.updateRoom)
  .delete(authenticate, authorize("admin"), roomController.deleteRoom);

module.exports = router;

