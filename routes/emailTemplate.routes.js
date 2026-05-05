const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const ctrl = require('../controllers/emailTemplate.controller');


router.use(protect, checkRole('superAdmin'));

router.get('/', ctrl.getAllTemplates);
router.get('/:templateId', ctrl.getTemplate);
router.put('/:templateId', ctrl.updateTemplate);
router.post('/:templateId/reset', ctrl.resetTemplate);
router.post('/:templateId/preview', ctrl.sendPreview);

module.exports = router;