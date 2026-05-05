import fs from 'fs';
import path from 'path';
import type { Category, CategoryMeta } from './models/Category';

const DATA_ROOT = path.join(process.cwd(), 'data');

function readMeta(dirPath: string): CategoryMeta | null {
  const metaPath = path.join(dirPath, 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as CategoryMeta;
}

function buildCategory(dirPath: string, slug: string, relativePath: string): Category | null {
  const meta = readMeta(dirPath);
  if (!meta) return null;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const children: Category[] = entries
    .filter((e) => e.isDirectory())
    .map((e) => buildCategory(path.join(dirPath, e.name), e.name, `${relativePath}/${e.name}`))
    .filter((c): c is Category => c !== null)
    .sort((a, b) => a.priority - b.priority);

  return { ...meta, slug, path: relativePath, children };
}

export function getTopLevelCategories(): Category[] {
  const entries = fs.readdirSync(DATA_ROOT, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => buildCategory(path.join(DATA_ROOT, e.name), e.name, e.name))
    .filter((c): c is Category => c !== null && !c.hidden)
    .sort((a, b) => a.priority - b.priority);
}

export function getCategoryBySlug(slugs: string[]): Category | null {
  let current = path.join(DATA_ROOT, ...slugs);
  const meta = readMeta(current);
  if (!meta) return null;

  const slug = slugs[slugs.length - 1];
  const relativePath = slugs.join('/');
  return buildCategory(current, slug, relativePath);
}
