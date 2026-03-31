import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const PARSERS = [
  { key: 'rss', note: 'Generic RSS/Atom via rss-parser' },
  { key: 'ofac', note: 'OFAC Recent Actions HTML parser' },
  { key: 'ussf_cfc', note: 'US Space Force CFC News HTML parser' },
  { key: 'who_dons', note: 'WHO Disease Outbreak News JSON parser' },
  { key: 'newslaundry', note: 'Newslaundry list page JSON-in-script parser' },
];

export async function registerParsersTool(srv: McpServer) {
  srv.registerTool('parsers.list', {
    description: 'List available parser keys',
    outputSchema: { parsers: z.array(z.object({ key: z.string(), note: z.string() })) }
  }, async () => {
    const structuredContent = { parsers: PARSERS };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });
}
