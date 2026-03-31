import { request } from 'undici';
import PQueue from 'p-queue';
import { FeedCache, type FeedCacheEntry } from './cache.js';

type FetchResult = {
  status: number;
  headers: Record<string, string>;
  bodyText: string;
};

export type HttpSettings = {
  userAgent: string;
  timeoutMs: number;
  retries: number;
  backoffBaseMs: number;
  backoffFactor: number;
  concurrency: number;
  perHost: number;
};

type FetchOutcome =
  | { cached: true; cache: FeedCacheEntry }
  | { cached: false; response: FetchResult; etag?: string; lastModified?: string };

export class HttpClient {
  private queue: PQueue;
  private cache: FeedCache;
  constructor(private settings: HttpSettings, cacheDir: string) {
    this.queue = new PQueue({ concurrency: settings.concurrency });
    this.cache = new FeedCache(cacheDir);
  }

  async fetch(url: string, headers?: Record<string, string>, cacheMode: 'prefer'|'bypass'|'only' = 'prefer'): Promise<FetchOutcome> {
    const cached = await this.cache.read(url);
    if (cacheMode === 'only' && cached) return { cached: true, cache: cached } as const;

    return this.queue.add(async () => {
      const h: Record<string, string> = {
        'user-agent': this.settings.userAgent,
        ...(headers || {})
      };
      if (cached?.etag) h['if-none-match'] = cached.etag;
      if (cached?.lastModified) h['if-modified-since'] = cached.lastModified;

      let attempt = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        try {
          const res = await request(url, {
            method: 'GET',
            headers: h,
            headersTimeout: this.settings.timeoutMs,
            bodyTimeout: this.settings.timeoutMs,
          });

          const status = res.statusCode;
          const headersMap: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            headersMap[String(k).toLowerCase()] = Array.isArray(v) ? String(v[0]) : String(v as any);
          }
          const bodyText = await res.body.text();

          const response: FetchResult = { status, headers: headersMap, bodyText };

          if (status === 304 && cached) {
            return { cached: true, cache: cached } as const;
          }
          if (status >= 200 && status < 300) {
            const etag = headersMap['etag'];
            const lastModified = headersMap['last-modified'];
            return { cached: false, response, etag, lastModified } as const;
          }
          if (status >= 500 || status === 429) throw new Error(`HTTP ${status}`);
          // Non-retryable
          return { cached: false, response } as const;
        } catch (err) {
          attempt++;
          if (attempt > this.settings.retries) throw err;
          const backoff = this.settings.backoffBaseMs * Math.pow(this.settings.backoffFactor, attempt - 1);
          await new Promise((r) => setTimeout(r, backoff + Math.floor(Math.random() * 200)));
        }
      }
    }) as unknown as Promise<FetchOutcome>;
  }

  async readCache(url: string) {
    return this.cache.read(url);
  }
  async writeCache(url: string, items: unknown[], etag?: string, lastModified?: string) {
    await this.cache.write(url, { url, etag, lastModified, fetchedAt: Date.now(), items });
  }
}
