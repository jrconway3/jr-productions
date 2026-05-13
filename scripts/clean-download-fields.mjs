import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = join(__dirname, '..', 'data');

let cleaned = 0;
let skipped = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.name.endsWith('.json') && entry.name !== 'meta.json') {
      const text = readFileSync(full, 'utf-8');
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.warn(`Skipping unparseable: ${full}`);
        skipped++;
        continue;
      }

      if ('download' in data) {
        delete data.download;
        writeFileSync(full, JSON.stringify(data, null, 2) + '\n', 'utf-8');
        console.log(`Cleaned: ${full}`);
        cleaned++;
      } else {
        skipped++;
      }
    }
  }
}

walk(DATA_ROOT);
console.log(`\nDone. Cleaned ${cleaned} files, skipped ${skipped}.`);
