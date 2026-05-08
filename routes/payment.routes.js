const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const paymentCtrl = require('../controllers/razorpay.controller');

router.use(protect);
router.post('/create-order', checkRole('admin'), paymentCtrl.createOrder);
router.post('/verify', checkRole('admin'), paymentCtrl.verifyPayment);
router.post('/failed', checkRole('admin'), paymentCtrl.markFailed);
router.get('/history', paymentCtrl.getPaymentHistory);

module.exports = router;
