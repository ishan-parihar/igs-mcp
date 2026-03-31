import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';
import { PoolsFileSchema, SourcesFileSchema, SettingsSchema, type PoolsFile, type SourcesFile, type Settings } from './schemas.js';

const CFG_DIR = path.resolve(process.cwd(), 'config');

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

export async function loadPools(): Promise<PoolsFile> {
  const file = path.join(CFG_DIR, 'pools.yml');
  const parsed = await readYaml<PoolsFile>(file);
  return PoolsFileSchema.parse(parsed);
}

export async function savePools(data: PoolsFile): Promise<void> {
  const file = path.join(CFG_DIR, 'pools.yml');
  const validated = PoolsFileSchema.parse(data);
  await writeYaml(file, validated);
}

export async function loadSources(): Promise<SourcesFile> {
  const file = path.join(CFG_DIR, 'sources.yml');
  const parsed = await readYaml<SourcesFile>(file);
  return SourcesFileSchema.parse(parsed);
}

export async function saveSources(data: SourcesFile): Promise<void> {
  const file = path.join(CFG_DIR, 'sources.yml');
  const validated = SourcesFileSchema.parse(data);
  await writeYaml(file, validated);
}

export async function loadSettings(): Promise<Settings> {
  const file = path.join(CFG_DIR, 'settings.yml');
  const parsed = await readYaml<Settings>(file);
  return SettingsSchema.parse(parsed);
}
