import fs from 'fs';

const filePath = 'scripts/lib/feWalker.mjs';
const content = fs.readFileSync(filePath, 'utf8');

// --- New parseBattleAnimationReadmeMetadata ---
const newParseFunc = `
function parseBattleAnimationReadmeMetadata(publicRoot) {
  const readmePath = path.join(publicRoot, 'assets', 'fe', 'battle_animations', 'README.md');
  const sections = readMarkdownSections(readmePath).filter((section) => section.level === 3);

  const byKey = new Map();

  for (const section of sections) {
    const variants = [];
    let currentVariant = null;
    let license = '';
    let hasJaidynVariant = false;

    for (const line of section.lines) {
      // Top-level list item (0-3 leading spaces before dash) = new variant
      if (/^\\s{0,3}-\\s/.test(line)) {
        const itemText = line.replace(/^\\s{0,3}-\\s+/, '').trim();
        if (/^lt fixes/i.test(itemText)) {
          currentVariant = null;
          continue;
        }
        const typeAndLabel = itemText.match(/^([^:]+):\\s*(.+)$/);
        const variantType = typeAndLabel ? typeAndLabel[1].trim() : '';
        const rawLabel = typeAndLabel ? typeAndLabel[2].trim() : itemText;
        // Strip trailing " by Author" attribution from freeform labels
        const variantLabel = rawLabel.replace(/\\s+by\\s+\\S+.*$/i, '').trim();
        currentVariant = { type: variantType, label: variantLabel, authors: new Set(), bodyTypes: [], weaponTypes: [] };
        variants.push(currentVariant);
        continue;
      }

      // Sub-item (4+ leading spaces before dash) = belongs to current variant
      if (currentVariant && /^\\s{4,}-\\s/.test(line)) {
        if (/^\\s*-\\s*by\\s*:?\\s*/i.test(line)) {
          for (const author of parseAuthorsFromText(line)) {
            currentVariant.authors.add(author);
            if (author.toLowerCase() === 'jaidynreiman') hasJaidynVariant = true;
          }
        }
        const bodyMatch = line.match(/^\\s*-\\s*body types?\\s*:\\s*(.+)$/i);
        if (bodyMatch) {
          currentVariant.bodyTypes = bodyMatch[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        }
        const weaponMatch = line.match(/^\\s*-\\s*weapons?\\s*:\\s*(.+)$/i);
        if (weaponMatch) {
          currentVariant.weaponTypes = weaponMatch[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        }
        const parsedLicense = parseLicenseFromLine(line);
        if (parsedLicense) license = parsedLicense;
      }
    }

    const key = normalizeMarkdownKey(section.title);
    if (!hasJaidynVariant) {
      byKey.set(key, null);
      continue;
    }

    const allCredits = variants
      .filter((v) => v.authors.size > 0)
      .map((v) => ({ type: v.label || v.type, authors: [...v.authors] }));

    const jaidynVariants = variants.filter((v) =>
      [...v.authors].some((a) => a.toLowerCase() === 'jaidynreiman'),
    );

    byKey.set(key, {
      title: section.title,
      description: extractSectionDescription(section.lines),
      license,
      allCredits,
      jaidynVariants,
    });
  }

  return byKey;
}

function findBattleAnimationSection(byKey, classDirName) {
  const normalizedClass = normalizeMarkdownKey(classDirName);
  // Check for explicit exclusion first (null entry whose key contains the class name)
  for (const [key, entry] of byKey) {
    if (entry === null && key.includes(normalizedClass)) return null;
  }
  // Find best matching section by word overlap (ignoring tier prefixes like t1, t2)
  const dirWords = classDirName.toLowerCase().split(/[_\\s-]+/).filter((w) => w.length > 2 && !/^t\\d+$/.test(w));
  let bestEntry = null;
  let bestScore = 0;
  for (const [, entry] of byKey) {
    if (!entry) continue;
    const titleWords = entry.title.toLowerCase().split(/\\W+/).filter((w) => w.length > 2);
    const score = dirWords.filter((w) => titleWords.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }
  return bestScore > 0 ? bestEntry : null;
}

function matchVariantDirToReadme(variantDirName, jaidynVariants) {
  if (!jaidynVariants || jaidynVariants.length === 0) return { variant: null, bodyTypes: [] };

  const bodyTypeWords = new Set(['male', 'female', 'universal', 'monster']);
  const dirWords = variantDirName.toLowerCase().split(/[_\\s-]+/).filter(Boolean);
  const identifyingWords = dirWords.filter((w) => !bodyTypeWords.has(w));
  const bodyTypesFromDir = dirWords.filter((w) => bodyTypeWords.has(w));

  if (identifyingWords.length > 0) {
    for (const variant of jaidynVariants) {
      const normalizedLabel = normalizeMarkdownKey(variant.label);
      if (identifyingWords.every((w) => normalizedLabel.includes(normalizeMarkdownKey(w)))) {
        return { variant, bodyTypes: bodyTypesFromDir.length > 0 ? bodyTypesFromDir : variant.bodyTypes };
      }
    }
  }

  // Fall back: match by body type
  if (bodyTypesFromDir.length > 0) {
    const matched = jaidynVariants.find((v) => v.bodyTypes.some((bt) => bodyTypesFromDir.includes(bt)));
    if (matched) return { variant: matched, bodyTypes: bodyTypesFromDir };
  }

  // Final fallback: first jaidynVariant
  return { variant: jaidynVariants[0], bodyTypes: bodyTypesFromDir.length > 0 ? bodyTypesFromDir : jaidynVariants[0].bodyTypes };
}
`;

