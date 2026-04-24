const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const fmt = (n) => `Rs.${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });


const C = {
  emeraldDk: '#085041',   
  emerald: '#0F6E56',   
  emeraldMd: '#1D9E75',   
  emeraldLt: '#5DCAA5',   
  mint: '#9FE1CB',   
  mintBg: '#E1F5EE',   
  mintPale: '#f4fdf9', 
  white: '#ffffff',
  text: '#1a1a1a',
  muted: '#666666',
  border: '#e0e0e0',
};

const STATUS_COLORS = {
  sent: { bg: C.mintBg, text: C.emeraldDk, dot: C.emerald },
  paid: { bg: C.mintBg, text: C.emeraldDk, dot: C.emerald },
  draft: { bg: '#f3f4f6', text: '#374151', dot: '#9ca3af' },
  pending: { bg: '#fef3c7', text:   '#92400e', dot: '#d97706' },
  overdue: { bg: '#fee2e2', text: '#b91c1c', dot: '#ef4444' },
  cancelled: { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
};


const drawShieldIcon = (doc, cx, cy, size = 10) => {
  const s = size;
  doc.save()
    .moveTo(cx, cy - s)
    .lineTo(cx + s * 0.8, cy - s * 0.4)
    .lineTo(cx + s * 0.8, cy + s * 0.1)
    .bezierCurveTo(cx + s * 0.8, cy + s * 0.7, cx, cy + s, cx, cy + s)
    .bezierCurveTo(cx - s * 0.8, cy + s * 0.7, cx - s * 0.8, cy + s * 0.1, cx - s * 0.8, cy + s * 0.1)
    .lineTo(cx - s * 0.8, cy - s * 0.4)
    .closePath()
    .fill(C.white)
    .restore();
};


const drawAvatar = (doc, x, y, r, initials) => {
  doc.circle(x, y, r).fill(C.mintBg);
  doc.circle(x, y, r).lineWidth(0.5).strokeColor(C.mint).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.emeraldDk)
    .text(initials, x - r, y - 6, { width: r * 2, align: 'center' });
};

exports.generateInvoicePDF = async (invoice, client) => {
  return new Promise((resolve, reject) => {
    try {
      const dir = path.join(process.cwd(), 'uploads/invoices');
      ensureDir(dir);
      const filename = `invoice-${invoice.invoiceNo}.pdf`;
      const filepath = path.join(dir, filename);

      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      const stream = fs.createWriteStream(filepath);
      doc.pipe(stream);

      const W = doc.page.width;    
      const H = doc.page.height;  
      const PAD = 48;
      const INNER = W - PAD * 2;

      doc.rect(0, 0, W, 3).fill(C.emerald);

      const hdrY = 28;

    
      doc.roundedRect(PAD, hdrY, 34, 34, 7).fill(C.emerald);
      drawShieldIcon(doc, PAD + 17, hdrY + 17, 9);

      doc.font('Helvetica-Bold').fontSize(20).fillColor(C.emeraldDk)
        .text('NetVault', PAD + 44, hdrY + 2);
      doc.font('Helvetica').fontSize(9).fillColor(C.emeraldMd)
        .text('DOMAIN & HOSTING MANAGEMENT', PAD + 44, hdrY + 24, { characterSpacing: 1.2 });

  
      doc.font('Helvetica').fontSize(9).fillColor(C.emeraldLt)
        .text('INVOICE', PAD + INNER - 160, hdrY, { width: 160, align: 'right', characterSpacing: 1.5 });
      doc.font('Helvetica-Bold').fontSize(20).fillColor(C.emeraldDk)
        .text(invoice.invoiceNo, PAD + INNER - 160, hdrY + 16, { width: 160, align: 'right' });

      
      const metaY = hdrY + 56;
      const cellW = INNER / 3;

      doc.rect(PAD, metaY, INNER, 48).fill(C.mintBg);
      doc.rect(PAD, metaY, INNER, 48).lineWidth(0.5).strokeColor(C.mint).stroke();

      const metaCells = [
        { label: 'ISSUE DATE', value: fmtDate(invoice.createdAt) },
        { label: 'DUE DATE', value: fmtDate(invoice.dueDate) },
        { label: 'STATUS', value: invoice.status, isStatus: true },
      ];

      metaCells.forEach((cell, i) => {
        const cx = PAD + cellW * i;
        if (i > 0) {
          doc.moveTo(cx, metaY).lineTo(cx, metaY + 48)
            .lineWidth(0.5).strokeColor(C.mint).stroke();
        }
        doc.font('Helvetica').fontSize(8).fillColor(C.emeraldMd)
          .text(cell.label, cx + 14, metaY + 10, { characterSpacing: 1 });

        if (cell.isStatus) {
          const sc = STATUS_COLORS[invoice.status] || STATUS_COLORS.draft;
          const badgeW = 72;
          const badgeX = cx + 14;
          const badgeY = metaY + 24;
          doc.roundedRect(badgeX, badgeY, badgeW, 14, 7).fill(C.white);
          doc.roundedRect(badgeX, badgeY, badgeW, 14, 7).lineWidth(0.5).strokeColor(C.mint).stroke();
          // Dot
          doc.circle(badgeX + 10, badgeY + 7, 3).fill(sc.dot);
          doc.font('Helvetica-Bold').fontSize(8).fillColor(sc.text)
            .text(cell.value.charAt(0).toUpperCase() + cell.value.slice(1),
              badgeX + 16, badgeY + 3, { width: badgeW - 20 });
        } else {
          doc.font('Helvetica-Bold').fontSize(12).fillColor(C.emeraldDk)
            .text(cell.value, cx + 14, metaY + 24, { width: cellW - 20 });
        }
      });

      const billY = metaY + 48 + 20;
      const halfW = (INNER - 24) / 2;


      doc.moveTo(PAD + halfW + 12, billY)
        .lineTo(PAD + halfW + 12, billY + 80)
        .lineWidth(0.5).strokeColor(C.border).stroke();

      const drawParty = (x, tag, initials, name, lines) => {
        doc.font('Helvetica').fontSize(8).fillColor(C.emeraldMd)
          .text(tag, x, billY, { characterSpacing: 1.2 });
        // Avatar
        drawAvatar(doc, x + 15, billY + 28, 14, initials);
        doc.font('Helvetica-Bold').fontSize(13).fillColor(C.text)
          .text(name, x + 36, billY + 18);
        doc.font('Helvetica').fontSize(10).fillColor(C.muted);
        lines.filter(Boolean).forEach((line, i) => {
          doc.text(line, x + 36, billY + 34 + i * 14, { width: halfW - 40 });
        });
      };

      drawParty(PAD, 'FROM', 'NV', 'NetVault', [
        'Domain & Hosting Management',
        'support@netvault.in',
      ]);

      drawParty(PAD + halfW + 24, 'BILL TO',
        ((client.name || 'CL').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()),
        client.name || '',
        [
          client.company || '',
          client.email || '',
          client.phone || '',
          client.address || '',
        ]
      );

   
      const tableY = billY + 92;

      const COL = {
        desc: { x: PAD, w: 188 },
        type: { x: PAD + 194, w: 78 },
        qty: { x: PAD + 278, w: 52 },
        price: { x: PAD + 336, w: 92 },
        total: { x: PAD + 434, w: INNER - 434 },
      };

      // Table header
      doc.rect(PAD, tableY, INNER, 26).fill(C.emerald);

      const HEADERS = [
        { key: 'desc', label: 'DESCRIPTION', align: 'left' },
        { key: 'type', label: 'TYPE', align: 'left' },
        { key: 'qty', label: 'QTY', align: 'right' },
        { key: 'price', label: 'UNIT PRICE', align: 'right' },
        { key: 'total', label: 'TOTAL', align: 'right' },
      ];

      HEADERS.forEach(({ key, label, align }) => {
        const col = COL[key];
        doc.font('Helvetica-Bold').fontSize(8).fillColor('rgba(255,255,255,0.65)')
          .text(label, col.x + 8, tableY + 9, { width: col.w - 10, align, characterSpacing: 0.8 });
      });

      // Table rows
      let rowY = tableY + 26;
      const ROW_H = 32;

      invoice.items.forEach((item, i) => {
        const bg = i % 2 === 0 ? C.mintPale : C.white;
        doc.rect(PAD, rowY, INNER, ROW_H).fill(bg);
        doc.moveTo(PAD, rowY + ROW_H).lineTo(PAD + INNER, rowY + ROW_H)
          .lineWidth(0.3).strokeColor(C.border).stroke();

        const ty = rowY + 7;

        // Description + subtitle
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text)
          .text(item.description || '', COL.desc.x + 8, ty, { width: COL.desc.w - 10, ellipsis: true });
        if (item.subtitle) {
          doc.font('Helvetica').fontSize(8).fillColor(C.muted)
            .text(item.subtitle, COL.desc.x + 8, ty + 13, { width: COL.desc.w - 10, ellipsis: true });
        }

        // Type pill
        const typeLabel = (item.type || 'service').charAt(0).toUpperCase() + (item.type || 'service').slice(1);
        const pillW = 52;
        doc.roundedRect(COL.type.x + 6, ty + 1, pillW, 14, 3)
          .fill(C.mintBg);
        doc.roundedRect(COL.type.x + 6, ty + 1, pillW, 14, 3)
          .lineWidth(0.4).strokeColor(C.mint).stroke();
        doc.font('Helvetica').fontSize(8).fillColor(C.emerald)
          .text(typeLabel, COL.type.x + 6, ty + 3, { width: pillW, align: 'center' });

        doc.font('Helvetica').fontSize(10).fillColor(C.muted)
          .text(String(item.quantity), COL.qty.x, ty + 4, { width: COL.qty.w - 8, align: 'right' });
        doc.font('Helvetica').fontSize(10).fillColor(C.muted)
          .text(fmt(item.unitPrice), COL.price.x, ty + 4, { width: COL.price.w - 8, align: 'right' });
        doc.font('Helvetica-Bold').fontSize(10).fillColor(C.text)
          .text(fmt(item.total), COL.total.x, ty + 4, { width: COL.total.w - 8, align: 'right' });

        rowY += ROW_H;
      });

      // ── Totals ───────────────────────────────────────────────────────
      const totX = PAD + INNER - 220;
      const totW = 220;
      let totY = rowY + 18;

      const drawTotRow = (label, value) => {
        doc.font('Helvetica').fontSize(10).fillColor(C.muted)
          .text(label, totX, totY, { width: 110 });
        doc.font('Helvetica').fontSize(10).fillColor(C.text)
          .text(value, totX + 110, totY, { width: 110, align: 'right' });
        doc.moveTo(totX, totY + 16).lineTo(totX + totW, totY + 16)
          .lineWidth(0.3).strokeColor(C.border).stroke();
        totY += 22;
      };

      drawTotRow('Subtotal', fmt(invoice.subtotal));
      if (invoice.taxRate > 0) drawTotRow(`Tax (${invoice.taxRate}%)`, fmt(invoice.taxAmount));
      if (invoice.discount > 0) drawTotRow('Discount', `-${fmt(invoice.discount)}`);

      // Total due box
      totY += 6;
      doc.roundedRect(totX, totY, totW, 38, 7).fill(C.emerald);
      doc.font('Helvetica').fontSize(9).fillColor(C.emeraldLt)
        .text('TOTAL DUE', totX + 14, totY + 12, { characterSpacing: 0.8 });
      doc.font('Helvetica-Bold').fontSize(17).fillColor(C.white)
        .text(fmt(invoice.total), totX + 14, totY + 10, { width: totW - 28, align: 'right' });

      // ── Notes ────────────────────────────────────────────────────────
      if (invoice.notes) {
        const notesY = totY + 56;
        // Left accent bar
        doc.rect(PAD, notesY, 3, 44).fill(C.emerald);
        // Note background
        doc.rect(PAD + 3, notesY, INNER * 0.55 - 3, 44).fill(C.mintBg);

        doc.font('Helvetica-Bold').fontSize(8).fillColor(C.emeraldMd)
          .text('NOTES', PAD + 14, notesY + 6, { characterSpacing: 1 });
        doc.font('Helvetica').fontSize(10).fillColor(C.emeraldDk)
          .text(invoice.notes, PAD + 14, notesY + 18, { width: INNER * 0.55 - 20 });
      }

      // ── Footer ───────────────────────────────────────────────────────
      const footY = H - 48;

      // Footer bg strip
      doc.rect(0, footY - 4, W, 52).fill(C.mintBg);
      doc.moveTo(PAD, footY - 4).lineTo(PAD + INNER, footY - 4)
        .lineWidth(0.5).strokeColor(C.mint).stroke();

      doc.font('Helvetica').fontSize(9).fillColor(C.emeraldMd)
        .text('NetVault — Domain & Hosting Management', PAD, footY + 6)
        .text('support@netvault.in', PAD, footY + 19);

      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.emeraldDk)
        .text('Thank you for your business!', PAD, footY + 6, { width: INNER, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(C.emeraldMd)
        .text(`Payment due by ${fmtDate(invoice.dueDate)}`, PAD, footY + 19, { width: INNER, align: 'right' });

      doc.end();

      stream.on('finish', () => {
        console.log(`PDF generated: ${filename}`);
        resolve(`uploads/invoices/${filename}`);
      });
      stream.on('error', reject);

    } catch (err) {
      reject(err);
    }
  });
};

