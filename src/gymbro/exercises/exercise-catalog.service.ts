import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync, realpathSync, statSync } from 'fs';
import { resolve, sep } from 'path';

interface CatalogRecord {
  sourceId: string; nameOriginal: string; instructionsFr: string[]; groupeMusculaire: string;
  musclesPrimaires: string[]; musclesSecondaires: string[]; equipementRequis: string;
  hasAnimation: boolean; license: 'CC0-1.0';
}
interface Manifest { version: number; source: string; revision: string; dataRevision: string; exercises: CatalogRecord[];
  media?: { storage: 'minio'; baseUrl: string; files: string[] }; }
const token = /^[A-Za-z0-9_-]{1,160}$/;

@Injectable()
export class ExerciseCatalogService {
  private manifest?: Manifest;
  private readonly directory: string;
  private readonly publicBase: string;
  constructor(config: ConfigService) {
    this.directory = resolve(config.get<string>('EXERCISE_CATALOG_DIR') || resolve(process.cwd(), 'assets/exercise-catalog'));
    const base = (config.get<string>('PUBLIC_API_URL') || 'https://api.gympass.minifootapp.com').replace(/\/+$/, '');
    this.publicBase = base.endsWith('/api/v1') ? base : `${base}/api/v1`;
  }

  private load() {
    if (this.manifest) return this.manifest;
    try {
      const manifest = JSON.parse(readFileSync(resolve(this.directory, 'catalog.json'), 'utf8')) as Manifest;
      if (manifest.version !== 1 || manifest.source !== 'flow' || !token.test(manifest.revision) || !Array.isArray(manifest.exercises)) throw Error('Invalid manifest');
      if (manifest.media) {
        const url = new URL(manifest.media.baseUrl);
        if (manifest.media.storage !== 'minio' || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
          !Array.isArray(manifest.media.files) || !manifest.media.files.every(file => /^[A-Za-z0-9_-]{1,160}\.(gif|png)$/.test(file))) throw Error('Invalid media index');
        manifest.media.baseUrl = url.toString().replace(/\/+$/, '');
      }
      const seen = new Set<string>();
      for (const item of manifest.exercises) {
        if (!token.test(item.sourceId) || seen.has(item.sourceId) || item.license !== 'CC0-1.0' || typeof item.hasAnimation !== 'boolean' ||
          ![item.nameOriginal, item.groupeMusculaire, item.equipementRequis].every(v => typeof v === 'string' && v.length > 0) ||
          ![item.instructionsFr, item.musclesPrimaires, item.musclesSecondaires].every(v => Array.isArray(v) && v.every(s => typeof s === 'string'))) throw Error('Invalid exercise');
        seen.add(item.sourceId);
      }
      this.manifest = manifest;
      return manifest;
    } catch { throw new ServiceUnavailableException('Catalogue des exercices indisponible : vérifier les fichiers locaux du catalogue'); }
  }

  private filePath(revision: string, file: string) {
    const base = realpathSync(this.directory);
    const candidate = resolve(this.directory, 'flow', revision, file);
    if (!existsSync(candidate)) return null;
    const path = realpathSync(candidate);
    return path.startsWith(base + sep) && statSync(path).isFile() ? path : null;
  }

  private item(record: CatalogRecord) {
    const { revision, media } = this.load();
    const available = record.hasAnimation && (media
      ? media.files.includes(`${record.sourceId}.gif`) && media.files.includes(`${record.sourceId}.png`)
      : !!this.filePath(revision, `${record.sourceId}.gif`) && !!this.filePath(revision, `${record.sourceId}.png`));
    const base = media ? `${media.baseUrl}/flow/${revision}/${record.sourceId}`
      : `${this.publicBase}/gymbro/exercises/media/flow/${revision}/${record.sourceId}`;
    return { ...record, source: 'flow' as const, sourceRevision: revision, hasAnimation: available,
      animationUrl: available ? `${base}.gif` : null, posterUrl: available ? `${base}.png` : null, importedExerciseId: null as string | null };
  }

  lookup(sourceId: string, revision: string) {
    // Legacy exercises remain readable if the optional catalog bundle is absent.
    let manifest: Manifest;
    try { manifest = this.load(); } catch { return null; }
    if (manifest.revision !== revision) return null;
    const record = manifest.exercises.find(item => item.sourceId === sourceId);
    return record ? this.item(record) : null;
  }

  requireItem(sourceId: string) {
    if (typeof sourceId !== 'string' || !token.test(sourceId)) throw new BadRequestException('Identifiant de source invalide');
    const record = this.load().exercises.find(item => item.sourceId === sourceId);
    if (!record) throw new NotFoundException('Exercice absent du catalogue');
    return this.item(record);
  }

  browse(query: Record<string, string>) {
    for (const key of ['q', 'group', 'equipment', 'page', 'hasAnimation']) {
      if (query[key] !== undefined && (typeof query[key] !== 'string' || query[key].length > 200)) throw new BadRequestException('Filtre invalide');
    }
    if (query.page && !/^[1-9]\d{0,5}$/.test(query.page)) throw new BadRequestException('Page invalide');
    if (query.hasAnimation !== undefined && !['true', 'false'].includes(query.hasAnimation)) throw new BadRequestException('Filtre animation invalide');
    const page = Number(query.page || 1);
    const items = this.load().exercises.map(item => this.item(item));
    const q = (query.q || '').toLocaleLowerCase('fr');
    const filtered = items.filter(item => (!q || `${item.nameOriginal} ${item.instructionsFr.join(' ')} ${item.groupeMusculaire}`.toLocaleLowerCase('fr').includes(q)) &&
      (!query.group || item.groupeMusculaire === query.group) && (!query.equipment || item.equipementRequis === query.equipment) &&
      (query.hasAnimation === undefined || item.hasAnimation === (query.hasAnimation === 'true')));
    const animated = items.filter(item => item.hasAnimation).length;
    return { items: filtered.slice((page - 1) * 24, page * 24), total: filtered.length, page, pageSize: 24,
      filters: { groups: [...new Set(items.map(item => item.groupeMusculaire))].sort(), equipment: [...new Set(items.map(item => item.equipementRequis))].sort() },
      stats: { total: items.length, animated, withoutAnimation: items.length - animated } };
  }

  media(revision: string, file: string) {
    const match = /^([A-Za-z0-9_-]{1,160})\.(gif|png)$/.exec(file);
    if (!match || !token.test(revision) || this.load().revision !== revision) throw new NotFoundException('Média introuvable');
    const item = this.requireItem(match[1]);
    if (this.load().media && item.hasAnimation) return { url: match[2] === 'gif' ? item.animationUrl : item.posterUrl, path: undefined,
      contentType: match[2] === 'gif' ? 'image/gif' : 'image/png' };
    const path = item.hasAnimation && this.filePath(revision, file);
    if (!path) throw new NotFoundException('Média introuvable');
    return { path, url: undefined, contentType: match[2] === 'gif' ? 'image/gif' : 'image/png' };
  }
}
