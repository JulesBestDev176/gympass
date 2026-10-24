import { BadRequestException } from '@nestjs/common';
import { validateBinaryManifest } from './binary-manifest';
const ApkReader = require('@devicefarmer/adbkit-apkreader');
const ManifestParser = require('@devicefarmer/adbkit-apkreader/lib/apkreader/parser/manifest');

export const APK_MAX_BYTES = 256 * 1024 * 1024;
const MANIFEST_MAX_BYTES = 4 * 1024 * 1024;

/** Only inflate the manifest, bounded independently of the ZIP's declared sizes. */
export async function readApkMetadata(path: string): Promise<{ packageName: string; versionName: string; versionCode: number }> {
  try {
    const reader = await ApkReader.open(path);
    const manifest = await reader.usingFileStream('AndroidManifest.xml', async (stream: NodeJS.ReadableStream) => {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of stream as any) {
        bytes += chunk.length;
        if (bytes > MANIFEST_MAX_BYTES) throw new Error('Manifest too large');
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      validateBinaryManifest(data);
      return new ManifestParser(data).parse();
    });
    if (manifest.package !== 'com.gympass.gympass_sn') throw new Error('Wrong package');
    if (!Number.isInteger(manifest.versionCode) || manifest.versionCode < 1 || manifest.versionCode > 2100000000 || (manifest.versionCodeMajor ?? 0) !== 0) throw new Error('Invalid versionCode');
    if (typeof manifest.versionName !== 'string' || !manifest.versionName.trim() || manifest.versionName.length > 128 || manifest.versionName.startsWith('resourceId:')) throw new Error('Invalid versionName');
    return { packageName: manifest.package, versionName: manifest.versionName, versionCode: manifest.versionCode };
  } catch {
    throw new BadRequestException('APK invalide : package com.gympass.gympass_sn et version explicite requis.');
  }
}
