const mongoose = require('mongoose');

const ROLES = ['superAdmin', 'admin', 'staff', 'client'];

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  content: { type: String, required: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  targetRoles: [{ type: String, enum: ROLES }],
  publishedAt: { type: Date },
  expiresAt: { type: Date },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // ── Popup customization ──────────────────────────────────────────────────
  customization: {
    bgColor: { type: String, default: '#ffffff' },   // popup background
    textColor: { type: String, default: '#111827' },   // body text colour
    accentColor: { type: String, default: '#6366F1' },   // top bar + button
    buttonText: { type: String, default: '' },          // CTA label  (empty = hidden)
    buttonLink: { type: String, default: '' },          // CTA href
    iconEmoji: { type: String, default: '' },          // emoji icon (overrides priority icon)
    imageUrl: { type: String, default: '' },          // banner image URL
  },
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);