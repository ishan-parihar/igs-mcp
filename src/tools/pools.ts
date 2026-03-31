import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { loadPools, savePools } from '../config/loader.js';

export async function registerPoolTools(srv: McpServer) {
  srv.registerTool('pools.list', {
    description: 'List all configured pools',
    outputSchema: { pools: z.array(z.object({ id: z.string(), name: z.string(), description: z.string().optional(), is_active: z.boolean().optional() })) }
  }, async () => {
    const pools = await loadPools();
    const structuredContent = { pools: pools.pools };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], structuredContent };
  });

  srv.registerTool('pools.upsert', {
    description: 'Create or update a pool',
    inputSchema: {
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    is_active: z.boolean().optional(),
    },
    outputSchema: { updated: z.boolean() }
  }, async (args: any) => {
    const pf = await loadPools();
    const idx = pf.pools.findIndex(p => p.id === args.id);
    if (idx >= 0) pf.pools[idx] = { ...pf.pools[idx], ...args };
    else pf.pools.push({ ...args });
    await savePools(pf);
    const structuredContent = { updated: true };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  });

  srv.registerTool('pools.delete', {
    description: 'Delete a pool by id',
    inputSchema: { id: z.string().min(1) },
    outputSchema: { removed: z.boolean() }
  }, async (args: any) => {
    const pf = await loadPools();
    const before = pf.pools.length;
    pf.pools = pf.pools.filter(p => p.id !== args.id);
    await savePools(pf);
    const structuredContent = { removed: before !== pf.pools.length };
    return { content: [{ type: 'text', text: JSON.stringify(structuredContent) }], structuredContent };
  });
}
