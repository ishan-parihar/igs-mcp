import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.resolve(__dirname, '..', 'config');
const userDir = (process.env.IGS_CONFIG_DIR ||
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'igs-mcp'));

async function readYaml(f) { return (await import('js-yaml')).default.load(await fs.readFile(f, 'utf8')); }
async function writeYaml(f, obj) {
  const yaml = (await import('js-yaml')).default;
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, yaml.dump(obj, { noRefs: true, lineWidth: 120 }), 'utf8');
}

async function fileExists(p) { try { await fs.access(p); return true; } catch { return false; } }

async function main() {
  console.log('User config dir:', userDir);

  // Read defaults (authoritative)
  const defDoc = await readYaml(path.join(defaultDir, 'sources.yml'));
  const defMap = {};
  for (const s of defDoc.sources) defMap[s.id] = s;

  // Read user sources
  const userFile = path.join(userDir, 'sources.yml');
  if (!(await fileExists(userFile))) {
    console.log('No user sources.yml found, copying defaults');
    await writeYaml(userFile, defDoc);
    return;
  }
  const userDoc = await readYaml(userFile);
  const userSources = userDoc.sources || [];

  // Update: for each source that exists in defaults, update URL/parser/pools from defaults
  // Keep user's is_active override
  let updated = 0;
  const merged = userSources.map(us => {
    if (defMap[us.id]) {
      const ds = defMap[us.id];
      updated++;
      return {
        ...us,
        url: ds.url,
        parser: ds.parser,
        parserConfig: ds.parserConfig,
        headers: ds.headers || us.headers,
        pools: ds.pools,
      };
    }
    return us;
  });

  // Add any defaults that are missing from user config
  for (const ds of defDoc.sources) {
    if (!merged.find(s => s.id === ds.id)) {
      merged.push(ds);
    }
  }

  await writeYaml(userFile, { sources: merged });
  console.log(`Updated ${updated} sources from defaults, ${merged.length} total`);
}

main().catch(e => { console.error(e); process.exit(1); });
