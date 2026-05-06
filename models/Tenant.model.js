const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema({
  orgName: { type: String, required: false, trim: true, default: '' },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  planName: { type: String, default: 'free' },
  logo: { type: String },
  website: { type: String },
  address: { type: String },
  phone: { type: String },
  countryCode: { type: String, default: '+91' },
  country: { type: String, default: 'IN' },
  email: { type: String },
  isActive: { type: Boolean, default: true },

  planStatus: {
    type: String,
    enum: ['pending', 'active', 'trial', 'trial_expired', 'suspended', 'rejected'],
    default: 'active',
    index: true,
  },
  approvedAt: { type: Date },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectedAt: { type: Date },
  rejectionReason: { type: String },

  // Free trial fields
  trialStartDate: { type: Date },
  trialEndDate: { type: Date },
  trialDays: { type: Number, default: 7 },
  isOnTrial: { type: Boolean, default: false },
  profileCompleted: { type: Boolean, default: false },

  maxDomains: { type: Number, default: 20 },
  maxClients: { type: Number, default: 10 },
  maxStaff: { type: Number, default: 3 },
  maxHosting: { type: Number, default: 10 },
  subscriptionStart: { type: Date, default: Date.now },
  subscriptionEnd: { type: Date },
  settings: {
    emailAlerts: { type: Boolean, default: true },
    smsAlerts: { type: Boolean, default: false },
    alertDays: { type: [Number], default: [30, 15, 7, 1] },
    currency: { type: String, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
  },
}, { timestamps: true });

TenantSchema.virtual('trialDaysRemaining').get(function () {
  if (!this.isOnTrial || !this.trialEndDate) return null;
  const diff = this.trialEndDate - new Date();
  return Math.max(0, Math.ceil(diff / 86400000));
});

TenantSchema.set('toJSON', { virtuals: true });
TenantSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Tenant', TenantSchema);
