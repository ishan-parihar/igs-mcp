import { stripHtml, decodeEntities } from '../normalize/html.js';
import type { NewsItem, Source } from '../types/news.js';

// Parser adapted from IGS n8n Code node approach: slice HTML blocks, extract first <a>, category, and date.
export function parseOfacHtml(source: Source, html: string): NewsItem[] {
  const blocks = html.split('<div class="margin-bottom-4 search-result views-row">').slice(1);
  const baseUrl = 'https://ofac.treasury.gov';
  const out: NewsItem[] = [];
  for (const block of blocks) {
    try {
      const linkRegex = /<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
      const linkMatches = [...block.matchAll(linkRegex)];
      if (!linkMatches.length) continue;
      let link = linkMatches[0][1].trim();
      if (!link.startsWith('http')) link = baseUrl + (link.startsWith('/') ? link : '/' + link);
      const titleRaw = linkMatches[0][2].replace(/<[^>]*>/g, '').trim();
      const title = decodeEntities(titleRaw);
      let category = 'Recent Action';
      if (linkMatches.length >= 2) {
        category = decodeEntities(linkMatches[1][2].replace(/<[^>]*>/g, '').trim());
      }
      const dateMatch = block.match(/([A-Z][a-z]+\s+\d{1,2},\s+\d{4})\s*-/);
      const pubDate = dateMatch ? new Date(dateMatch[1].trim()).toISOString() : new Date().toISOString();
      const desc = stripHtml(block).slice(0, 600);
      out.push({
        id: link,
        title: `${title}${category ? ' — ' + category : ''}`,
        link,
        pubDate,
        source_name: source.name,
        pool_id: source.pools[0] || 'POOL_B_STRATEGY',
        content_snippet: desc,
      });
    } catch {
      // ignore block errors
    }
  }
  return out;
}
