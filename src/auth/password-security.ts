import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';

export const clearRecovery = {
  otpCode: null, otpExpiresAt: null, otpAttempts: 0,
  passwordResetTokenHash: null, passwordResetExpiresAt: null,
};

export function validateNewPassword(password: string, confirmation?: string) {
  if (typeof password !== 'string' || [...password].length < 12 || Buffer.byteLength(password, 'utf8') > 72 || !password.trim()) {
    throw new BadRequestException('Utilisez au moins 12 caractères et au plus 72 octets pour le mot de passe.');
  }
  if (confirmation !== undefined && password !== confirmation) {
    throw new BadRequestException('Les mots de passe ne correspondent pas.');
  }
}

export const tokenDigest = (value: string) => createHash('sha256').update(value).digest('hex');

export function publicStaffUser(user: any) {
  const { id, gymId, nom, prenom, email, telephone, role, actif, mustChangePassword, photoUrl, createdAt, updatedAt } = user;
  return { id, gymId, nom, prenom, email, telephone, role, actif, mustChangePassword, photoUrl, createdAt, updatedAt,
    ...(user.gym ? { gym: { id: user.gym.id, nom: user.gym.nom, slug: user.gym.slug } } : {}),
  };
}
