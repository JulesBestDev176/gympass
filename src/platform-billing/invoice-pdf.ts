// PDFKit's built-in Helvetica embeds no external assets or user-controlled markup.
const PDFDocument = require('pdfkit');
export function renderInvoice(invoice: any, footer: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 48, left: 48, right: 48 }, info: { Title: `Facture ${invoice.number}`, Author: invoice.issuer.name } });
        const chunks: Buffer[] = [];
        doc.on('data', c => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        const line = (value: string, size = 11) => { doc.fontSize(size).fillColor('#17253b').text(value, { width: 499, lineGap: 3 }); };
        const money = (n: number) => `${n.toLocaleString('fr-FR').replace(/[\u202f\u00a0]/g, ' ')} FCFA`;
        const date = (v: string) => new Date(v).toLocaleDateString('fr-FR', { timeZone: 'UTC' });
        line('GYMPASS', 24);
        line(`FACTURE ${invoice.number}`, 17);
        line(`Émise le ${date(invoice.issuedAt)}`);
        doc.moveDown();
        line('ÉMETTEUR', 10);
        for (const v of Object.values(invoice.issuer))
            if (v)
                line(String(v));
        doc.moveDown();
        line('FACTURÉ À', 10);
        for (const v of Object.values(invoice.customer))
            if (v)
                line(String(v));
        doc.moveDown();
        const status = { UNPAID: 'Impayée', PARTIALLY_PAID: 'Partiellement payée', PAID: 'Payée', CANCELLED: 'Annulée' };
        line(`Abonnement plateforme : ${invoice.months} mois`, 14);
        line(`Prix mensuel : ${money(invoice.unitPriceFcfa)}`);
        line(`Total : ${money(invoice.totalFcfa)}`, 16);
        line(`Reçu : ${money(invoice.paidFcfa)}`);
        line(invoice.status === 'CANCELLED' ? 'Aucun montant dû' : `Solde : ${money(invoice.totalFcfa - invoice.paidFcfa)}`);
        line(`Statut : ${status[invoice.status]}`);
        if (invoice.coveredFrom)
            line(`Couverture du ${date(invoice.coveredFrom)} au ${date(invoice.coveredUntil)} (fin exclusive)`);
        if (invoice.cancellationReason)
            line(`Motif d'annulation : ${invoice.cancellationReason}`);
        if (invoice.payments.length) {
            doc.moveDown();
            line('PAIEMENTS ENREGISTRÉS', 12);
            for (const p of invoice.payments)
                line(`${date(p.paidAt)} — ${money(p.amountFcfa)} — ${p.mode}${p.reference ? ' — ' + p.reference : ''}`);
        }
        if (footer) {
            doc.moveDown();
            line(footer, 9);
        }
        doc.end();
    });
}

