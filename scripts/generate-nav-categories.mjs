import fs from 'fs';
import path from 'path';

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');
const OUTPUT_PATH = path.join(DATA_ROOT, 'nav-categories.json');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function titleCaseFromSlug(value) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function readCategoryChildren(topLevelKey) {
  const rootDir = path.join(DATA_ROOT, topLevelKey);
  if (!fs.existsSync(rootDir)) return [];

  const dirs = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dirPath = path.join(rootDir, entry.name);
      const meta = readJson(path.join(dirPath, 'meta.json'));
      if (!meta || meta.hidden || meta.excluded) return null;

      return {
        href: `/${topLevelKey}/${entry.name}`,
        label: meta.label || titleCaseFromSlug(entry.name),
        priority: typeof meta.priority === 'number' ? meta.priority : 999,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority)
    .map(({ href, label }) => ({ href, label }));

  return dirs;
}

function main() {
  const payload = {
    categories: {
      lpc: readCategoryChildren('lpc'),
      fe: readCategoryChildren('fe'),
    },
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const lpcCount = payload.categories.lpc.length;
  const feCount = payload.categories.fe.length;
  console.log(`Generated nav categories: lpc=${lpcCount}, fe=${feCount}`);
}

main();