// --- New scanBattleAnimations ---
const newScanFunc = `
export function scanBattleAnimations(sourceRoot, publicRoot) {
  const assets = [];
  const metas = [];
  const readmeByKey = parseBattleAnimationReadmeMetadata(publicRoot);
  const typeDirs = listNonUnderscoreDirs(sourceRoot);

  typeDirs.forEach((typeDirName, typeIndex) => {
    const typeDir = path.join(sourceRoot, typeDirName);
    const typeAssetsStart = assets.length;
    const classMetaEntries = [];

    const classDirs = listNonUnderscoreDirs(typeDir);
    classDirs.forEach((classDirName, classIndex) => {
      const section = findBattleAnimationSection(readmeByKey, classDirName);
      if (section === null) {
        console.warn(\`⚠️  Skipping battle animation: \${typeDirName}/\${classDirName} - not credited in README\`);
        return;
      }

      const classDir = path.join(typeDir, classDirName);
      const classAssetsStart = assets.length;

      const variantDirs = listNonUnderscoreDirs(classDir);
      variantDirs.forEach((variantDirName) => {
        const variantDir = path.join(classDir, variantDirName);
        const candidateFiles = collectCandidateFiles(variantDir);
        const imageFiles = candidateFiles.filter((filePath) => isImageFile(path.basename(filePath)));
        if (imageFiles.length === 0) return;

        const credits = section?.allCredits ?? [];
        if (credits.length === 0) {
          console.warn(\`⚠️  Skipping battle animation import: \${path.join(typeDirName, classDirName, variantDirName)} - no credits found\`);
          return;
        }

        const { variant, bodyTypes } = section
          ? matchVariantDirToReadme(variantDirName, section.jaidynVariants)
          : { variant: null, bodyTypes: [] };

        const previewFile = pickPreviewFromFiles(candidateFiles);
        const weaponDirs = listNonUnderscoreDirs(variantDir).filter((name) =>
          ['sword', 'axe', 'lance', 'dagger', 'magic', 'bow', 'staff', 'unarmed', 'handaxe'].includes(name.toLowerCase()),
        );

        const assetName = variant?.label ?? titleCaseFromSlug(variantDirName);

        assets.push({
          relativeDir: path.join('battle-animations', typeDirName, classDirName),
          fileSlug: slugifyUnderscore(variantDirName),
          data: {
            name: assetName,
            type: 'fe',
            path: \`battle-animations/\${typeDirName}/\${classDirName}\`,
            format: getFormatForPreview(previewFile, 'spritesheet'),
            license: section?.license || 'F2U, F2E',
            credits,
            animated: true,
            class: titleCaseFromSlug(classDirName),
            body_types: bodyTypes,
            weapon_types: weaponDirs,
            preview: previewFile ? relativePublicAssetPath(previewFile, publicRoot) : '',
            download: '',
          },
        });
      });

      if (assets.length > classAssetsStart) {
        classMetaEntries.push({
          relativeDir: path.join('battle-animations', typeDirName, classDirName),
          meta: buildMeta(titleCaseFromSlug(classDirName), (classIndex + 1) * 10),
        });
      }
    });

    if (assets.length > typeAssetsStart) {
      metas.push({
        relativeDir: path.join('battle-animations', typeDirName),
        meta: buildMeta(titleCaseFromSlug(typeDirName), (typeIndex + 1) * 10),
      });
      metas.push(...classMetaEntries);
    }
  });

  return { assets, metas };
}
`;

const lines = content.split('\n');

// Find line ranges to replace:
// 1. parseBattleAnimationReadmeMetadata: starts with "function parseBattleAnimationReadmeMetadata"
// 2. collectCreditsForBattleVariant: starts with "function collectCreditsForBattleVariant"
// 3. scanBattleAnimations: starts with "export function scanBattleAnimations"
// Each ends just before the next top-level function or export

function findLineRange(lines, startPattern) {
  const start = lines.findIndex((l) => startPattern.test(l));
  if (start === -1) return null;
  // Find end: next line that starts with "function " or "export function " at col 0
  let end = start + 1;
  while (end < lines.length && !/^(function |export function |export const )/.test(lines[end])) {
    end++;
  }
  return { start, end };
}

const parseRange = findLineRange(lines, /^function parseBattleAnimationReadmeMetadata/);
const collectRange = findLineRange(lines, /^function collectCreditsForBattleVariant/);
const scanRange = findLineRange(lines, /^export function scanBattleAnimations/);

console.log('parseRange:', parseRange);
console.log('collectRange:', collectRange);
console.log('scanRange:', scanRange);

// Replace in reverse order to preserve line numbers
const ranges = [scanRange, collectRange, parseRange].filter(Boolean).sort((a, b) => b.start - a.start);

let newLines = [...lines];

// Replace scanBattleAnimations
if (scanRange) {
  newLines = [...newLines.slice(0, scanRange.start), ...newScanFunc.split('\n'), ...newLines.slice(scanRange.end)];
}

// Recalculate collectRange and parseRange offsets after scanBattleAnimations replacement
// Actually, easier to do all replacements in one pass from bottom to top
const newLines2 = [...lines];
const replacements = [
  { range: scanRange, replacement: newScanFunc },
  { range: collectRange, replacement: '' }, // remove collectCreditsForBattleVariant
  { range: parseRange, replacement: newParseFunc },
].filter((r) => r.range).sort((a, b) => b.range.start - a.range.start);

let result = [...lines];
for (const { range, replacement } of replacements) {
  result = [...result.slice(0, range.start), ...replacement.split('\n'), ...result.slice(range.end)];
}

fs.writeFileSync(filePath, result.join('\n'), 'utf8');
console.log('Done. Replaced parseBattleAnimationReadmeMetadata, removed collectCreditsForBattleVariant, replaced scanBattleAnimations.');
