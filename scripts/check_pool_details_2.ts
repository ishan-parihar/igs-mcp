import fs from 'node:fs/promises';
import yaml from 'js-yaml';

async function run() {
  const sourcesFile = 'config/sources.yml';
  const sourcesDoc = yaml.load(await fs.readFile(sourcesFile, 'utf8'));
  const sources = sourcesDoc.sources;

  console.log('--- GLOBAL_TECH_CYBER Sources ---');
  sources.filter(s => s.pools.includes('GLOBAL_TECH_CYBER')).forEach(s => {
    console.log(`- ${s.name} (${s.url})`);
  });

  const countries = {};
  sources.filter(s => s.pools.includes('GLOBAL_COUNTRIES')).forEach(s => {
    (s.countries || []).forEach(c => {
      countries[c] = (countries[c] || 0) + 1;
    });
  });

  console.log('\n--- Countries with only 1 Source ---');
  const onlyOne = Object.entries(countries)
    .filter(([c, count]) => count === 1)
    .map(([c]) => c);
  console.log(onlyOne.join(', '));
}

run().catch(console.error);
