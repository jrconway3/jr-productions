import path from 'path';

const IMAGE_EXTENSIONS = new Set(['.png', '.gif', '.webp', '.jpg', '.jpeg']);

export const MAP_WEAPON_LABELS = [
  'Sword',
  'Dagger',
  'Lance',
  'Axe',
  'Magic',
  'Bow',
  'Staff',
];

export function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

export function stripUnderscoreDirs(segments) {
  return segments.filter((segment) => !segment.startsWith('_'));
}

export function isImageFile(fileName) {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export function titleCaseFromSlug(value) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function slugifyUnderscore(value) {
  return value
    .toLowerCase()
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function humanizeSegment(value) {
  return titleCaseFromSlug(value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim());
}

export function mapSourceRootToDataRoot(sourceRoot) {
  return sourceRoot.toLowerCase().replace(/_/g, '-');
}

export function relativePublicAssetPath(absolutePath, publicRoot) {
  return normalizeSlashes(path.relative(publicRoot, absolutePath));
}

export function parseCreditAuthorsFromBraces(text) {
  const authors = [];
  // Match both {Author} (correct) and (Author} (mismatched-bracket typo)
  const matches = [
    ...(text.match(/\{[^}]*\}/g) ?? []),
    ...(text.match(/\([^)]*\}/g) ?? []),
  ];
  for (const match of matches) {
    const inside = match.slice(1, -1).trim();
    if (!inside) continue;
    for (const part of inside.split(',')) {
      const author = part.trim();
      if (author) authors.push(author);
    }
  }
  return [...new Set(authors)];
}

export function stripCreditsAndBodyMarkers(text) {
  return text
    .replace(/\{[^}]*\}/g, ' ')      // {Author} correct format
    .replace(/\([^)]*\}/g, ' ')       // (Author} mismatched-bracket typo
    .replace(/\((M|F|U)\)/gi, ' ')   // body-type markers
    .replace(/\s+/g, ' ')
    .trim();
}

export function inferBodyTypeMarkers(text) {
  const bodyTypes = new Set();
  if (/\(M\)/i.test(text)) bodyTypes.add('male');
  if (/\(F\)/i.test(text)) bodyTypes.add('female');
  if (/\(U\)/i.test(text)) bodyTypes.add('universal');
  return [...bodyTypes];
}

export function inferWeaponVariant(nameText) {
  for (const weapon of MAP_WEAPON_LABELS) {
    const pattern = new RegExp(`\\b${weapon}\\b`, 'i');
    if (pattern.test(nameText)) return weapon;
  }
  return 'Unarmed';
}

export function ensureUniqueSlug(baseSlug, usedSlugs) {
  if (!usedSlugs.has(baseSlug)) {
    usedSlugs.add(baseSlug);
    return baseSlug;
  }

  let index = 2;
  let candidate = `${baseSlug}_${index}`;
  while (usedSlugs.has(candidate)) {
    index += 1;
    candidate = `${baseSlug}_${index}`;
  }
  usedSlugs.add(candidate);
  return candidate;
}
