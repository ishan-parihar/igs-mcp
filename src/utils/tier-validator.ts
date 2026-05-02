/**
 * Tier Validator Utility
 *
 * Validates and manages source quality tiers (Tier 1/2/3).
 * Tiers are used to prioritize sources during dedup and to adjust cache policies.
 *
 * All functions are pure — no side effects, no dependencies on other IGS modules.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Tier = 1 | 2 | 3;

export interface TierConfig {
  value: Tier;
  label: string;
  description: string;
  /** Default cache TTL multiplier (higher = cache longer, tier 1 is most authoritative) */
  cacheTtlMultiplier: number;
  /** Sources at this tier are considered authoritative for dedup priority */
  isAuthoritative: boolean;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  1: {
    value: 1,
    label: 'Primary / Official',
    description:
      'Official sources, peer-reviewed journals, government agencies, primary data',
    cacheTtlMultiplier: 2.0,
    isAuthoritative: true,
  },
  2: {
    value: 2,
    label: 'Major Outlet',
    description:
      'Established news outlets, major think tanks, reputable independent media',
    cacheTtlMultiplier: 1.0,
    isAuthoritative: false,
  },
  3: {
    value: 3,
    label: 'Blog / Social / Niche',
    description:
      'Blogs, social media, niche publications, unverified sources, Reddit, Twitter',
    cacheTtlMultiplier: 0.5,
    isAuthoritative: false,
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_TIERS = new Set<Tier>([1, 2, 3]);

/**
 * Validate that a tier value is 1, 2, or 3.
 * Accepts numbers and their string representations.
 * Returns the tier if valid, or undefined.
 */
export function validateTier(value: unknown): Tier | undefined {
  if (typeof value === 'number' && VALID_TIERS.has(value as Tier)) {
    return value as Tier;
  }
  if (typeof value === 'string') {
    const num = Number(value);
    if (Number.isInteger(num) && VALID_TIERS.has(num as Tier)) {
      return num as Tier;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/**
 * Get human-readable label for a tier.
 * Returns 'Unknown Tier' if invalid.
 */
export function getTierLabel(tier: Tier): string {
  const config = TIER_CONFIG[tier];
  return config ? config.label : 'Unknown Tier';
}

/**
 * Check if a source with given tier is considered reliable for dedup priority.
 * Tier 1 sources win in dedup conflicts. Tier 3 never wins.
 */
export function isSourceReliable(tier?: Tier): boolean {
  if (tier === undefined) return false;
  const config = TIER_CONFIG[tier];
  return config ? config.isAuthoritative : false;
}

/**
 * Get cache TTL multiplier for a tier.
 * Tier 1 = 2x (cache longer, authoritative content changes slowly)
 * Tier 2 = 1x (normal)
 * Tier 3 = 0.5x (social media changes fast, cache less)
 */
export function getTierCacheMultiplier(tier?: Tier): number {
  if (tier === undefined) return 1.0;
  const config = TIER_CONFIG[tier];
  return config ? config.cacheTtlMultiplier : 1.0;
}
