import fs from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

async function run() {
  const poolsFile = 'config/pools.yml';
  const sourcesFile = 'config/sources.yml';

  const poolsDoc = yaml.load(await fs.readFile(poolsFile, 'utf8'));
  const sourcesDoc = yaml.load(await fs.readFile(sourcesFile, 'utf8'));

  const pools = poolsDoc.pools;
  const sources = sourcesDoc.sources;

  const poolCounts = {};
  for (const pool of pools) {
    poolCounts[pool.id] = {
      name: pool.name,
      count: 0,
      activeCount: 0,
      sources: []
    };
  }

  const sourcesByPool = {};
  const sourcesWithNoPool = [];

  for (const src of sources) {
    if (!src.pools || src.pools.length === 0) {
      sourcesWithNoPool.push(src.id);
      continue;
    }
    for (const poolId of src.pools) {
      if (poolCounts[poolId]) {
        poolCounts[poolId].count++;
        if (src.is_active !== false) {
          poolCounts[poolId].activeCount++;
        }
        poolCounts[poolId].sources.push(src.id);
      } else {
        if (!sourcesByPool[poolId]) sourcesByPool[poolId] = 0;
        sourcesByPool[poolId]++;
      }
    }
  }

  console.log('--- Pool Coverage Summary ---');
  for (const poolId in poolCounts) {
    const p = poolCounts[poolId];
    const flag = p.activeCount === 0 ? '!!! EMPTY !!!' : p.activeCount < 5 ? '!! LOW !!' : '';
    console.log(`${poolId.padEnd(25)} | Total: ${String(p.count).padStart(3)} | Active: ${String(p.activeCount).padStart(3)} | ${flag}`);
  }

  console.log('\n--- Undefined Pools (referenced in sources but not in pools.yml) ---');
  for (const poolId in sourcesByPool) {
    console.log(`${poolId.padEnd(25)} | Sources: ${sourcesByPool[poolId]}`);
  }

  if (sourcesWithNoPool.length > 0) {
    console.log(`\n--- Sources with No Pools (${sourcesWithNoPool.length}) ---`);
    console.log(sourcesWithNoPool.slice(0, 10).join(', ') + (sourcesWithNoPool.length > 10 ? '...' : ''));
  }
}

run().catch(console.error);
