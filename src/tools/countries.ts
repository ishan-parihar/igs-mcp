import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadCountries, loadSources } from '../config/loader.js';

export async function registerCountryCityTools(srv: McpServer) {
  // List countries with source counts from config-driven metadata
  srv.registerTool('sources.countries', {
    description: 'List countries with available source counts. Use with news.fetch countries param for country-level filtering.',
    outputSchema: { countries: z.array(z.object({ name: z.string(), code: z.string(), source_count: z.number() })) }
  }, async () => {
    const cd = await loadCountries();
    const sf = await loadSources();
    const out = (cd.countries || []).map((c: any) => {
      const count = sf.sources.filter(s =>
        s.is_active !== false &&
        (s.countries || []).some((sc: string) =>
          sc.toUpperCase() === c.code?.toUpperCase()
        )
      ).length;
      return { name: c.name, code: c.code, source_count: count };
    });
    const structuredContent = { countries: out };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });

  // List cities with source counts from config-driven metadata
  srv.registerTool('sources.cities', {
    description: 'List cities with available source counts. Use with news.fetch cities param for city-level filtering.',
    outputSchema: { cities: z.array(z.object({ name: z.string(), source_count: z.number() })) }
  }, async () => {
    const sf = await loadSources();
    const cityMap: Record<string, number> = {};
    for (const s of sf.sources) {
      if (s.is_active === false) continue;
      for (const c of (s.cities || [])) {
        cityMap[c] = (cityMap[c] || 0) + 1;
      }
    }
    const out = Object.entries(cityMap)
      .map(([name, count]) => ({ name, source_count: count }))
      .sort((a, b) => b.source_count - a.source_count);
    const structuredContent = { cities: out };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });

  // List domains with source counts
  srv.registerTool('sources.domains', {
    description: 'List available topic domains and source counts. Use with news.fetch domains param for topic-based filtering.',
    outputSchema: { domains: z.array(z.object({ name: z.string(), source_count: z.number() })) }
  }, async () => {
    const sf = await loadSources();
    const domainMap: Record<string, number> = {};
    for (const s of sf.sources) {
      if (s.is_active === false) continue;
      for (const d of (s.domains || [])) {
        domainMap[d] = (domainMap[d] || 0) + 1;
      }
    }
    const out = Object.entries(domainMap)
      .map(([name, count]) => ({ name, source_count: count }))
      .sort((a, b) => b.source_count - a.source_count);
    const structuredContent = { domains: out };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });
}
