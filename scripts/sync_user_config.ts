import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDir = path.resolve(__dirname, '..', 'config');
const userDir = process.env.IGS_CONFIG_DIR || path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'igs-mcp');

const dryRun = process.argv.includes('--dry-run');
const replace = process.argv.includes('--replace');

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const files = ['pools.yml', 'sources.yml', 'settings.yml', 'countries.yml'];
  await fs.mkdir(userDir, { recursive: true });

  console.log(`Default config dir: ${defaultDir}`);
  console.log(`User config dir: ${userDir}`);

  for (const file of files) {
    const src = path.join(defaultDir, file);
    const dest = path.join(userDir, file);
    const exists = await fileExists(dest);

    if (!exists || replace) {
      if (dryRun) {
        console.log(`${exists ? 'would overwrite' : 'would copy'} ${file}`);
      } else if (await fileExists(src)) {
        await fs.copyFile(src, dest);
        console.log(`${exists ? 'overwrote' : 'copied'} ${file}`);
      }
    } else {
      console.log(`kept existing ${file}`);
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
