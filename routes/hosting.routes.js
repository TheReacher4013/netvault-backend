const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const { checkHostingLimit } = require('../middleware/planLimit.middleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/csv/' });
const ctrl = require('../controllers/hosting.controller');

router.use(protect);

router.get('/stats', ctrl.getHostingStats);
router.get('/export-csv', checkRole('admin', 'staff', 'technicalManager'), ctrl.exportHostingCSV);
router.get('/', ctrl.getHosting);
router.post('/', checkHostingLimit, ctrl.addHosting);
router.post('/import', checkRole('admin'), upload.single('file'), ctrl.importHostingCSV);

router.get('/:id', ctrl.getHostingById);
router.put('/:id', ctrl.updateHosting);
router.delete('/:id', checkRole('admin', 'technicalManager', 'superAdmin'), ctrl.deleteHosting);

router.get('/:id/credentials', checkRole('admin', 'staff', 'technicalManager', 'accountManager'), ctrl.getCredentials);
router.get('/:id/ssl-status', ctrl.getSSLStatus);
router.get('/:id/uptime', ctrl.getUptimeLogs);

module.exports = router;
