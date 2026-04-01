import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { autodiscoverList } from '../parsers/generic_html.js';
import { HttpClient } from '../http/client.js';
import { loadSettings, loadSources, saveSources } from '../config/loader.js';

export async function registerAutodiscoverTools(srv: McpServer) {
  srv.registerTool('sources.autodiscover', {
    description: 'Auto-discover feeds/selectors. Give a homepage; tool tries RSS/Atom/JSON/HTML/sitemap. Use as a precursor to sources.enableGenericScraper or sources.upsert.',
    inputSchema: { url: z.string().url(), pools: z.array(z.string()).optional(), name: z.string().optional() },
    outputSchema: {
      kind: z.enum(['rss','atom','html','json','sitemap','none']),
      url: z.string().optional(),
      selectors: z.object({ item: z.string(), title: z.string().optional(), link: z.string().optional(), date: z.string().optional(), desc: z.string().optional() }).optional(),
      sample: z.array(z.any()).optional(),
    }
  }, async (args: any) => {
    const settings = await loadSettings();
    const http = new HttpClient(settings.http, settings.cache.dir);
    const source = { id: 'ad-hoc', name: args.name || 'Ad Hoc', type: 'http', url: args.url, pools: args.pools || [], is_active: true } as any;
    const res = await autodiscoverList(source, http);
    const structuredContent: any = { kind: res.kind, url: res.url, selectors: res.selectors, sample: res.sample };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });

  srv.registerTool('sources.enableGenericScraper', {
    description: 'Enable generic HTML scraping for a source (known selectors). Prefer native RSS first; use only when no feed is available.',
    inputSchema: {
      id: z.string().min(1),
      listUrl: z.string().url().optional(),
      selectors: z.object({ item: z.string(), title: z.string().optional(), link: z.string().optional(), date: z.string().optional(), desc: z.string().optional() })
    },
    outputSchema: { updated: z.boolean() }
  }, async (args: any) => {
    const sf = await loadSources();
    const idx = sf.sources.findIndex(s => s.id === args.id);
    if (idx < 0) throw new Error(`Source not found: ${args.id}`);
    const s = sf.sources[idx];
    s.parser = 'generic_html';
    s.parserConfig = { listUrl: args.listUrl, selectors: args.selectors } as any;
    await saveSources(sf);
    const structuredContent = { updated: true };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  });
}
