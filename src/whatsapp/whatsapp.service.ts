import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface WhatsappDelivery {
  status: 'accepted' | 'failed' | 'unconfigured' | 'disconnected' | 'invalid_phone' | 'unconfirmed';
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
      // Relayio forwards this JID unchanged to the Baileys socket.
      const { data } = await axios.post(`${this.baseUrl}/sessions/${encodeURIComponent(session.id)}/messages/text`, { chatId: `${phone}@s.whatsapp.net`, body: message }, options);
      if (!data || typeof data !== 'object' || ['failed', 'error', 'undelivered'].includes(String(data.status).toLowerCase())) return { status: 'failed' };
      const messageId = typeof data.id === 'string' ? data.id : typeof data._id === 'string' ? data._id : undefined;
      if (!messageId) return { status: 'failed' };
      this.logger.log('Message pris en charge par Relayio ; livraison non confirmée.');
      return { status: 'accepted', messageId };
    } catch {
      // Axios errors include request headers and message contents; never log them.
      this.logger.warn('Envoi WhatsApp non confirmé par Relayio.');
      return { status: 'failed' };
    }
  }

  async sendImage(to: string, image: Buffer, caption: string): Promise<WhatsappDelivery> {
    return this.sendMedia(to, image, caption, 'image/png', 'carte-gympass.png');
  }

  async sendReceipt(to: string, pdf: Buffer, caption: string, filename: string): Promise<WhatsappDelivery> {
    return this.sendMedia(to, pdf, caption, 'application/pdf', filename);
  }

  private async sendMedia(to: string, image: Buffer, caption: string, mimeType: string, filename: string): Promise<WhatsappDelivery> {
    if (!this.apiKey) return { status: 'unconfigured' };
    const phone = this.formatPhone(to);
    if (!/^[1-9]\d{6,14}$/.test(phone)) return { status: 'invalid_phone' };
    if (!image.length || image.length > 4 * 1024 * 1024) return { status: 'failed' };
    let sending = false;
    try {
      const options = { headers: { 'x-api-key': this.apiKey }, timeout: 6000, maxRedirects: 0 };
      const { data: sessions } = await axios.get(`${this.baseUrl}/sessions`, options);
      if (!Array.isArray(sessions)) return { status: 'failed' };
      const session = this.sessionId ? sessions.find(s => s.id === this.sessionId || s._id === this.sessionId) : sessions.length === 1 ? sessions[0] : undefined;
      if (!session || typeof session.id !== 'string' || !session.id) return { status: 'failed' };
      if (String(session.status).toUpperCase() !== 'READY') return { status: 'disconnected' };
      const url = `${this.baseUrl}/sessions/${encodeURIComponent(session.id)}`;
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(image)], { type: mimeType }), filename);
      const { data: media } = await axios.post(`${url}/media`, form, { ...options, timeout: 10000, maxBodyLength: 5 * 1024 * 1024, maxContentLength: 65536 });
      const mediaId = typeof media?.id === 'string' ? media.id : media?.mediaId;
      if (typeof mediaId !== 'string' || !mediaId) return { status: 'failed' };
      sending = true;
      const { data } = await axios.post(`${url}/messages/media`, {
        chatId: `${phone}@s.whatsapp.net`, mediaId, mimeType, filename, caption: caption.slice(0, 1024),
      }, options);
      if (['failed', 'error', 'undelivered', 'rejected'].includes(String(data?.status).toLowerCase())) return { status: 'failed' };
      const messageId = typeof data?.id === 'string' ? data.id : data?._id;
      if (typeof messageId !== 'string' || !messageId) return { status: 'unconfirmed' };
      this.logger.log('Carte prise en charge par Relayio ; livraison non confirmée.');
      return { status: 'accepted', messageId };
    } catch (error) {
      // Upload failures cannot have sent a message. Once sending starts, a lost
      // reply is ambiguous: reserve the attempt to prevent duplicate delivery.
      const refusal = axios.isAxiosError(error) && error.response && [400, 401, 403, 404, 405, 413, 415, 422, 429].includes(error.response.status);
      this.logger.warn('Transmission de la carte WhatsApp non confirmée.');
      return { status: sending && !refusal ? 'unconfirmed' : 'failed' };
    }
  }

  async sendGymbroCredentials(telephone: string, password: string, prenom: string): Promise<WhatsappDelivery> {
    return this.send(telephone,
      `Bonjour ${prenom} ! 👋\n\nVoici vos identifiants pour l'application GymBro :\n\n` +
      `📱 Téléphone : ${telephone}\n🔑 Mot de passe : ${password}\n\nBonne séance ! 💪`);
  }

  async sendGymbroOtp(telephone: string, otp: string, prenom: string): Promise<WhatsappDelivery> {
    return this.send(telephone,
      `Bonjour ${prenom} ! 👋\n\n` +
      `Ton code de confirmation GymBro :\n\n` +
      `🔐 *${otp}*\n\n` +
      `Ce code expire dans 10 minutes. Ne le partage pas.\n\n` +
      `GymBro 💪`);
  }

  async sendGymbroPasswordResetOtp(telephone: string, otp: string, prenom: string): Promise<WhatsappDelivery> {
    return this.send(telephone,
      `Bonjour ${prenom},\n\nTon code de récupération GymBro : ${otp}\n\n` +
      `Il expire dans 10 minutes. Ne le partage pas. Si tu n’as pas demandé ce code, ignore ce message.\n\nGymBro`);
  }

  // Envoi des identifiants à un nouveau gérant
  async sendCredentials(telephone: string, email: string, password: string, prenom: string): Promise<WhatsappDelivery> {
    const message =
      `Bonjour ${prenom} ! 👋\n\n` +
      `Votre compte GymPass SN a été créé.\n\n` +
      `📧 Email : ${email}\n` +
      `🔑 Mot de passe temporaire : ${password}\n\n` +
      `Connectez-vous et changez votre mot de passe dès votre première connexion.\n\n` +
      `GymPass SN`;
    return this.send(telephone, message);
  }

  // Envoi d'un OTP pour réinitialisation de mot de passe
  async sendOtp(telephone: string, otp: string, prenom: string): Promise<WhatsappDelivery> {
    const message =
      `Bonjour ${prenom},\n\n` +
      `Votre code de réinitialisation GymPass SN :\n\n` +
      `🔐 *${otp}*\n\n` +
      `Ce code expire dans 10 minutes. Ne le partagez pas.\n\n` +
      `GymPass SN`;
    return this.send(telephone, message);
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
