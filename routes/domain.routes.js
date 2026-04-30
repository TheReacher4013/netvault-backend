const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const { checkDomainLimit } = require('../middleware/planLimit.middleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/csv/' });
const ctrl = require('../controllers/domain.controller');
const monitorCtrl = require('../controllers/domainMonitor.controller');

router.use(protect);

router.get('/stats', ctrl.getDomainStats);
router.get('/expiring', ctrl.getExpiringDomains);
router.get('/export-csv', checkRole('admin', 'staff', 'technicalManager'), ctrl.exportDomainsCSV);
router.get('/', ctrl.getDomains);

router.post('/', checkDomainLimit, ctrl.addDomain);
router.post('/import-csv', checkRole('admin'), upload.single('file'), ctrl.importDomainsCSV);
router.post('/import', checkRole('admin'), upload.single('file'), ctrl.importDomainsEnhanced);

router.get('/:id', ctrl.getDomain);
router.put('/:id', ctrl.updateDomain);
router.delete('/:id', checkRole('admin', 'technicalManager', 'superAdmin'), ctrl.deleteDomain);

router.post('/:id/check', monitorCtrl.checkNow);

router.post('/:id/dns', ctrl.addDNSRecord);
router.put('/:id/dns/:recordId', ctrl.updateDNSRecord);
router.delete('/:id/dns/:recordId', ctrl.deleteDNSRecord);

module.exports = router;
