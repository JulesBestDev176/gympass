import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('Firebase non configuré — push notifications désactivées.');
      return;
    }

    this.app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    this.logger.log('Firebase Admin SDK initialisé.');
  }

  async sendToToken(
    fcmToken: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.app) return;
    try {
      await admin.messaging(this.app).send({
        token: fcmToken,
        notification: { title, body },
        data,
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
    } catch (err: any) {
      this.logger.error(`Erreur push FCM → ${fcmToken}: ${err.message}`);
    }
  }

  async sendToTokens(
    fcmTokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (!this.app || fcmTokens.length === 0) return;
    const messages = fcmTokens.map((token) => ({
      token,
      notification: { title, body },
      data,
      android: { priority: 'high' as const },
      apns: { payload: { aps: { sound: 'default' } } },
    }));
    try {
      const response = await admin.messaging(this.app).sendEach(messages);
      if (response.failureCount > 0) {
        this.logger.warn(`${response.failureCount}/${fcmTokens.length} push échoués.`);
      }
    } catch (err: any) {
      this.logger.error(`Erreur envoi push multiple : ${err.message}`);
    }
  }
}
