import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ── Resolve config directories ──────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.resolve(__dirname, '..', 'config');
const userDir = (process.env.IGS_CONFIG_DIR ||
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'igs-mcp'));

// ── Old → new pool ID map ───────────────────────────────
const POOL_MAP = {
  'POOL_A_MACRO':  'GLOBAL_BREAKING',
  'POOL_B_STRATEGY': 'GLOBAL_GEOECON',
  'POOL_C_TECH': 'GLOBAL_TECH_CYBER',
  'POOL_D_CULTURE': 'GLOBAL_CULT_SOC',
  'POOL_E_ENV_HEALTH': 'GLOBAL_ENV_HEALTH',
};

// ── Helpers ─────────────────────────────────────────────
async function readYaml(f) { return (await import('js-yaml')).default.load(await fs.readFile(f, 'utf8')); }
async function writeYaml(f, obj) {
  const yaml = (await import('js-yaml')).default;
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, yaml.dump(obj, { noRefs: true, lineWidth: 120 }), 'utf8');
}
async function fileExists(p) { try { await fs.access(p); return true; } catch { return false; } }

// ── Main ────────────────────────────────────────────────
async function main() {
  console.log('Default config dir:', defaultDir);
  console.log('User config dir:', userDir);

  // 1. Copy default pools.yml (overwrites old pool IDs with new architecture)
  const defaultPools = await readYaml(path.join(defaultDir, 'pools.yml'));
  await writeYaml(path.join(userDir, 'pools.yml'), defaultPools);
  console.log('✓ Pools updated → new architecture (' + defaultPools.pools.length + ' pools)');

  // 2. Load existing user sources (if any) and remap old pool IDs
  let existing = [];
  if (await fileExists(path.join(userDir, 'sources.yml'))) {
    const doc = await readYaml(path.join(userDir, 'sources.yml'));
    existing = doc.sources || [];
  }

  const remapped = existing.map(s => ({
    ...s,
    pools: (s.pools || []).map(p => POOL_MAP[p] || p),
  }));

  // 3. Load default sources (authoritative list of canonical sources)
  const defaults = await readYaml(path.join(defaultDir, 'sources.yml'));
  const defaultSources = defaults.sources || [];

  // 4. Merge: keep user overrides, add defaults, preserve user-added extras
  const merged = [...remapped]; // start with remapped user sources
  for (const ds of defaultSources) {
    const idx = merged.findIndex(s => s.id === ds.id);
    if (idx >= 0) {
      // merge: keep user's is_active/parserConfig overrides, update pools and url
      merged[idx] = { ...ds, ...merged[idx], pools: merged[idx].pools.length ? merged[idx].pools : ds.pools };
    } else {
      merged.push(ds);
    }
  }

  await writeYaml(path.join(userDir, 'sources.yml'), { sources: merged });
  console.log(`✓ Sources updated → ${merged.length} sources (${existing.length} old remapped, ${defaultSources.length} defaults)`);

  // 5. Copy settings if missing
  if (!(await fileExists(path.join(userDir, 'settings.yml')))) {
    const src = path.join(defaultDir, 'settings.yml');
    if (await fileExists(src)) {
      await fs.copyFile(src, path.join(userDir, 'settings.yml'));
      console.log('✓ Settings initialised from defaults');
    }
  }

  // 6. Summary
  const poolCounts = {};
  for (const s of merged) {
    for (const p of s.pools) {
      poolCounts[p] = (poolCounts[p] || 0) + 1;
    }
  }
  console.log('\nPool summary:');
  for (const [pool, count] of Object.entries(poolCounts).sort()) {
    console.log(`  ${pool}: ${count} sources`);
  }
  console.log(`\nConfig dir: ${userDir}`);
}

main().catch(e => { console.error(e); process.exit(1); });
