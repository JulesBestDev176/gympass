// Publish only the verified generated catalog media to the existing MinIO bucket.
// Credentials are read from stdin JSON (MINIO_*), never files or arguments.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const Minio = require('minio');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function publish(config, source, output) {
  const catalog = JSON.parse(await fs.readFile(path.join(source, 'catalog.json'), 'utf8'));
  const checksums = JSON.parse(await fs.readFile(path.join(source, 'checksums.json'), 'utf8'));
  if (catalog.source !== 'flow' || !/^[a-f0-9]{40}$/.test(catalog.revision) || catalog.exercises.length !== 1324) throw Error('Invalid catalog');
  if (config.MINIO_USE_SSL !== 'true') throw Error('HTTPS storage required');
  const bucket = config.MINIO_BUCKET || 'gympass';
  const client = new Minio.Client({ endPoint: config.MINIO_ENDPOINT, port: Number(config.MINIO_PORT || 443), useSSL: true, accessKey: config.MINIO_ACCESS_KEY, secretKey: config.MINIO_SECRET_KEY });
  if (!await client.bucketExists(bucket)) throw Error('Existing bucket required');
  const prefix = 'exercises/gif750-v1';
  const base = `https://${config.MINIO_ENDPOINT}${Number(config.MINIO_PORT || 443) === 443 ? '' : ':' + Number(config.MINIO_PORT)}/${bucket}/${prefix}`;
  const files = catalog.exercises.filter(e => e.hasAnimation).flatMap(e => {
    if (!/^\d{4}$/.test(e.sourceId)) throw Error('Invalid source ID');
    return ['gif', 'png'].map(ext => `${e.sourceId}.${ext}`);
  });
  let cursor = 0, done = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++], relative = `flow/${catalog.revision}/${file}`, key = `${prefix}/${relative}`;
      const bytes = await fs.readFile(path.join(source, relative));
      const expected = checksums.assets[relative];
      if (!expected || hash(bytes) !== expected) throw Error('Local asset hash mismatch: ' + file);
      let matched = false;
      try { const stat = await client.statObject(bucket, key); matched = stat.metaData?.sha256 === expected && stat.size === bytes.length; }
      catch (error) { if (!['NotFound', 'NoSuchKey', 'NoSuchObject'].includes(error.code)) throw error; }
      if (!matched) {
        let attempts = 0;
        while (true) {
          try {
            await client.putObject(bucket, key, bytes, bytes.length, { 'Content-Type': file.endsWith('.gif') ? 'image/gif' : 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable', sha256: expected });
            const stat = await client.statObject(bucket, key);
            if (stat.size !== bytes.length || stat.metaData?.sha256 !== expected) throw Error('Remote verification failed');
            break;
          } catch (error) { if (++attempts >= 3) throw error; }
        }
      }
      if (++done % 250 === 0) console.log(JSON.stringify({ uploadedOrVerified: done, total: files.length }));
    }
  }));
  // Confirm anonymous HTTPS delivery, type, cache and exact bytes for representative objects.
  for (const file of [files[0], files[Math.floor(files.length / 2)], files.at(-1)]) {
    const response = await fetch(`${base}/flow/${catalog.revision}/${file}`, { signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (!response.ok || response.headers.get('content-type') !== (file.endsWith('.gif') ? 'image/gif' : 'image/png') || !response.headers.get('cache-control')?.includes('immutable') || hash(Buffer.from(await response.arrayBuffer())) !== checksums.assets[`flow/${catalog.revision}/${file}`]) throw Error('Public delivery verification failed');
  }
  catalog.media = { storage: 'minio', baseUrl: base, files };
  await fs.mkdir(output, { recursive: true });
  for (const file of (await fs.readdir(source)).filter(name => /^(?:FLOW-|HASAN-|README\.md$|checksums\.json$)/.test(name))) {
    if (path.resolve(source, file) !== path.resolve(output, file)) await fs.copyFile(path.join(source, file), path.join(output, file));
  }
  await fs.writeFile(path.join(output, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n');
  console.log(JSON.stringify({ verifiedObjects: files.length, records: catalog.exercises.length, storage: 'minio', metadataReady: true }));
}

if (require.main === module) {
  let input = '';
  process.stdin.on('data', data => { input += data; });
  process.stdin.on('end', async () => {
    try { await publish(JSON.parse(input.replace(/^\uFEFF/, '')), path.resolve(process.argv[2]), path.resolve(process.argv[3] || 'assets/exercise-catalog')); }
    catch (error) { console.error(JSON.stringify({ error: error.code || error.name, operation: 'catalog media publication failed; metadata not activated' })); process.exitCode = 1; }
  });
}
module.exports = { publish };
