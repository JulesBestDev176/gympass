import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 1. Gym Yeumbeul
  const gym = await prisma.gym.upsert({
    where: { slug: 'gymyeumbeul' },
    update: {},
    create: {
      nom: 'Gym Yeumbeul',
      ville: 'Dakar',
      pays: 'SN',
      slug: 'gymyeumbeul',
      fraisInscription: 5000,
      prixMensualite: 25000,
      dureeMensualite: 30,
      prixSeance: 2500,
      antiDoubleScanSec: 5,
    },
  });
  console.log(`Gym : ${gym.nom}  (id: ${gym.id})`);

  // 2. User Yandar — ADMIN, mot de passe à changer au premier login
  const hash = await bcrypt.hash('Yandar1234!', 10);
  const user = await prisma.user.upsert({
    where: { email: 'yandar@gymyeumbeul.sn' },
    update: { gymId: gym.id },
    create: {
      gymId: gym.id,
      nom: 'Yandar',
      prenom: 'Yandar',
      email: 'yandar@gymyeumbeul.sn',
      passwordHash: hash,
      role: UserRole.ADMIN,
      actif: true,
      mustChangePassword: true,
    },
  });
  console.log(`User  : ${user.prenom} ${user.nom}`);
  console.log(`Email : yandar@gymyeumbeul.sn`);
  console.log(`Pass  : Yandar1234!  (à changer au premier login)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
