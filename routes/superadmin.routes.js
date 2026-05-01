const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const ctrl = require('../controllers/superadmin.controller');
const approvalCtrl = require('../controllers/planApproval.controller');


router.use(protect, checkRole('superAdmin'));


router.get('/stats', ctrl.getPlatformStats);

router.get('/pending-tenants', approvalCtrl.getPendingTenants);

router.get('/tenants', ctrl.getTenants);
router.post('/tenants', ctrl.createTenant);
router.get('/tenants/:id', ctrl.getTenant);
router.patch('/tenants/:id/plan', ctrl.updateTenantPlan);
router.patch('/tenants/:id/toggle', ctrl.toggleTenant);
router.delete('/tenants/:id', ctrl.deleteTenant);


router.post('/tenants/:id/approve', approvalCtrl.approveTenant);
router.post('/tenants/:id/reject', approvalCtrl.rejectTenant);


router.get('/domains', ctrl.getAllDomains);
router.get('/clients', ctrl.getAllClients);


router.get('/plans', ctrl.getPlans);
router.post('/plans', ctrl.createPlan);
router.put('/plans/:id', ctrl.updatePlan);
router.delete('/plans/:id', ctrl.deletePlan);

module.exports = router;