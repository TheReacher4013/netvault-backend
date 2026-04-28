const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/announcementController');
const { requireSuperAdmin, requireAuth } = require('../middleware/roleMiddleware');

// All authenticated users (read)
router.get('/', requireAuth, ctrl.getAnnouncements);
router.get('/:id', requireAuth, ctrl.getAnnouncementById);

// Superadmin only (CRUD)
router.post('/', requireSuperAdmin, ctrl.createAnnouncement);
router.put('/:id', requireSuperAdmin, ctrl.updateAnnouncement);
router.delete('/:id', requireSuperAdmin, ctrl.deleteAnnouncement);
router.patch('/:id/publish', requireSuperAdmin, ctrl.publishAnnouncement);

module.exports = router;
