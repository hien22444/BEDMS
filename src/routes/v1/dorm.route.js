const express = require("express");
const { dormController } = require("../../controllers");
const { authenticate, authorize } = require("../../middleware/auth");

const router = express.Router();

// All dorm routes are restricted to admin users
router.use(authenticate, authorize("admin"));

router
  .route("/")
  .get(dormController.getDorms)
  .post(dormController.createDorm);

router
  .route("/:id")
  .get(dormController.getDormById)
  .put(dormController.updateDorm)
  .patch(dormController.updateDorm)
  .delete(dormController.deleteDorm);

module.exports = router;

