const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const ctrl = require('../controllers/report.controller');
router.use(protect);

// CRUD
router.get('/', ctrl.getAllReports);
router.post('/', ctrl.createReport);
router.put('/:id', ctrl.updateReport);
router.delete('/:id', ctrl.deleteReport);
router.post('/:id/regenerate', ctrl.regenerateReport);

// Analytics
router.get('/renewals', ctrl.getRenewalReport);
router.get('/revenue', ctrl.getRevenueReport);
router.get('/status-overview', ctrl.getStatusOverview);
router.get('/client/:id', ctrl.getClientReport);
module.exports = router;