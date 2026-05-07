#!/usr/bin/env node
// Generates CREDITS.md for lpc-jaidynreiman-assets from ULPC sheet_definitions.
// Run with: node scripts/generate-credits.mjs
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SHEET_DEFS = 'E:/code/assets/lpc/Universal-LPC-Spritesheet-Character-Generator/sheet_definitions';
const OUT_FILE   = 'E:/code/assets/lpc/lpc-jaidynreiman-assets/CREDITS.md';

function walkDir(dir, base = '') {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) results.push(...walkDir(join(dir, entry.name), rel));
    else if (entry.name.endsWith('.json')) results.push(rel);
  }
  return results;
}

// Collect all JaidynReiman assets grouped by top-level category
const byCategory = {};

for (const relPath of walkDir(SHEET_DEFS)) {
  let content;
  try { content = JSON.parse(readFileSync(join(SHEET_DEFS, relPath), 'utf-8')); }
  catch { continue; }

  const allCredits = content.credits ?? [];
  if (!allCredits.some(c => Array.isArray(c.authors) && c.authors.includes('JaidynReiman'))) continue;

  const category = relPath.split('/')[0];
  if (!byCategory[category]) byCategory[category] = [];

  // Collect unique authors and licenses across all credit entries
  const authors = [...new Set(allCredits.flatMap(c => c.authors ?? []))];
  const licenses = [...new Set(allCredits.flatMap(c => c.licenses ?? []))];
  // Collect unique URLs, preferring OGA links
  const urls = [...new Set(allCredits.flatMap(c => c.urls ?? []))];

  byCategory[category].push({ name: content.name, authors, licenses, urls });
}

// Build markdown
const lines = [
  '# Credits',
  '',
  'All assets in this repository are authored or co-authored by JaidynReiman.',
  'Full attribution for each asset is listed below.',
  '',
  '---',
  '',
];

for (const category of Object.keys(byCategory).sort()) {
  const label = category.charAt(0).toUpperCase() + category.slice(1);
  lines.push(`## ${label}`, '');

  for (const asset of byCategory[category].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push(`### ${asset.name}`);
    lines.push(`**Authors:** ${asset.authors.join(', ')}`);
    lines.push(`**License:** ${asset.licenses.join(', ')}`);
    if (asset.urls.length) {
      lines.push('**Sources:**');
      asset.urls.forEach(u => lines.push(`- <${u}>`));
    }
    lines.push('');
  }
}

writeFileSync(OUT_FILE, lines.join('\n'));
console.log(`Written: ${OUT_FILE}`);
console.log(`Assets documented: ${Object.values(byCategory).reduce((s, a) => s + a.length, 0)}`);
