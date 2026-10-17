// PDFKit draws locally: no remote assets or user-controlled HTML.
const PDFDocument = require('pdfkit');
const { join } = require('node:path');
export function renderInvoice(invoice: any, footer: string, brand: 'gympass' | 'gymbro' = 'gympass'): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const brandName = brand === 'gymbro' ? 'GymBro' : 'GymPass';
        const doc = new PDFDocument({ size: 'A4', bufferPages: true, margins: { top: 42, bottom: 30, left: 48, right: 48 }, info: { Title: `Facture ${invoice.number}`, Author: invoice.issuer.name || brandName } });
        const chunks: Buffer[] = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const money = (n: number) => `${n.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} FCFA`;
        const date = (v: string) => new Date(v).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
        const ink = '#0d0f12', accent = '#b5ff2d', muted = '#626b78', border = '#e2e5e9';
        const left = 48, right = doc.page.width - 48, width = right - left, bottom = doc.page.height - 78;
        let y = 0;
        const clean = (v: unknown) => String(v ?? '').replace(/[\u2010-\u2015\u2212]/g, '-');
        const font = (size: number, bold = false) => doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
        const height = (v: unknown, w: number, size = 10, bold = false) => {
            font(size, bold); return doc.heightOfString(clean(v), { width: w, lineGap: 3 });
        };
        const text = (v: unknown, x: number, top: number, w: number, size = 10, color = ink, bold = false, align = 'left') => {
            font(size, bold).fillColor(color).text(clean(v), x, top, { width: w, lineGap: 3, align });
        };
        const rule = (top: number, x = left, w = width, color = border) => doc.moveTo(x, top).lineTo(x + w, top).lineWidth(0.7).strokeColor(color).stroke();
        const label = (v: string, x: number, top: number, w: number) => text(v, x, top, w, 8, muted, true);
        const decorate = () => doc.rect(0, 0, 6, doc.page.height).fill(accent);
        const nextPage = () => {
            doc.addPage(); decorate();
            text(`${brandName.toUpperCase()} / FACTURATION`, left, 34, 250, 9, ink, true);
            text(invoice.number, right - 180, 34, 180, 9, muted, false, 'right');
            rule(55); y = 77;
        };
        const ensure = (space: number) => { if (y + space > bottom) nextPage(); };
        const paragraph = (value: string, size = 9, color = muted) => {
            // Split even long unbroken references before measuring, so text cannot
            // cause PDFKit to insert undecorated pages outside our pagination.
            let line = '';
            const flush = () => { if (line) { const h = height(line, width, size); ensure(h + 3); text(line, left, y, width, size, color); y += h + 3; line = ''; } };
            for (const segment of clean(value).split('\n')) {
                for (const word of segment.split(/\s+/).filter(Boolean)) {
                    font(size);
                    if (line && doc.widthOfString(`${line} ${word}`) > width) flush();
                    if (doc.widthOfString(word) <= width) line += `${line ? ' ' : ''}${word}`;
                    else {
                        flush();
                        for (const char of word) { if (doc.widthOfString(line + char) > width) flush(); line += char; }
                    }
                }
                flush();
            }
            flush();
        };
        decorate();
        doc.roundedRect(left, 34, 58, 60, 5).fill(ink);
        doc.image(join(__dirname, '../../assets/branding', `${brand}.png`), left + 2, 36, { fit: [54, 56], align: 'center', valign: 'center' });
        text(brandName.toUpperCase(), left + 73, 42, 330, 23, ink, true);
        text(brand === 'gymbro' ? 'Abonnement utilisateur' : 'Abonnement des salles', left + 74, 70, 330, 9, muted);
        rule(103, left, width, ink);
        label('FACTURE', left, 121, 250);
        text(invoice.number, left, 139, 300, 19, ink, true);
        const statuses = {
            UNPAID: { label: 'À PAYER', color: '#b45309', bg: '#fef3c7' },
            PARTIALLY_PAID: { label: 'PAIEMENT PARTIEL', color: '#b45309', bg: '#fef3c7' },
            PAID: { label: 'PAYÉE', color: ink, bg: accent },
            CANCELLED: { label: 'ANNULÉE', color: muted, bg: '#f1f5f9' },
        };
        const status = statuses[invoice.status] || statuses.UNPAID;
        font(8, true);
        const badgeWidth = doc.widthOfString(status.label) + 22;
        doc.roundedRect(right - badgeWidth, 119, badgeWidth, 22, 3).fill(status.bg);
        text(status.label, right - badgeWidth, 126, badgeWidth, 8, status.color, true, 'center');
        text(`Émise le ${date(invoice.issuedAt)}`, right - 170, 151, 170, 9, muted, false, 'right');

        y = 177;
        const colWidth = (width - 40) / 2;
        const partyLines = (party: any) => [party.name, party.address, party.email, party.phone, party.taxId ? `Identifiant fiscal : ${party.taxId}` : ''].filter(Boolean);
        const parties = [partyLines(invoice.issuer), partyLines(invoice.customer)];
        const partyHeight = (values: any[]) => values.reduce((sum, v, i) => sum + height(v, colWidth, i === 0 ? 12 : 9, i === 0) + 4, 20);
        if (Math.max(...parties.map(partyHeight)) > 340) {
            // Extremely long legal identities use full-width flowing text.
            for (const [i, lines] of parties.entries()) {
                ensure(45); label(i ? 'FACTURÉ À' : 'ÉMETTEUR', left, y, width); y += 20;
                for (const value of lines) paragraph(String(value), 10, ink);
                y += 16;
            }
        } else {
            for (const [i, lines] of parties.entries()) {
                const x = left + i * (colWidth + 40);
                label(i ? 'FACTURÉ À' : 'ÉMETTEUR', x, y, colWidth);
                let top = y + 20;
                lines.forEach((v, j) => { const size = j === 0 ? 12 : 9; text(v, x, top, colWidth, size, j ? muted : ink, !j); top += height(v, colWidth, size, !j) + 4; });
            }
            y += Math.max(...parties.map(partyHeight));
        }
        y += 18; ensure(125);
        const xs = [left, left + 248, left + 302, left + 405];
        label('DÉSIGNATION', xs[0], y, 240);
        text('MOIS', xs[1], y, 40, 8, muted, true, 'center');
        text('PRIX / MOIS', xs[2], y, 90, 8, muted, true, 'right');
        text('MONTANT', xs[3], y, right - xs[3], 8, muted, true, 'right');
        rule(y + 22); y += 38;
        text(brand === 'gymbro' ? 'Abonnement GymBro' : 'Abonnement plateforme', xs[0], y, 235, 12, ink, true);
        text(`Accès aux services ${brandName}`, xs[0], y + 22, 235, 9, muted);
        text(invoice.months, xs[1], y + 3, 40, 11, ink, false, 'center');
        text(money(invoice.unitPriceFcfa), xs[2], y + 3, 90, 9, ink, false, 'right');
        text(money(invoice.totalFcfa), xs[3], y + 3, right - xs[3], 10, ink, true, 'right');
        rule(y + 49); y += 65;

        ensure(155);
        const summaryX = left + 225, summaryW = right - summaryX;
        const summaryLine = (name: string, amount: number) => {
            text(name, summaryX, y, 115, 10, muted);
            text(money(amount), summaryX + 110, y, summaryW - 110, 10, ink, true, 'right');
            rule(y + 22, summaryX, summaryW); y += 31;
        };
        summaryLine('Total', invoice.totalFcfa);
        summaryLine('Paiements reçus', invoice.paidFcfa);
        const balance = invoice.status === 'CANCELLED' ? 0 : Math.max(0, invoice.totalFcfa - invoice.paidFcfa);
        doc.roundedRect(summaryX, y, summaryW, 61, 4).fill(ink);
        text(invoice.status === 'CANCELLED' ? 'Aucun montant dû' : invoice.status === 'PAID' ? 'TOTAL PAYÉ' : 'RESTE À PAYER', summaryX + 15, y + 12, summaryW - 30, 8, '#cbd5e1', true);
        text(money(invoice.status === 'PAID' ? invoice.paidFcfa : balance), summaryX + 15, y + 30, summaryW - 30, 21, accent, true, 'right');
        y += 76;
        if (invoice.coveredFrom && invoice.coveredUntil) { paragraph(`Période d’abonnement : du ${date(invoice.coveredFrom)} au ${date(invoice.coveredUntil)} (date de fin exclue).`, 10, ink); y += 10; }
        if (invoice.cancellationReason) { paragraph(`Motif d'annulation : ${invoice.cancellationReason}`, 10, ink); y += 10; }

        if (invoice.payments.length) {
            const modes = { ESPECES: 'Espèces', WAVE: 'Wave', ORANGE_MONEY: 'Orange Money', VIREMENT: 'Virement', CHEQUE: 'Chèque', AUTRE: 'Autre' };
            const tableHeader = () => {
                ensure(85); label('PAIEMENTS ENREGISTRÉS', left, y, width); y += 24;
                doc.rect(left, y, width, 26).fill('#f8fafc');
                label('DATE', left + 10, y + 9, 72); label('MODE', left + 95, y + 9, 85);
                label('RÉFÉRENCE', left + 185, y + 9, 180);
                text('MONTANT', right - 110, y + 9, 100, 8, muted, true, 'right'); y += 38;
            };
            tableHeader();
            for (const p of invoice.payments) {
                const reference = clean(p.reference || '-');
                const h = Math.max(28, height(reference, 185, 9) + 14);
                if (y + h > bottom) { nextPage(); tableHeader(); }
                text(date(p.paidAt), left + 10, y, 76, 9, muted);
                text(modes[p.mode] || clean(p.mode), left + 95, y, 83, 9);
                text(reference, left + 185, y, 185, 9, muted);
                text(money(p.amountFcfa), right - 110, y, 100, 9, ink, true, 'right');
                rule(y + h - 9); y += h;
            }
            y += 10;
        }
        if (footer) { ensure(45); label('INFORMATIONS', left, y, width); y += 19; paragraph(footer); }
        const range = doc.bufferedPageRange();
        for (let page = range.start; page < range.start + range.count; page++) {
            doc.switchToPage(page);
            // Footers live below the body margin and must not create new pages.
            const margin = doc.page.margins.bottom;
            doc.page.margins.bottom = 0;
            const top = doc.page.height - 51;
            rule(top);
            text(`${brandName} - Facture générée électroniquement`, left, top + 13, 335, 8, muted);
            text(`${page + 1} / ${range.count}`, right - 80, top + 13, 80, 8, muted, false, 'right');
            doc.page.margins.bottom = margin;
        }
        doc.end();
    });
}

