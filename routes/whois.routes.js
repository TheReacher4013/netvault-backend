const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const ctrl = require('../controllers/whois.controller');

router.use(protect);

router.get('/availability', ctrl.checkAvailability);
router.get('/lookup', ctrl.lookup);
router.post('/refresh/:id', ctrl.refreshDomainWhois);

module.exports = router;
