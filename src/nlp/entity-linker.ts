import nlp from 'compromise';

/**
 * Entity types supported by the entity linker.
 */
export type EntityType = 'Person' | 'Place' | 'Organization' | 'Event' | 'Product';

/**
 * Linked entity with context and frequency information.
 * Used for cross-article entity correlation and insight discovery.
 */
export interface LinkedEntity {
  /** Normalized entity name (lowercase, trimmed) */
  name: string;
  /** Entity type */
  type: EntityType;
  /** Number of mentions in the source text */
  mentions: number;
  /** Context snippets where entity appears (max 3) */
  context: string[];
  /** Normalized ID for cross-article linking */
  normalizedId: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Extract and link entities from text.
 * Uses compromise for NER and adds frequency-based ranking.
 */
export function extractAndLinkEntities(text: string): LinkedEntity[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const doc = nlp(text);
  const entities: LinkedEntity[] = [];

  /**
   * Extract entities of a specific type with frequency and context.
   */
  const extractWithCount = (
    extractFn: () => any,
    type: EntityType,
    confidenceBase: number
  ): LinkedEntity[] => {
    const matches: string[] = extractFn().out('array');
    const freq: Record<string, { count: number; contexts: string[] }> = {};

    for (const match of matches) {
      const normalized = match.toLowerCase().trim();
      if (!normalized || normalized.length < 2) {
        continue; // Skip very short matches
      }

      if (!freq[normalized]) {
        freq[normalized] = { count: 0, contexts: [] };
      }
      freq[normalized].count++;

      // Store context (the match itself + nearby words)
      if (freq[normalized].contexts.length < 3) {
        const context = doc.match(match).out('text');
        if (context && context.length > 0) {
          freq[normalized].contexts.push(context);
        }
      }
    }

    return Object.entries(freq).map(([name, data]) => ({
      name: capitalizeFirst(name),
      type,
      mentions: data.count,
      context: data.contexts,
      normalizedId: name,
      confidence: Math.min(1.0, confidenceBase + (data.count - 1) * 0.1),
    }));
  };

  // Extract different entity types with different base confidence
  entities.push(...extractWithCount(() => doc.people(), 'Person', 0.7));
  entities.push(...extractWithCount(() => doc.places(), 'Place', 0.75));
  entities.push(...extractWithCount(() => doc.organizations(), 'Organization', 0.7));

  // Custom event detection (capitalized multi-word phrases with event indicators)
  const eventPatterns = doc.match('#ProperNoun+ (summit|conference|meeting|talks|agreement|deal|launch|announcement)');
  if (eventPatterns.length > 0) {
    entities.push(...extractWithCount(() => eventPatterns, 'Event', 0.6));
  }

  // Custom product detection (capitalized terms with product indicators)
  const productPatterns = doc.match('#ProperNoun+ (app|platform|service|system|device|phone|software)');
  if (productPatterns.length > 0) {
    entities.push(...extractWithCount(() => productPatterns, 'Product', 0.6));
  }

  // Sort by mentions (frequency) and then by confidence
  return entities
    .filter((e) => e.mentions >= 1)
    .sort((a, b) => {
      if (b.mentions !== a.mentions) {
        return b.mentions - a.mentions;
      }
      return b.confidence - a.confidence;
    });
}

/**
 * Extract entities with their types and return as a simplified format.
 * @param text - Input text
 * @param minConfidence - Minimum confidence threshold (default: 0.5)
 * @returns Array of entities
 */
export function extractEntities(
  text: string,
  minConfidence: number = 0.5
): LinkedEntity[] {
  return extractAndLinkEntities(text).filter((e) => e.confidence >= minConfidence);
}

/**
 * Get unique entity types present in the text.
 * @param text - Input text
 * @returns Array of entity types found
 */
export function getEntityTypes(text: string): EntityType[] {
  const entities = extractAndLinkEntities(text);
  const types = new Set<EntityType>();
  entities.forEach((e) => types.add(e.type));
  return Array.from(types);
}

/**
 * Count total entity mentions in text.
 * @param text - Input text
 * @returns Total mention count
 */
export function countEntityMentions(text: string): number {
  const entities = extractAndLinkEntities(text);
  return entities.reduce((sum, e) => sum + e.mentions, 0);
}

/**
 * Capitalize first letter of a string.
 */
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Normalize entity name for cross-article matching.
 * Handles common variations and abbreviations.
 */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+(inc|ltd|llc|corp|co|l\.p\.|lp)\.?$/i, '')
    .replace(/\s+(the|a|an)\s+/i, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

/**
 * Check if two entities likely refer to the same real-world entity.
 */
export function entitiesMatch(entity1: string, entity2: string): boolean {
  const norm1 = normalizeEntityName(entity1);
  const norm2 = normalizeEntityName(entity2);
  
  // Exact match after normalization
  if (norm1 === norm2) {
    return true;
  }

  // Check if one contains the other (for abbreviations)
  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    const shorter = norm1.length < norm2.length ? norm1 : norm2;
    const longer = norm1.length < norm2.length ? norm2 : norm1;
    
    // Only match if shorter is substantial (not just "US" vs "USA")
    if (shorter.length > 3) {
      return true;
    }
  }

  return false;
}
