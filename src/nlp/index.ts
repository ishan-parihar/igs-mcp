/**
 * NLP Module - Auto-tagging and insight discovery for IGS.
 * 
 * Provides:
 * - Domain classification (keyword-based)
 * - Entity extraction and linking
 * - Cross-article insight discovery
 */

export {
  domainClassifier,
  DomainClassifier,
  DOMAIN_LABELS,
  type DomainLabel,
  type DomainClassification,
} from './domain-classifier.js';

export {
  extractAndLinkEntities,
  extractEntities,
  getEntityTypes,
  countEntityMentions,
  normalizeEntityName,
  entitiesMatch,
  type LinkedEntity,
  type EntityType,
} from './entity-linker.js';

export {
  insightEngine,
  InsightEngine,
  type ArticleInsight,
  type EntityConnection,
  type TrendingEntity,
} from './insight-engine.js';
