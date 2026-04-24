// routes/auth.routes.js
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const ctrl = require('../controllers/auth.controller');
const protect = require('../middleware/auth.middleware');
const validate = require('../middleware/validate.middleware');

// ── Registration + basic login ─────
router.post('/register', [
  body('orgName').notEmpty().withMessage('Organisation name required'),
  body('name').notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
], validate, ctrl.register);

router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], validate, ctrl.login);

// ── Password recovery ───────────────────────────────────────────────────────
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password/:token', ctrl.resetPassword);
router.patch('/change-password', protect, ctrl.changePassword);

// ── Current user ────────────────────────────────────────────────────────────
router.get('/me', protect, ctrl.getMe);

// ── 2FA: setup (generate QR)  →  verify-setup (enable) ──────────────────────
router.post('/2fa/setup', protect, ctrl.setup2FA);
router.post('/2fa/verify-setup', protect, ctrl.verify2FASetup);
router.post('/2fa/disable', protect, ctrl.disable2FA);

// ── 2FA login step 2 (unauthenticated — uses tempToken) ─────────────────────
router.post('/2fa/verify-login', ctrl.verify2FALogin);

module.exports = router;
