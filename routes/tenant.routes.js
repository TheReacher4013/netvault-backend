const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');

const tenantCtrl = require('../controllers/tenant.controller');
const approvalCtrl = require('../controllers/planApproval.controller');

router.use(protect);


router.get('/me', tenantCtrl.getMyTenant);

router.put('/me', checkRole('admin'), tenantCtrl.updateMyTenant);

router.get('/status', approvalCtrl.getOwnTenantStatus);

module.exports = router;