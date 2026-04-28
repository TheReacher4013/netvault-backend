const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String },
  type: {
    type: String,
    enum: ['user_activity', 'system', 'financial', 'audit', 'custom'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'generating', 'ready', 'failed'],
    default: 'pending'
  },
  filters: { type: mongoose.Schema.Types.Mixed, default: {} },
  data: { type: mongoose.Schema.Types.Mixed },
  fileUrl: { type: String },
  format: { type: String, enum: ['pdf', 'csv', 'excel'], default: 'pdf' },
  generatedAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
