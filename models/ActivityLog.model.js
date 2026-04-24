const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const ActivityLogSchema = new mongoose.Schema({
  tenantId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', index: true },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:   { type: String },       
  userEmail:  { type: String },

 
  action:     { type: String, required: true, index: true },

  entityType: { type: String, enum: ['domain', 'hosting', 'client', 'invoice', 'user', 'tenant', 'auth', 'credential', null] },
  entityId:   { type: mongoose.Schema.Types.ObjectId },


  metadata:   { type: mongoose.Schema.Types.Mixed, default: {} },

  ip:         { type: String },
  userAgent:  { type: String },
}, { timestamps: true });

// Auto-cleanup older than 1 year
ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ tenantId: 1, createdAt: -1 });
ActivityLogSchema.index({ tenantId: 1, entityType: 1, entityId: 1 });
ActivityLogSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);
