import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import { v4 as uuid } from 'uuid';
import * as path from 'path';

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

  async uploadPhoto(
    buffer: Buffer,
    originalName: string,
    mimetype: string,
  ): Promise<{ url: string }> {
    await this.ensureBucket();

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
