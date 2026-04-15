const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const ctrl = require('../controllers/uptime.controller');
router.use(protect);
router.get('/status', ctrl.getLiveStatus);
router.get('/summary', ctrl.getUptimeSummary);
router.get('/logs/:hostingId', ctrl.getUptimeLogs);
module.exports = router;
