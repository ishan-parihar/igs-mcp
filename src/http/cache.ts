import fs from 'node:fs/promises';
import path from 'node:path';

export type FeedCacheEntry = {
  url: string;
  etag?: string;
  lastModified?: string;
  fetchedAt: number;
  items: unknown[]; // parser-native shape or normalized items
};

export class FeedCache {
  constructor(private dir: string) {}

  private fileFor(url: string) {
    const key = Buffer.from(url).toString('base64url');
    return path.join(this.dir, `${key}.json`);
  }

  async read(url: string): Promise<FeedCacheEntry | null> {
    try {
      const file = this.fileFor(url);
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  async write(url: string, data: FeedCacheEntry): Promise<void> {
    const file = this.fileFor(url);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data), 'utf8');
  }
}
