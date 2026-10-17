import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, PlatformInvoiceStatus } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { addCalendarMonths, billingState } from './access-policy';
import { integer, key, mode, object, paymentInput, text, MAX_FCFA } from './validation';
const invoiceInclude = { payments: { orderBy: { paidAt: 'asc' as const } } };
const defaults = { monthlyPriceFcfa: null, graceDays: 7, issuerName: '', issuerAddress: '', issuerEmail: '', issuerPhone: '', issuerTaxId: '', invoiceFooter: '' };
const identity = (source: any, prefix: string) => ({ name: source[prefix + 'Name'] || '', address: source[prefix + 'Address'] || '', email: source[prefix + 'Email'] || '', phone: source[prefix + 'Phone'] || '', taxId: source[prefix + 'TaxId'] || '' });
@Injectable()
export class PlatformBillingService {
    constructor(private readonly prisma: PrismaService) { }
    private async serial<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
        for (let attempt = 0; attempt < 6; attempt++) {
            try {
                return await this.prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 15000 });
            }
            catch (e) {
                if (!['P2034', 'P2002'].includes(e.code))
                    throw e;
                if (attempt === 5)
                    throw new ServiceUnavailableException('Conflit temporaire, réessayez avec la même clé');
                await new Promise(r => setTimeout(r, 15 * (attempt + 1)));
            }
        }
    }
    private async settings(db: Prisma.TransactionClient = this.prisma) { const row = await db.platformBillingSettings.findUnique({ where: { id: 'global' } }); if (!row)
        return { ...defaults }; const { id, ...result } = row; return result; }
    async updateSettings(body: any) {
        object(body, Object.keys(defaults));
        const data: any = {};
        for (const [k, v] of Object.entries(body)) {
            if (k === 'monthlyPriceFcfa')
                data[k] = v === null ? null : integer(v);
            else if (k === 'graceDays')
                data[k] = integer(v, 0, 90);
            else
                data[k] = text(v, k === 'invoiceFooter' ? 4000 : 2000);
        }
        const { id, ...result } = await this.prisma.platformBillingSettings.upsert({ where: { id: 'global' }, create: { id: 'global', ...data }, update: data });
        return result;
    }
    private gymView(gym: any, settings: any, outstandingFcfa = 0, now = new Date()) {
        const a = gym.billingAccount;
        return { gymId: gym.id, name: gym.nom, city: gym.ville, ...billingState(a, settings.graceDays, now), enabled: a?.enabled ?? false, monthlyPriceFcfa: a?.monthlyPriceFcfa ?? settings.monthlyPriceFcfa, priceOverrideFcfa: a?.monthlyPriceFcfa ?? null, outstandingFcfa, billingName: a?.billingName || '', billingAddress: a?.billingAddress || '', billingEmail: a?.billingEmail || '', billingPhone: a?.billingPhone || '', billingTaxId: a?.billingTaxId || '' };
    }
    async updateGym(gymId: string, body: any) {
        object(body, ['enabled', 'monthlyPriceFcfa', 'billingName', 'billingAddress', 'billingEmail', 'billingPhone', 'billingTaxId']);
        if (typeof body.enabled !== 'boolean' || !('monthlyPriceFcfa' in body))
            throw new BadRequestException('Activation et tarif requis');
        const data: any = { enabled: body.enabled, monthlyPriceFcfa: body.monthlyPriceFcfa === null ? null : integer(body.monthlyPriceFcfa) };
        for (const k of ['billingName', 'billingAddress', 'billingEmail', 'billingPhone', 'billingTaxId'])
            if (body[k] !== undefined)
                data[k] = text(body[k]);
        return this.serial(async (tx) => { const gym = await tx.gym.findUnique({ where: { id: gymId }, include: { billingAccount: true } }); if (!gym)
            throw new NotFoundException('Salle introuvable'); if (data.enabled && gym.billingAccount && !gym.billingAccount.enabled && !gym.billingAccount.paidUntil)
            data.activatedAt = new Date(); const account = await tx.gymBillingAccount.upsert({ where: { gymId }, create: { gymId, ...data }, update: data }); const sums = await tx.platformInvoice.aggregate({ where: { gymId, status: { in: ['UNPAID', 'PARTIALLY_PAID'] } }, _sum: { totalFcfa: true, paidFcfa: true } }); return this.gymView({ ...gym, billingAccount: account }, await this.settings(tx), (sums._sum.totalFcfa || 0) - (sums._sum.paidFcfa || 0)); });
    }
    async overview() {
        return this.serial(async (tx) => {
            const settings = await this.settings(tx);
            const rows = await tx.gym.findMany({ include: { billingAccount: true }, orderBy: { nom: 'asc' } });
            const sums = await tx.platformInvoice.groupBy({ by: ['gymId'], where: { status: { in: ['UNPAID', 'PARTIALLY_PAID'] } }, _sum: { totalFcfa: true, paidFcfa: true } });
            const collected = await tx.platformBillingPayment.aggregate({ _sum: { amountFcfa: true } });
            const now = new Date();
            const gyms = rows.map(g => { const s = sums.find(s => s.gymId === g.id); return this.gymView(g, settings, (s?._sum.totalFcfa || 0) - (s?._sum.paidFcfa || 0), now); });
            return { settings, summary: { collectedFcfa: collected._sum.amountFcfa || 0, outstandingFcfa: gyms.reduce((s, g) => s + g.outstandingFcfa, 0), activeGyms: gyms.filter(g => g.status === 'ACTIVE').length, graceGyms: gyms.filter(g => g.status === 'GRACE').length, blockedGyms: gyms.filter(g => g.status === 'BLOCKED').length }, gyms, generatedAt: now.toISOString() };
        });
    }
    private view(row: any) { return { id: row.id, number: row.number, gymId: row.gymId, gymName: row.gymName, months: row.months, unitPriceFcfa: row.unitPriceFcfa, totalFcfa: row.totalFcfa, paidFcfa: row.paidFcfa, status: row.status, issuedAt: row.issuedAt.toISOString(), coveredFrom: row.coveredFrom?.toISOString() ?? null, coveredUntil: row.coveredUntil?.toISOString() ?? null, issuer: row.issuer, customer: row.customer, payments: row.payments.map(p => ({ id: p.id, amountFcfa: p.amountFcfa, mode: p.mode, reference: p.reference, paidAt: p.paidAt.toISOString() })), cancellationReason: row.cancellationReason }; }
    async getInvoice(id: string, db: Prisma.TransactionClient = this.prisma) { const row = await db.platformInvoice.findUnique({ where: { id }, include: invoiceInclude }); if (!row)
        throw new NotFoundException('Facture introuvable'); return this.view(row); }
    async invoices(query: any) { object(query, ['page', 'gymId', 'status']); const page = query.page === undefined ? 1 : integer(Number(query.page), 1, 1000000); if (query.status && !Object.values(PlatformInvoiceStatus).includes(query.status))
        throw new BadRequestException('Statut invalide'); const where: any = {}; if (query.gymId)
        where.gymId = text(query.gymId, 200); if (query.status)
        where.status = query.status; return this.serial(async (tx) => ({ items: (await tx.platformInvoice.findMany({ where, orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * 20, take: 20, include: invoiceInclude })).map(i => this.view(i)), total: await tx.platformInvoice.count({ where }), page, pageSize: 20 })); }
    private fingerprint(value: any) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
    private async duplicate(tx: Prisma.TransactionClient, key: string, fingerprint: string) { const command = await tx.platformBillingCommand.findUnique({ where: { key } }); if (!command)
        return null; if (command.fingerprint !== fingerprint)
        throw new ConflictException('Clé déjà utilisée pour une autre opération'); return this.getInvoice(command.invoiceId, tx); }
    async createInvoice(body: any, actor: string) {
        object(body, ['gymId', 'months', 'paid', 'mode', 'reference', 'idempotencyKey']);
        if (typeof body.paid !== 'boolean')
            throw new BadRequestException('Paiement requis');
        const input = { gymId: text(body.gymId, 200), months: integer(body.months, 1, 120), paid: body.paid, mode: body.paid ? mode(body.mode) : null, reference: body.reference === undefined ? null : text(body.reference, 300), key: key(body.idempotencyKey) };
        if (!input.paid && (body.mode !== undefined || body.reference !== undefined))
            throw new BadRequestException('Paiement absent');
        const fingerprint = this.fingerprint({ operation: 'invoice', actor, ...input });
        return this.serial(async (tx) => {
            const duplicate = await this.duplicate(tx, input.key, fingerprint);
            if (duplicate)
                return duplicate;
            const gym = await tx.gym.findUnique({ where: { id: input.gymId }, include: { billingAccount: true } });
            if (!gym)
                throw new NotFoundException('Salle introuvable');
            const settings = await this.settings(tx);
            const unitPriceFcfa = gym.billingAccount?.monthlyPriceFcfa ?? settings.monthlyPriceFcfa;
            if (!unitPriceFcfa || !settings.issuerName.trim())
                throw new BadRequestException('Tarif et émetteur requis');
            const totalFcfa = integer(unitPriceFcfa * input.months, 1, MAX_FCFA);
            const now = new Date();
            await tx.gymBillingAccount.upsert({ where: { gymId: gym.id }, create: { gymId: gym.id, enabled: true, activatedAt: now }, update: { enabled: true, ...(gym.billingAccount && !gym.billingAccount.enabled && !gym.billingAccount.paidUntil ? { activatedAt: now } : {}) } });
            const counter = await tx.platformInvoiceCounter.upsert({ where: { year: now.getUTCFullYear() }, create: { year: now.getUTCFullYear(), value: 1 }, update: { value: { increment: 1 } } });
            const customer = identity(gym.billingAccount || {}, 'billing');
            if (!customer.name)
                customer.name = gym.nom;
            if (!customer.address)
                customer.address = [gym.ville, gym.pays].filter(Boolean).join(', ');
            const invoice = await tx.platformInvoice.create({ data: { number: `GP-${counter.year}-${String(counter.value).padStart(6, '0')}`, gymId: gym.id, gymName: gym.nom, months: input.months, unitPriceFcfa, totalFcfa, issuer: identity(settings, 'issuer'), customer, footer: settings.invoiceFooter, createdById: actor, issuedAt: now } });
            if (input.paid)
                await this.applyPayment(tx, invoice, { amountFcfa: totalFcfa, mode: input.mode, reference: input.reference, paidAt: now }, actor, now);
            await tx.platformBillingCommand.create({ data: { key: input.key, fingerprint, invoiceId: invoice.id } });
            return this.getInvoice(invoice.id, tx);
        });
    }
    private async applyPayment(tx: Prisma.TransactionClient, invoice: any, input: any, actor: string, now: Date) {
        if (invoice.status === 'CANCELLED' || invoice.status === 'PAID' || input.amountFcfa > invoice.totalFcfa - invoice.paidFcfa)
            throw new ConflictException('Montant supérieur au solde ou facture clôturée');
        const paidFcfa = invoice.paidFcfa + input.amountFcfa;
        const settled = paidFcfa === invoice.totalFcfa;
        const data: any = { paidFcfa, status: settled ? 'PAID' : 'PARTIALLY_PAID' };
        if (settled) {
            const account = await tx.gymBillingAccount.findUniqueOrThrow({ where: { gymId: invoice.gymId } });
            const continuing = account.paidUntil && account.paidUntil > now;
            const from = continuing ? account.paidUntil : now;
            const anchorDay = continuing ? (account.anchorDay || from.getUTCDate()) : now.getUTCDate();
            const until = addCalendarMonths(from, invoice.months, anchorDay);
            data.coveredFrom = from;
            data.coveredUntil = until;
            await tx.gymBillingAccount.update({ where: { gymId: invoice.gymId }, data: { enabled: true, paidUntil: until, anchorDay } });
        }
        await tx.platformBillingPayment.create({ data: { invoiceId: invoice.id, amountFcfa: input.amountFcfa, mode: input.mode, reference: input.reference, paidAt: input.paidAt, recordedById: actor } });
        await tx.platformInvoice.update({ where: { id: invoice.id }, data });
    }
    async recordPayment(id: string, body: any, actor: string) { const input = paymentInput(body); const fingerprint = this.fingerprint({ operation: 'payment', invoiceId: id, actor, ...input }); return this.serial(async (tx) => { const duplicate = await this.duplicate(tx, input.key, fingerprint); if (duplicate)
        return duplicate; const invoice = await tx.platformInvoice.findUnique({ where: { id } }); if (!invoice)
        throw new NotFoundException('Facture introuvable'); const now = new Date(); await this.applyPayment(tx, invoice, { ...input, paidAt: input.paidAt ? new Date(input.paidAt) : now }, actor, now); await tx.platformBillingCommand.create({ data: { key: input.key, fingerprint, invoiceId: id } }); return this.getInvoice(id, tx); }); }
    async cancelInvoice(id: string, body: any) { object(body, ['reason']); const reason = text(body.reason, 2000); if (!reason)
        throw new BadRequestException('Motif requis'); return this.serial(async (tx) => { const invoice = await tx.platformInvoice.findUnique({ where: { id } }); if (!invoice)
        throw new NotFoundException('Facture introuvable'); if (invoice.status !== 'UNPAID' || invoice.paidFcfa !== 0)
        throw new ConflictException('Seule une facture impayée peut être annulée'); await tx.platformInvoice.update({ where: { id }, data: { status: 'CANCELLED', cancellationReason: reason } }); return this.getInvoice(id, tx); }); }
    async invoicePdf(id: string): Promise<Buffer> { const invoice = await this.prisma.platformInvoice.findUnique({ where: { id }, include: invoiceInclude }); if (!invoice)
        throw new NotFoundException('Facture introuvable'); const { renderInvoice } = await import('./invoice-pdf'); return renderInvoice(this.view(invoice), invoice.footer); }
}
