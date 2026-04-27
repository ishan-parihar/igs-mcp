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

const log = {
  info: (...args: unknown[]) => process.stderr.write('[info] ' + args.join(' ') + '\n'),
  error: (...args: unknown[]) => process.stderr.write('[error] ' + args.join(' ') + '\n'),
  debug: (...args: unknown[]) => process.stderr.write('[debug] ' + args.join(' ') + '\n'),
};

async function main() {
  const server = new McpServer({ name: 'igs-mcp', version: '0.2.0' }, { capabilities: {} });

  await registerPoolTools(server);
  await registerSourceTools(server);
  await registerParsersTool(server);
  await registerNewsTools(server);
  await registerAutodiscoverTools(server);
  await registerCountryCityTools(server);
  await registerEnrichTool(server);
  await registerInsightTools(server);
  await registerResearchTools(server);

  log.info('server ready');

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => { console.error(e); process.exit(1); });