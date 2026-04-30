const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const ctrl = require('../controllers/notification.controller');

router.use(protect);
router.get('/', ctrl.getAlerts);
router.patch('/read-all', ctrl.markAllAlertsRead);
router.patch('/:id/read', ctrl.markAlertRead);
router.delete('/:id', ctrl.deleteAlert);

module.exports = router;
