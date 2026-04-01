import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadCountries, loadSources } from '../config/loader.js';

export async function registerCountryCityTools(srv: McpServer) {
  // List available countries with resolved source IDs present in config
  srv.registerTool('sources.countries', {
    description: 'List country names available for friendly-name resolution and their mapped source IDs (from Guardian/France24 and curated). Use with news.fetch.countries for compute-efficient selection.',
    outputSchema: { countries: z.array(z.object({ name: z.string(), code: z.string().optional(), sources: z.array(z.string()) })) }
  }, async () => {
    const cd = await loadCountries();
    const sf = await loadSources();
    const sourceIds = new Set(sf.sources.map(s => s.id));
    const out: any[] = [];
    for (const c of cd.countries || []) {
      const ids: string[] = [];
      if (c.guardian_slug) ids.push(`guardian_${c.guardian_slug}`);
      if (c.france24_slug) ids.push(`france24_${c.france24_slug}`);
      const present = ids.filter(id => sourceIds.has(id));
      out.push({ name: c.name, code: c.code, sources: present });
    }
    const structuredContent = { countries: out };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });

  // List available cities (curated + India native) from config
  srv.registerTool('sources.cities', {
    description: 'List curated global cities and India city feeds available with their source IDs. Use with news.fetch.cities for precise city-level intel.',
    outputSchema: { cities: z.array(z.object({ name: z.string(), sources: z.array(z.string()) })) }
  }, async () => {
    const sf = await loadSources();
    const cities: Record<string, string[]> = {};
    for (const s of sf.sources) {
      if (!(s.pools || []).some(p => p === 'GLOBAL_CITIES' || p === 'INDIA_CITIES')) continue;
      // Extract city name from source name if present in parentheses; else fallback to last token
      let city = '';
      const m = /\(([^)]+)\)/.exec(s.name || '');
      if (m) city = m[1];
      if (!city) {
        // try from URL or name
        const parts = (s.name || '').split(' ');
        city = parts[parts.length - 1];
      }
      city = city.trim();
      if (!city) continue;
      if (!cities[city]) cities[city] = [];
      cities[city].push(s.id);
    }
    const out = Object.entries(cities).map(([name, sources]) => ({ name, sources }));
    const structuredContent = { cities: out };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });
}
