import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_ROOT = path.join(__dirname, '..', 'data');

function walkJson(dir, callback) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJson(full, callback);
    else if (entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'meta.json') {
      callback(full);
    }
  }
}

function patchJson(filePath, patcher) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  const patched = patcher(data);
  if (patched === null) return; // skip
  const out = JSON.stringify(patched, null, 2) + '\n';
  if (out !== raw) fs.writeFileSync(filePath, out, 'utf-8');
}

let updated = 0;
let skipped = 0;

// LPC assets → animation_spec: "lpc"
walkJson(path.join(DATA_ROOT, 'lpc'), (filePath) => {
  patchJson(filePath, (data) => {
    if (data.animation_spec) { skipped++; return null; }
    updated++;
    return { ...data, animation_spec: 'lpc' };
  });
});

// FE portraits → animation_spec: "fe/portrait" + placeholder cutouts
walkJson(path.join(DATA_ROOT, 'fe', 'portraits'), (filePath) => {
  patchJson(filePath, (data) => {
    if (data.animation_spec) { skipped++; return null; }
    updated++;
    return {
      ...data,
      animation_spec: 'fe/portrait',
      cutouts: {
        mouth_neutral: { offset_x: 0, offset_y: 0 },
        mouth_smile:   { offset_x: 0, offset_y: 0 },
        blink:         { offset_x: 0, offset_y: 0 },
      },
    };
  });
});

// FE map sprites → animation_spec: "fe/map_sprite"
walkJson(path.join(DATA_ROOT, 'fe', 'map-sprites'), (filePath) => {
  patchJson(filePath, (data) => {
    if (data.animation_spec) { skipped++; return null; }
    updated++;
    return { ...data, animation_spec: 'fe/map_sprite' };
  });
});

// FE battle animations → animation_spec: "fe/battle"
walkJson(path.join(DATA_ROOT, 'fe', 'battle-animations'), (filePath) => {
  patchJson(filePath, (data) => {
    if (data.animation_spec) { skipped++; return null; }
    updated++;
    return { ...data, animation_spec: 'fe/battle' };
  });
});

console.log(`Done. Updated: ${updated}, Skipped (already had animation_spec): ${skipped}`);
