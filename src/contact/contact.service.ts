import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { ConfigService } from '@nestjs/config';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class ContactService {
  private readonly notifyPhone: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly config: ConfigService,
  ) {
    this.notifyPhone = this.config.get<string>('CONTACT_NOTIFY_PHONE') ?? '';
  }

  async create(dto: CreateContactDto) {
    const lead = await this.prisma.contactLead.create({
      data: { gym: dto.gym, city: dto.city, phone: dto.phone },
    });

    if (this.notifyPhone) {
      const msg =
        `📩 Nouvelle demande de démo GymPass\n\n` +
        `🏋️ Salle : ${dto.gym}\n` +
        `📍 Ville : ${dto.city}\n` +
        `📞 Téléphone : ${dto.phone}`;
      await this.whatsapp.sendMessage(this.notifyPhone, msg);
    }

    return lead;
  }

  async findAll() {
    return this.prisma.contactLead.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async remove(id: string) {
    return this.prisma.contactLead.delete({ where: { id } });
  }
}
