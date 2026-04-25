import { LinkedEntity, normalizeEntityName } from './entity-linker.js';

/**
 * Processed article insight data.
 */
export interface ArticleInsight {
  id: string;
  title: string;
  domains: Array<{ domain: string; score: number }>;
  entities: LinkedEntity[];
  pubDate: string;
  sourceName: string;
}

/**
 * Cross-domain connection for an entity.
 */
export interface EntityConnection {
  entity: string;
  entityType: string;
  domains: Array<{
    domain: string;
    articleIds: string[];
    articleTitles: string[];
  }>;
  connectionStrength: number;
}

/**
 * Trending entity with growth metrics.
 */
export interface TrendingEntity {
  entity: string;
  type: string;
  currentMentions: number;
  previousMentions: number;
  growth: number;
  normalizedGrowth: number;
}

/**
 * Insight engine for cross-article analysis and discovery.
 * Maintains an in-memory index of processed articles for correlation.
 */
export class InsightEngine {
  private articles: Map<string, ArticleInsight> = new Map();
  private entityIndex: Map<string, Set<string>> = new Map(); // normalizedEntityId -> articleIds
  private domainIndex: Map<string, Set<string>> = new Map(); // domain -> articleIds

  /**
   * Add an article to the insight engine.
   * Automatically updates entity and domain indexes.
   */
  addArticle(insight: ArticleInsight): void {
    this.articles.set(insight.id, insight);

    // Index by entities
    for (const entity of insight.entities) {
      const normId = entity.normalizedId;
      if (!this.entityIndex.has(normId)) {
        this.entityIndex.set(normId, new Set());
      }
      this.entityIndex.get(normId)!.add(insight.id);
    }

    // Index by domains
    for (const domain of insight.domains) {
      if (!this.domainIndex.has(domain.domain)) {
        this.domainIndex.set(domain.domain, new Set());
      }
      this.domainIndex.get(domain.domain)!.add(insight.id);
    }
  }

  /**
   * Add multiple articles in batch.
   */
  addArticles(insights: ArticleInsight[]): void {
    for (const insight of insights) {
      this.addArticle(insight);
    }
  }

  /**
   * Remove an article from the index.
   */
  removeArticle(articleId: string): void {
    const insight = this.articles.get(articleId);
    if (!insight) return;

    // Remove from entity index
    for (const entity of insight.entities) {
      const articleSet = this.entityIndex.get(entity.normalizedId);
      if (articleSet) {
        articleSet.delete(articleId);
        if (articleSet.size === 0) {
          this.entityIndex.delete(entity.normalizedId);
        }
      }
    }

    // Remove from domain index
    for (const domain of insight.domains) {
      const articleSet = this.domainIndex.get(domain.domain);
      if (articleSet) {
        articleSet.delete(articleId);
        if (articleSet.size === 0) {
          this.domainIndex.delete(domain.domain);
        }
      }
    }

    this.articles.delete(articleId);
  }

  /**
   * Find articles that mention the same entity across different domains.
   * This is the core inter-domain insight discovery function.
   */
  findInterDomainConnections(
    entityName: string,
    minDomains: number = 2
  ): EntityConnection[] {
    const normName = normalizeEntityName(entityName);
    const articleIds = this.entityIndex.get(normName);

    if (!articleIds || articleIds.size === 0) {
      return [];
    }

    // Group articles by domain
    const domainArticles: Map<string, Array<{ id: string; title: string }>> = new Map();

    for (const articleId of articleIds) {
      const insight = this.articles.get(articleId);
      if (!insight) continue;

      for (const domain of insight.domains) {
        if (!domainArticles.has(domain.domain)) {
          domainArticles.set(domain.domain, []);
        }
        domainArticles.get(domain.domain)!.push({
          id: articleId,
          title: insight.title,
        });
      }
    }

    // Only return if entity appears in multiple domains
    if (domainArticles.size < minDomains) {
      return [];
    }

    // Get entity type from first article
    const firstArticle = this.articles.get(Array.from(articleIds)[0]);
    const entityType =
      firstArticle?.entities.find((e) => e.normalizedId === normName)?.type ||
      'Unknown';

    // Calculate connection strength (number of domains * avg articles per domain)
    const totalArticles = Array.from(domainArticles.values()).reduce(
      (sum, articles) => sum + articles.length,
      0
    );
    const connectionStrength = (domainArticles.size * totalArticles) / articleIds.size;

    return [
      {
        entity: entityName,
        entityType,
        domains: Array.from(domainArticles.entries()).map(([domain, articles]) => ({
          domain,
          articleIds: articles.map((a) => a.id),
          articleTitles: articles.map((a) => a.title),
        })),
        connectionStrength,
      },
    ];
  }

