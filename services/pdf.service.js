const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const ensureDir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

exports.generateInvoicePDF = async (invoice, client) => {
  return new Promise((resolve, reject) => {
    try {
      const dir = path.join(__dirname, '../uploads/invoices');
      ensureDir(dir);
      const filename = `invoice-${invoice.invoiceNo}.pdf`;
      const filepath = path.join(dir, filename);
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      // ── Header ──
      doc.rect(0, 0, doc.page.width, 90).fill('#0D2B1F');
      doc.fontSize(26).fillColor('#2ECC8A').text('NetVault', 50, 28, { continued: true });
      doc.fontSize(12).fillColor('#A8C4B8').text('  Domain & Hosting Management', { baseline: 'middle' });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor('#5DE4C7').text('INVOICE', 50, 65);

      // ── Invoice meta ──
      doc.fillColor('#111111');
      doc.fontSize(20).text(`Invoice ${invoice.invoiceNo}`, 50, 110);
      doc.fontSize(10).fillColor('#555555');
      doc.text(`Date: ${new Date(invoice.createdAt).toDateString()}`, 50, 138);
      doc.text(`Due: ${new Date(invoice.dueDate).toDateString()}`, 50, 152);
      doc.text(`Status: ${invoice.status.toUpperCase()}`, 50, 166);

      // ── Client info ──
      doc.rect(350, 105, 200, 75).fill('#F0FBF5').stroke('#D0EDD8');
      doc.fillColor('#163D2B').fontSize(11).text('Bill To:', 360, 113);
      doc.fillColor('#111111').fontSize(10)
        .text(client.name || '', 360, 128)
        .text(client.company || '', 360, 142)
        .text(client.email || '', 360, 156)
        .text(client.phone || '', 360, 170);

      // ── Table header ──
      const tableTop = 210;
      doc.rect(50, tableTop, 500, 24).fill('#163D2B');
      doc.fillColor('#FFFFFF').fontSize(10);
      doc.text('Description', 60, tableTop + 7);
      doc.text('Qty', 310, tableTop + 7);
      doc.text('Unit Price', 360, tableTop + 7);
      doc.text('Total', 460, tableTop + 7);

      // ── Table rows ──
      let y = tableTop + 30;
      invoice.items.forEach((item, i) => {
        if (i % 2 === 0) doc.rect(50, y - 4, 500, 22).fill('#F8FAFB').stroke();
        doc.fillColor('#111111').fontSize(10);
        doc.text(item.description, 60, y, { width: 240 });
        doc.text(String(item.quantity), 315, y);
        doc.text(`₹${item.unitPrice.toLocaleString('en-IN')}`, 360, y);
        doc.text(`₹${item.total.toLocaleString('en-IN')}`, 460, y);
        y += 26;
      });

      // ── Totals ──
      y += 10;
      doc.moveTo(350, y).lineTo(550, y).stroke('#D0EDD8');
      y += 10;
      const drawRow = (label, val, bold = false) => {
        doc.fillColor(bold ? '#0D2B1F' : '#555555')
          .fontSize(bold ? 12 : 10)
          .font(bold ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(label, 360, y);
        doc.text(val, 460, y);
        y += 20;
      };
      drawRow('Subtotal:', `₹${invoice.subtotal.toLocaleString('en-IN')}`);
      if (invoice.taxRate > 0) drawRow(`Tax (${invoice.taxRate}%):`, `₹${invoice.taxAmount.toLocaleString('en-IN')}`);
      if (invoice.discount > 0) drawRow('Discount:', `-₹${invoice.discount.toLocaleString('en-IN')}`);
      doc.rect(350, y, 200, 28).fill('#0D2B1F');
      doc.fillColor('#2ECC8A').fontSize(13).font('Helvetica-Bold')
        .text('Total:', 360, y + 7)
        .text(`₹${invoice.total.toLocaleString('en-IN')}`, 460, y + 7);

      // ── Footer ──
      doc.fontSize(9).fillColor('#999999')
        .text('Thank you for your business!', 50, doc.page.height - 60, { align: 'center' })
        .text('NetVault — Domain & Hosting Management Platform', { align: 'center' });

      doc.end();
      stream.on('finish', () => {
        logger.info(`PDF generated: ${filename}`);
        resolve(`uploads/invoices/${filename}`);
      });
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};
