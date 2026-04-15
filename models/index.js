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

ClientSchema.index({ tenantId: 1 });
ClientSchema.plugin(mongoosePaginate);
const Client = mongoose.model('Client', ClientSchema);

// ── Invoice ──────────────────────────────────────────────────────────────
const InvoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true },
  type: { type: String, enum: ['domain', 'hosting', 'ssl', 'service', 'other'], default: 'service' },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, required: true },
  total: { type: Number, required: true },
});

const InvoiceSchema = new mongoose.Schema({
  invoiceNo: { type: String, unique: true, required: true },
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
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: ['domain_expiry', 'hosting_expiry', 'ssl_expiry', 'server_down', 'invoice_overdue', 'new_client', 'payment_received', 'info'],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  entityId: { type: mongoose.Schema.Types.ObjectId },
  entityType: { type: String, enum: ['domain', 'hosting', 'client', 'invoice', 'user'] },
  severity: { type: String, enum: ['info', 'warning', 'danger', 'success'], default: 'info' },
  read: { type: Boolean, default: false },
  readAt: { type: Date },
}, { timestamps: true });

NotificationSchema.index({ tenantId: 1, read: 1 });
NotificationSchema.index({ createdAt: -1 });
const Notification = mongoose.model('Notification', NotificationSchema);

// ── UptimeLog ─────────────────────────────────────────────────────────────
const UptimeLogSchema = new mongoose.Schema({
  hostingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hosting', required: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
  status: { type: String, enum: ['up', 'down'], required: true },
  responseTime: { type: Number }, // ms
  statusCode: { type: Number },
  checkedAt: { type: Date, default: Date.now },
  error: { type: String },
}, { timestamps: false });

UptimeLogSchema.index({ hostingId: 1, checkedAt: -1 });
UptimeLogSchema.index({ tenantId: 1 });
const UptimeLog = mongoose.model('UptimeLog', UptimeLogSchema);

// ── Plan (SaaS Subscription) ──────────────────────────────────────────────
const PlanSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  displayName: { type: String, required: true },
  price: { type: Number, required: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  maxDomains: { type: Number, default: 20 },
  maxClients: { type: Number, default: 10 },
  maxStaff: { type: Number, default: 3 },
  maxHosting: { type: Number, default: 10 },
  features: [{ type: String }],
  isActive: { type: Boolean, default: true },
  isPopular: { type: Boolean, default: false },
  trialDays: { type: Number, default: 14 },
}, { timestamps: true });

const Plan = mongoose.model('Plan', PlanSchema);

module.exports = { Client, Invoice, Credential, Notification, UptimeLog, Plan };
