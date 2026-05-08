const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema({
    templateId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
      
    },
    name: { type: String, required: true },
    tag: { type: String, default: '' },


    subject: { type: String, required: true },
    headerTitle: { type: String, default: 'NetVault' },
    headerSub: { type: String, default: '' },
    greeting: { type: String, default: '' },
    body: { type: String, default: '' },
    highlight: { type: String, default: '' },
    btnText: { type: String, default: '' },
    btnUrl: { type: String, default: '' },
    footer: { type: String, default: '' },

   
    hdrColor: { type: String, default: '#0D2B1F' },
    hdrTxtColor: { type: String, default: '#6EE7B7' },
    hlColor: { type: String, default: '#2ECC8A' },
    hlBg: { type: String, default: '#F0FBF5' },
    btnColor: { type: String, default: '#2ECC8A' },
    btnTxtColor: { type: String, default: '#050F0A' },
    footerBg: { type: String, default: '#F9FAFB' },
    footerTxt: { type: String, default: '#9CA3AF' },

    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);