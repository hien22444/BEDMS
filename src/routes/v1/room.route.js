const express = require("express");

const { authenticate, authorize } = require("../../middleware/auth");
const roomController = require("../../controllers/room.controller");

const router = express.Router();

// All routes require authentication and admin or manager role
router
  .route("/")
  .get(authenticate, authorize("admin", "manager"), roomController.getAllRooms)
  .post(authenticate, authorize("admin", "manager"), roomController.createRoom);

router
  .route("/:id")
  .get(authenticate, authorize("admin", "manager"), roomController.getRoomById)
  .patch(authenticate, authorize("admin", "manager"), roomController.updateRoom)
  .delete(authenticate, authorize("admin", "manager"), roomController.deleteRoom);

module.exports = router;
