import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface WhatsappDelivery {
  status: 'accepted' | 'failed' | 'unconfigured' | 'disconnected' | 'invalid_phone';
  messageId?: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiKey: string;
  private readonly sessionId: string;
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('RELAYIO_API_KEY') ?? '';
    this.sessionId = this.config.get<string>('RELAYIO_SESSION_ID')?.trim() ?? '';
    this.baseUrl = (this.config.get<string>('RELAYIO_BASE_URL') || 'https://relayio.minifootapp.com/v1').replace(/\/+$/, '');
  }

  private formatPhone(telephone: string): string {
    let phone = telephone.trim().replace(/[\s().-]/g, '');
    if (phone.startsWith('+')) phone = phone.slice(1);
    else if (phone.startsWith('00')) phone = phone.slice(2);
    else if (/^\d{9}$/.test(phone)) phone = `221${phone}`;
    return phone;
  }

  private async send(to: string, message: string): Promise<WhatsappDelivery> {
    if (!this.apiKey) {
      this.logger.warn('Envoi WhatsApp indisponible : connexion Relayio non configurée.');
      return { status: 'unconfigured' };
    }
    const phone = this.formatPhone(to);
    if (!/^[1-9]\d{6,14}$/.test(phone)) return { status: 'invalid_phone' };
    if (!message.trim() || message.length > 4096) return { status: 'failed' };
    try {
      const options = { headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' }, timeout: 6000, maxRedirects: 0 };
      const { data: sessions } = await axios.get(`${this.baseUrl}/sessions`, options);
      if (!Array.isArray(sessions)) return { status: 'failed' };
      const session = this.sessionId ? sessions.find(s => s.id === this.sessionId || s._id === this.sessionId) : sessions.length === 1 ? sessions[0] : undefined;
      if (!session || typeof session.id !== 'string' || !session.id) return { status: 'failed' };
      if (String(session.status).toUpperCase() !== 'READY') return { status: 'disconnected' };
      const { data } = await axios.post(`${this.baseUrl}/sessions/${encodeURIComponent(session.id)}/messages/text`, { chatId: `${phone}@c.us`, body: message }, options);
      if (!data || typeof data !== 'object' || ['failed', 'error', 'undelivered'].includes(String(data.status).toLowerCase())) return { status: 'failed' };
      const messageId = typeof data.id === 'string' ? data.id : typeof data._id === 'string' ? data._id : undefined;
      if (!messageId) return { status: 'failed' };
      return { status: 'accepted', messageId };
    } catch {
      // Axios errors include request headers and message contents; never log them.
      this.logger.warn('Envoi WhatsApp non confirmé par Relayio.');
      return { status: 'failed' };
    }
  }

  async sendGymbroCredentials(telephone: string, password: string, prenom: string): Promise<WhatsappDelivery> {
    return this.send(telephone,
      `Bonjour ${prenom} ! 👋\n\nVoici vos identifiants pour l'application GymBro :\n\n` +
      `📱 Téléphone : ${telephone}\n🔑 Mot de passe : ${password}\n\nBonne séance ! 💪`);
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
