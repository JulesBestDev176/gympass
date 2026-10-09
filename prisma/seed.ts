import { PrismaClient, UserRole, PaymentMode, PaymentType, SubscriptionStatus, NotifType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱  Seeding GymPass SN...');

  // ── Gym ──────────────────────────────────────────────────────────────────────
  const gym = await prisma.gym.upsert({
    where: { slug: 'gymdakarplateau' },
    update: {},
    create: {
      nom: 'Gym Dakar Plateau',
      ville: 'Dakar',
      pays: 'SN',
      slug: 'gymdakarplateau',
      fraisInscription: 5000,
      prixMensualite: 25000,
      dureeMensualite: 30,
      prixSeance: 2500,
      antiDoubleScanSec: 5,
    },
  });
  console.log(`  ✓ Gym: ${gym.nom}`);

  // ── Admin ────────────────────────────────────────────────────────────────────
  const adminHash = await bcrypt.hash('Admin1234!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'mamadou.diop@gymdakarplateau.sn' },
    update: {},
    create: {
      gymId: gym.id,
      nom: 'Diop',
      prenom: 'Mamadou',
      email: 'mamadou.diop@gymdakarplateau.sn',
      telephone: '+221 77 000 00 01',
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      actif: true,
      mustChangePassword: false,
    },
  });
  console.log(`  ✓ Admin: ${admin.prenom} ${admin.nom}`);

  // ── Gérants ──────────────────────────────────────────────────────────────────
  const gerantHash = await bcrypt.hash('Gerant1234!', 10);
  const gerant1 = await prisma.user.upsert({
    where: { email: 'aissatou.fall@gymdakarplateau.sn' },
    update: {},
    create: {
      gymId: gym.id,
      nom: 'Fall',
      prenom: 'Aïssatou',
      email: 'aissatou.fall@gymdakarplateau.sn',
      telephone: '+221 77 000 00 02',
      passwordHash: gerantHash,
      role: UserRole.GERANT,
      actif: true,
      mustChangePassword: true,
    },
  });
  const gerant2 = await prisma.user.upsert({
    where: { email: 'ibrahima.mbaye@gymdakarplateau.sn' },
    update: {},
    create: {
      gymId: gym.id,
      nom: 'Mbaye',
      prenom: 'Ibrahima',
      email: 'ibrahima.mbaye@gymdakarplateau.sn',
      telephone: '+221 77 000 00 03',
      passwordHash: gerantHash,
      role: UserRole.GERANT,
      actif: true,
      mustChangePassword: true,
    },
  });
  console.log(`  ✓ Gérants: ${gerant1.prenom}, ${gerant2.prenom}`);

  // ── Members ──────────────────────────────────────────────────────────────────
  const membersData = [
    { numeroCarte: 'GP-2024-001', nom: 'Ndiaye', prenom: 'Fatou', telephone: '+221 77 123 45 67' },
    { numeroCarte: 'GP-2024-002', nom: 'Sarr', prenom: 'Ibrahima', telephone: '+221 76 234 56 78' },
    { numeroCarte: 'GP-2024-003', nom: 'Ba', prenom: 'Aminata', telephone: '+221 78 345 67 89' },
    { numeroCarte: 'GP-2024-004', nom: 'Diallo', prenom: 'Moussa', telephone: '+221 70 456 78 90' },
    { numeroCarte: 'GP-2024-005', nom: 'Kane', prenom: 'Oumy', telephone: '+221 77 567 89 01' },
    { numeroCarte: 'GP-2024-006', nom: 'Gueye', prenom: 'Samba', telephone: '+221 76 678 90 12' },
    { numeroCarte: 'GP-2024-007', nom: 'Thiaw', prenom: 'Rokhaya', telephone: '+221 78 789 01 23' },
    { numeroCarte: 'GP-2024-008', nom: 'Faye', prenom: 'Cheikh', telephone: '+221 77 890 12 34' },
  ];

  const members = [];
  for (const m of membersData) {
    const member = await prisma.member.upsert({
      where: { numeroCarte: m.numeroCarte },
      update: {},
      create: {
        gymId: gym.id,
        numeroCarte: m.numeroCarte,
        qrCode: `GYMPASS-SN-${m.numeroCarte}`,
        nom: m.nom,
        prenom: m.prenom,
        telephone: m.telephone,
        carteActive: m.numeroCarte !== 'GP-2024-006', // Samba désactivé
      },
    });
    members.push(member);
  }
  console.log(`  ✓ ${members.length} adhérents créés`);

  // ── Subscriptions ─────────────────────────────────────────────────────────────
  const now = new Date();
  const subData = [
    { memberIdx: 0, daysLeft: 15, statut: SubscriptionStatus.ACTIF },
    { memberIdx: 1, daysLeft: 1, statut: SubscriptionStatus.EXPIRE_DEMAIN },
    { memberIdx: 2, daysLeft: -3, statut: SubscriptionStatus.EXPIRE },
    { memberIdx: 4, daysLeft: 22, statut: SubscriptionStatus.ACTIF },
    { memberIdx: 5, daysLeft: 8, statut: SubscriptionStatus.CARTE_DESACTIVEE },
    { memberIdx: 6, daysLeft: 28, statut: SubscriptionStatus.ACTIF },
  ];
  for (const s of subData) {
    const expiration = new Date(now);
    expiration.setDate(expiration.getDate() + s.daysLeft);
    await prisma.subscription.create({
      data: {
        memberId: members[s.memberIdx].id,
        formule: 'Mensuel',
        dateDebut: new Date(now.getTime() - 30 * 24 * 3600 * 1000),
        dateExpiration: expiration,
        statut: s.statut,
      },
    });
  }
  console.log('  ✓ Abonnements créés');

  // ── Session Cards ─────────────────────────────────────────────────────────────
  const card1 = await prisma.sessionCard.create({
    data: {
      memberId: members[3].id, // Moussa Diallo
      qrCode: `GYMPASS-CARTE-SC001`,
      seancesRestantes: 3,
      seancesTotal: 5,
      active: true,
    },
  });
  const card2 = await prisma.sessionCard.create({
    data: {
      memberId: members[7].id, // Cheikh Faye
      qrCode: `GYMPASS-CARTE-SC002`,
      seancesRestantes: 0,
      seancesTotal: 4,
      active: true,
    },
  });
  // Update member subscriptions for séance
  await prisma.subscription.create({
    data: {
      memberId: members[3].id,
      formule: 'Séance',
      dateDebut: now,
      dateExpiration: new Date(now.getTime() + 365 * 24 * 3600 * 1000),
      statut: SubscriptionStatus.SEANCE_DISPONIBLE,
    },
  });
  await prisma.subscription.create({
    data: {
      memberId: members[7].id,
      formule: 'Séance',
      dateDebut: now,
      dateExpiration: new Date(now.getTime() + 365 * 24 * 3600 * 1000),
      statut: SubscriptionStatus.SEANCE_CONSOMMEE,
    },
  });
  console.log('  ✓ Cartes séances créées');

  // ── Payments ──────────────────────────────────────────────────────────────────
  const paymentsData = [
    { memberIdx: 0, type: PaymentType.ABONNEMENT, formule: 'Mensuel', montant: 25000, mode: PaymentMode.ORANGE_MONEY, ref: 'OM-20240915-001', userId: gerant1.id, daysAgo: 0 },
    { memberIdx: 1, type: PaymentType.ABONNEMENT, formule: 'Mensuel', montant: 25000, mode: PaymentMode.ESPECES, userId: gerant1.id, daysAgo: 1, note: 'Renouvellement tardif' },
    { memberIdx: 3, type: PaymentType.SEANCE_UNIQUE, formule: 'Séance unique', montant: 2500, mode: PaymentMode.WAVE, ref: 'WV-20240914-012', userId: gerant2.id, daysAgo: 1 },
    { memberIdx: 4, type: PaymentType.ABONNEMENT, formule: 'Mensuel', montant: 25000, mode: PaymentMode.ESPECES, userId: admin.id, daysAgo: 5 },
    { memberIdx: 6, type: PaymentType.ABONNEMENT, formule: 'Mensuel', montant: 25000, mode: PaymentMode.ORANGE_MONEY, ref: 'OM-20240908-007', userId: gerant1.id, daysAgo: 7 },
  ];
  for (const p of paymentsData) {
    const createdAt = new Date(now.getTime() - p.daysAgo * 24 * 3600 * 1000);
    await prisma.payment.create({
      data: {
        gymId: gym.id,
        memberId: members[p.memberIdx].id,
        userId: p.userId,
        type: p.type,
        formule: p.formule,
        montantFcfa: p.montant,
        mode: p.mode,
        reference: p.ref ?? null,
        note: p.note ?? null,
        createdAt,
      },
    });
  }
  console.log('  ✓ Paiements créés');

  // ── Notifications ─────────────────────────────────────────────────────────────
  const notifsData = [
    { titre: '8 abonnements expirent demain', message: 'Pensez à les relancer pour éviter une interruption.', type: NotifType.EXPIRE_DEMAIN, lue: false, hoursAgo: 1 },
    { titre: 'Paiement enregistré', message: 'Fatou Ndiaye — 25 000 FCFA (Mensuel) via Orange Money.', type: NotifType.PAIEMENT, lue: false, hoursAgo: 2 },
    { titre: 'Nouvelle inscription', message: "Rokhaya Thiaw vient d'être inscrite.", type: NotifType.INSCRIPTION, lue: true, hoursAgo: 5 },
    { titre: 'Abonnement expiré', message: 'Aminata Ba — abonnement expiré depuis 3 jours.', type: NotifType.EXPIRATION, lue: true, hoursAgo: 24 },
    { titre: '2 autorisations exceptionnelles', message: 'Vérifiez les justificatifs et la validité.', type: NotifType.EXPIRE_DEMAIN, lue: false, hoursAgo: 3 },
  ];
  for (const n of notifsData) {
    const createdAt = new Date(now.getTime() - n.hoursAgo * 3600 * 1000);
    await prisma.notification.create({
      data: { gymId: gym.id, titre: n.titre, message: n.message, type: n.type, lue: n.lue, createdAt },
    });
  }
  console.log('  ✓ Notifications créées');

  console.log('\n✅  Seed terminé !');
  console.log('   Admin  : mamadou.diop@gymdakarplateau.sn  /  Admin1234!');
  console.log('   Gérant : aissatou.fall@gymdakarplateau.sn  /  Gerant1234!  (mustChangePassword: true)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
