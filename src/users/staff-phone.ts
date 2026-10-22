import { BadRequestException } from '@nestjs/common';
import { normalizeSenegalPhone } from '../members/dto/member.dto';

export function staffPhone(value: unknown): string {
  if (typeof value !== 'string') throw new BadRequestException('Numéro WhatsApp sénégalais requis.');
  const phone = normalizeSenegalPhone(value);
  if (!/^\+2217[05678]\d{7}$/.test(phone)) throw new BadRequestException('Numéro WhatsApp sénégalais invalide.');
  return phone;
}

export function phoneUniqueCollision(error: any): boolean {
  return error?.code === 'P2002' && String(error?.meta?.target ?? '').includes('telephone');
}
