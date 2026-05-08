const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const tenantCtrl = require('../controllers/tenant.controller');
const approvalCtrl = require('../controllers/planApproval.controller');

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/logos';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `logo_${req.user._id}_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  }
});

router.use(protect);

router.get('/me', tenantCtrl.getMyTenant);
router.put('/me', checkRole('admin'), tenantCtrl.updateMyTenant);
router.post('/me/logo', checkRole('admin'), uploadLogo.single('logo'), tenantCtrl.uploadLogo);
router.get('/status', approvalCtrl.getOwnTenantStatus);
router.post('/subscribe', checkRole('admin'), approvalCtrl.subscribePlan);

if (process.env.NODE_ENV !== 'production') {
  router.post('/dev/reset-trial', checkRole('admin'), async (req, res) => {
    const Tenant = require('../models/Tenant.model');
    const days = parseInt(req.query.days) || 7;
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant) return res.status(404).json({ success: false, message: 'Tenant not found' });
    tenant.planStatus = 'trial';
    tenant.isOnTrial = true;
    tenant.trialStartDate = new Date();
    tenant.trialEndDate = new Date(Date.now() + days * 86400000);
    await tenant.save();
    return res.json({ success: true, message: `Trial reset to ${days} days`, trialEndDate: tenant.trialEndDate });
  });
}

module.exports = router;