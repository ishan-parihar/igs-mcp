import process from 'process';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
// @ts-ignore
import keywordExtractor from 'keyword-extractor';
// @ts-ignore
import Sentiment from 'sentiment';
import nlp from 'compromise';
import { domainClassifier, extractEntities } from '../nlp/index.js';

const sentiment = new Sentiment();

type EnrichItem = {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  source_name: string;
  pool_id: string;
  content_snippet: string;
  author?: string;
  media_url?: string;
};

function extractKeywords(text: string, max = 8): string[] {
  const words = (keywordExtractor as any).extract(text || '', {
    language: 'english',
    remove_digits: true,
    return_changed_case: true,
    remove_duplicates: false,
  });
  // Simple frequency sort
  const freq: Record<string, number> = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, max).map(([w]) => w);
}

function extractEntitiesBasic(text: string): { name: string; type: string }[] {
  const doc = nlp(text || '');
  const ents: { name: string; type: string }[] = [];
  doc.people().out('array').forEach((n: string) => ents.push({ name: n, type: 'Person' }));
  doc.places().out('array').forEach((n: string) => ents.push({ name: n, type: 'Place' }));
  doc.organizations().out('array').forEach((n: string) => ents.push({ name: n, type: 'Organization' }));
  // Deduplicate
  const seen = new Set<string>();
  return ents.filter(e => { const k = `${e.type}:${e.name.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

function summarize(text: string, title: string): string {
  if (!text) return title || '';
  const sents = text.split(/(?<=[.!?])\s+/);
  if (sents.length === 1) return sents[0];
  return sents.slice(0, 2).join(' ');
}

export async function registerEnrichTool(srv: McpServer) {
  srv.registerTool('news.enrich', {
    description: 'NLP enrichment (offline). Adds topics, entities, sentiment, summary, and domains to items. Use after news.fetch for deeper analysis.',
    inputSchema: {
      items: z.array(z.object({
        id: z.string(), 
        title: z.string(), 
        link: z.string(), 
        pubDate: z.string(),
        source_name: z.string(), 
        pool_id: z.string(), 
        content_snippet: z.string().optional(),
        author: z.string().optional(), 
        media_url: z.string().optional()
      })),
      extract: z.array(z.enum(['topics','entities','sentiment','summary','domains'])).optional(),
      useAdvancedEntities: z.boolean().optional().default(false),
    },
    outputSchema: {
      items: z.array(z.any()),
      meta: z.object({
        itemsEnriched: z.number(),
        domainsClassified: z.number(),
      }).optional(),
    }
  }, async (args: any) => {
    const defaultExtract = ['topics','entities','sentiment','summary','domains'];
    
    const extractList = (args.extract || []).filter((e: string) => e !== 'embeddings');
    const want = new Set<string>(extractList.length > 0 ? extractList : defaultExtract);
    const useAdvancedEntities = args.useAdvancedEntities || false;
    
    let domainsClassified = 0;
    
    const out = await Promise.all((args.items || []).map(async (it: EnrichItem) => {
      const text = `${it.title} ${it.content_snippet || ''}`;
      const enriched: any = { ...it };
      
      // Existing enrichments (fast, synchronous)
      if (want.has('topics')) {
        enriched.topics = extractKeywords(text, 8);
      }
      
      if (want.has('entities')) {
        if (useAdvancedEntities) {
          // Use advanced entity linker with context
          const entities = extractEntities(text, 0.5);
          enriched.entities = entities.map(e => ({
            name: e.name,
            type: e.type,
            mentions: e.mentions,
            confidence: e.confidence,
          }));
        } else {
          // Use basic entity extraction (backward compatible)
          enriched.entities = extractEntitiesBasic(text);
        }
      }
      
      if (want.has('sentiment')) {
        const s = sentiment.analyze(text);
        enriched.sentiment = { 
          score: s.score, 
          comparative: s.comparative, 
          label: s.score > 1 ? 'positive' : s.score < -1 ? 'negative' : 'neutral' 
        };
      }
      
      if (want.has('summary')) {
        enriched.summary = summarize(it.content_snippet || '', it.title);
      }
      
      // New ML-powered enrichments (async)
      if (want.has('domains')) {
        try {
          enriched.domains = await domainClassifier.classify(text, 5, 0.5);
          domainsClassified++;
        } catch (error) {
          console.error('[news.enrich] Domain classification failed:', error);
          enriched.domains = [];
        }
      }
      
      return enriched;
    }));
    
    const structuredContent = { 
      items: out,
      meta: {
        itemsEnriched: out.length,
        domainsClassified,
      }
    };
    
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  });
}
