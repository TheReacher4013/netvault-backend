const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
  },
  planId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true,
  },
  planName: { type: String, required: true },
  billingCycle: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },

  razorpayOrderId: { type: String, required: true, unique: true, index: true },
  razorpayPaymentId: { type: String, index: true },
  razorpaySignature: { type: String },

  
  originalAmount: { type: Number, required: true },  
  discountApplied: { type: Number, default: 0 },
  amount: { type: Number, required: true },           
  currency: { type: String, default: 'INR' },

 
  couponCode: { type: String },
  couponData: { type: mongoose.Schema.Types.Mixed },


  referralCode: { type: String },

  
  status: {
    type: String,
    enum: ['pending', 'captured', 'failed', 'refunded'],
    default: 'pending',
    index: true,
  },


  rzpStatus: { type: String },
  method: { type: String },              


  capturedAt: { type: Date },
  failedAt: { type: Date },
  failureReason: { type: String },
  refundedAt: { type: Date },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Payment', PaymentSchema);
