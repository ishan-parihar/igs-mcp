import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { insightEngine, type ArticleInsight } from '../nlp/index.js';

export async function registerInsightTools(srv: McpServer) {
  srv.registerTool('insights.findConnections', {
    description: 'Find articles that mention the same entity across different domains (e.g., tech + geopolitics). Enables inter-domain insight discovery.',
    inputSchema: {
      entity: z.string().describe('Entity name to search for (e.g., "China", "Elon Musk", "Google")'),
      minDomains: z.number().optional().default(2).describe('Minimum number of domains the entity must appear in'),
    },
    outputSchema: {
      connections: z.array(z.object({
        entity: z.string(),
        entityType: z.string(),
        domains: z.array(z.object({
          domain: z.string(),
          articleIds: z.array(z.string()),
          articleTitles: z.array(z.string()),
        })),
        connectionStrength: z.number(),
      })),
      count: z.number(),
    }
  }, async (args: any) => {
    const connections = insightEngine.findInterDomainConnections(args.entity, args.minDomains);
    
    return { 
      content: [{ type: 'text', text: JSON.stringify({ connections, count: connections.length }, null, 2) }], 
      structuredContent: { connections, count: connections.length }
    };
  });

  srv.registerTool('insights.findAllConnections', {
    description: 'Discover all entities that appear across multiple domains. Returns connections sorted by strength.',
    inputSchema: {
      minDomains: z.number().optional().default(2).describe('Minimum number of domains'),
      limit: z.number().optional().default(20).describe('Maximum number of connections to return'),
    },
    outputSchema: {
      connections: z.array(z.any()),
      totalFound: z.number(),
      stats: z.object({
        totalArticles: z.number(),
        totalEntities: z.number(),
        totalDomains: z.number(),
      }),
    }
  }, async (args: any) => {
    const connections = insightEngine.findAllInterDomainConnections(args.minDomains);
    const limited = connections.slice(0, args.limit);
    const stats = insightEngine.getStats();
    
    return { 
      content: [{ type: 'text', text: JSON.stringify({ connections: limited, totalFound: connections.length, stats }, null, 2) }], 
      structuredContent: { connections: limited, totalFound: connections.length, stats }
    };
  });

  srv.registerTool('insights.trendingEntities', {
    description: 'Detect entities with increasing mention frequency. Useful for identifying emerging topics and breaking news.',
    inputSchema: {
      timeWindowHours: z.number().optional().default(24).describe('Time window in hours to analyze'),
      minGrowth: z.number().optional().default(2.0).describe('Minimum growth factor (e.g., 2.0 = 2x increase)'),
      minCurrentMentions: z.number().optional().default(3).describe('Minimum current mentions to qualify'),
    },
    outputSchema: {
      trending: z.array(z.object({
        entity: z.string(),
        type: z.string(),
        currentMentions: z.number(),
        previousMentions: z.number(),
        growth: z.number(),
        normalizedGrowth: z.number(),
      })),
      count: z.number(),
      stats: z.object({
        totalArticles: z.number(),
        totalEntities: z.number(),
        totalDomains: z.number(),
      }),
    }
  }, async (args: any) => {
    const timeWindowMs = args.timeWindowHours * 3600000;
    const trending = insightEngine.detectTrendingEntities(timeWindowMs, args.minGrowth, args.minCurrentMentions);
    const stats = insightEngine.getStats();
    
    return { 
      content: [{ type: 'text', text: JSON.stringify({ trending, count: trending.length, stats }, null, 2) }], 
      structuredContent: { trending, count: trending.length, stats }
    };
  });

  srv.registerTool('insights.indexArticles', {
    description: 'Add enriched articles to the insight engine for cross-article analysis. Call this after news.enrich to enable insight discovery.',
    inputSchema: {
      articles: z.array(z.object({
        id: z.string(),
        title: z.string(),
        pubDate: z.string(),
        sourceName: z.string(),
        domains: z.array(z.object({
          domain: z.string(),
          score: z.number(),
        })).optional().default([]),
        entities: z.array(z.object({
          name: z.string(),
          type: z.string(),
          mentions: z.number().optional(),
          normalizedId: z.string().optional(),
          confidence: z.number().optional(),
        })).optional().default([]),
      })),
    },
    outputSchema: {
      indexed: z.number(),
      stats: z.object({
        totalArticles: z.number(),
        totalEntities: z.number(),
        totalDomains: z.number(),
        avgEntitiesPerArticle: z.number(),
        avgDomainsPerArticle: z.number(),
      }),
    }
  }, async (args: any) => {
    let indexed = 0;
    
    for (const article of args.articles) {
      const insight: ArticleInsight = {
        id: article.id,
        title: article.title,
        pubDate: article.pubDate,
        sourceName: article.sourceName,
        domains: article.domains || [],
        entities: ((article.entities || []) as any[]).map((e: any) => ({
          name: e.name,
          type: e.type as any,
          mentions: e.mentions || 1,
          context: [],
          normalizedId: e.normalizedId || e.name.toLowerCase(),
          confidence: e.confidence || 0.7,
        })),
      };
      
      insightEngine.addArticle(insight);
      indexed++;
    }
    
    const stats = insightEngine.getStats();
    
    return { 
      content: [{ type: 'text', text: JSON.stringify({ indexed, stats }, null, 2) }], 
      structuredContent: { indexed, stats }
    };
  });

  srv.registerTool('insights.getStats', {
    description: 'Get statistics about the indexed articles in the insight engine.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      totalArticles: z.number(),
      totalEntities: z.number(),
      totalDomains: z.number(),
      avgEntitiesPerArticle: z.number(),
      avgDomainsPerArticle: z.number(),
    })
  }, async () => {
    const stats = insightEngine.getStats();
    
    return { 
      content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }], 
      structuredContent: stats
    };
  });

  srv.registerTool('insights.clearIndex', {
    description: 'Clear all indexed articles from the insight engine. Use to free memory or reset the index.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      cleared: z.boolean(),
    })
  }, async () => {
    insightEngine.clear();
    
    return { 
      content: [{ type: 'text', text: JSON.stringify({ cleared: true }, null, 2) }], 
      structuredContent: { cleared: true }
    };
  });
}