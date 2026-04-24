const mongoose = require('mongoose');

const OtpTokenSchema = new mongoose.Schema({
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    codeHash: { type: String, required: true },   // bcrypt hash of the 6-digit code
    purpose: { type: String, enum: ['register', 'email-change'], default: 'register' },
    attempts: { type: Number, default: 0 },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

OtpTokenSchema.index({ email: 1, purpose: 1 });

module.exports = mongoose.model('OtpToken', OtpTokenSchema);