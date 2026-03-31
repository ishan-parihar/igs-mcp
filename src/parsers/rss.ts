import RSSParser from 'rss-parser';
import { stripHtml } from '../normalize/html.js';
import type { NewsItem, Source } from '../types/news.js';

const parser = new RSSParser({ timeout: 10000 });

export async function parseRss(source: Source, xmlOrUrl: string, isXml: boolean): Promise<NewsItem[]> {
  const feed = isXml ? await parser.parseString(xmlOrUrl) : await parser.parseURL(xmlOrUrl);
  const now = new Date();
  return (feed.items || []).map((it) => {
    const title = it.title || 'Untitled';
    const link = it.link || it.guid || '';
    const pub = it.isoDate || it.pubDate || now.toISOString();
    const snippetSrc = (it['content:encoded'] as string) || it.contentSnippet || it.content || it.summary || '';
    const content_snippet = stripHtml(String(snippetSrc)).slice(0, 600);
    return {
      id: String(it.guid || link || title + '_' + pub),
      title,
      link,
      pubDate: new Date(pub).toISOString(),
      source_name: source.name,
      pool_id: source.pools[0] || 'UNKNOWN',
      content_snippet,
      author: (it as any).creator || (it as any).author,
      media_url: (it as any).enclosure?.url || (it as any).thumbnail || undefined,
      raw: it,
    };
  });
}
