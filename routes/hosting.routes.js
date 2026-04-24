
const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const { checkHostingLimit } = require('../middleware/planLimit.middleware'); // ← NEW
const ctrl = require('../controllers/hosting.controller');

router.use(protect);

router.get('/stats', ctrl.getHostingStats);
router.get('/', ctrl.getHosting);
router.post('/', checkHostingLimit, ctrl.addHosting);  // ← limit enforced

router.get('/:id', ctrl.getHostingById);
router.put('/:id', ctrl.updateHosting);
router.delete('/:id', checkRole('admin', 'superAdmin'), ctrl.deleteHosting);

router.get('/:id/credentials', checkRole('admin', 'staff'), ctrl.getCredentials);
router.get('/:id/ssl-status', ctrl.getSSLStatus);
router.get('/:id/uptime', ctrl.getUptimeLogs);

module.exports = router;
