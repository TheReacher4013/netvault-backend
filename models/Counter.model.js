const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { timestamps: true });

/**
 * Atomically increment a counter and return the new value.
 * @param {string} key - e.g., `invoice-${tenantId}-${year}`
 * @returns {Promise<number>} the new sequence value
 */
CounterSchema.statics.nextSeq = async function (key) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', CounterSchema);
