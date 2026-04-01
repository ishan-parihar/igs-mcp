import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import yaml from 'js-yaml';
import { PoolsFileSchema, SourcesFileSchema, SettingsSchema, type PoolsFile, type SourcesFile, type Settings } from './schemas.js';

// Resolve user config directory with precedence:
// 1) env IGS_CONFIG_DIR
// 2) $XDG_CONFIG_HOME/igs-mcp or ~/.config/igs-mcp
// Defaults directory (read-only): <repo>/config
const DEFAULT_DIR = path.resolve(process.cwd(), 'config');

function resolveUserConfigDir(): string {
  const envDir = process.env.IGS_CONFIG_DIR;
  if (envDir && envDir.trim().length > 0) return path.resolve(envDir);
  const xdg = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(xdg, 'igs-mcp');
}

const USER_CFG_DIR = resolveUserConfigDir();

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function ensureBootstrapped() {
  // If user config files are missing, copy from DEFAULT_DIR
  const files = ['pools.yml', 'sources.yml', 'settings.yml'];
  await fs.mkdir(USER_CFG_DIR, { recursive: true });
  for (const f of files) {
    const target = path.join(USER_CFG_DIR, f);
    if (!(await fileExists(target))) {
      const src = path.join(DEFAULT_DIR, f);
      if (await fileExists(src)) {
        const raw = await fs.readFile(src);
        await fs.writeFile(target, raw);
      }
    }
  }
}

async function readYaml<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, 'utf8');
  const doc = yaml.load(raw);
  return doc as T;
}

async function writeYaml(file: string, obj: unknown) {
  const txt = yaml.dump(obj, { noRefs: true, lineWidth: 120 });
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, txt, 'utf8');
}

export function getUserConfigDir(): string { return USER_CFG_DIR; }

export async function loadPools(): Promise<PoolsFile> {
  await ensureBootstrapped();
  const file = path.join(USER_CFG_DIR, 'pools.yml');
  const parsed = await readYaml<PoolsFile>(file);
  return PoolsFileSchema.parse(parsed);
}

export async function savePools(data: PoolsFile): Promise<void> {
  await fs.mkdir(USER_CFG_DIR, { recursive: true });
  const file = path.join(USER_CFG_DIR, 'pools.yml');
  const validated = PoolsFileSchema.parse(data);
  await writeYaml(file, validated);
}

export async function loadSources(): Promise<SourcesFile> {
  await ensureBootstrapped();
  const file = path.join(USER_CFG_DIR, 'sources.yml');
  const parsed = await readYaml<SourcesFile>(file);
  return SourcesFileSchema.parse(parsed);
}

export async function saveSources(data: SourcesFile): Promise<void> {
  await fs.mkdir(USER_CFG_DIR, { recursive: true });
  const file = path.join(USER_CFG_DIR, 'sources.yml');
  const validated = SourcesFileSchema.parse(data);
  await writeYaml(file, validated);
}

export async function loadSettings(): Promise<Settings> {
  await ensureBootstrapped();
  const file = path.join(USER_CFG_DIR, 'settings.yml');
  const parsed = await readYaml<Settings>(file);
  return SettingsSchema.parse(parsed);
}

// Lightweight loader for countries.yml (no zod schema; used for friendly mapping)
export async function loadCountries(): Promise<any> {
  await ensureBootstrapped();
  const file = path.join(DEFAULT_DIR, 'countries.yml');
  try {
    const raw = await fs.readFile(file, 'utf8');
    return yaml.load(raw) as any;
  } catch {
    return { countries: [] };
  }
}
