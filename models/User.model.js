const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  role: { type: String, enum: ['superAdmin', 'admin', 'staff', 'client'], default: 'staff' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
  phone: { type: String, trim: true },
  avatar: { type: String },
  isActive: { type: Boolean, default: true },
  lastLogin: { type: Date },
  resetPasswordToken: String,
  resetPasswordExpire: Date,

  //  NEW: 2FA (§8.4 of the spec)
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret: { type: String, select: false },        
  twoFactorBackupCodes: { type: [String], select: false }, 
}, { timestamps: true });

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('User', UserSchema);
