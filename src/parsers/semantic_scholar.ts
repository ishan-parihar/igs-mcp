import type { NewsItem, Source } from '../types/news.js';

interface SemanticScholarPaper {
  paperId: string;
  title: string;
  url?: string;
  abstract?: string;
  year?: number;
  publicationDate?: string;
  authors?: Array<{ name: string }>;
  venue?: string;
  journal?: { name: string };
  publicationVenue?: string;
}

interface SemanticScholarResponse {
  total?: number;
  data?: SemanticScholarPaper[];
}

/**
 * Parses Semantic Scholar API JSON response into NewsItem[].
 * 
 * API format: https://api.semanticscholar.org/graph/v1/paper/search
 * Returns: { total: number, data: Paper[] }
 */
export function parseSemanticScholarJson(source: Source, body: string): NewsItem[] {
  try {
    const data: SemanticScholarResponse = JSON.parse(body);
    const papers = data.data || [];
    
    return papers.map((paper): NewsItem => {
      const link = paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`;
      const pubDate = normalizePublicationDate(paper.publicationDate, paper.year);
      const authors = (paper.authors || []).map(a => a.name).join(', ');
      const venue = paper.venue || paper.journal?.name || paper.publicationVenue || '';
      
      let contentSnippet = paper.abstract || '';
      if (venue) {
        contentSnippet = contentSnippet ? `${venue} — ${contentSnippet}` : venue;
      }
      
      return {
        id: paper.paperId,
        title: paper.title,
        link,
        pubDate,
        source_name: source.name,
        pool_id: source.pools[0] || '',
        content_snippet: contentSnippet.slice(0, 600),
        author: authors || undefined,
      };
    });
  } catch (err) {
    console.error(`Failed to parse Semantic Scholar response for ${source.id}:`, err);
    return [];
  }
}

/**
 * Normalizes publication date to ISO string.
 * Semantic Scholar returns dates in various formats.
 */
function normalizePublicationDate(pubDate?: string, year?: number): string {
  if (pubDate) {
    try {
      const d = new Date(pubDate);
      if (!isNaN(d.getTime())) {
        return d.toISOString();
      }
    } catch {
      // fall through to year-based fallback
    }
  }
  
  if (year) {
    return `${year}-01-01T00:00:00.000Z`;
  }
  
  return new Date().toISOString();
}
