import { BadRequestException, Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { v4 as uuid } from 'uuid';
import * as path from 'path';
import axios from 'axios';
import type sharp from 'sharp';
const createReceiptImage: typeof sharp = require('sharp');

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private readonly client: Minio.Client;
  private readonly bucket: string;
  private readonly publicBase: string;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost');
    const port = parseInt(this.config.get<string>('MINIO_PORT', '9000'), 10);
    const useSSL = this.config.get<string>('MINIO_USE_SSL', 'false') === 'true';

    this.bucket = this.config.get<string>('MINIO_BUCKET', 'gympass');
    this.publicBase = `${useSSL ? 'https' : 'http'}://${endpoint}:${port}/${this.bucket}`;

    this.client = new Minio.Client({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey: this.config.get<string>('MINIO_ACCESS_KEY', 'gympass'),
      secretKey: this.config.get<string>('MINIO_SECRET_KEY', 'gympass123'),
    });
  }

  private async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket, 'us-east-1');
      // Politique publique en lecture
      const policy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${this.bucket}/*`],
          },
        ],
      });
      await this.client.setBucketPolicy(this.bucket, policy);
      this.logger.log(`Bucket "${this.bucket}" créé avec politique publique en lecture.`);
    }
  }

  async readReceiptPhoto(url?: string | null): Promise<Buffer | null> {
    // Only our immutable photo objects may be fetched when generating a receipt.
    const prefix = `${this.publicBase}/photos/`;
    if (!url?.startsWith(prefix) || !/^[a-zA-Z0-9-]+\.(png|jpe?g|webp)$/i.test(url.slice(prefix.length))) return null;
    try {
      const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 3000,
        maxRedirects: 0, maxContentLength: 4 * 1024 * 1024 });
      return await createReceiptImage(Buffer.from(r.data), { limitInputPixels: 16000000 })
        .rotate().resize(256, 256, { fit: 'cover' }).png().toBuffer();
    } catch { return null; }
  }

  async uploadGymLogo(gymId: string, buffer: Buffer): Promise<{ url: string }> {
    if (!/^[a-zA-Z0-9_-]+$/.test(gymId) || buffer.length > 3 * 1024 * 1024) throw new BadRequestException('Logo invalide.');
    let png: Buffer;
    try {
      const image = createReceiptImage(buffer, { limitInputPixels: 16000000 });
      const meta = await image.metadata();
      if (!['png', 'jpeg', 'webp'].includes(meta.format) || (meta.pages ?? 1) > 1) throw new Error('format');
      png = await image.rotate().resize(512, 512, { fit: 'inside', withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
      if (png.length > 1024 * 1024) throw new Error('size');
    } catch { throw new BadRequestException('Image invalide. Utilisez un logo PNG, JPEG ou WebP non animé.'); }
    try {
      await this.ensureBucket();
      const key = `gym-logos/${gymId}/${uuid()}.png`;
      await this.client.putObject(this.bucket, key, png, png.length, { 'Content-Type': 'image/png' });
      return { url: `${this.publicBase}/${key}` };
    } catch { throw new InternalServerErrorException('Stockage du logo indisponible. Réessayez.'); }
  }

  async readGymLogo(gymId: string, url?: string | null): Promise<Buffer | null> {
    if (!gymId || !/^[a-zA-Z0-9_-]+$/.test(gymId)) return null;
    const prefix = `${this.publicBase}/gym-logos/${gymId}/`;
    if (!url?.startsWith(prefix) || !/^[a-f0-9-]+\.png$/.test(url.slice(prefix.length))) return null;
    try {
      const r = await axios.get(url, { responseType: 'arraybuffer', timeout: 3000, maxRedirects: 0, maxContentLength: 1024 * 1024 });
      return await createReceiptImage(Buffer.from(r.data), { limitInputPixels: 512 * 512 }).png().toBuffer();
    } catch { return null; }
  }

  async uploadPhoto(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ): Promise<{ url: string }> {
    try {
      await this.ensureBucket();
    } catch (err: any) {
      this.logger.error(`MinIO inaccessible (${err.message}) — vérifiez que le service est démarré sur ${this.config.get('MINIO_ENDPOINT', 'localhost')}:${this.config.get('MINIO_PORT', '9000')}`);
      throw new InternalServerErrorException('Stockage de fichiers indisponible. Vérifiez que MinIO est démarré.');
    }

    const ext = path.extname(originalName) || '.jpg';
    const objectName = `photos/${uuid()}${ext}`;

    try {
      await this.client.putObject(this.bucket, objectName, buffer, buffer.length, {
        'Content-Type': mimetype,
      });
    } catch (err: any) {
      this.logger.error(`Upload MinIO échoué : ${err.message}`);
      throw new InternalServerErrorException("Échec de l'upload du fichier");
    }

    return { url: `${this.publicBase}/${objectName}` };
  }
}
