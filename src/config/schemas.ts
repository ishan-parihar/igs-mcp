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
  type: z.enum(['rss', 'http']),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  parser: z.string().optional(),
  pools: z.array(z.string()).default([]),
  is_active: z.boolean().optional().default(true),
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
});

export type PoolsFile = z.infer<typeof PoolsFileSchema>;
export type SourcesFile = z.infer<typeof SourcesFileSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
