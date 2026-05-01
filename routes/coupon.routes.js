const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const ctrl = require('../controllers/coupon.controller');


router.get('/coupons/public', ctrl.getPublicCoupons);

router.use(protect);


router.get('/coupons', checkRole('superAdmin', 'admin'), ctrl.getCoupons);
router.post('/coupons', checkRole('superAdmin'), ctrl.createCoupon);

router.post('/coupons/validate', checkRole('admin', 'staff', 'billingManager'), ctrl.validateCoupon);

router.get('/coupons/:id', checkRole('superAdmin'), ctrl.getCoupon);
router.put('/coupons/:id', checkRole('superAdmin'), ctrl.updateCoupon);
router.delete('/coupons/:id', checkRole('superAdmin'), ctrl.deleteCoupon);
router.patch('/coupons/:id/toggle', checkRole('superAdmin'), ctrl.toggleCoupon);


router.get('/referrals/my', checkRole('admin'), ctrl.getMyReferral);
router.get('/referrals', checkRole('superAdmin'), ctrl.getAllReferrals);
router.post('/referrals/apply', ctrl.applyReferral);
router.patch('/referrals/:id/reward', checkRole('superAdmin'), ctrl.markRewarded);

module.exports = router;