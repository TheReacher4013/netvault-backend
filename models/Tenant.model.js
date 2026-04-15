const mongoose = require('mongoose');

const TenantSchema = new mongoose.Schema({
  orgName: { type: String, required: true, trim: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  planName: { type: String, default: 'free' },
  logo: { type: String },
  website: { type: String },
  address: { type: String },
  phone: { type: String },
  email: { type: String },
  isActive: { type: Boolean, default: true },
  maxDomains: { type: Number, default: 20 },
  maxClients: { type: Number, default: 10 },
  maxStaff: { type: Number, default: 3 },
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

module.exports = mongoose.model('Tenant', TenantSchema);
