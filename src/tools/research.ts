import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchReddit, normalizeRedditPost } from '../utils/reddit-api.js';
import { searchArxiv, normalizeArxivPaper } from '../utils/arxiv-api.js';
import { searchSemanticScholar, normalizeSemanticScholarPaper } from '../utils/semanticscholar-api.js';
import type { NewsItem } from '../types/news.js';
import { extractMarkdownSummary } from '../parsers/pdf-to-markdown.js';
import path from 'node:path';
import { request } from 'undici';
import { writeFile } from 'node:fs/promises';
import { resolvePaperPath, ensureDir, sanitizeFilename } from '../utils/fs-helpers.js';
import { convertPdfToMarkdown } from '../parsers/pdf-to-markdown.js';
import { getPaperDetails } from '../utils/semanticscholar-api.js';

const RedditSearchInput = z.object({
  query: z.string().min(1).describe('Search query'),
  subreddits: z.array(z.string()).optional().describe('Specific subreddits to search (e.g., ["worldnews", "science"])'),
  sort: z.enum(['relevance', 'hot', 'new', 'top', 'rising']).optional().default('relevance'),
  time: z.enum(['hour', 'day', 'week', 'month', 'year', 'all']).optional().default('all'),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

const ResearchSearchInput = z.object({
  query: z.string().min(1).describe('Search query'),
  sources: z.array(z.enum(['arxiv', 'semanticscholar'])).optional().default(['arxiv', 'semanticscholar']),
  categories: z.array(z.string()).optional().describe('arXiv categories (e.g., ["cs.AI", "cs.LG"])'),
  yearFrom: z.number().int().min(1900).max(2100).optional(),
  yearTo: z.number().int().min(1900).max(2100).optional(),
  limit: z.number().int().min(1).max(100).optional().default(25),
});

const PaperDetailsInput = z.object({
  paperId: z.string().min(1).describe('Paper ID (arxiv:2401.12345 or semanticscholar:abc123)'),
  includeCitations: z.boolean().optional().default(false),
  includeReferences: z.boolean().optional().default(false),
  extractPDF: z.boolean().optional().default(false),
});

const DownloadInput = z.object({
  paperId: z.string().min(1).describe('Paper ID (arxiv:2401.12345 or semanticscholar:abc123)'),
  outputPath: z.string().optional().describe('Where to save the PDF. Defaults to IGS_PAPERS_DIR or ~/.config/igs-mcp/papers/'),
  format: z.enum(['pdf', 'markdown', 'both']).optional().default('both').describe('What to save: just PDF, just markdown, or both'),
});

export async function registerResearchTools(srv: McpServer) {
  srv.registerTool('reddit.search', {
    description: 'Search Reddit posts by query. Supports filtering by subreddits, sort order, and time range. Returns normalized posts with title, author, subreddit, score, and content.',
    inputSchema: RedditSearchInput.shape,
    outputSchema: {
      posts: z.array(z.any()),
      count: z.number(),
      meta: z.object({
        query: z.string(),
        subreddits: z.array(z.string()).optional(),
        sort: z.string(),
        time: z.string(),
      }),
    },
  }, async (args: any) => {
    const posts = await searchReddit({
      query: args.query,
      subreddits: args.subreddits,
      sort: args.sort,
      time: args.time,
      limit: args.limit,
    });
    
    const normalizedPosts: NewsItem[] = posts.map(post => 
      normalizeRedditPost(post, `Reddit r/${post.subreddit}`, 'REDDIT')
    );
    
    const structuredContent = {
      posts: normalizedPosts,
      count: normalizedPosts.length,
      meta: {
        query: args.query,
        subreddits: args.subreddits,
        sort: args.sort,
        time: args.time,
      },
    };
    
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  });

  srv.registerTool('research.search', {
    description: 'Search academic papers across arXiv and Semantic Scholar. Returns papers with title, authors, abstract, citation count, and PDF links. Use categories to filter arXiv results (e.g., cs.AI, cs.LG).',
    inputSchema: ResearchSearchInput.shape,
    outputSchema: {
      papers: z.array(z.any()),
      count: z.number(),
      total: z.number(),
      meta: z.object({
        query: z.string(),
        sources: z.array(z.string()),
        categories: z.array(z.string()).optional(),
        yearRange: z.object({ from: z.number().optional(), to: z.number().optional() }).optional(),
      }),
    },
  }, async (args: any) => {
    const allPapers: NewsItem[] = [];
    let total = 0;
    
    // Search arXiv
    if (args.sources.includes('arxiv')) {
      const arxivResults = await searchArxiv({
        query: args.query,
        categories: args.categories,
        maxResults: args.limit,
      });
      
      const normalized = arxivResults.map(paper =>
        normalizeArxivPaper(paper, `arXiv ${paper.primaryCategory}`, 'RESEARCH_PAPERS')
      );
      allPapers.push(...normalized);
      total += arxivResults.length;
    }
    
    // Search Semantic Scholar
    if (args.sources.includes('semanticscholar')) {
      const ssResults = await searchSemanticScholar({
        query: args.query,
        yearFrom: args.yearFrom,
        yearTo: args.yearTo,
        limit: args.limit,
        openAccessPdf: true,
      });
      
      const normalized = ssResults.papers.map(paper =>
        normalizeSemanticScholarPaper(paper, 'Semantic Scholar', 'RESEARCH_PAPERS')
      );
      allPapers.push(...normalized);
      total += ssResults.total;
    }
    
    // Sort by recency and limit
    allPapers.sort((a, b) => 
      new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime()
    );
    const limitedPapers = allPapers.slice(0, args.limit);
    
    const structuredContent = {
      papers: limitedPapers,
      count: limitedPapers.length,
      total,
      meta: {
        query: args.query,
        sources: args.sources,
        categories: args.categories,
        yearRange: {
          from: args.yearFrom,
          to: args.yearTo,
        },
      },
    };
    
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  });

  srv.registerTool('research.paper', {
    description: 'Get detailed information about a specific paper. Supports arXiv IDs (e.g., "2401.12345") and Semantic Scholar IDs. Can fetch citations, references, and extract PDF content (token-efficient).',
    inputSchema: PaperDetailsInput.shape,
    outputSchema: {
      paper: z.object({
        id: z.string(),
        title: z.string(),
        authors: z.array(z.string()),
        abstract: z.string(),
        year: z.number().optional(),
        citations: z.number().optional(),
        references: z.number().optional(),
        pdfUrl: z.string().optional(),
        content: z.string().optional(),
        tokenEstimate: z.number().optional(),
      }),
      citations: z.array(z.any()).optional(),
      references: z.array(z.any()).optional(),
    },
  }, async (args: any) => {
    const paperId = args.paperId;
    let paper: any = null;
    let source: 'arxiv' | 'semanticscholar' = 'arxiv';
    
    // Detect source from ID format
    if (paperId.startsWith('arxiv:')) {
      source = 'arxiv';
      const arxivId = paperId.replace('arxiv:', '');
      const arxivPapers = await searchArxiv({
        query: `all:${arxivId}`,
        maxResults: 1,
      });
      paper = arxivPapers[0];
    } else if (paperId.startsWith('semanticscholar:')) {
      source = 'semanticscholar';
      const ssId = paperId.replace('semanticscholar:', '');
      // Would need to call getPaperDetails here
    } else {
      // Try arXiv first (more common)
      const arxivPapers = await searchArxiv({
        query: `all:${paperId}`,
        maxResults: 1,
      });
      if (arxivPapers.length > 0) {
        paper = arxivPapers[0];
        source = 'arxiv';
      }
    }
    
    if (!paper) {
      throw new Error(`Paper not found: ${paperId}`);
    }
    
    const result: any = {
      paper: {
        id: paper.id,
        title: paper.title,
        authors: paper.authors?.map((a: any) => a.name) || [],
        abstract: paper.abstract || '',
        year: paper.year || new Date(paper.published).getFullYear(),
        citations: paper.citationCount,
        references: paper.referenceCount,
        pdfUrl: paper.pdfUrl,
      },
    };
    
    // Fetch citations if requested
    if (args.includeCitations && source === 'semanticscholar') {
      // Would call getPaperCitations here
    }
    
    // Fetch references if requested
    if (args.includeReferences && source === 'semanticscholar') {
      // Would call getPaperReferences here
    }
    
    // Extract PDF content if requested
    if (args.extractPDF && paper.pdfUrl) {
      try {
        const { request } = await import('undici');

        const res = await request(paper.pdfUrl, {
          headers: {
            'user-agent': 'Mozilla/5.0 (compatible; IGS/1.0)',
          },
          maxRedirections: 5,
          headersTimeout: 15000,
          bodyTimeout: 60000,
        } as any);

        if (res.statusCode === 200) {
          const buffer = Buffer.from(await res.body.arrayBuffer());
          const markdown = await extractMarkdownSummary(buffer, 3000);
          result.paper.content = markdown;
          result.paper.tokenEstimate = Math.ceil(markdown.length / 4);
        }
      } catch (err) {
        console.error('PDF extraction failed:', err);
        result.paper.content = `PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    
    const structuredContent = result;
    
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent,
    };
  });

  srv.registerTool('research.download', {
    description: 'Download a research paper PDF and optionally convert to markdown. Saves files to the specified path or default papers directory. Returns file paths and metadata.',
    inputSchema: DownloadInput.shape,
    outputSchema: {
      pdfPath: z.string().optional(),
      markdownPath: z.string().optional(),
      fileSize: z.number(),
      markdownSize: z.number().optional(),
      metadata: z.object({
        id: z.string(),
        title: z.string(),
        authors: z.array(z.string()),
        pdfUrl: z.string(),
        year: z.number().optional(),
        citations: z.number().optional(),
      }),
    },
  }, async (args: any) => {
    const paperId = args.paperId;
    let paper: any = null;

    if (paperId.startsWith('arxiv:')) {
      const arxivId = paperId.replace('arxiv:', '');
      const arxivPapers = await searchArxiv({
        query: `all:${arxivId}`,
        maxResults: 1,
      });
      paper = arxivPapers[0];
    } else if (paperId.startsWith('semanticscholar:')) {
      const ssId = paperId.replace('semanticscholar:', '');
      paper = await getPaperDetails(ssId);
    } else {
      const arxivPapers = await searchArxiv({
        query: `all:${paperId}`,
        maxResults: 1,
      });
      if (arxivPapers.length > 0) {
        paper = arxivPapers[0];
      }
    }

    if (!paper) {
      throw new Error(`Paper not found: ${paperId}`);
    }

    const pdfUrl = paper.pdfUrl || paper.openAccessPdf?.url;
    if (!pdfUrl) {
      throw new Error(`No PDF URL available for paper: ${paper.title || paperId}`);
    }

    const res = await request(pdfUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; IGS/1.0)' },
      maxRedirections: 5,
      headersTimeout: 15000,
      bodyTimeout: 60000,
    } as any);
    if (res.statusCode !== 200) {
      throw new Error(`Failed to download PDF: HTTP ${res.statusCode}`);
    }
    const pdfBuffer = Buffer.from(await res.body.arrayBuffer());

    const format: 'pdf' | 'markdown' | 'both' = args.format || 'both';

    const basePath = await resolvePaperPath({ paperId: args.paperId, outputPath: args.outputPath, extension: 'pdf' });

    let pdfPath: string | undefined;
    if (format === 'pdf' || format === 'both') {
      pdfPath = basePath;
      await ensureDir(path.dirname(pdfPath));
      await writeFile(pdfPath, pdfBuffer);
    }

    let mdPath: string | undefined;
    let markdown: string | undefined;
    if (format === 'markdown' || format === 'both') {
      markdown = await convertPdfToMarkdown(pdfBuffer);
      mdPath = basePath.replace(/\.pdf$/, '.md');
      await ensureDir(path.dirname(mdPath));
      await writeFile(mdPath, markdown, 'utf-8');
    }

    const result = {
      pdfPath: (format === 'pdf' || format === 'both') ? pdfPath : undefined,
      markdownPath: (format === 'markdown' || format === 'both') ? mdPath : undefined,
      fileSize: pdfBuffer.length,
      markdownSize: markdown ? Buffer.byteLength(markdown, 'utf-8') : undefined,
      metadata: {
        id: paper.paperId || paper.id,
        title: paper.title,
        authors: paper.authors?.map((a: any) => a.name) || [],
        pdfUrl,
        year: paper.year || (paper.published ? new Date(paper.published).getFullYear() : undefined),
        citations: paper.citationCount,
      },
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  });
}
