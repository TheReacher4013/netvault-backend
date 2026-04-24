
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/otp.controller');

router.post('/send', ctrl.sendOtp);
router.post('/verify', ctrl.verifyOtp);

module.exports = router;