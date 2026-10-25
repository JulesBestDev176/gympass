import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReleaseStorageService } from './release-storage.service';
import { APK_MAX_BYTES, readApkMetadata } from './apk-metadata';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { createHash, randomUUID } from 'crypto';

@Injectable()
export class AppReleasesService {
  constructor(private readonly prisma: PrismaService, private readonly storage: ReleaseStorageService) {}
  private view(row: any, admin = false) {
    const published = row.status === 'PUBLISHED';
    return { id: row.id, packageName: row.packageName, versionName: row.versionName, versionCode: row.versionCode, notes: row.notes, sizeBytes: row.sizeBytes, sha256: row.sha256, apkUrl: published ? `/api/v1/app-releases/android/${row.id}/apk` : null, publishedAt: row.publishedAt?.toISOString() ?? null, ...(admin ? { status: row.status, createdAt: row.createdAt.toISOString() } : {}) };
  }
  async latest() {
    const row = await this.prisma.appRelease.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { versionCode: 'desc' } });
    return { release: row ? this.view(row) : null };
  }
  async list(cursor?: string, limit = 20) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20 || (cursor && !/^[a-zA-Z0-9-]{1,64}$/.test(cursor))) throw new BadRequestException('Pagination invalide');
    if (cursor && !(await this.prisma.appRelease.findUnique({ where: { id: cursor } }))) throw new BadRequestException('Curseur invalide');
    const rows = await this.prisma.appRelease.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    return { items: rows.slice(0, limit).map(row => this.view(row, true)), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
  }
  async createDraft(file: Express.Multer.File | undefined, notes: unknown, actorId: string) {
    if (!file) throw new BadRequestException('Fichier APK requis');
    const key = `android/${randomUUID()}.apk`; let stored = false;
    try {
      if (file.size < 1 || file.size > APK_MAX_BYTES || typeof notes !== 'string' || notes.trim().length > 10000) throw new BadRequestException('APK ou notes invalides (maximum 10 000 caractères)');
      const metadata = await readApkMetadata(file.path);
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(file.path)) hash.update(chunk);
      await this.storage.put(key, file.path, file.size); stored = true;
      const row = await this.prisma.appRelease.create({ data: { ...metadata, notes: notes.trim(), sizeBytes: file.size, sha256: hash.digest('hex'), objectKey: key, createdById: actorId } });
      return this.view(row, true);
    } catch (error) {
      if (stored) await this.storage.remove(key).catch(() => undefined);
      throw error;
    } finally { await unlink(file.path).catch(() => undefined); }
  }
  async publish(id: string) {
    const result = await this.prisma.$transaction(async tx => {
      // One global PostgreSQL transaction lock serializes all publishers across instances.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(173542, 1)`;
      const row = await tx.appRelease.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Version introuvable');
      if (row.status === 'PUBLISHED') return this.view(row, true);
      const latest = await tx.appRelease.findFirst({ where: { status: 'PUBLISHED' }, orderBy: { versionCode: 'desc' } });
      if (latest && row.versionCode <= latest.versionCode) throw new ConflictException('Le versionCode doit dépasser la dernière version publiée.');
      return this.view(await tx.appRelease.update({ where: { id }, data: { status: 'PUBLISHED', publishedAt: new Date() } }), true);
    });
    // Conserver uniquement les 2 dernières versions publiées ; supprimer les anciennes de MinIO et de la base.
    await this._pruneOldReleases().catch(() => undefined);
    return result;
  }

  private async _pruneOldReleases() {
    const published = await this.prisma.appRelease.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { versionCode: 'desc' },
      select: { id: true, objectKey: true },
    });
    const drafts = await this.prisma.appRelease.findMany({
      where: { status: 'DRAFT' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, objectKey: true },
    });
    // Garder les 2 dernières publiées, supprimer toutes les DRAFT.
    const toDelete = [...published.slice(2), ...drafts];
    for (const row of toDelete) {
      await this.storage.remove(row.objectKey).catch(() => undefined);
      await this.prisma.appRelease.delete({ where: { id: row.id } }).catch(() => undefined);
    }
  }
  async deleteRelease(id: string) {
    const row = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Version introuvable');
    await this.storage.remove(row.objectKey).catch(() => undefined);
    await this.prisma.appRelease.delete({ where: { id } });
  }
  async download(id: string) {
    const row = await this.prisma.appRelease.findUnique({ where: { id } });
    if (!row || row.status !== 'PUBLISHED') throw new NotFoundException('Version introuvable');
    return { row, stream: await this.storage.get(row.objectKey) };
  }
}
