const express = require("express");

const { authenticate, authorize } = require("../../middleware/auth");
const { userController } = require("../../controllers");
const { uploadExcel } = require("../../middleware/upload");

const router = express.Router();

router.route("/").get(authenticate, userController.getAllUsers);

router
  .route("/import-excel")
  .post(authenticate, authorize("admin"), uploadExcel, userController.importExcel);

router.route("/:id").delete(authenticate, userController.deleteUser);

module.exports = router;
