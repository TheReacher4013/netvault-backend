const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/invite.controller');

router.get('/verify/:token', ctrl.verifyInvite);
router.post('/accept/:token', ctrl.acceptInvite);

module.exports = router;