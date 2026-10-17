import { randomUUID } from 'node:crypto';

const CEILINGS_MS = [5, 10, 25, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000, 30000, 60000];
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE']);

interface Point {
  minute: string;
  method: string;
  route: string;
  count: number;
  errors4xx: number;
  errors5xx: number;
  durationSumMs: number;
  maxMs: number;
  buckets: number[];
}

interface Batch {
  batchId: string;
  app: 'gympass-backend';
  points: Point[];
}

interface Observation {
  method: string;
  /** Only Express's resolved route template; never URL, originalUrl, params or baseUrl. */
  route?: unknown;
  status: number;
  durationMs: number;
  time?: Date;
}

interface Options {
  url?: string;
  token?: string;
  maxSeries?: number;
  maxPendingBatches?: number;
  warn?: (message: string) => void;
  fetch?: typeof globalThis.fetch;
}

/** Bounded in-memory aggregates. Network work is performed only by flush(). */
export class RequestMetrics {
  readonly enabled: boolean;
  droppedRequests = 0;
  droppedPoints = 0;
  private readonly active = new Map<string, Point>();
  private readonly queue: Batch[] = [];
  private readonly maxSeries: number;
  private readonly maxPendingBatches: number;
  private readonly warn: (message: string) => void;
  private readonly send: typeof globalThis.fetch;
  private readonly endpoint?: string;
  private readonly token?: string;
  private flushing = false;
  private reportedDrops = 0;

  constructor(options: Options = {}) {
    this.maxSeries = Math.max(1, Math.min(500, options.maxSeries ?? 500));
    this.maxPendingBatches = Math.max(1, Math.min(10, options.maxPendingBatches ?? 10));
    this.warn = options.warn ?? (() => {});
    this.send = options.fetch ?? globalThis.fetch;
    this.token = options.token;
    if (options.url && options.token) {
      try {
        const endpoint = new URL(options.url);
        if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
          throw new Error('Invalid monitoring URL');
        }
        // MONITORING_URL is the collector origin, not an ingestion endpoint.
        this.endpoint = new URL('/ingest', endpoint).toString();
      } catch {
        this.warn('Monitoring disabled: invalid collector URL');
      }
    }
    this.enabled = Boolean(this.endpoint && this.token);
  }

  get pendingBatches(): number {
    return this.queue.length;
  }

  record(observation: Observation): void {
    if (!this.enabled || !Number.isFinite(observation.durationMs) || observation.durationMs < 0) return;
    const route = typeof observation.route === 'string' && observation.route.startsWith('/') && observation.route.length <= 256
      ? observation.route : '<unmatched>';
    if (route === '/ingest' || route === '/metrics' || /\/monitoring\/(ingest|metrics)$/.test(route)) return;
    const method = METHODS.has(observation.method?.toUpperCase()) ? observation.method.toUpperCase() : '<other>';
    const timestamp = (observation.time ?? new Date()).getTime();
    if (!Number.isFinite(timestamp)) return;
    const minute = new Date(Math.floor(timestamp / 60000) * 60000).toISOString();
    const key = JSON.stringify([minute, method, route]);
    let point = this.active.get(key);
    if (!point) {
      if (this.active.size >= this.maxSeries) {
        this.droppedRequests++;
        this.droppedPoints++;
        return;
      }
      point = { minute, method, route, count: 0, errors4xx: 0, errors5xx: 0,
        durationSumMs: 0, maxMs: 0, buckets: new Array(CEILINGS_MS.length + 1).fill(0) };
      this.active.set(key, point);
    }
    point.count++;
    if (observation.status >= 400 && observation.status < 500) point.errors4xx++;
    if (observation.status >= 500 && observation.status < 600) point.errors5xx++;
    point.durationSumMs += observation.durationMs;
    point.maxMs = Math.max(point.maxMs, observation.durationMs);
    const bucket = CEILINGS_MS.findIndex(ceiling => observation.durationMs <= ceiling);
    point.buckets[bucket === -1 ? CEILINGS_MS.length : bucket]++;
  }

  async flush(): Promise<void> {
    if (!this.enabled || this.flushing) return;
    this.flushing = true;
    try {
      if (this.active.size) {
        const points = [...this.active.values()];
        this.active.clear();
        if (this.queue.length >= this.maxPendingBatches) {
          this.droppedRequests += points.reduce((total, point) => total + point.count, 0);
          this.droppedPoints += points.length;
        } else {
          this.queue.push({ batchId: randomUUID(), app: 'gympass-backend', points });
        }
      }
      if (this.reportedDrops !== this.droppedRequests) {
        this.warn(`Monitoring capacity exceeded: droppedRequests=${this.droppedRequests}, droppedPoints=${this.droppedPoints}`);
        this.reportedDrops = this.droppedRequests;
      }
      while (this.queue.length) {
        try {
          const response = await this.send(this.endpoint!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
            body: JSON.stringify(this.queue[0]),
            signal: AbortSignal.timeout(5000),
            redirect: 'error',
          });
          // Drain no response content into memory or logs.
          await response.body?.cancel();
          if (!response.ok) throw new Error('Collector rejected batch');
          this.queue.shift();
        } catch {
          // Preserve the original immutable batch/ID for the next interval.
          this.warn('Monitoring collector unavailable; pending batch retained for retry');
          break;
        }
      }
    } finally {
      this.flushing = false;
    }
  }
}

/** Install before routing; read req.route only after Express resolves the request. */
export function requestTelemetry(metrics: RequestMetrics) {
  return (req: { method: string; route?: { path?: unknown } },
    res: { statusCode: number; once: (event: string, listener: () => void) => unknown }, next: () => void): void => {
    if (metrics.enabled) {
      const start = process.hrtime.bigint();
      res.once('finish', () => {
        metrics.record({ method: req.method, route: req.route?.path, status: res.statusCode,
          durationMs: Number(process.hrtime.bigint() - start) / 1e6 });
      });
    }
    next();
  };
}
