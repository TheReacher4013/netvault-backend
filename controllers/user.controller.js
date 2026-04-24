const User = require('../models/User.model');
const { success, error } = require('../utils/apiResponse');
const audit = require('../utils/audit');

// @GET /api/users
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find({ tenantId: req.tenantId })
      .select('-password')
      .sort({ createdAt: -1 });
    return success(res, { users });
  } catch (err) { next(err); }
};

// @POST /api/users
exports.addUser = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    if (!name || !email) return error(res, 'Name and email are required', 400);

    const existing = await User.findOne({ email });
    if (existing) return error(res, 'Email is already in use', 400);

    const user = await User.create({
      name, email,
      password: password || 'ChangeMe@123',
      role: role || 'staff',
      phone,
      tenantId: req.tenantId,
    });

    audit.log(req, 'user.create', 'user', user._id, { email, role: user.role });

    return success(res, {
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    }, 'User created', 201);
  } catch (err) { next(err); }
};

// @PATCH /api/users/:id/role
exports.updateRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['admin', 'staff', 'client'].includes(role)) return error(res, 'Invalid role', 400);
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { role },
      { new: true }
    );
    if (!user) return error(res, 'User not found', 404);
    audit.log(req, 'user.role-change', 'user', user._id, { role });
    return success(res, { user }, 'Role updated');
  } catch (err) { next(err); }
};

// @PATCH /api/users/:id/toggle-active
exports.toggleActive = async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!user) return error(res, 'User not found', 404);
    user.isActive = !user.isActive;
    await user.save();
    audit.log(req, user.isActive ? 'user.activate' : 'user.deactivate', 'user', user._id, {});
    return success(res, { user }, `User ${user.isActive ? 'activated' : 'deactivated'}`);
  } catch (err) { next(err); }
};

// @DELETE /api/users/:id
exports.deleteUser = async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return error(res, 'You cannot delete your own account', 400);
    }
    const user = await User.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!user) return error(res, 'User not found', 404);
    audit.log(req, 'user.delete', 'user', user._id, { email: user.email });
    return success(res, {}, 'User deleted');
  } catch (err) { next(err); }
};

// @GET /api/users/profile
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    return success(res, { user });
  } catch (err) { next(err); }
};

// @PUT /api/users/profile
// ✅ UPDATED: accepts `email` with uniqueness check
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, avatar, email } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (avatar !== undefined) updates.avatar = avatar;

    // Handle email change with proper validation
    let emailChanged = false;
    if (email !== undefined) {
      const normalized = email.trim().toLowerCase();
      // Basic format check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return error(res, 'Please provide a valid email address', 400);
      }

      const currentUser = await User.findById(req.user._id);
      if (!currentUser) return error(res, 'User not found', 404);

      if (normalized !== currentUser.email) {
        // Check for collision with another user
        const collision = await User.findOne({
          email: normalized,
          _id: { $ne: req.user._id },
        });
        if (collision) return error(res, 'This email is already in use by another account', 400);

        updates.email = normalized;
        emailChanged = true;
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    );

    if (emailChanged) {
      audit.log(req, 'user.email-change', 'user', user._id, {
        newEmail: user.email,
      });
    }

    return success(res, { user }, 'Profile updated');
  } catch (err) { next(err); }
};