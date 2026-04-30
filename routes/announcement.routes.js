const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const ctrl = require('../controllers/announcement.controller');

// All authenticated users (read)
router.get('/', protect, ctrl.getAnnouncements);
router.get('/:id', protect, ctrl.getAnnouncementById);

// Superadmin only (CRUD)
router.post('/', protect, checkRole('superAdmin'), ctrl.createAnnouncement);
router.put('/:id', protect, checkRole('superAdmin'), ctrl.updateAnnouncement);
router.delete('/:id', protect, checkRole('superAdmin'), ctrl.deleteAnnouncement);
router.patch('/:id/publish', protect, checkRole('superAdmin'), ctrl.publishAnnouncement);

module.exports = router;