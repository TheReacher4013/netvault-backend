// routes/user.routes.js
const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const { checkStaffLimit } = require('../middleware/planLimit.middleware'); // ← NEW
const ctrl = require('../controllers/user.controller');

router.use(protect);

// Profile routes (any authenticated user)
router.get('/profile', ctrl.getProfile);
router.put('/profile', ctrl.updateProfile);

// Team management (admin only)
router.get('/', checkRole('admin', 'superAdmin'), ctrl.getUsers);
router.post('/', checkRole('admin', 'superAdmin'), checkStaffLimit, ctrl.addUser); // ← limit enforced

router.patch('/:id/role', checkRole('admin', 'superAdmin'), ctrl.updateRole);
router.patch('/:id/toggle-active', checkRole('admin', 'superAdmin'), ctrl.toggleActive);
router.delete('/:id', checkRole('admin', 'superAdmin'), ctrl.deleteUser);

module.exports = router;
