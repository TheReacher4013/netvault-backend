// routes/tenant.routes.js
const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const ctrl = require('../controllers/tenant.controller');

router.use(protect);

// Any authenticated tenant user can view company info
router.get('/me', ctrl.getMyTenant);

// Only admin can update company settings
router.put('/me', checkRole('admin'), ctrl.updateMyTenant);

module.exports = router;
