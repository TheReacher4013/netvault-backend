// routes/domain.routes.js
const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const { checkDomainLimit } = require('../middleware/planLimit.middleware'); // ← NEW
const multer = require('multer');
const upload = multer({ dest: 'uploads/csv/' });
const ctrl = require('../controllers/domain.controller');

router.use(protect);

// Static routes MUST come before /:id to avoid Express matching them as IDs
router.get('/stats', ctrl.getDomainStats);
router.get('/expiring', ctrl.getExpiringDomains);
router.get('/', ctrl.getDomains);

// ✅ FIX: checkDomainLimit runs BEFORE create — enforces plan max
router.post('/', checkDomainLimit, ctrl.addDomain);
router.post('/import-csv', checkRole('admin'), upload.single('file'), ctrl.importDomainsCSV);

router.get('/:id', ctrl.getDomain);
router.put('/:id', ctrl.updateDomain);
router.delete('/:id', checkRole('admin', 'superAdmin'), ctrl.deleteDomain);

// DNS sub-routes
router.post('/:id/dns', ctrl.addDNSRecord);
router.put('/:id/dns/:recordId', ctrl.updateDNSRecord);
router.delete('/:id/dns/:recordId', ctrl.deleteDNSRecord);

module.exports = router;
