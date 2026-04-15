const express = require('express');
const router = express.Router();
const { register, login, getMe, forgotPassword, resetPassword, changePassword } = require('../controllers/auth.controller');
const protect = require('../middleware/auth.middleware');
const { body } = require('express-validator');
const validate = require('../middleware/validate.middleware');

router.post('/register', [
  body('orgName').notEmpty().withMessage('Organisation name required'),
  body('name').notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
], validate, register);

router.post('/login', [
  body('email').isEmail(),
  body('password').notEmpty(),
], validate, login);

router.get('/me', protect, getMe);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.patch('/change-password', protect, changePassword);

module.exports = router;
