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

async function main() {
  const log = pino({ level: process.env.LOG_LEVEL || 'info' });
  const server = new McpServer({ name: 'igs-news-mcp', version: '0.1.0' }, { capabilities: {} });

  await registerPoolTools(server);
  await registerSourceTools(server);
  await registerParsersTool(server);
  await registerNewsTools(server);
  await registerAutodiscoverTools(server);
  await registerCountryCityTools(server);
  await registerEnrichTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('IGS MCP server started on stdio');
}

main().catch((e) => { console.error(e); process.exit(1); });
