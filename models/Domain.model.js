const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const DNSRecordSchema = new mongoose.Schema({
  type: { type: String, enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'], required: true },
  name: { type: String, required: true },
  value: { type: String, required: true },
  ttl: { type: Number, default: 3600 },
  priority: { type: Number }, // for MX records
}, { _id: true });

const DomainSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, lowercase: true },
  registrar: { type: String, trim: true },
  registrationDate: { type: Date },
  expiryDate: { type: Date, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  status: {
    type: String,
    enum: ['active', 'expiring', 'expired', 'transfer', 'suspended'],
    default: 'active',
  },
  autoRenewal: { type: Boolean, default: false },
  isLive: { type: Boolean, default: true },
  nameservers: [{ type: String }],
  dnsRecords: [DNSRecordSchema],
  whois: {
    registrantName: String,
    registrantEmail: String,
    registrantOrg: String,
    updatedDate: Date,
    rawData: String,
  },
  transferStatus: {
    inProgress: { type: Boolean, default: false },
    initiatedAt: Date,
    fromRegistrar: String,
    toRegistrar: String,
    authCode: String,
  },
  subdomains: [{
    name: { type: String },
    pointsTo: { type: String },
    createdAt: { type: Date, default: Date.now },
  }],
  renewalCost: { type: Number },
  sellingPrice: { type: Number },
  notes: { type: String },
  tags: [{ type: String }],
  alertsSent: {
    day30: { type: Boolean, default: false },
    day15: { type: Boolean, default: false },
    day7: { type: Boolean, default: false },
    day1: { type: Boolean, default: false },
  },
}, { timestamps: true });

DomainSchema.index({ tenantId: 1, name: 1 }, { unique: true });
DomainSchema.index({ tenantId: 1, status: 1 });
DomainSchema.index({ expiryDate: 1 });
DomainSchema.plugin(mongoosePaginate);

// Auto-update status based on expiry
DomainSchema.pre('save', function (next) {
  const now = new Date();
  const daysLeft = Math.ceil((this.expiryDate - now) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0) this.status = 'expired';
  else if (daysLeft <= 30) this.status = 'expiring';
  else if (this.status !== 'transfer' && this.status !== 'suspended') this.status = 'active';
  next();
});

module.exports = mongoose.model('Domain', DomainSchema);
