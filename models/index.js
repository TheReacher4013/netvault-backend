const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const ClientSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  company: { type: String, trim: true },
  address: { type: String },
  avatar: { type: String },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },

  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },


  inviteToken: { type: String, select: false },
  inviteTokenExpire: { type: Date, select: false },

  isActive: { type: Boolean, default: true },
  notes: [{
    content: { type: String, required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now },
  }],
  tags: [{ type: String }],
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

ClientSchema.virtual('domains', {
  ref: 'Domain', localField: '_id', foreignField: 'clientId',
});
ClientSchema.virtual('hosting', {
  ref: 'Hosting', localField: '_id', foreignField: 'clientId',
});
ClientSchema.virtual('invoices', {
  ref: 'Invoice', localField: '_id', foreignField: 'clientId',
});

//  NEW: convenience flag for frontend
ClientSchema.virtual('hasPortalAccess').get(function () {
  return !!this.userId;
});

// Strip invite-token fields from every API response
ClientSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    delete ret.inviteToken;
    delete ret.inviteTokenExpire;
    return ret;
  },
});

ClientSchema.index({ tenantId: 1 });
ClientSchema.index({ userId: 1 });
ClientSchema.plugin(mongoosePaginate);

const Client = mongoose.model('Client', ClientSchema);

// ── Everything below is UNCHANGED from your existing models/index.js ────────

// ── Invoice ──────────────────────────────────────────────────────────────
const InvoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  type: { type: String, enum: ['domain', 'hosting', 'ssl', 'service', 'other'], default: 'service' },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, required: true },
  total: { type: Number, required: true },
});

const InvoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  items: [InvoiceItemSchema],
  subtotal: { type: Number, required: true },
  taxRate: { type: Number, default: 0 },
  taxAmount: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  status: { type: String, enum: ['draft', 'sent', 'paid', 'pending', 'overdue', 'cancelled'], default: 'draft' },
  dueDate: { type: Date, required: true },
  paidAt: { type: Date },
  pdfUrl: { type: String },
  notes: { type: String },
  currency: { type: String, default: 'INR' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

InvoiceSchema.index({ tenantId: 1, invoiceNo: 1 }, { unique: true }); // per-tenant uniqueness
InvoiceSchema.index({ tenantId: 1, status: 1 });
InvoiceSchema.index({ clientId: 1 });
InvoiceSchema.plugin(mongoosePaginate);
const Invoice = mongoose.model('Invoice', InvoiceSchema);

// ── Credential (Encrypted Vault) ─────────────────────────────────────────
const { encryptData, decryptData } = require('../services/encrypt.service');

const CredentialSchema = new mongoose.Schema({
  label: { type: String, required: true },
  type: { type: String, enum: ['cpanel', 'ftp', 'sftp', 'database', 'email', 'ssh', 'dns', 'other'], required: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
  hostingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hosting' },
  domainId: { type: mongoose.Schema.Types.ObjectId, ref: 'Domain' },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  _encryptedData: { type: String, required: true },
  notes: { type: String },
  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

CredentialSchema.virtual('data')
  .get(function () {
    try { return JSON.parse(decryptData(this._encryptedData)); }
    catch { return null; }
  })
  .set(function (val) {
    this._encryptedData = encryptData(JSON.stringify(val));
  });

CredentialSchema.set('toJSON', { virtuals: false });
CredentialSchema.set('toObject', { virtuals: true });
CredentialSchema.index({ tenantId: 1, clientId: 1 });
const Credential = mongoose.model('Credential', CredentialSchema);

// ── Notification ──────────────────────────────────────────────────────────
const NotificationSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // 'system' = auto-generated alert (cron/events), 'broadcast' = admin-sent to roles
  source: { type: String, enum: ['system', 'broadcast'], default: 'system' },
  type: {
    type: String,
    enum: ['domain_expiry', 'hosting_expiry', 'ssl_expiry', 'server_down', 'invoice_overdue', 'new_client', 'payment_received', 'info', 'warning', 'success', 'error'],
    default: 'info',
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  entityType: { type: String, enum: ['domain', 'hosting', 'client', 'invoice', 'user'] },
  severity: { type: String, enum: ['info', 'warning', 'danger', 'success'], default: 'info' },
  // Optional explicit front-end route to navigate to on click (e.g. '/domains/abc123')
  actionUrl: { type: String, default: null },
  // For system alerts: simple boolean read flag per-tenant scope
  read: { type: Boolean, default: false },
  readAt: { type: Date },
  // For broadcast notifications: per-user read tracking
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  // Broadcast-only fields
  targetRoles: [{ type: String }],
  targetUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isGlobal: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

NotificationSchema.index({ tenantId: 1, read: 1 });
NotificationSchema.index({ createdAt: -1 });
const Notification = mongoose.model('Notification', NotificationSchema);

// ── UptimeLog ─────────────────────────────────────────────────────────────
const UptimeLogSchema = new mongoose.Schema({
  hostingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hosting', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  status: { type: String, enum: ['up', 'down'], required: true },
  responseTime: { type: Number },
  statusCode: { type: Number },
  checkedAt: { type: Date, default: Date.now },
  error: { type: String },
}, { timestamps: false });

UptimeLogSchema.index({ hostingId: 1, checkedAt: -1 });
UptimeLogSchema.index({ tenantId: 1 });
const UptimeLog = mongoose.model('UptimeLog', UptimeLogSchema);

// ── Plan ──────────────────────────────────────────────────────────────────
const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  price: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  maxDomains: { type: Number, default: 20 },
  maxClients: { type: Number, default: 10 },
  maxStaff: { type: Number, default: 3 },
  maxHosting: { type: Number, default: 10 },
  features: [{ type: String }],
  isActive: { type: Boolean, default: true },
  isPopular: { type: Boolean, default: false },
  trialDays: { type: Number, default: 7 },
  // Countries this plan is available for (empty = all countries)
  availableCountries: [{ type: String }],
}, { timestamps: true });

const Plan = mongoose.model('Plan', PlanSchema);


// ── ReportEmailSchedule ───────────────────────────────────────────────────────
// Stores email recipients for daily scheduled report delivery
const ReportEmailScheduleSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', default: null }, // null = superAdmin global
  scope: { type: String, enum: ['superAdmin', 'admin'], required: true },
  emails: [{ type: String, trim: true, lowercase: true }],
  sendTime: { type: String, default: '18:00' }, // HH:MM 24h format
  timezone: { type: String, default: 'Asia/Kolkata' },
  enabled: { type: Boolean, default: true },
  lastSentAt: { type: Date },
}, { timestamps: true });

ReportEmailScheduleSchema.index({ tenantId: 1, scope: 1 }, { unique: true });
const ReportEmailSchedule = mongoose.model('ReportEmailSchedule', ReportEmailScheduleSchema);

module.exports = { Client, Invoice, Credential, Notification, UptimeLog, Plan, ReportEmailSchedule };
