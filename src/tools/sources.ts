import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadSources, saveSources } from '../config/loader.js';

const SourceInput = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(['rss', 'http']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  parser: z.string().optional(),
  pools: z.array(z.string()).default([]),
  is_active: z.boolean().optional().default(true),
});

export async function registerSourceTools(srv: McpServer) {
  srv.registerTool('sources.list', {
    description: 'List sources. Use pools + search to narrow, then select source ids for news.fetch. Returns id/name/type/url/pools.',
    inputSchema: { pools: z.array(z.string()).optional(), active_only: z.boolean().optional() },
    outputSchema: { sources: z.array(z.object({ id: z.string(), name: z.string(), type: z.enum(['rss','http']), url: z.string(), headers: z.record(z.string()).optional(), parser: z.string().optional(), pools: z.array(z.string()), is_active: z.boolean().optional() })) }
  }, async (args: any) => {
    const sf = await loadSources();
    let list = sf.sources;
    if (args?.pools?.length) list = list.filter(s => s.pools.some(p => args.pools!.includes(p)));
    if (args?.active_only) list = list.filter(s => s.is_active !== false);
    const structuredContent = { sources: list };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });

  srv.registerTool('sources.upsert', {
    description: 'Create or update a source (rss/http). Use this after sources.autodiscover, or to add a known feed. Avoid generic city/country adds when native feeds exist.',
    inputSchema: SourceInput.shape,
    outputSchema: { id: z.string() }
  }, async (args: any) => {
    const sf = await loadSources();
    const id = args.id ?? args.name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const idx = sf.sources.findIndex(s => s.id === id);
    const src = { id, ...args } as any;
    if (idx >= 0) sf.sources[idx] = { ...sf.sources[idx], ...src };
    else sf.sources.push(src);
    await saveSources(sf);
    const structuredContent = { id };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  });

  srv.registerTool('sources.delete', {
    description: 'Delete a source by id. Use with caution and consider disabling (is_active=false) first.',
    inputSchema: { id: z.string().min(1) },
    outputSchema: { removed: z.boolean() }
  }, async (args: any) => {
    const sf = await loadSources();
    const before = sf.sources.length;
    sf.sources = sf.sources.filter(s => s.id !== args.id);
    await saveSources(sf);
    const structuredContent = { removed: before !== sf.sources.length };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  });
}
