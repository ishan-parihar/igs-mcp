/**
 * arXiv API wrapper.
 * 
 * Uses arXiv's OAI-PMH API: http://export.arxiv.org/api/query
 * Free, no authentication required.
 * 
 * Rate limits:
 * - 3000 requests per 24 hours (anonymous)
 * - 10000 requests per 24 hours (with registered API key)
 * - Max 100 results per request
 */

import { request } from 'undici';
import { parseStringPromise } from 'xml2js';

export interface ArxivSearchOptions {
  query: string;
  categories?: string[];  // e.g., ['cs.AI', 'cs.LG']
  start?: number;  // Offset for pagination
  maxResults?: number;  // Max 100
  sortBy?: 'relevance' | 'lastUpdatedDate' | 'submittedDate';
  sortOrder?: 'ascending' | 'descending';
}

export interface ArxivAuthor {
  name: string;
  affiliation?: string;
}

export interface ArxivPaper {
  id: string;  // arXiv ID (e.g., "2401.12345")
  title: string;
  abstract: string;
  authors: ArxivAuthor[];
  published: string;  // ISO date
  updated: string;
  categories: string[];
  primaryCategory: string;
  pdfUrl: string;
  doi?: string;
  journalRef?: string;
  comment?: string;
}

const BASE_URL = 'https://export.arxiv.org/api/query';
const USER_AGENT = 'IGS-MCP/1.0 (https://github.com/igs-mcp)';

/**
 * Searches arXiv for papers matching the query.
 */
export async function searchArxiv(opts: ArxivSearchOptions): Promise<ArxivPaper[]> {
  const maxResults = Math.min(opts.maxResults || 25, 100);
  const start = opts.start || 0;
  const sortBy = opts.sortBy || 'relevance';
  const sortOrder = opts.sortOrder || 'descending';
  
  // Build search query
  let searchQuery = opts.query;
  if (opts.categories && opts.categories.length > 0) {
    const categoryClause = opts.categories.map(cat => `cat:${cat}`).join(' OR ');
    searchQuery = `(${searchQuery}) AND (${categoryClause})`;
  }
  
  const url = new URL(BASE_URL);
  url.searchParams.set('search_query', searchQuery);
  url.searchParams.set('start', String(start));
  url.searchParams.set('max_results', String(maxResults));
  url.searchParams.set('sortBy', sortBy);
  url.searchParams.set('sortOrder', sortOrder);
  
  try {
    const res = await request(url.toString(), {
      method: 'GET',
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'application/atom+xml',
      },
      headersTimeout: 15000,
      bodyTimeout: 15000,
    });
    
    if (res.statusCode !== 200) {
      console.error(`arXiv API returned status ${res.statusCode}`);
      return [];
    }
    
    const body = await res.body.text();
    const xml = await parseStringPromise(body, { explicitArray: false });
    
    if (!xml.feed || !xml.feed.entry) {
      return [];
    }
    
    const entries = Array.isArray(xml.feed.entry) ? xml.feed.entry : [xml.feed.entry];
    
    return entries.map(parseArxivEntry);
  } catch (err) {
    console.error('arXiv search failed:', err);
    return [];
  }
}

/**
 * Parses an arXiv Atom entry into a Paper object.
 */
function parseArxivEntry(entry: any): ArxivPaper {
  const id = entry.id?._ || entry.id || '';
  const arxivId = extractArxivId(id);
  
  const authors = Array.isArray(entry.author) 
    ? entry.author.map((a: any) => ({
        name: a.name?._ || a.name,
        affiliation: a.affiliation?._ || a.affiliation,
      }))
    : [{
        name: entry.author?.name?._ || entry.author?.name,
        affiliation: entry.author?.affiliation?._ || entry.author?.affiliation,
      }];
  
  const categories = entry.category 
    ? (Array.isArray(entry.category) ? entry.category : [entry.category]).map((c: any) => c.term)
    : [];
  
  return {
    id: arxivId,
    title: entry.title?._ || entry.title,
    abstract: entry.summary?._ || entry.summary,
    authors,
    published: new Date(entry.published?._ || entry.published).toISOString(),
    updated: new Date(entry.updated?._ || entry.updated).toISOString(),
    categories,
    primaryCategory: entry['arxiv:primary_category']?.$?.term || categories[0] || '',
    pdfUrl: `https://arxiv.org/pdf/${arxivId}.pdf`,
    doi: entry['arxiv:doi']?._ || entry['arxiv:doi'],
    journalRef: entry['arxiv:journal_ref']?._ || entry['arxiv:journal_ref'],
    comment: entry['arxiv:comment']?._ || entry['arxiv:comment'],
  };
}

/**
 * Extracts arXiv ID from various URL formats.
 */
function extractArxivId(id: string): string {
  // Handle formats like:
  // - http://arxiv.org/abs/2401.12345
  // - http://arxiv.org/abs/cs.AI/1234567
  // - 2401.12345
  
  const match = id.match(/arxiv\.org\/abs\/(.+)$/);
  if (match) {
    return match[1];
  }
  
  // Already just the ID
  return id.replace(/^.*\//, '');
}

/**
 * Converts an arXiv paper to NewsItem format.
 */
export function normalizeArxivPaper(paper: ArxivPaper, sourceName: string, poolId: string) {
  // Token-efficient abstract: first 2 sentences or 300 chars
  const abstractSentences = paper.abstract.split('.').slice(0, 2).join('.');
  const conciseAbstract = abstractSentences.length > 300 
    ? abstractSentences.slice(0, 300) + '...'
    : abstractSentences;
  
  const authorList = paper.authors.map(a => a.name).join(', ');
  const categories = paper.categories.slice(0, 3).join(', ');
  
  return {
    id: `arxiv_${paper.id}`,
    title: paper.title,
    link: paper.pdfUrl,
    pubDate: paper.published,
    source_name: sourceName,
    pool_id: poolId,
    content_snippet: `[${categories}] ${authorList} — ${conciseAbstract}`.slice(0, 600),
    author: authorList,
    media_url: undefined,
  };
}

/**
 * Fetches additional paper details from arXiv.
 */
export async function getArxivPaperDetails(arxivId: string): Promise<ArxivPaper | null> {
  const papers = await searchArxiv({
    query: `all:${arxivId}`,
    maxResults: 1,
  });
  
  return papers[0] || null;
}
