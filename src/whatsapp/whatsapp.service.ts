import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly baseUrl = 'https://api.relay.io/v1';

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('RELAYIO_API_KEY') ?? '';
    this.senderId = this.config.get<string>('RELAYIO_SENDER_ID') ?? 'GymPass SN';
  }

  private formatPhone(telephone: string): string {
    // Normaliser le numéro : supprimer espaces, garder le +
    return telephone.replace(/\s+/g, '');
  }

  private async send(to: string, message: string): Promise<void> {
    if (!this.apiKey) {
      this.logger.warn(`[WhatsApp Mock] → ${to}: ${message}`);
      return;
    }
    try {
      await axios.post(
        `${this.baseUrl}/messages`,
        {
          to: this.formatPhone(to),
          from: this.senderId,
          body: message,
          channel: 'whatsapp',
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (err: any) {
      this.logger.error(`Erreur envoi WhatsApp vers ${to}: ${err.message}`);
    }
  }

  // Envoi des identifiants à un nouveau gérant
  async sendCredentials(telephone: string, email: string, password: string, prenom: string): Promise<void> {
    const message =
      `Bonjour ${prenom} ! 👋\n\n` +
      `Votre compte GymPass SN a été créé.\n\n` +
      `📧 Email : ${email}\n` +
      `🔑 Mot de passe temporaire : ${password}\n\n` +
      `Connectez-vous et changez votre mot de passe dès votre première connexion.\n\n` +
      `GymPass SN`;
    await this.send(telephone, message);
  }

  // Envoi d'un OTP pour réinitialisation de mot de passe
  async sendOtp(telephone: string, otp: string, prenom: string): Promise<void> {
    const message =
      `Bonjour ${prenom},\n\n` +
      `Votre code de réinitialisation GymPass SN :\n\n` +
      `🔐 *${otp}*\n\n` +
      `Ce code expire dans 10 minutes. Ne le partagez pas.\n\n` +
      `GymPass SN`;
    await this.send(telephone, message);
  }

  // Envoi du QR code d'un membre (URL de l'image)
  async sendQrCode(telephone: string, memberNom: string, qrImageUrl: string): Promise<void> {
    const message =
      `Voici la carte QR de *${memberNom}* :\n` +
      `${qrImageUrl}\n\n` +
      `GymPass SN`;
    await this.send(telephone, message);
  }

  // Envoi d'un message texte libre
  async sendMessage(telephone: string, message: string): Promise<void> {
    await this.send(telephone, message);
  }
}
