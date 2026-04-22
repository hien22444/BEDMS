const express = require('express');
const { authenticate, authorize } = require('../../middleware/auth');
const { uploadDormRuleDocument } = require('../../middleware/upload');
const { agentController } = require('../../controllers');

const router = express.Router();

router.post('/answer', authenticate, authorize('student'), agentController.answer);
router.get('/dorm-rules', authenticate, authorize('admin'), agentController.getDormRules);
router.put('/dorm-rules', authenticate, authorize('admin'), agentController.updateDormRules);
router
  .route('/dorm-rules/files')
  .get(authenticate, authorize('student', 'admin'), agentController.getDormRuleFiles)
  .post(
    authenticate,
    authorize('admin'),
    uploadDormRuleDocument,
    agentController.uploadDormRuleFile
  );
router
  .route('/dorm-rules/files/:id/feature')
  .patch(authenticate, authorize('admin'), agentController.featureDormRuleFile);
router
  .route('/dorm-rules/files/:id')
  .delete(authenticate, authorize('admin'), agentController.deleteDormRuleFile);

module.exports = router;
