export interface PaymentReceiptData {
  version: 1;
  number: string;
  gymName: string;
  branding?: { logoUrl: string | null; brandColor: string | null };
  member: { name: string; number: string; phone: string; photoUrl: string | null; qrCode: string };
  amount: number;
  mode: string;
  paidAt: string;
  paymentType: string;
  reference: string | null;
  collector: string;
  month: string | null;
  expiresAt: string | null;
  quantity: number | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
}

export function receiptData(payment: any, gym: any, member: any, collector: string,
  details: Partial<PaymentReceiptData> = {}): PaymentReceiptData {
  const month = payment.moisCouvert || null;
  const [year, m] = (month || '').split('-').map(Number);
  return { version: 1, number: `GP-${payment.id.toUpperCase()}`, gymName: gym.nom,
    branding: { logoUrl: gym.logoUrl || null, brandColor: gym.brandColor || null },
    member: { name: `${member.prenom} ${member.nom}`, number: member.numeroCarte,
      phone: member.telephone || '', photoUrl: member.photoUrl || null, qrCode: member.qrCode },
    amount: payment.montantFcfa, mode: payment.mode, paidAt: payment.createdAt.toISOString(),
    paymentType: payment.type, reference: payment.reference || null, collector,
    month, expiresAt: month ? new Date(Date.UTC(year, m, 0, 23, 59, 59, 999)).toISOString() : null,
    quantity: null, balanceBefore: null, balanceAfter: null, ...details };
}
