const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('../../controllers/email-campaign.controller');

router.use(authenticate, authorize('manager'));

router.get('/students/preview', c.previewStudents);
router.post('/send', c.sendCampaign);
router.get('/history', c.getHistory);
router.get('/templates', c.listTemplates);
router.post('/templates', c.createTemplate);
router.put('/templates/:id', c.updateTemplate);
router.delete('/templates/:id', c.deleteTemplate);

module.exports = router;
