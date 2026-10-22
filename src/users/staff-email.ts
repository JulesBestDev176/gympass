import { BadRequestException } from '@nestjs/common';

function latin(value: string): string {
  return value.trim().toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae');
}

export function staffEmailParts(prenom: string, nom: string, gymSlug: string) {
  const first = latin(prenom).replace(/[^a-z0-9]/g, '');
  const last = latin(nom).replace(/[^a-z0-9]/g, '');
  const domain = latin(gymSlug).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63).replace(/-+$/g, '');
  if (!first || !last || !domain) {
    throw new BadRequestException('Prénom, nom ou nom de salle invalide pour générer l’adresse de connexion');
  }
  return { local: `${first}.${last}`, domain: `${domain}.sn` };
}

export function staffEmailCandidate(parts: { local: string; domain: string }, number: number) {
  const suffix = number === 0 ? '' : String(number);
  return `${parts.local.slice(0, 64 - suffix.length).replace(/\.+$/g, '')}${suffix}@${parts.domain}`;
}

export function isEmailUniqueCollision(error: unknown): boolean {
  const conflict = error as { code?: string; meta?: { target?: string | string[] } };
  const target = conflict?.meta?.target;
  return conflict?.code === 'P2002' && (Array.isArray(target)
    ? target.includes('email')
    : typeof target === 'string' && /(^|_)email(_|$)/.test(target));
}
