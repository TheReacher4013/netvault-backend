const express = require('express');
const router = express.Router();
const protect = require('../middleware/auth.middleware');
const checkRole = require('../middleware/role.middleware');
const { checkStaffLimit } = require('../middleware/planLimit.middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ctrl = require('../controllers/user.controller');

// Avatar upload setup
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = 'uploads/avatars';
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `avatar_${req.user._id}_${Date.now()}${path.extname(file.originalname)}`);
  }
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/image/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

router.use(protect);

router.get('/profile', ctrl.getProfile);
router.put('/profile', ctrl.updateProfile);
router.post('/profile/avatar', uploadAvatar.single('avatar'), ctrl.uploadAvatar);

router.get('/', checkRole('admin', 'superAdmin'), ctrl.getUsers);
router.post('/', checkRole('admin', 'superAdmin'), checkStaffLimit, ctrl.addUser);

router.patch('/:id/role', checkRole('admin', 'superAdmin'), ctrl.updateRole);
router.patch('/:id/toggle-active', checkRole('admin', 'superAdmin'), ctrl.toggleActive);
router.delete('/:id', checkRole('admin', 'superAdmin'), ctrl.deleteUser);

module.exports = router;
