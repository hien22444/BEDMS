const express = require("express");

const auth = require("../../middleware/auth");
const { userController } = require("../../controllers");

const router = express.Router();

router.route("/").get(auth, userController.getAllUsers);

router.route("/:id").delete(auth, userController.deleteUser);

module.exports = router;
