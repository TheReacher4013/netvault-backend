const User = require('../models/User.model');
const { success, error } = require('../utils/apiResponse');

// @GET /api/users  — All staff in tenant
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find({
      tenantId: req.tenantId,
      role: { $in: ['admin', 'staff', 'client'] },
    }).sort({ createdAt: -1 });
    return success(res, { users });
  } catch (err) { next(err); }
};

// @POST /api/users  — Add staff member
exports.addUser = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return error(res, 'Email already registered', 400);

    const user = await User.create({
      name, email, password: password || 'ChangeMe@123',
      role: role || 'staff', phone,
      tenantId: req.tenantId,
    });
    return success(res, { user: { _id: user._id, name: user.name, email: user.email, role: user.role } }, 'User added', 201);
  } catch (err) { next(err); }
};

// @PATCH /api/users/:id/role
exports.updateRole = async (req, res, next) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      { role: req.body.role }, { new: true }
    );
    if (!user) return error(res, 'User not found', 404);
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
    return success(res, { isActive: user.isActive }, `User ${user.isActive ? 'activated' : 'deactivated'}`);
  } catch (err) { next(err); }
};

// @DELETE /api/users/:id
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!user) return error(res, 'User not found', 404);
    return success(res, {}, 'User deleted');
  } catch (err) { next(err); }
};

// @GET /api/users/profile
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('tenantId', 'orgName logo planName');
    return success(res, { user });
  } catch (err) { next(err); }
};

// @PUT /api/users/profile
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, phone, avatar } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id, { name, phone, avatar }, { new: true, runValidators: true }
    );
    return success(res, { user }, 'Profile updated');
  } catch (err) { next(err); }
};
