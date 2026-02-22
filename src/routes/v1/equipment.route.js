const express = require("express");
const equipmentController = require("../../controllers/equipment.controller");
const { authenticate, authorize } = require("../../middleware/auth");

const router = express.Router();

// All equipment routes are restricted to admin users
router.use(authenticate, authorize("admin"));

// ==================== CATEGORY ====================
router
  .route("/categories")
  .get(equipmentController.getCategories)
  .post(equipmentController.createCategory);

router
  .route("/categories/:id")
  .get(equipmentController.getCategoryById)
  .put(equipmentController.updateCategory)
  .patch(equipmentController.updateCategory)
  .delete(equipmentController.deleteCategory);

// ==================== TEMPLATE ====================
router
  .route("/templates")
  .get(equipmentController.getTemplates)
  .post(equipmentController.createTemplate);

router
  .route("/templates/:id")
  .get(equipmentController.getTemplateById)
  .put(equipmentController.updateTemplate)
  .patch(equipmentController.updateTemplate)
  .delete(equipmentController.deleteTemplate);

// ==================== ROOM TYPE EQUIPMENT CONFIG ====================
router
  .route("/room-type-configs")
  .get(equipmentController.getRoomTypeConfigs)
  .post(equipmentController.createRoomTypeConfig);

router
  .route("/room-type-configs/:id")
  .put(equipmentController.updateRoomTypeConfig)
  .patch(equipmentController.updateRoomTypeConfig)
  .delete(equipmentController.deleteRoomTypeConfig);

module.exports = router;
