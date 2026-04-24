const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const { encryptData, decryptData } = require('../services/encrypt.service');

const HostingSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  planType: { type: String, enum: ['shared', 'vps', 'dedicated', 'cloud', 'reseller'], required: true },
  provider: { type: String, trim: true },
  serverIP: { type: String, trim: true },
  serverLocation: { type: String },
  nameservers: [{ type: String }],
  bandwidth: { type: String },
  diskSpace: { type: String },
  ram: { type: String },
  expiryDate: { type: Date, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  status: { type: String, enum: ['active', 'expiring', 'expired', 'suspended'], default: 'active' },
  controlPanel: { type: String, enum: ['cpanel', 'plesk', 'directadmin', 'webmin', 'none'], default: 'cpanel' },
  // Encrypted credentials — never expose this field directly via API
  _cpanelInfoEncrypted: { type: String, select: false },
  ssl: {
    enabled: { type: Boolean, default: false },
    provider: { type: String },
    expiryDate: { type: Date },
    autoRenew: { type: Boolean, default: false },
    status: { type: String, enum: ['valid', 'expiring', 'expired', 'none'], default: 'none' },
    alertsSent: {
      day30: { type: Boolean, default: false },
      day15: { type: Boolean, default: false },
      day7: { type: Boolean, default: false },
    },
  },
  backup: {
    enabled: { type: Boolean, default: false },
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
    location: { type: String },
    lastBackup: { type: Date },
    nextBackup: { type: Date },
  },
  uptime: {
    monitorEnabled: { type: Boolean, default: true },
    currentStatus: { type: String, enum: ['up', 'down', 'unknown'], default: 'unknown' },
    lastChecked: { type: Date },
    uptimePercent: { type: Number, default: 100 },
  },
  renewalCost: { type: Number },
  sellingPrice: { type: Number },
  autoRenewal: { type: Boolean, default: false },
  notes: { type: String },
  alertsSent: {
    day30: { type: Boolean, default: false },
    day15: { type: Boolean, default: false },
    day7: { type: Boolean, default: false },
    day1: { type: Boolean, default: false },
  },
}, { timestamps: true });


HostingSchema.virtual('cpanelInfo')
  .get(function () {
    if (!this._cpanelInfoEncrypted) return null;
    try { return JSON.parse(decryptData(this._cpanelInfoEncrypted)); }
    catch { return null; }
  })
  .set(function (val) {
    if (val) this._cpanelInfoEncrypted = encryptData(JSON.stringify(val));
  });


HostingSchema.set('toJSON', {
  virtuals: false,
  transform: (doc, ret) => {
    delete ret._cpanelInfoEncrypted; // never expose this in API responses
    return ret;
  },
});
HostingSchema.set('toObject', { virtuals: true }); // virtuals available for internal use

HostingSchema.pre('save', function (next) {
  const now = new Date();
  const daysLeft = Math.ceil((this.expiryDate - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) this.status = 'expired';
  else if (daysLeft <= 30) this.status = 'expiring';
  else if (this.status !== 'suspended') this.status = 'active';
  next();
});

HostingSchema.index({ tenantId: 1, status: 1 });
HostingSchema.index({ expiryDate: 1 });
HostingSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Hosting', HostingSchema);
