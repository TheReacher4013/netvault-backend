
const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const ctrl = require('../controllers/clientPortal.controller');

// Require auth + specifically the 'client' role
router.use(protect);
router.use(checkRole('client'));

router.get('/overview',          ctrl.getOverview);
router.get('/domains',           ctrl.getDomains);
router.get('/hosting',           ctrl.getHosting);
router.get('/invoices',          ctrl.getInvoices);
router.get('/invoices/:id',      ctrl.getInvoice);
router.get('/invoices/:id/pdf',  ctrl.downloadInvoicePDF);
router.get('/alerts',            ctrl.getAlerts);

module.exports = router;
