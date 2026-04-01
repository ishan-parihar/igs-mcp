/**
 * Semantic Scholar API wrapper.
 * 
 * Uses Semantic Scholar Graph API: https://api.semanticscholar.org/api-docs/graph
 * Free tier: 100 requests/day, 5 requests/second
 * 
 * No API key required for basic usage.
 */

import { request } from 'undici';

export interface SemanticScholarSearchOptions {
  query: string;
  yearFrom?: number;
  yearTo?: number;
  fields?: string;  // Comma-separated field list
  limit?: number;  // Max 100
  offset?: number;
  openAccessPdf?: boolean;
}

export interface SemanticScholarAuthor {
  authorId: string;
  name: string;
  affiliation?: string;
}

export interface SemanticScholarPaper {
  paperId: string;
  title: string;
  abstract?: string;
  year?: number;
  publicationDate?: string;
  venue?: string;
  authors: SemanticScholarAuthor[];
  citationCount?: number;
  referenceCount?: number;
  influentialCitationCount?: number;
  isOpenAccess?: boolean;
  openAccessPdf?: {
    url: string;
    status: string;
  };
  url?: string;
  doi?: string;
  publicationVenue?: string;
  journal?: {
    name: string;
    pages?: string;
    volume?: string;
  };
}

interface SemanticScholarResponse {
  total: number;
  data: SemanticScholarPaper[];
  next?: string;
}

const BASE_URL = 'https://api.semanticscholar.org/graph/v1/paper/search';
const USER_AGENT = 'IGS-MCP/1.0 (https://github.com/igs-mcp)';
const DEFAULT_FIELDS = 'title,abstract,year,publicationDate,authors,venue,citationCount,referenceCount,openAccessPdf,url,doi,publicationVenue,journal';

/**
 * Searches Semantic Scholar for papers matching the query.
 */
export async function searchSemanticScholar(opts: SemanticScholarSearchOptions): Promise<{ papers: SemanticScholarPaper[]; total: number }> {
  const limit = Math.min(opts.limit || 20, 100);
  const fields = opts.fields || DEFAULT_FIELDS;
  
  const url = new URL(BASE_URL);
  url.searchParams.set('query', opts.query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('fields', fields);
  
  if (opts.yearFrom) {
    url.searchParams.set('year', `${opts.yearFrom}-${opts.yearTo || new Date().getFullYear()}`);
  }
  
  if (opts.openAccessPdf) {
    url.searchParams.set('openAccessPdf', 'true');
  }
  
  if (opts.offset) {
    url.searchParams.set('offset', String(opts.offset));
  }
  
  let lastError: any = null;
  
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await request(url.toString(), {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        headersTimeout: 15000,
        bodyTimeout: 15000,
      });
      
      if (res.statusCode === 429) {
        const retryAfter = Array.isArray(res.headers['retry-after']) 
          ? res.headers['retry-after'][0] 
          : (res.headers['retry-after'] || '5');
        const waitMs = Math.min(parseInt(retryAfter) * 1000, 30000);
        console.log(`Semantic Scholar rate limited, waiting ${waitMs}ms...`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      
      if (res.statusCode !== 200) {
        const body = await res.body.text();
        console.error(`Semantic Scholar API returned status ${res.statusCode}:`, body);
        return { papers: [], total: 0 };
      }
      
      const body = await res.body.text();
      const data: SemanticScholarResponse = JSON.parse(body);
      
      return {
        papers: data.data || [],
        total: data.total || 0,
      };
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }
  
  console.error('Semantic Scholar search failed after retries:', lastError);
  return { papers: [], total: 0 };
}

/**
 * Gets paper details by paper ID.
 */
export async function getPaperDetails(paperId: string): Promise<SemanticScholarPaper | null> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/${paperId}?fields=${DEFAULT_FIELDS}`;
  
  try {
    const res = await request(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
      },
      headersTimeout: 10000,
      bodyTimeout: 10000,
    });
    
    if (res.statusCode !== 200) {
      return null;
    }
    
    const body = await res.body.text();
    return JSON.parse(body);
  } catch (err) {
    console.error('Failed to get paper details:', err);
    return null;
  }
}

/**
 * Gets citations for a paper.
 */
export async function getPaperCitations(paperId: string, limit: number = 20): Promise<SemanticScholarPaper[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/${paperId}/citations?fields=${DEFAULT_FIELDS}&limit=${limit}`;
  
  try {
    const res = await request(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
      },
      headersTimeout: 15000,
      bodyTimeout: 15000,
    });
    
    if (res.statusCode !== 200) {
      return [];
    }
    
    const body = await res.body.text();
    const data = JSON.parse(body);
    return data.data || [];
  } catch (err) {
    console.error('Failed to get citations:', err);
    return [];
  }
}

/**
 * Gets references for a paper.
 */
export async function getPaperReferences(paperId: string, limit: number = 20): Promise<SemanticScholarPaper[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/${paperId}/references?fields=${DEFAULT_FIELDS}&limit=${limit}`;
  
  try {
    const res = await request(url, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
      },
      headersTimeout: 15000,
      bodyTimeout: 15000,
    });
    
    if (res.statusCode !== 200) {
      return [];
    }
    
    const body = await res.body.text();
    const data = JSON.parse(body);
    return data.data || [];
  } catch (err) {
    console.error('Failed to get references:', err);
    return [];
  }
}

/**
 * Converts a Semantic Scholar paper to NewsItem format.
 */
export function normalizeSemanticScholarPaper(paper: SemanticScholarPaper, sourceName: string, poolId: string) {
  // Token-efficient abstract: first 2 sentences or 250 chars
  let conciseAbstract = '';
  if (paper.abstract) {
    const abstractSentences = paper.abstract.split('.').slice(0, 2).join('.');
    conciseAbstract = abstractSentences.length > 250 
      ? abstractSentences.slice(0, 250) + '...'
      : abstractSentences;
  }
  
  const authorList = paper.authors.slice(0, 5).map(a => a.name).join(', ');
  const venue = paper.venue || paper.journal?.name || paper.publicationVenue || '';
  
  // Build content snippet with citation info
  const metaParts: string[] = [];
  if (venue) metaParts.push(venue);
  if (paper.year) metaParts.push(String(paper.year));
  if (paper.citationCount !== undefined) metaParts.push(`${paper.citationCount} citations`);
  
  const meta = metaParts.join(' • ');
  const contentSnippet = meta 
    ? `${meta} — ${conciseAbstract || authorList}`.slice(0, 600)
    : (conciseAbstract || authorList).slice(0, 600);
  
  return {
    id: `semanticscholar_${paper.paperId}`,
    title: paper.title,
    link: paper.url || `https://www.semanticscholar.org/paper/${paper.paperId}`,
    pubDate: paper.publicationDate || `${paper.year || new Date().getFullYear()}-01-01T00:00:00.000Z`,
    source_name: sourceName,
    pool_id: poolId,
    content_snippet: contentSnippet,
    author: authorList || undefined,
    media_url: undefined,
  };
}
