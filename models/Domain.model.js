const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const DNSRecordSchema = new mongoose.Schema({
  type: { type: String, enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'], required: true },
  name: { type: String, required: true },
  value: { type: String, required: true },
  ttl: { type: Number, default: 3600 },
  priority: { type: Number },
}, { _id: true });

const DomainSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, lowercase: true },
  url: { type: String, trim: true, lowercase: true }, // Full URL e.g. example.com
  registrar: { type: String, trim: true },
  registrationDate: { type: Date },
  expiryDate: { type: Date, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },

 
  parentDomainId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Domain',
    default: null,
    index: true,
  },
  // Derived flag — useful for filters like "show main domains only"
  isSubdomain: { type: Boolean, default: false, index: true },

  status: {
    type: String,
    enum: ['active', 'expiring', 'expired', 'transfer', 'suspended'],
    default: 'active',
  },
  autoRenewal: { type: Boolean, default: false },
  isLive: { type: Boolean, default: true },
  hostingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hosting', default: null }, // Linked hosting

  //  NEW: monitoring fields (prep for Feature 4 in next turn)
  monitoring: {
    lastChecked: { type: Date },
    currentState: { type: String, enum: ['up', 'down', 'unknown'], default: 'unknown' },
    lastDownAt: { type: Date },
    lastUpAt: { type: Date },
    lastAlertAt: { type: Date },  // throttle alerts to once per 2 hours
  },

  nameservers: [{ type: String }],
  dnsRecords: [DNSRecordSchema],
  whois: {
    registrantName: String,
    registrantEmail: String,
    registrantOrg: String,
    updatedDate: Date,
    rawData: String,
    lastFetched: Date,
  },
  transferStatus: {
    inProgress: { type: Boolean, default: false },
    initiatedAt: Date,
    fromRegistrar: String,
    toRegistrar: String,
    authCode: String,
  },
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
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

//  Virtual — query child domains by parentDomainId
DomainSchema.virtual('subdomains', {
  ref: 'Domain',
  localField: '_id',
  foreignField: 'parentDomainId',
});

DomainSchema.index({ tenantId: 1, name: 1 }, { unique: true });
DomainSchema.index({ tenantId: 1, status: 1 });
DomainSchema.index({ tenantId: 1, projectId: 1 });
DomainSchema.index({ tenantId: 1, parentDomainId: 1 });
DomainSchema.index({ expiryDate: 1 });
DomainSchema.plugin(mongoosePaginate);

const PROTECTED_STATUSES = ['transfer', 'suspended'];

DomainSchema.pre('save', function (next) {
  // Sync url from name if not set
  if (!this.url && this.name) {
    this.url = this.name.replace(/^https?:\/\//, '').replace(/^www\./, '');
  }

  // Derive isSubdomain
  this.isSubdomain = !!this.parentDomainId;

  // Expiry-driven status (same logic as before)
  if (PROTECTED_STATUSES.includes(this.status)) return next();
  if (!this.isNew && !this.isModified('expiryDate')) return next();

  const now = new Date();
  const daysLeft = Math.ceil((this.expiryDate - now) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) this.status = 'expired';
  else if (daysLeft <= 30) this.status = 'expiring';
  else this.status = 'active';

  if (this.isModified('expiryDate') && !this.isNew) {
    this.alertsSent = { day30: false, day15: false, day7: false, day1: false };
  }

  next();
});

module.exports = mongoose.model('Domain', DomainSchema);