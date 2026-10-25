import { join } from 'node:path';
import { PaymentReceiptData } from './payment-receipt.data';
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

export const receiptMode = (mode: string) => ({ ESPECES: 'Espèces', WAVE: 'Wave', ORANGE_MONEY: 'Orange Money', CHEQUE: 'Chèque', VIREMENT: 'Virement', AUTRE: 'Autre' }[mode] || mode);
export const receiptTitle = (r: PaymentReceiptData) => r.paymentType === 'ABONNEMENT' ? 'Mensualité enregistrée'
  : r.paymentType === 'RECHARGE_CARTE' ? `${r.quantity ?? ''} séances ajoutées` : r.paymentType === 'INSCRIPTION' ? 'Inscription enregistrée' : 'Paiement enregistré';

export async function renderPaymentReceipt(r: PaymentReceiptData, photo?: Buffer | null, logo?: Buffer | null): Promise<Buffer> {
  const qr = await QRCode.toBuffer(r.member.qrCode, { width: 240, margin: 2, errorCorrectionLevel: 'M' });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 0, info: { Title: `Reçu ${r.number}`, Author: r.gymName } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const regular = join(__dirname, '../../assets/fonts/Inter-Regular.ttf');
    const medium = join(__dirname, '../../assets/fonts/Inter-Medium.ttf');
    const ink = '#14191D', muted = '#69727D';
    const custom = /^#[0-9a-f]{6}$/i.test(r.branding?.brandColor || '');
    const accent = custom ? r.branding.brandColor : '#B9FF00';
    const rgb = [1, 3, 5].map(i => parseInt(accent.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const readableAccent = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 >= 0.14 ? accent : '#FFFFFF';
    const header = '#0D1012', headerText = '#FFFFFF';
    const money = (n: number) => `${n.toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ')} FCFA`;
    const date = new Date(r.paidAt).toLocaleString('fr-FR', { timeZone: 'Africa/Dakar', dateStyle: 'short', timeStyle: 'short' });
    const text = (value: string, x: number, y: number, width: number, size = 10, color = ink, bold = false, height = 30, align = 'left') =>
      doc.font(bold ? medium : regular).fontSize(size).fillColor(color).text(value, x, y, { width, height, ellipsis: true, align });
    doc.rect(0, 0, 420, 595.28).fill('#FFFFFF');
    doc.rect(0, 0, 420, 103).fill(header);
    doc.rect(0, 103, 420, 4).fill(accent);
    if (logo) doc.roundedRect(22, 16, 56, 56, 6).fill('#FFFFFF');
    doc.image(logo || join(__dirname, '../../assets/branding/gympass.png'), 26, 20, { fit: [48, 48], align: 'center', valign: 'center' });
    text(r.gymName, 90, 25, 303, 17, headerText, true, 42);
    text('REÇU D’ENCAISSEMENT', 90, 70, 303, 10, readableAccent, true, 16);
    text(r.number, 26, 88, 370, 7, '#AAB1B8', false, 12);
    text(receiptTitle(r), 24, 124, 372, 18, ink, true, 26, 'center');
    text(date, 24, 153, 372, 9, muted, false, 18, 'center');
    doc.roundedRect(24, 184, 372, 108, 10).fill('#F2F5F5');
    doc.roundedRect(38, 201, 64, 64, 8).fill('#E0E7E6');
    let hasPhoto = false;
    if (photo) {
      doc.save();
      try { doc.roundedRect(38, 201, 64, 64, 8).clip(); doc.image(photo, 38, 201, { cover: [64, 64], align: 'center', valign: 'center' }); hasPhoto = true; }
      catch { /* A missing portrait never prevents issuing the paid receipt. */ }
      finally { doc.restore(); }
    }
    if (!hasPhoto) text(r.member.name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join(''), 38, 221, 64, 19, muted, true, 28, 'center');
    text(r.member.name, 116, 202, 175, 14, ink, true, 38);
    const digits = r.member.phone.replace(/\D/g, '');
    const phone = /^(221)?\d{9}$/.test(digits)
      ? `${digits.length === 12 ? '+221 ' : ''}${digits.slice(-9).replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4')}`
      : r.member.phone.trim();
    text(phone, 116, 246, 175, 9, muted, false, 16);
    text(`Carte ${r.member.number}`, 116, 267, 175, 9, ink, true, 16);
    doc.image(qr, 306, 199, { width: 76, height: 76 });
    text('QR adhérent', 304, 275, 80, 7, muted, false, 12, 'center');
    const rows: [string, string][] = [];
    if (r.month) rows.push(['Mois couvert', new Date(`${r.month}-01T12:00:00Z`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Africa/Dakar' })]);
    if (r.expiresAt) rows.push(['Nouvelle échéance', new Date(r.expiresAt).toLocaleDateString('fr-FR', { timeZone: 'Africa/Dakar' })]);
    if (r.quantity != null) rows.push(['Séances ajoutées', String(r.quantity)]);
    if (r.balanceBefore != null && r.balanceAfter != null) rows.push(['Solde de séances', `${r.balanceBefore} → ${r.balanceAfter} séances`]);
    rows.push(['Mode de paiement', receiptMode(r.mode)], ['Encaissé par', r.collector]);
    if (r.reference) rows.push(['Référence', r.reference]);
    rows.forEach(([label, value], i) => {
      const y = 310 + i * 29;
      text(label, 28, y, 145, 9, muted, false, 20);
      text(value, 180, y, 212, 9, ink, true, 22, 'right');
      doc.moveTo(28, y + 23).lineTo(392, y + 23).strokeColor('#E5E9E9').lineWidth(0.5).stroke();
    });
    doc.roundedRect(24, 482, 372, 58, 8).fill(header);
    text('TOTAL ENCAISSÉ', 40, 503, 145, 10, headerText, true, 18);
    text(money(r.amount), 180, 498, 199, 19, readableAccent, true, 32, 'right');
    text('Paiement enregistré • Conservez ce reçu.', 24, 556, 372, 9, muted, false, 16, 'center');
    text('GymPass', 24, 575, 372, 8, muted, false, 12, 'center');
    doc.end();
  });
}
