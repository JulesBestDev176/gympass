import { BadRequestException } from '@nestjs/common';
import { PaymentMode } from '@prisma/client';
export const MAX_FCFA = 2000000000;
export function object(value: any, allowed: string[]) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !allowed.includes(k)))
    throw new BadRequestException('Champs invalides'); return value; }
export function integer(v: any, min = 1, max = MAX_FCFA) { if (!Number.isInteger(v) || v < min || v > max)
    throw new BadRequestException('Montant ou durée invalide'); return v as number; }
export function text(v: any, max = 2000) { if (typeof v !== 'string' || v.length > max)
    throw new BadRequestException('Texte invalide'); return v.trim(); }
export function key(v: any) { if (typeof v !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v))
    throw new BadRequestException('Clé UUID requise'); return v.toLowerCase(); }
export function mode(v: any) { if (!Object.values(PaymentMode).includes(v))
    throw new BadRequestException('Mode invalide'); return v as PaymentMode; }
export function paymentInput(body: any) {
    object(body, ['amountFcfa', 'mode', 'reference', 'paidAt', 'idempotencyKey']);
    const paidAt = body.paidAt === undefined ? null : text(body.paidAt, 40);
    if (paidAt !== null && (!/^\d{4}-\d{2}-\d{2}T/.test(paidAt) || !Number.isFinite(Date.parse(paidAt)) || Date.parse(paidAt) > Date.now() + 60000))
        throw new BadRequestException('Date invalide');
    return { amountFcfa: integer(body.amountFcfa), mode: mode(body.mode), reference: body.reference === undefined ? null : text(body.reference, 300), paidAt, key: key(body.idempotencyKey) };
}
