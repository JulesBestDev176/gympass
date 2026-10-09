import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import { NotifType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  async findAll(gymId: string, userId: string) {
    return this.prisma.notification.findMany({
      where: {
        gymId,
        OR: [{ userId: null }, { userId }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(gymId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, gymId },
      data: { lue: true },
    });
  }

  async markAllRead(gymId: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: {
        gymId,
        lue: false,
        OR: [{ userId: null }, { userId }],
      },
      data: { lue: true },
    });
  }

  async countUnread(gymId: string, userId: string): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: {
        gymId,
        lue: false,
        OR: [{ userId: null }, { userId }],
      },
    });
    return { count };
  }

  // Crée une notification en base + envoie un push à tous les users actifs du gym
  async createAndPush(
    gymId: string,
    titre: string,
    message: string,
    type: NotifType,
    targetUserId?: string,
  ) {
    const notif = await this.prisma.notification.create({
      data: { gymId, titre, message, type, userId: targetUserId ?? null },
    });

    // Récupérer les tokens FCM des users actifs du gym concernés
    const users = await this.prisma.user.findMany({
      where: {
        gymId,
        actif: true,
        fcmToken: { not: null },
        ...(targetUserId ? { id: targetUserId } : {}),
      },
      select: { fcmToken: true },
    });

    const tokens = users.map((u) => u.fcmToken!).filter(Boolean);
    if (tokens.length > 0) {
      await this.firebase.sendToTokens(tokens, titre, message, { notifId: notif.id, type });
    }

    return notif;
  }
}
