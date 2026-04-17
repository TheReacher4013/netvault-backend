const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const ctrl = require('../controllers/superadmin.controller');

// All super-admin routes require authentication AND the superAdmin role
router.use(protect, checkRole('superAdmin'));

// ── Platform dashboard stats ──────────────────────────────────────────────
router.get('/stats', ctrl.getPlatformStats);

// ── Company (Tenant) management ───────────────────────────────────────────
router.get('/tenants', ctrl.getTenants);
router.post('/tenants', ctrl.createTenant);       // ← NEW: create company
router.get('/tenants/:id', ctrl.getTenant);          // ← ENHANCED: drill-down
router.patch('/tenants/:id/plan', ctrl.updateTenantPlan);
router.patch('/tenants/:id/toggle', ctrl.toggleTenant);
router.delete('/tenants/:id', ctrl.deleteTenant);       // ← NEW: delete company

// ── Cross-tenant data views ───────────────────────────────────────────────
router.get('/domains', ctrl.getAllDomains);   // ← NEW: all domains platform-wide
router.get('/clients', ctrl.getAllClients);   // ← NEW: all clients platform-wide

// ── Subscription plans ────────────────────────────────────────────────────
router.get('/plans', ctrl.getPlans);
router.post('/plans', ctrl.createPlan);
router.put('/plans/:id', ctrl.updatePlan);

module.exports = router;
