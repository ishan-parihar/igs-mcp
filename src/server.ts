import pino from 'pino';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPoolTools } from './tools/pools.js';
import { registerSourceTools } from './tools/sources.js';
import { registerParsersTool } from './tools/parsers.js';
import { registerNewsTools } from './tools/news.js';
import { registerAutodiscoverTools } from './tools/autodiscover.js';
import { registerCountryCityTools } from './tools/countries.js';
import { registerEnrichTool } from './tools/enrich.js';
import { registerResearchTools } from './tools/research.js';
import { registerInsightTools } from './tools/insights.js';

async function main() {
  const log = pino({ level: process.env.LOG_LEVEL || 'info' });
  const server = new McpServer({ name: 'igs-mcp', version: '0.2.0' }, { capabilities: {} });

  // Core tools
  await registerPoolTools(server);
  await registerSourceTools(server);
  await registerParsersTool(server);
  await registerNewsTools(server);
  await registerAutodiscoverTools(server);
  await registerCountryCityTools(server);
  
  // NLP and enrichment tools
  await registerEnrichTool(server);
  await registerInsightTools(server);
  
  // Research tools
  await registerResearchTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('IGS MCP server started on stdio with NLP auto-tagging enabled');
}

main().catch((e) => { console.error(e); process.exit(1); });
