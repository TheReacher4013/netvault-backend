const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const tenantCtrl = require('../controllers/tenant.controller');
const approvalCtrl = require('../controllers/planApproval.controller');

// Multer setup for logo upload
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

module.exports = router;
