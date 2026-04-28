import fs from 'node:fs/promises';
import yaml from 'js-yaml';

async function run() {
  const sourcesFile = 'config/sources.yml';
  const sourcesDoc = yaml.load(await fs.readFile(sourcesFile, 'utf8'));
  const sources = sourcesDoc.sources;

  console.log('--- GLOBAL_CITIES Sources ---');
  sources.filter(s => s.pools.includes('GLOBAL_CITIES')).forEach(s => {
    console.log(`- ${s.name} (${s.url})`);
  });

  console.log('\n--- INDIA_FACTCHECK_DATA Sources ---');
  sources.filter(s => s.pools.includes('INDIA_FACTCHECK_DATA')).forEach(s => {
    console.log(`- ${s.name} (${s.url})`);
  });

  console.log('\n--- GLOBAL_CULT_SOC Sources ---');
  sources.filter(s => s.pools.includes('GLOBAL_CULT_SOC')).forEach(s => {
    console.log(`- ${s.name} (${s.url})`);
  });

  // Check country distribution in GLOBAL_COUNTRIES
  const countries = {};
  sources.filter(s => s.pools.includes('GLOBAL_COUNTRIES')).forEach(s => {
    (s.countries || []).forEach(c => {
      countries[c] = (countries[c] || 0) + 1;
    });
  });

  console.log('\n--- GLOBAL_COUNTRIES Distribution (Top 20) ---');
  Object.entries(countries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .forEach(([c, count]) => {
      console.log(`${c.padEnd(10)}: ${count}`);
    });
}

run().catch(console.error);
