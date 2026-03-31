import fs from 'node:fs/promises';
import path from 'node:path';

export type QueryCacheMeta = {
  key: string;
  at: number;
  deps: Record<string, number>; // url -> fetchedAt
};

export class QueryCache {
  constructor(private dir: string, private ttlMs: number) {}

  private fileFor(key: string) {
    const k = Buffer.from(key).toString('base64url');
    return path.join(this.dir, 'queries', `${k}.json`);
  }

  async read<T>(key: string): Promise<{ meta: QueryCacheMeta; data: T } | null> {
    try {
      const f = this.fileFor(key);
      const raw = await fs.readFile(f, 'utf8');
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.meta.at > this.ttlMs) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  async write<T>(key: string, deps: Record<string, number>, data: T) {
    const f = this.fileFor(key);
    const payload = { meta: { key, at: Date.now(), deps }, data };
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, JSON.stringify(payload), 'utf8');
  }
}
