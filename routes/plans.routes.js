const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/plans.controller');

router.get('/', ctrl.getPublicPlans);

module.exports = router;