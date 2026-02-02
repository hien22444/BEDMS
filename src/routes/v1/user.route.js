const express = require("express");

const { authenticate } = require("../../middleware/auth");
const { userController } = require("../../controllers");

const router = express.Router();

router.route("/").get(authenticate, userController.getAllUsers);

router.route("/:id").delete(authenticate, userController.deleteUser);

module.exports = router;
