import { z } from 'zod';

export const PoolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  is_active: z.boolean().optional().default(true),
});

export const PoolsFileSchema = z.object({
  pools: z.array(PoolSchema),
});

export const SourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['rss', 'http', 'social_media']),
  url: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  parser: z.string().optional(),
  parserConfig: z
    .object({
      listUrl: z.string().url().optional(),
      selectors: z
        .object({
          item: z.string().min(1),
          title: z.string().optional(),
          link: z.string().optional(),
          date: z.string().optional(),
          desc: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  pools: z.array(z.string()).default([]),
  countries: z.array(z.string()).optional().default([]),
  cities: z.array(z.string()).optional().default([]),
  domains: z.array(z.string()).optional().default([]),
  is_active: z.boolean().optional().default(true),
  platform: z.enum(['reddit', 'twitter', 'web']).optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  rate_limit: z
    .object({
      interval_seconds: z.number().int().positive(),
      batch_size: z.number().int().positive().optional(),
    })
    .optional(),
  sourceCategory: z.enum(['news', 'community', 'research', 'social']).optional().default('news'),
}).superRefine((data, ctx) => {
  // If type === 'social_media', platform must be set
  if (data.type === 'social_media' && !data.platform) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Sources with type 'social_media' must have a 'platform' field (reddit, twitter, or web)",
      path: ['platform'],
    });
  }

  // If tier is provided, validate it's 1, 2, or 3
  if (data.tier !== undefined && ![1, 2, 3].includes(data.tier)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Tier must be 1, 2, or 3 if provided',
      path: ['tier'],
    });
  }

  // If rate_limit is provided, interval_seconds must be positive
  if (data.rate_limit !== undefined) {
    if (data.rate_limit.interval_seconds < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'rate_limit.interval_seconds must be a positive integer',
        path: ['rate_limit', 'interval_seconds'],
      });
    }
  }

  // Non-social_media sources must have a valid URL
  if (data.type !== 'social_media' && data.url) {
    const urlResult = z.string().url().safeParse(data.url);
    if (!urlResult.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['url'],
        message: `Invalid URL for non-social_media source: ${data.url}`,
      });
    }
  }
});

export const SourcesFileSchema = z.object({
  sources: z.array(SourceSchema),
});

export const SettingsSchema = z.object({
  http: z.object({
    userAgent: z.string().default('IGS-MCP/0.1'),
    timeoutMs: z.number().int().min(1000).default(15000),
    retries: z.number().int().min(0).max(5).default(2),
    backoffBaseMs: z.number().int().min(100).default(500),
    backoffFactor: z.number().min(1).default(2.0),
    concurrency: z.number().int().min(1).max(16).default(6),
    perHost: z.number().int().min(1).max(8).default(2),
  }),
  cache: z.object({
    enabled: z.boolean().default(true),
    dir: z.string().default('cache'),
    honorEtags: z.boolean().default(true),
    ttlMs: z.number().int().min(60000).default(30 * 60 * 1000),
    queryTtlMs: z.number().int().min(60000).default(10 * 60 * 1000),
    maxItemsPerSource: z.number().int().min(50).default(300),
  }),
  time: z.object({
    timezone: z.enum(['local']).default('local'),
  }),
  tavily: z.object({
    enabled: z.boolean().default(false),
    apiKey: z.string().optional(),
    searchDepth: z.enum(['basic', 'advanced', 'fast', 'ultra-fast']).default('basic'),
    defaultTopic: z.enum(['general', 'news', 'finance']).default('general'),
    timeoutMs: z.number().int().min(1000).default(30000),
  }).optional(),
  firecrawl: z.object({
    enabled: z.boolean().default(false),
    apiKey: z.string().optional(),
    timeoutMs: z.number().int().min(1000).default(60000),
    defaultFormats: z.array(z.enum(['markdown', 'html', 'screenshot', 'links'])).default(['markdown']),
  }).optional(),
});

export type PoolsFile = z.infer<typeof PoolsFileSchema>;
export type SourcesFile = z.infer<typeof SourcesFileSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export interface ValidationResult {
  valid: boolean;
  errors: Array<{ path: string; message: string; value?: unknown }>;
  warnings: Array<{ path: string; message: string }>;
}

/**
 * Validate a parsed YAML sources document against the extended schema.
 * Returns structured validation result instead of throwing.
 * This is the primary entry point for validating sources.yml before loading.
 */
export function validateSourcesYaml(data: unknown): ValidationResult {
  const result = SourcesFileSchema.safeParse(data);
  if (result.success) {
    return { valid: true, errors: [], warnings: [] };
  }

  const errors = result.error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
    value: (issue as any).received,
  }));

  return { valid: false, errors, warnings: [] };
}

/**
 * Validate a single source entry against the schema.
 */
export function validateSourceEntry(data: unknown): ValidationResult {
  const result = SourceSchema.safeParse(data);
  if (result.success) {
    return { valid: true, errors: [], warnings: [] };
  }

  const errors = result.error.issues.map(issue => ({
    path: issue.path.join('.'),
    message: issue.message,
    value: (issue as any).received,
  }));

  return { valid: false, errors, warnings: [] };
}