  /**
   * Find all cross-domain connections in the indexed articles.
   * Returns connections sorted by strength.
   */
  findAllInterDomainConnections(minDomains: number = 2): EntityConnection[] {
    const connections: EntityConnection[] = [];
    const processed = new Set<string>();

    for (const [entityId, articleIds] of this.entityIndex.entries()) {
      if (processed.has(entityId) || articleIds.size < 2) {
        continue;
      }

      const result = this.findInterDomainConnections(entityId, minDomains);
      if (result.length > 0) {
        connections.push(...result);
        processed.add(entityId);
      }
    }

    return connections.sort((a, b) => b.connectionStrength - a.connectionStrength);
  }

  /**
   * Detect trending entities based on mention frequency growth.
   * Compares recent time window against previous period.
   */
  detectTrendingEntities(
    timeWindowMs: number = 3600000, // 1 hour
    minGrowth: number = 2.0,
    minCurrentMentions: number = 3
  ): TrendingEntity[] {
    const now = Date.now();
    const currentStart = now - timeWindowMs;
    const previousStart = now - timeWindowMs * 2;

    // Count entity mentions in current and previous periods
    const currentCounts: Map<string, { count: number; type: string }> = new Map();
    const previousCounts: Map<string, { count: number; type: string }> = new Map();

    for (const article of this.articles.values()) {
      const pubDate = new Date(article.pubDate).getTime();
      const entityCounts: Map<string, { count: number; type: string }> = new Map();

      for (const entity of article.entities) {
        if (!entityCounts.has(entity.normalizedId)) {
          entityCounts.set(entity.normalizedId, {
            count: entity.mentions,
            type: entity.type,
          });
        } else {
          entityCounts.get(entity.normalizedId)!.count += entity.mentions;
        }
      }

      for (const [entityId, data] of entityCounts.entries()) {
        if (pubDate >= currentStart) {
          if (!currentCounts.has(entityId)) {
            currentCounts.set(entityId, { count: 0, type: data.type });
          }
          currentCounts.get(entityId)!.count += data.count;
        } else if (pubDate >= previousStart && pubDate < currentStart) {
          if (!previousCounts.has(entityId)) {
            previousCounts.set(entityId, { count: 0, type: data.type });
          }
          previousCounts.get(entityId)!.count += data.count;
        }
      }
    }

    // Calculate growth
    const trending: TrendingEntity[] = [];

    for (const [entityId, currentData] of currentCounts.entries()) {
      if (currentData.count < minCurrentMentions) {
        continue;
      }

      const previousData = previousCounts.get(entityId);
      const previousCount = previousData?.count || 0;

      // Avoid division by zero
      const growth = previousCount === 0 ? currentData.count : currentData.count / previousCount;

      if (growth >= minGrowth) {
        trending.push({
          entity: entityId,
          type: currentData.type,
          currentMentions: currentData.count,
          previousMentions: previousCount,
          growth,
          normalizedGrowth: growth,
        });
      }
    }

    return trending.sort((a, b) => b.normalizedGrowth - a.normalizedGrowth);
  }

  /**
   * Get statistics about the indexed articles.
   */
  getStats(): {
    totalArticles: number;
    totalEntities: number;
    totalDomains: number;
    avgEntitiesPerArticle: number;
    avgDomainsPerArticle: number;
  } {
    const articles = Array.from(this.articles.values());
    const totalEntities = articles.reduce((sum, a) => sum + a.entities.length, 0);
    const totalDomains = articles.reduce((sum, a) => sum + a.domains.length, 0);

    return {
      totalArticles: articles.length,
      totalEntities,
      totalDomains: this.domainIndex.size,
      avgEntitiesPerArticle: articles.length > 0 ? totalEntities / articles.length : 0,
      avgDomainsPerArticle: articles.length > 0 ? totalDomains / articles.length : 0,
    };
  }

  /**
   * Clear all indexed articles.
   */
  clear(): void {
    this.articles.clear();
    this.entityIndex.clear();
    this.domainIndex.clear();
  }
}

// Singleton instance for application-wide use
export const insightEngine = new InsightEngine();
