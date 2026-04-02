import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { insightEngine, type ArticleInsight } from '../nlp/index.js';

export async function registerInsightTools(srv: McpServer) {
  // Tool 1: Find cross-domain connections for an entity
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
    
    const structuredContent = {
      connections,
      count: connections.length,
    };
    
    return { 
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], 
      structuredContent 
    };
  });

  // Tool 2: Find all cross-domain connections
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
    
    const structuredContent = {
      connections: limited,
      totalFound: connections.length,
      stats,
    };
    
    return { 
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], 
      structuredContent 
    };
  });

  // Tool 3: Get topic clusters
  srv.registerTool('insights.getClusters', {
    description: 'Get clusters of similar articles based on semantic similarity. Articles in the same cluster discuss similar topics.',
    inputSchema: {
      similarityThreshold: z.number().optional().default(0.7).describe('Minimum similarity score (0-1) to group articles'),
      minClusterSize: z.number().optional().default(3).describe('Minimum articles per cluster'),
    },
    outputSchema: {
      clusters: z.array(z.object({
        clusterId: z.string(),
        articleIds: z.array(z.string()),
        domains: z.array(z.string()),
        representativeTitle: z.string(),
        avgSimilarity: z.number(),
      })),
      clusterCount: z.number(),
      stats: z.object({
        totalArticles: z.number(),
        totalEntities: z.number(),
        totalDomains: z.number(),
      }),
    }
  }, async (args: any) => {
    const clusters = insightEngine.clusterArticles(args.similarityThreshold, args.minClusterSize);
    const stats = insightEngine.getStats();
    
    const structuredContent = {
      clusters,
      clusterCount: clusters.length,
      stats,
    };
    
    return { 
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], 
      structuredContent 
    };
  });

  // Tool 4: Trending entities
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
    
    const structuredContent = {
      trending,
      count: trending.length,
      stats,
    };
    
    return { 
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], 
      structuredContent 
    };
  });

  // Tool 5: Add articles to insight engine
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
        embedding: z.array(z.number()).optional(),
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
        embedding: article.embedding,
      };
      
      insightEngine.addArticle(insight);
      indexed++;
    }
    
    const stats = insightEngine.getStats();
    
    const structuredContent = {
      indexed,
      stats,
    };
    
    return { 
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], 
      structuredContent 
    };
  });

  // Tool 6: Get engine stats
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
    
    const structuredContent = stats;
    
    return { 
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], 
      structuredContent 
    };
  });

  // Tool 7: Clear index
  srv.registerTool('insights.clearIndex', {
    description: 'Clear all indexed articles from the insight engine. Use to free memory or reset the index.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      cleared: z.boolean(),
    })
  }, async () => {
    insightEngine.clear();
    
    const structuredContent = {
      cleared: true,
    };
    
    return { 
      content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }], 
      structuredContent 
    };
  });
}
