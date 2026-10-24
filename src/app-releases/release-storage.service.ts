import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';
import { createReadStream } from 'fs';

@Injectable()
export class ReleaseStorageService {
  private readonly client: Client;
  private readonly bucket: string;
  constructor(config: ConfigService) {
    this.bucket = config.get<string>('MINIO_RELEASES_BUCKET', 'gympass-releases');
    // Never reuse the public photos bucket, including through a configuration error.
    if (this.bucket === config.get<string>('MINIO_BUCKET', 'gympass')) throw new Error('APK bucket must be separate from public photos');
    this.client = new Client({ endPoint: config.get<string>('MINIO_ENDPOINT', 'localhost'), port: Number(config.get('MINIO_PORT', '9000')), useSSL: config.get('MINIO_USE_SSL', 'false') === 'true', accessKey: config.get('MINIO_ACCESS_KEY', 'gympass'), secretKey: config.get('MINIO_SECRET_KEY', 'gympass123') });
  }
  private async ensurePrivateBucket() {
    if (!(await this.client.bucketExists(this.bucket))) {
      try { await this.client.makeBucket(this.bucket, 'us-east-1'); }
      catch (error) { if (!(await this.client.bucketExists(this.bucket))) throw error; }
    }
    const policy = await this.client.getBucketPolicy(this.bucket).catch(error => {
      if (error.code === 'NoSuchBucketPolicy') return '';
      throw error;
    });
    const statements = policy ? JSON.parse(policy).Statement : undefined;
    if (statements && (!Array.isArray(statements) || statements.length)) throw new Error('APK bucket must have no public bucket policy');
  }
  async put(key: string, filePath: string, size: number) {
    await this.ensurePrivateBucket();
    await this.client.putObject(this.bucket, key, createReadStream(filePath), size, { 'Content-Type': 'application/vnd.android.package-archive' });
  }
  async remove(key: string) { await this.client.removeObject(this.bucket, key); }
  async get(key: string) { return this.client.getObject(this.bucket, key); }
}
