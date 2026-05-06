const mongoose = require('mongoose')


const CouponSchema = new mongoose.Schema({
    code: {
        type: String, required: true, unique: true,
        uppercase: true, trim: true,
    },
    description: {
        type: String, trim: true,
    },

    
    discountType: {
        type: String,
        enum: ['percentage', 'flat', 'duration'],
        required: true,
    },

    discountValue: { type: Number, required: true, min: 0 },

    
    durationDays: { type: Number, default: null },

    maxUses: { type: Number, default: null },
    usedCount: { type: Number, default: 0 },
    minOrderAmount: { type: Number, default: 0 },

   
    applicablePlans: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }],

    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });



CouponSchema.methods.isValid = function (orderAmount = 0) {
    if (!this.isActive)
        return { valid: false, reason: 'Coupon is inactive' };
    if (this.expiresAt && new Date() > this.expiresAt)
        return { valid: false, reason: 'Coupon has expired' };
    if (this.maxUses !== null && this.usedCount >= this.maxUses)
        return { valid: false, reason: 'Coupon usage limit reached' };
    if (this.discountType !== 'duration' && orderAmount < this.minOrderAmount)
        return { valid: false, reason: 'Minimum order amount is ' + this.minOrderAmount };
    return { valid: true };
};


CouponSchema.methods.calcDiscount = function (amount) {
    if (this.discountType === 'percentage') {
        return Math.round((amount * this.discountValue) / 100);
    }
    if (this.discountType === 'flat') {
        return Math.min(this.discountValue, amount);
    }
   
    return 0;
};

const Coupon = mongoose.model('Coupon', CouponSchema);



const ReferralSchema = new mongoose.Schema({
    referrerTenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true },
    referralCode: { type: String, required: true, unique: true, uppercase: true },

    referredTenants: [{
        tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' },
        usedAt: { type: Date, default: Date.now },
        status: { type: String, enum: ['pending', 'rewarded', 'expired'], default: 'pending' },
    }],

    referrerReward: {
        type: { type: String, enum: ['percentage', 'flat', 'months'], default: 'flat' },
        value: { type: Number, default: 500 },
    },
    referredReward: {
        type: { type: String, enum: ['percentage', 'flat'], default: 'percentage' },
        value: { type: Number, default: 10 },
    },

    totalReferrals: { type: Number, default: 0 },
    totalRewardEarned: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

const Referral = mongoose.model('Referral', ReferralSchema);

module.exports = { Coupon, Referral };
