const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const ctrl = require('../controllers/activity.controller');

router.use(protect);


router.get('/', checkRole('admin', 'superAdmin'), ctrl.getLogs);
router.get('/entity/:type/:id', checkRole('admin', 'staff', 'superAdmin'), ctrl.getEntityTimeline);
router.delete('/', checkRole('admin', 'superAdmin'), ctrl.deleteLogs);
module.exports = router;
