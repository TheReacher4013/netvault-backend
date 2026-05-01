const express = require('express');
const router  = express.Router();
const protect = require('../middleware/auth.middleware');
const ctrl    = require('../controllers/reportData.controller');

router.use(protect);

router.get('/superadmin-summary', ctrl.getSuperAdminSummary);
router.get('/admin-summary',      ctrl.getAdminSummary);
router.get('/email-schedule',     ctrl.getEmailSchedule);
router.post('/email-schedule',    ctrl.saveEmailSchedule);
router.post('/email-schedule/test', ctrl.testEmailSchedule);

module.exports = router;
