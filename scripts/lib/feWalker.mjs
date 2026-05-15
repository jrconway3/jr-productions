import fs from 'fs';
import path from 'path';
import {
  inferBodyTypeMarkers,
  inferWeaponVariant,
  isImageFile,
  parseCreditAuthorsFromBraces,
  relativePublicAssetPath,
  slugifyUnderscore,
  stripCreditsAndBodyMarkers,
  titleCaseFromSlug,
} from './fePathUtils.mjs';
import {
  normalizeMarkdownKey,
  parseAuthorsFromText,
  parseCreditsFile,
  readMarkdownSections,
} from './feCredits.mjs';

const IMAGE_PRIORITY = ['.gif', '.png', '.webp', '.jpg', '.jpeg'];
const CREDIT_FILENAMES = ['CREDITS.txt', 'CREDITS.md', 'README.md'];

function listNonUnderscoreDirs(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function collectCandidateFiles(rootDir) {
  const files = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('_')) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        files.push(fullPath);
      }
    }
  }

  if (fs.existsSync(rootDir)) walk(rootDir);
  return files;
}

function pickPreviewFromFiles(filePaths) {
  const images = filePaths.filter((filePath) => isImageFile(path.basename(filePath)));
  if (images.length === 0) return '';

  for (const ext of IMAGE_PRIORITY) {
    const preferred = images.find((filePath) => path.extname(filePath).toLowerCase() === ext);
    if (preferred) return preferred;
  }

  return images[0];
}

function pickMapPreview(filePaths) {
  const images = filePaths.filter((filePath) => isImageFile(path.basename(filePath)));
  if (images.length === 0) return '';

  const gif = images.find((filePath) => path.extname(filePath).toLowerCase() === '.gif');
  if (gif) return gif;

  const stand = images.find((filePath) => /-stand\.[^.]+$/i.test(path.basename(filePath)));
  if (stand) return stand;

  const walk = images.find((filePath) => /-walk\.[^.]+$/i.test(path.basename(filePath)));
  if (walk) return walk;

  return images[0];
}

function getFormatForPreview(previewPath, fallback = 'spritesheet') {
  if (!previewPath) return fallback;
  const ext = path.extname(previewPath).toLowerCase();
  if (ext === '.gif') return 'gif';
  return fallback;
}

function buildMeta(label, priority) {
  return {
    label,
    description: '',
    priority,
    accent: 'warm',
  };
}

function parseFirstExistingCredits(dirPath) {
  for (const fileName of CREDIT_FILENAMES) {
    const candidate = path.join(dirPath, fileName);
    const parsed = parseCreditsFile(candidate);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function parseLicenseFromLine(line) {
  const match = line.match(/\blicense\(s\)\s*:\s*(.+)$/i);
  return match ? match[1].trim() : '';
}

function extractSectionDescription(lines) {
  const chunks = [];
  let hasStarted = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (hasStarted) chunks.push('');
      continue;
    }
    if (line.startsWith('-')) break;

    hasStarted = true;
    chunks.push(line);
  }

  return chunks
    .join('\n')
    .split(/\n\s*\n/g)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

function firstHeadingMatchByKey(sections, key) {
  if (!key) return null;
  const normalizedTarget = normalizeMarkdownKey(key);
  if (!normalizedTarget) return null;

  return sections.find((section) => {
    const headingKey = normalizeMarkdownKey(section.title);
    if (!headingKey) return false;
    
    // Check for exact match
    if (headingKey === normalizedTarget) return true;
    
    // Split heading into words and check if target matches any word
    const headingWords = section.title.toLowerCase().split(/\W+/).filter(Boolean);
    return headingWords.some(word => {
      const normalizedWord = normalizeMarkdownKey(word);
      return normalizedWord === normalizedTarget;
    });
  }) ?? null;
}

function parsePortraitOffsets(lines) {
  const defaultOffsets = {
    blink: { offset_x: 0, offset_y: 0 },
    mouth_neutral: { offset_x: 0, offset_y: 0 },
    mouth_smile: { offset_x: 0, offset_y: 0 },
  };

  let activeOffsetLabel = null;

  for (const rawLine of lines) {
    const offsetHeader = rawLine.match(/^\s*-\s*Offsets(?:\s*\(([^)]+)\))?\s*:/i);
    if (offsetHeader) {
      activeOffsetLabel = offsetHeader[1] ? offsetHeader[1].trim().toLowerCase() : 'default';
      continue;
    }

    if (!activeOffsetLabel || activeOffsetLabel !== 'default') continue;

    const coordMatch = rawLine.match(/^\s*-\s*(Eyes|Mouth Neutral|Mouth Smile|Mouth)\s*:\s*(-?\d+)\s*,\s*(-?\d+)\s*$/i);
    if (!coordMatch) continue;

    const target = coordMatch[1].trim().toLowerCase();
    const offsetX = Number.parseInt(coordMatch[2], 10);
    const offsetY = Number.parseInt(coordMatch[3], 10);

    if (target === 'eyes') {
      defaultOffsets.blink = { offset_x: offsetX, offset_y: offsetY };
      continue;
    }

    if (target === 'mouth neutral') {
      defaultOffsets.mouth_neutral = { offset_x: offsetX, offset_y: offsetY };
      continue;
    }

    if (target === 'mouth smile') {
      defaultOffsets.mouth_smile = { offset_x: offsetX, offset_y: offsetY };
      continue;
    }

    if (target === 'mouth') {
      defaultOffsets.mouth_neutral = { offset_x: offsetX, offset_y: offsetY };
      defaultOffsets.mouth_smile = { offset_x: offsetX, offset_y: offsetY };
    }
  }

  return defaultOffsets;
}

function parsePortraitReadmeMetadata(sourceRoot) {
  const readmePath = path.join(sourceRoot, 'README.md');
  const sections = readMarkdownSections(readmePath).filter((section) => section.level >= 3 && section.level <= 4);

  return sections.map((section) => {
    const creditsLine = section.lines.find((line) => /^\s*-\s*Credits?\s*:/i.test(line.trim())) ?? '';
    const licenseLine = section.lines.find((line) => /\blicense\(s\)\s*:/i.test(line)) ?? '';
    const creditsAuthors = parseAuthorsFromText(creditsLine);

    return {
      ...section,
      description: extractSectionDescription(section.lines),
      credits: creditsAuthors.length > 0 ? [{ authors: creditsAuthors }] : [],
      license: parseLicenseFromLine(licenseLine),
      offsets: parsePortraitOffsets(section.lines),
    };
  });
}

function parseMapReadmeMetadata(sourceRoot) {
  const readmePath = path.join(sourceRoot, 'README.md');
  const sections = readMarkdownSections(readmePath).filter((section) => section.level === 3);
  const byFileName = new Map();

  for (const section of sections) {
    const description = extractSectionDescription(section.lines);
    let license = '';
    let filenames = [];
    const tilesets = [];
    let currentTileset = null;

    for (const line of section.lines) {
      const tilesetMatch = line.match(/^\s*-\s*Tileset\s*:\s*(.+)$/i);
      if (tilesetMatch) {
        currentTileset = { type: tilesetMatch[1].trim(), authors: new Set() };
        tilesets.push(currentTileset);
        continue;
      }

      if (currentTileset && /made by\s*:?/i.test(line)) {
        for (const author of parseAuthorsFromText(line)) currentTileset.authors.add(author);
        continue;
      }

      const parsedLicense = parseLicenseFromLine(line);
      if (parsedLicense) license = parsedLicense;

      const fileMatch = line.match(/\bfilename\(s\)\s*:\s*(.+)$/i);
      if (fileMatch) {
        filenames = fileMatch[1]
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);
      }
    }

    const credits = tilesets
      .filter((t) => t.authors.size > 0)
      .map((t) => ({ type: t.type, authors: [...t.authors] }));

    for (const fileName of filenames) {
      byFileName.set(fileName.toLowerCase(), {
        name: section.title.trim(),
        description,
        credits,
        license,
      });
    }
  }

  return byFileName;
}

function parseAutotileReadmeMetadata(sourceRoot) {
  const readmePath = path.join(sourceRoot, 'README.md');
  const sections = readMarkdownSections(readmePath).filter((section) => section.level === 2 || section.level === 3);
  let currentParentKey = null;

  return sections.map((section) => {
    const creditsAuthors = new Set();
    let license = '';

    for (const line of section.lines) {
      if (/\bby\s*:?/i.test(line)) {
        for (const author of parseAuthorsFromText(line)) creditsAuthors.add(author);
      }
      const parsedLicense = parseLicenseFromLine(line);
      if (parsedLicense) license = parsedLicense;
    }

    if (section.level === 2) {
      currentParentKey = normalizeMarkdownKey(section.title);
    }

    return {
      level: section.level,
      parentKey: section.level === 3 ? currentParentKey : null,
      title: section.title,
      key: normalizeMarkdownKey(section.title),
      description: extractSectionDescription(section.lines),
      credits: creditsAuthors.size > 0 ? [{ authors: [...creditsAuthors] }] : [],
      license,
    };
  });
}


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
      if (/^\s{0,3}-\s/.test(line)) {
        const itemText = line.replace(/^\s{0,3}-\s+/, '').trim();
        if (/^lt fixes/i.test(itemText)) {
          currentVariant = null;
          continue;
        }
        const typeAndLabel = itemText.match(/^([^:]+):\s*(.*)$/);
        const variantType = typeAndLabel ? typeAndLabel[1].trim() : '';
        const rawLabel = typeAndLabel ? typeAndLabel[2].trim() : itemText;
        const variantCategoryKey = normalizeMarkdownKey(variantType);
        const isWeaponCategoryLine = /^weapons?\s*:/i.test(itemText);
        // Strip trailing " by Author" attribution from freeform labels
        let variantLabel = rawLabel.replace(/\s+by\s+\S+.*$/i, '').trim();

        // "Weapons: ..." headings are category labels, not the base variant name.
        // Weapon-specific labels come from the nested "Weapons:" list item and folders.
        if (variantCategoryKey === 'weapons' || isWeaponCategoryLine) {
          variantLabel = '';
        }

        currentVariant = {
          type: variantType,
          categoryKey: variantCategoryKey,
          label: variantLabel,
          authors: new Set(),
          bodyTypes: [],
          weaponTypes: [],
        };
        variants.push(currentVariant);
        continue;
      }

      // Sub-item (4+ leading spaces before dash) = belongs to current variant
      if (currentVariant && /^\s{4,}-\s/.test(line)) {
        if (/^\s*-\s*by\s*:?\s*/i.test(line)) {
          for (const author of parseAuthorsFromText(line)) {
            currentVariant.authors.add(author);
            if (author.toLowerCase() === 'jaidynreiman') hasJaidynVariant = true;
          }
        }
        const bodyMatch = line.match(/^\s*-\s*body types?\s*:\s*(.+)$/i);
        if (bodyMatch) {
          currentVariant.bodyTypes = bodyMatch[1].split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        }
        const weaponMatch = line.match(/^\s*-\s*weapons?\s*:\s*(.+)$/i);
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

    const seen = new Set();
    const allCredits = variants
      .filter((v) => v.authors.size > 0)
      .map((v) => ({ type: v.label || v.type, authors: [...v.authors].sort() }))
      .filter((c) => {
        const key = `${c.type}|${c.authors.join(',')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

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
    if (entry === null && key === normalizedClass) return null;
  }
  // Find best matching section by word overlap (ignoring tier prefixes like t1, t2)
  const dirWords = classDirName.toLowerCase().split(/[_\s-]+/).filter((w) => w.length > 2 && !/^t\d+$/.test(w));
  let bestEntry = null;
  let bestScore = 0;
  for (const [, entry] of byKey) {
    if (!entry) continue;
    const titleWords = entry.title.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
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

  const namedVariants = jaidynVariants.filter((v) => {
    const category = normalizeMarkdownKey(v.type);
    const isWeaponCategory = category === 'weapon' || category === 'weapons';
    return !isWeaponCategory && Boolean(normalizeMarkdownKey(v.label));
  });
  const candidates = namedVariants.length > 0
    ? namedVariants
    : jaidynVariants.filter((v) => Boolean(normalizeMarkdownKey(v.label)));
  if (candidates.length === 0) return { variant: null, bodyTypes: [] };

  const bodyTypeWords = new Set(['male', 'female', 'universal', 'monster']);
  const dirWords = variantDirName.toLowerCase().split(/[_\s-]+/).filter(Boolean);
  const identifyingWords = dirWords.filter((w) => !bodyTypeWords.has(w));
  const bodyTypesFromDir = dirWords.filter((w) => bodyTypeWords.has(w));

  if (identifyingWords.length > 0) {
    for (const variant of candidates) {
      const normalizedLabel = normalizeMarkdownKey(variant.label);
      if (identifyingWords.every((w) => normalizedLabel.includes(normalizeMarkdownKey(w)))) {
        return { variant, bodyTypes: bodyTypesFromDir.length > 0 ? bodyTypesFromDir : variant.bodyTypes };
      }
    }
  }

  // If the directory is only a sex folder (e.g. male/female), do not guess a label.
  // This avoids assigning weapon-entry headings like "Bow" as the base variant name.
  if (identifyingWords.length === 0) {
    return { variant: null, bodyTypes: bodyTypesFromDir };
  }

  // Fall back: match by body type only when unambiguous.
  if (bodyTypesFromDir.length > 0) {
    const bodyMatches = candidates.filter((v) => v.bodyTypes.some((bt) => bodyTypesFromDir.includes(bt)));
    if (bodyMatches.length === 1) return { variant: bodyMatches[0], bodyTypes: bodyTypesFromDir };
  }

  // Final fallback: first named non-weapon entry.
  return {
    variant: candidates[0],
    bodyTypes: bodyTypesFromDir.length > 0 ? bodyTypesFromDir : candidates[0].bodyTypes,
  };
}

function normalizeBattleWeaponKey(dirName) {
  const key = dirName.toLowerCase();
  if (key.startsWith('handaxe')) return 'handaxe';
  if (key.startsWith('axe')) return 'axe';
  if (key.startsWith('lance')) return 'lance';
  if (key.startsWith('sword')) return 'sword';
  if (key.startsWith('bow')) return 'bow';
  if (key.startsWith('dagger')) return 'dagger';
  if (key.startsWith('staff')) return 'staff';
  if (key.startsWith('magic') || key.includes('magus')) return 'magic';
  if (key.startsWith('unarmed')) return 'unarmed';
  return null;
}

function getBattleWeaponDisplayName(dirName, weaponKey) {
  const lowered = dirName.toLowerCase();
  const baseDisplay = weaponKey ? titleCaseFromSlug(weaponKey) : titleCaseFromSlug(dirName.replace(/_fixed$/i, ''));

  if (/_alt$/i.test(lowered)) {
    return `${baseDisplay} Alt`;
  }

  return baseDisplay;
}

function composeBattleBaseName(baseName, classDirName) {
  const cleanedClass = titleCaseFromSlug(classDirName).replace(/\bReskin\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  if (!cleanedClass) return baseName;
  const classWords = new Set(cleanedClass.toLowerCase().split(/\s+/).filter(Boolean));
  const filteredBase = baseName.split(/\s+/).filter((w) => !classWords.has(w.toLowerCase())).join(' ').trim();
  return (filteredBase ? `${cleanedClass} ${filteredBase}` : cleanedClass).replace(/\s{2,}/g, ' ').trim();
}



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
        console.warn(`⚠️  Skipping battle animation: ${typeDirName}/${classDirName} - not credited in README`);
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
          console.warn(`⚠️  Skipping battle animation import: ${path.join(typeDirName, classDirName, variantDirName)} - no credits found`);
          return;
        }

        const { variant, bodyTypes } = section
          ? matchVariantDirToReadme(variantDirName, section.jaidynVariants)
          : { variant: null, bodyTypes: [] };

        const previewFile = pickPreviewFromFiles(candidateFiles);
        const weaponDirs = listNonUnderscoreDirs(variantDir).filter((name) => normalizeBattleWeaponKey(name) !== null);

        const isBodyTypeOnlyDir = /^(male|female|universal|monster)$/i.test(variantDirName);
        const variantDirWords = variantDirName.toLowerCase().split(/[_\s-]+/).filter(Boolean);
        let assetName = variant?.label ?? titleCaseFromSlug(variantDirName);
        let genderSuffix = '';
        for (const bodyType of bodyTypes) {
          if (bodyType === 'male' || bodyType === 'female') {
            assetName = assetName.replace(new RegExp(`\\b${bodyType}\\b`, 'ig'), ' ');
            if (!isBodyTypeOnlyDir && variantDirWords.includes(bodyType)) {
              genderSuffix = bodyType === 'male' ? ' (M)' : ' (F)';
            }
          }
        }
        assetName = assetName.replace(/\b(handaxe|magic|staff|bow|sword|axe|lance|dagger|unarmed)\b/ig, ' ');
        if ((variant?.weaponTypes?.length ?? 0) > 1 && /\//.test(assetName)) {
          const escapedWeapons = (variant?.weaponTypes ?? [])
            .map((weapon) => weapon.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
          if (escapedWeapons.length > 0) {
            const weaponTokenPattern = new RegExp(`\\b(?:${escapedWeapons.join('|')})\\b`, 'ig');
            assetName = assetName
              .replace(weaponTokenPattern, '')
              .replace(/\s*\/\s*/g, ' ')
              .replace(/[\s,/-]+$/g, ' ');
          }
        }
        assetName = assetName.replace(/\s{2,}/g, ' ').trim();
        if (!assetName) {
          if (variant?.label) assetName = variant.label;
          else assetName = isBodyTypeOnlyDir ? '' : titleCaseFromSlug(variantDirName);
        }
        if (isBodyTypeOnlyDir) {
          assetName = '';
        }

        const weaponEntries = weaponDirs
          .map((dirName) => ({
            dirName,
            weaponKey: normalizeBattleWeaponKey(dirName),
            weaponDisplay: getBattleWeaponDisplayName(dirName, normalizeBattleWeaponKey(dirName)),
          }))
          .filter((entry) => entry.weaponKey && entry.weaponKey !== 'unarmed');

        const weaponVariants = [];
        const weaponTypes = new Set();
        for (const weaponEntry of weaponEntries) {
          const weaponDirPath = path.join(variantDir, weaponEntry.dirName);
          const weaponFiles = collectCandidateFiles(weaponDirPath).filter((filePath) => isImageFile(path.basename(filePath)));
          if (weaponFiles.length === 0) continue;

          const weaponPreview = pickPreviewFromFiles(weaponFiles);
          if (!weaponPreview) continue;

          weaponTypes.add(weaponEntry.weaponKey);
          weaponVariants.push({
            id: slugifyUnderscore(weaponEntry.dirName),
            weapon: weaponEntry.weaponKey,
            label: weaponEntry.weaponDisplay,
            preview: relativePublicAssetPath(weaponPreview, publicRoot),
          });
        }

        const cardName = composeBattleBaseName(assetName, classDirName) + genderSuffix;
        const fallbackPreview = weaponVariants[0]?.preview ?? (previewFile ? relativePublicAssetPath(previewFile, publicRoot) : '');

        assets.push({
          relativeDir: path.join('battle-animations', typeDirName, classDirName),
          fileSlug: slugifyUnderscore(variantDirName),
          data: {
            name: cardName,
            type: 'fe',
            path: `battle-animations/${typeDirName}/${classDirName}`,
            format: getFormatForPreview(previewFile, 'spritesheet'),
            animation_spec: 'fe/battle',
            license: section?.license || 'F2U, F2E',
            credits,
            animated: true,
            class: titleCaseFromSlug(classDirName),
            body_types: bodyTypes,
            weapon_types: [...weaponTypes],
            weapon_variants: weaponVariants,
            preview: fallbackPreview,
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

export function scanPortraits(sourceRoot, publicRoot) {
  const assets = [];
  const metas = [];
  const readmeEntries = parsePortraitReadmeMetadata(sourceRoot);
  const tierDirs = listNonUnderscoreDirs(sourceRoot);

  tierDirs.forEach((tierName, tierIndex) => {
    const tierDir = path.join(sourceRoot, tierName);
    const tierAssetsStart = assets.length;

    const charDirs = listNonUnderscoreDirs(tierDir);
    charDirs.forEach((charDirName) => {
      const charDir = path.join(tierDir, charDirName);
      const charEntries = fs.readdirSync(charDir, { withFileTypes: true });
      const baseSection = firstHeadingMatchByKey(readmeEntries, titleCaseFromSlug(charDirName));

      // Parent character asset: include only files directly in the character directory.
      const rootImagePaths = charEntries
        .filter((entry) => entry.isFile() && !entry.name.startsWith('_') && isImageFile(entry.name))
        .map((entry) => path.join(charDir, entry.name));

      if (rootImagePaths.length > 0) {
        const previewFile = pickPreviewFromFiles(rootImagePaths);
        const variants = rootImagePaths
          .map((filePath) => path.basename(filePath, path.extname(filePath)).replace(/\{[^}]*\}/g, '').trim())
          .filter(Boolean);

        const credits = baseSection?.credits ?? [];

        // Skip if no credits found
        if (credits.length === 0) {
          console.warn(`⚠️  Skipping portrait import: ${path.join(tierName, charDirName)} - no credits found in README`);
        } else {
          assets.push({
            relativeDir: path.join('portraits', tierName.toLowerCase()),
            fileSlug: slugifyUnderscore(charDirName),
            data: {
              name: titleCaseFromSlug(charDirName),
              type: 'fe',
              path: `portraits/${tierName.toLowerCase()}`,
              format: 'portrait',
              animation_spec: 'fe/portrait',
              license: baseSection?.license || 'F2U, F2E',
              credits,
              description: baseSection?.description || undefined,
              variants: [...new Set(variants)],
              preview: previewFile ? relativePublicAssetPath(previewFile, publicRoot) : '',
              cutouts: baseSection?.offsets ?? {
                blink: { offset_x: 0, offset_y: 0 },
                mouth_neutral: { offset_x: 0, offset_y: 0 },
                mouth_smile: { offset_x: 0, offset_y: 0 },
              },
              download: '',
            },
          });
        }
      }

      // Any non-underscore subdirectory becomes its own separate portrait asset.
      const childDirs = charEntries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));

      for (const childDirName of childDirs) {
        const childDir = path.join(charDir, childDirName);
        const childFiles = collectCandidateFiles(childDir);
        const childImageFiles = childFiles.filter((filePath) => isImageFile(path.basename(filePath)));
        if (childImageFiles.length === 0) continue;

        const previewFile = pickPreviewFromFiles(childImageFiles);
        const variants = childImageFiles
          .map((filePath) => path.basename(filePath, path.extname(filePath)).replace(/\{[^}]*\}/g, '').trim())
          .filter(Boolean);

        const childSection = firstHeadingMatchByKey(readmeEntries, `${titleCaseFromSlug(charDirName)} ${titleCaseFromSlug(childDirName)}`);
        const credits = childSection?.credits ?? baseSection?.credits ?? [];

        // Skip if no credits found
        if (credits.length === 0) {
          console.warn(`⚠️  Skipping portrait import: ${path.join(tierName, charDirName, childDirName)} - no credits found in README`);
          continue;
        }

        assets.push({
          relativeDir: path.join('portraits', tierName.toLowerCase()),
          fileSlug: `${slugifyUnderscore(charDirName)}_${slugifyUnderscore(childDirName)}`,
          data: {
            name: `${titleCaseFromSlug(charDirName)} ${titleCaseFromSlug(childDirName)}`,
            type: 'fe',
            path: `portraits/${tierName.toLowerCase()}`,
            format: 'portrait',
            animation_spec: 'fe/portrait',
            license: childSection?.license || baseSection?.license || 'F2U, F2E',
            credits,
            description: childSection?.description || baseSection?.description || undefined,
            variants: [...new Set(variants)],
            preview: previewFile ? relativePublicAssetPath(previewFile, publicRoot) : '',
            cutouts: childSection?.offsets
              ?? baseSection?.offsets
              ?? {
                blink: { offset_x: 0, offset_y: 0 },
                mouth_neutral: { offset_x: 0, offset_y: 0 },
                mouth_smile: { offset_x: 0, offset_y: 0 },
              },
            download: '',
          },
        });
      }
    });

    if (assets.length > tierAssetsStart) {
      metas.push({
        relativeDir: path.join('portraits', tierName.toLowerCase()),
        meta: buildMeta(titleCaseFromSlug(tierName), (tierIndex + 1) * 10),
      });
    }
  });

  return { assets, metas };
}

function parseMapSpriteFileName(fileName) {
  const stem = path.basename(fileName, path.extname(fileName));
  const hyphenIndex = stem.indexOf('-');
  const basePart = hyphenIndex >= 0 ? stem.slice(0, hyphenIndex) : stem;
  const animationPart = hyphenIndex >= 0 ? stem.slice(hyphenIndex + 1).trim().toLowerCase() : '';

  const creditsAuthors = parseCreditAuthorsFromBraces(basePart);
  const bodyTypes = inferBodyTypeMarkers(basePart);

  const nameWithoutCreditsAndMarkers = stripCreditsAndBodyMarkers(basePart).replace(/\s+/g, ' ').trim();
  const slug = slugifyUnderscore(nameWithoutCreditsAndMarkers);
  const variant = inferWeaponVariant(nameWithoutCreditsAndMarkers);

  return {
    slug,
    displayName: nameWithoutCreditsAndMarkers || stem,
    animation: animationPart,
    creditsAuthors,
    bodyTypes,
    variant,
  };
}

function parseMapSpriteReadmeMetadata(publicRoot) {
  const readmePath = path.join(publicRoot, 'assets', 'fe', 'map_sprites', 'README.md');
  const sections = readMarkdownSections(readmePath).filter((section) => section.level === 4);

  // Returns Map<slug, { title, label, credits, license, description, walkFallbacks, standSpec? }>
  const bySlug = new Map();

  function normalizeStandSpecName(rawValue) {
    const value = rawValue.trim().toLowerCase().replace(/\s+/g, '_');
    if (!value) return null;
    if (value === 'stand') return 'stand';
    if (value.startsWith('stand_')) return value;
    if (value.startsWith('fe_stand_')) return value.replace(/^fe_/, '');
    if (value.startsWith('fe_')) return `stand_${value.slice('fe_'.length)}`;
    return `stand_${value}`;
  }

  for (const section of sections) {
    const headingLabel = section.title.trim();
    let classname = null;
    const variants = [];
    let currentVariant = null;
    let inPoses = false;
    let sectionLicense = '';

    for (const line of section.lines) {
      // Top-level Class: line (0-indent)
      const classMatch = line.match(/^-\s*Class:\s*(.+)$/i);
      if (classMatch) {
        classname = classMatch[1].trim();
        continue;
      }

      // Top-level variant bullets (0-indent): - Type: Name?
      const topLevelMatch = line.match(/^-\s*([^:]+):\s*(.*)$/);
      if (topLevelMatch) {
        inPoses = false;
        currentVariant = {
          type: topLevelMatch[1].trim(),
          name: topLevelMatch[2].trim(),
          authors: new Set(),
          bodyTypes: [],
          weapons: [],
          standPoses: [],
          walkPoses: [],
          standSpec: null,
          license: '',
        };
        variants.push(currentVariant);
        continue;
      }

      if (!currentVariant) continue;

      // 4-space sub-items
      if (/^ {4}-/.test(line)) {
        const content = line.replace(/^ {4}-\s*/, '').trim();
        inPoses = false;
        if (/^by\b/i.test(content)) {
          for (const author of parseAuthorsFromText(line)) currentVariant.authors.add(author);
        } else if (/^Body Types?:/i.test(content)) {
          currentVariant.bodyTypes = content.replace(/^Body Types?:\s*/i, '')
            .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
        } else if (/^Weapons?:/i.test(content)) {
          currentVariant.weapons = content.replace(/^Weapons?:\s*/i, '')
            .split(',').map((s) => s.trim()).filter(Boolean);
        } else if (/^Stand\s+Spec:/i.test(content)) {
          const specText = content.replace(/^Stand\s+Spec:\s*/i, '').trim();
          currentVariant.standSpec = normalizeStandSpecName(specText);
        } else if (/^Poses:$/i.test(content)) {
          inPoses = true;
        } else {
          const parsedLicense = parseLicenseFromLine(line);
          if (parsedLicense) { sectionLicense = parsedLicense; currentVariant.license = parsedLicense; }
        }
        continue;
      }

      // 8-space pose items (under Poses:)
      if (inPoses && /^ {8}-/.test(line)) {
        const content = line.replace(/^ {8}-\s*/, '').trim();
        const standMatch = content.match(/^Stand(?:\s*\(([^)]+)\))?:\s*(.+)$/i);
        if (standMatch) {
          const specOverride = standMatch[1]?.trim();
          if (specOverride) {
            const normalized = normalizeStandSpecName(specOverride);
            if (normalized) currentVariant.standSpec = normalized;
          }
          currentVariant.standPoses = standMatch[2].split(',').map((s) => s.trim()).filter(Boolean);
        }
        const walkMatch = content.match(/^Walk:\s*(.+)$/i);
        if (walkMatch) currentVariant.walkPoses = walkMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      }
    }

    if (!classname) continue;

    const jaidynVariants = variants.filter((v) =>
      [...v.authors].some((a) => a.toLowerCase() === 'jaidynreiman'),
    );
    if (jaidynVariants.length === 0) continue;

    const allCredits = variants
      .filter((v) => v.authors.size > 0)
      .map((v) => ({
        type: v.name ? `${v.type}: ${v.name}`.replace(/:\s*$/, '') : v.type,
        authors: [...v.authors],
      }));

    const description = extractSectionDescription(section.lines);

    for (const jv of jaidynVariants) {
      const weapons = jv.weapons.length > 0 ? jv.weapons : ['Unarmed'];
      const standPoses = jv.standPoses.length > 0 ? jv.standPoses : [jv.name || classname];
      const walkPoses = jv.walkPoses.length > 0 ? jv.walkPoses : standPoses;
      const license = jv.license || sectionLicense;
      const standSpec = jv.standSpec;

      for (const weapon of weapons) {
        const isUnarmed = weapon.toLowerCase() === 'unarmed';
        const weaponSuffix = isUnarmed ? '' : ` ${weapon}`;
        const assetLabel = weaponSuffix ? `${headingLabel}${weaponSuffix}` : headingLabel;

        // Walk fallbacks: slugs to search for when this group has no walk file
        const walkFallbacks = walkPoses.map((wp) => {
          if (/\([MFU]\)/i.test(wp)) {
            // Full override stem: strip gender marker to get slug base
            return slugifyUnderscore(stripCreditsAndBodyMarkers(wp).replace(/\s+/g, ' ').trim());
          }
          const wpNorm = normalizeMarkdownKey(wp);
          const classNorm = normalizeMarkdownKey(classname);
          return slugifyUnderscore(wpNorm === classNorm ? classname : `${classname} ${wp}`);
        });

        for (const standPose of standPoses) {
          let fileBase;
          if (/\([MFU]\)/i.test(standPose)) {
            fileBase = stripCreditsAndBodyMarkers(standPose).replace(/\s+/g, ' ').trim();
            if (weaponSuffix) fileBase += weaponSuffix;
          } else if (normalizeMarkdownKey(standPose) === normalizeMarkdownKey(classname)) {
            fileBase = `${classname}${weaponSuffix}`;
          } else {
            fileBase = `${classname} ${standPose}${weaponSuffix}`;
          }

          const slug = slugifyUnderscore(fileBase.replace(/\s+/g, ' ').trim());
          if (!bySlug.has(slug)) {
            bySlug.set(slug, {
              title: headingLabel,
              label: assetLabel,
              credits: allCredits,
              license,
              description,
              walkFallbacks,
              ...(standSpec ? { standSpec } : {}),
            });
          }

          // Also register the weaponless slug as a fallback so files without weapon suffix still resolve
          if (!isUnarmed) {
            let weaponlessBase;
            if (/\([MFU]\)/i.test(standPose)) {
              weaponlessBase = stripCreditsAndBodyMarkers(standPose).replace(/\s+/g, ' ').trim();
            } else if (normalizeMarkdownKey(standPose) === normalizeMarkdownKey(classname)) {
              weaponlessBase = classname;
            } else {
              weaponlessBase = `${classname} ${standPose}`;
            }
            const weaponlessSlug = slugifyUnderscore(weaponlessBase.replace(/\s+/g, ' ').trim());
            if (!bySlug.has(weaponlessSlug)) {
              bySlug.set(weaponlessSlug, {
                title: headingLabel,
                label: headingLabel,
                credits: allCredits,
                license,
                description,
                walkFallbacks,
                ...(standSpec ? { standSpec } : {}),
              });
            }
          }
        }
      }
    }
  }

  return bySlug;
}

export function scanMapSprites(sourceRoot, publicRoot) {
  const assets = [];
  const metas = [];
  const typeDirs = listNonUnderscoreDirs(sourceRoot);
  const readmeMetadata = parseMapSpriteReadmeMetadata(publicRoot);

  typeDirs.forEach((typeName, typeIndex) => {
    const typeDir = path.join(sourceRoot, typeName);
    const typeAssetsStart = assets.length;

    // Pre-index all walk files in this directory by slug for walk-fallback resolution
    const walkFilesBySlug = new Map();
    {
      const allEntries = fs.readdirSync(typeDir, { withFileTypes: true });
      for (const entry of allEntries) {
        if (!entry.isFile() || !isImageFile(entry.name)) continue;
        const parsed = parseMapSpriteFileName(entry.name);
        if ((parsed.animation === 'walk' || parsed.animation === 'move') && parsed.slug) {
          if (!walkFilesBySlug.has(parsed.slug)) {
            walkFilesBySlug.set(parsed.slug, path.join(typeDir, entry.name));
          }
        }
      }
    }

    const entries = fs.readdirSync(typeDir, { withFileTypes: true });
    const grouped = new Map();

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!isImageFile(entry.name)) continue;

      const parsed = parseMapSpriteFileName(entry.name);
      if (!parsed.slug) continue;

      const key = parsed.slug;
      if (!grouped.has(key)) {
        grouped.set(key, {
          slug: key,
          name: parsed.displayName,
          files: [],
          animations: new Set(),
          bodyTypes: new Set(),
          variants: new Set(),
          authors: new Set(),
        });
      }

      const group = grouped.get(key);
      group.files.push(path.join(typeDir, entry.name));
      if (parsed.animation) group.animations.add(parsed.animation);
      for (const bodyType of parsed.bodyTypes) group.bodyTypes.add(bodyType);
      group.variants.add(parsed.variant);
      for (const author of parsed.creditsAuthors) group.authors.add(author);
    }

    for (const group of grouped.values()) {
      const previewFile = pickMapPreview(group.files);
      const animations = [...group.animations];
      const normalizedAnimations = [];
      const animationSources = new Map();
      if (animations.includes('stand')) normalizedAnimations.push('stand');
      if (animations.includes('move')) normalizedAnimations.push('move');
      if (animations.includes('walk') && !normalizedAnimations.includes('move')) normalizedAnimations.push('move');

      for (const filePath of group.files) {
        const parsed = parseMapSpriteFileName(path.basename(filePath));
        const normalizedAnimation = parsed.animation === 'walk' ? 'move' : parsed.animation;
        if (!normalizedAnimation) continue;
        if (!animationSources.has(normalizedAnimation)) {
          animationSources.set(normalizedAnimation, filePath);
        }
      }

      // Direct slug lookup — README parser generates expected slugs from Class + variant + weapon
      const readmeData = readmeMetadata.get(group.slug) ?? null;

      // If no walk file in this group, try README walkFallbacks
      if (!animationSources.has('move') && readmeData?.walkFallbacks?.length) {
        for (const fallbackSlug of readmeData.walkFallbacks) {
          const walkFile = walkFilesBySlug.get(fallbackSlug);
          if (walkFile) {
            animationSources.set('move', walkFile);
            if (!normalizedAnimations.includes('move')) normalizedAnimations.push('move');
            break;
          }
        }
      }

      const finalCredits = readmeData?.credits?.length > 0
        ? readmeData.credits.map((c) => ({ ...c, notes: c.type }))
        : [];
      const standSpecOverride = readmeData?.standSpec
        ? readmeData.standSpec
        : undefined;

      // Only import map sprites with credits from the main README metadata.
      if (finalCredits.length === 0) {
        console.warn(`⚠️  Skipping map sprite import: ${path.join(typeName, group.slug)} - no credits found in main README`);
        continue;
      }

      assets.push({
        relativeDir: path.join('map-sprites', typeName),
        fileSlug: group.slug,
        data: {
          name: readmeData?.label ?? titleCaseFromSlug(group.name),
          type: 'fe',
          path: `map-sprites/${typeName}`,
          format: 'spritesheet',
          animation_spec: 'fe/map_sprite',
          license: readmeData?.license || 'F2U, F2E',
          body_types: [...group.bodyTypes],
          credits: finalCredits,
          animations: normalizedAnimations,
          animation_sources: Object.fromEntries(
            [...animationSources.entries()].map(([animation, filePath]) => [animation, relativePublicAssetPath(filePath, publicRoot)]),
          ),
          ...(standSpecOverride ? { map_sprite_stand_spec: standSpecOverride } : {}),
          variants: [...group.variants],
          preview: previewFile ? relativePublicAssetPath(previewFile, publicRoot) : '',
          download: '',
          description: readmeData?.description || '',
        },
      });
    }

    if (assets.length > typeAssetsStart) {
      metas.push({
        relativeDir: path.join('map-sprites', typeName),
        meta: buildMeta(titleCaseFromSlug(typeName), (typeIndex + 1) * 10),
      });
    }
  });

  return { assets, metas };
}

function scanGenericCategory(sourceRoot, publicRoot, categoryPath, format, includeSubcategoryMeta = true) {
  const assets = [];
  const metas = [];

  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });

  const rootImageFiles = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('_') && isImageFile(entry.name))
    .map((entry) => entry.name);

  for (const fileName of rootImageFiles) {
    const fullPath = path.join(sourceRoot, fileName);
    const slug = slugifyUnderscore(path.basename(fileName, path.extname(fileName)));
    assets.push({
      relativeDir: categoryPath,
      fileSlug: slug,
      data: {
        name: titleCaseFromSlug(path.basename(fileName, path.extname(fileName))),
        type: 'fe',
        path: categoryPath,
        format,
        license: 'F2U, F2E',
        credits: [],
        preview: relativePublicAssetPath(fullPath, publicRoot),
        download: '',
      },
    });
  }

  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  dirs.forEach((dirName, index) => {
    const fullDir = path.join(sourceRoot, dirName);
    const files = collectCandidateFiles(fullDir);
    const imageFiles = files.filter((filePath) => isImageFile(path.basename(filePath)));
    if (imageFiles.length === 0) return;

    if (includeSubcategoryMeta) {
      metas.push({
        relativeDir: path.join(categoryPath, dirName.toLowerCase()),
        meta: buildMeta(titleCaseFromSlug(dirName), (index + 1) * 10),
      });
    }

    const previewFile = pickPreviewFromFiles(files);

    assets.push({
      relativeDir: categoryPath,
      fileSlug: slugifyUnderscore(dirName),
      data: {
        name: titleCaseFromSlug(dirName),
        type: 'fe',
        path: categoryPath,
        format: getFormatForPreview(previewFile, format),
        license: 'F2U, F2E',
        credits: parseCreditsFile(path.join(fullDir, 'CREDITS.txt')),
        preview: previewFile ? relativePublicAssetPath(previewFile, publicRoot) : '',
        download: '',
      },
    });
  });

  return { assets, metas };
}

export function scanAutotiles(sourceRoot, publicRoot) {
  const readmeEntries = parseAutotileReadmeMetadata(sourceRoot);
  const assets = [];
  const metas = [];
  const topLevelEntries = readmeEntries.filter((entry) => entry.level === 2);

  const tokenize = (value) => value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 3);

  const wordsMatch = (left, right) => (
    left === right
    || left.startsWith(right)
    || right.startsWith(left)
    || left.includes(right)
    || right.includes(left)
  );

  const overlapScore = (a, b) => {
    if (a.length === 0 || b.length === 0) return 0;
    let score = 0;
    for (const left of a) {
      for (const right of b) {
        if (wordsMatch(left, right)) {
          score += 1;
          break;
        }
      }
    }
    return score;
  };

  const metadataScore = (fileStem, candidate) => {
    const fileWords = tokenize(fileStem);
    const candidateWords = tokenize(candidate.title);
    let score = overlapScore(fileWords, candidateWords);

    const compactFile = fileStem.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const compactKey = candidate.key.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (compactFile.includes(compactKey)) score += 5;

    return score;
  };

  const childSpecificScore = (fileStem, parent, child) => {
    if (!parent) return 0;

    const fileWords = tokenize(fileStem);
    const parentWords = tokenize(parent.title);
    const childWords = tokenize(child.title);
    const specificWords = childWords.filter(
      (childWord) => !parentWords.some((parentWord) => wordsMatch(childWord, parentWord)),
    );

    let score = overlapScore(fileWords, specificWords);

    const compactFile = fileStem.toLowerCase().replace(/[^a-z0-9]+/g, '');
    for (let index = 0; index < childWords.length - 1; index += 1) {
      const pair = `${childWords[index]}${childWords[index + 1]}`;
      if (pair.length >= 8 && compactFile.includes(pair)) score += 2;
    }

    return score;
  };

  const dirNames = listNonUnderscoreDirs(sourceRoot);
  dirNames.forEach((dirName, index) => {
    const dirPath = path.join(sourceRoot, dirName);
    const files = fs.readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && isImageFile(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) return;

    metas.push({
      relativeDir: path.join('autotiles', dirName.toLowerCase()),
      meta: buildMeta(titleCaseFromSlug(dirName), (index + 1) * 10),
    });

    const dirWords = tokenize(dirName);
    let bestSection = null;
    let bestSectionScore = 0;
    for (const entry of topLevelEntries) {
      const score = overlapScore(dirWords, tokenize(entry.title));
      if (score > bestSectionScore) {
        bestSectionScore = score;
        bestSection = entry;
      }
    }

    const childEntries = bestSection
      ? readmeEntries.filter((entry) => entry.level === 3 && entry.parentKey === bestSection.key)
      : [];
    const metadataCandidates = bestSection ? [bestSection, ...childEntries] : topLevelEntries;

    for (const fileName of files) {
      const filePath = path.join(dirPath, fileName);
      const fileStem = path.basename(fileName, path.extname(fileName));

      let bestMetadata = bestSection;
      let bestMetadataScore = 0;

      const normalizedStem = fileStem.toLowerCase();
      let bestChildMetadata = null;
      if (normalizedStem.includes('superfields') || normalizedStem.includes('super_fields')) {
        bestChildMetadata = childEntries.find((child) => /\bsuper\b.*\bfields\b/i.test(child.title)) || null;
      } else if (normalizedStem.includes('additional') && normalizedStem.includes('palette')) {
        bestChildMetadata = childEntries.find((child) => /\badditional\b.*\bpalettes?\b/i.test(child.title)) || null;
      }

      let bestChildScore = bestChildMetadata ? Number.MAX_SAFE_INTEGER : 0;
      for (const child of childEntries) {
        const childScore = childSpecificScore(fileStem, bestSection, child);
        if (childScore > bestChildScore) {
          bestChildScore = childScore;
          bestChildMetadata = child;
        }
      }

      if (bestChildMetadata && bestChildScore > 0) {
        bestMetadata = bestChildMetadata;
        bestMetadataScore = bestChildScore;
      } else {
        for (const candidate of metadataCandidates) {
          const score = metadataScore(fileStem, candidate);
          if (score > bestMetadataScore) {
            bestMetadataScore = score;
            bestMetadata = candidate;
          }
        }
      }

      if (!bestMetadata) {
        console.warn(`⚠️  Skipping autotile import: autotiles/${dirName}/${fileStem} - no README section match`);
        continue;
      }

      if (bestMetadata.credits.length === 0) {
        console.warn(`⚠️  Skipping autotile import: autotiles/${dirName}/${fileStem} - no credits found`);
        continue;
      }

      const metadataLabel = (() => {
        if (bestMetadata.level !== 3 || !bestSection) return bestMetadata.title;
        const parentPrefix = bestSection.title.toLowerCase();
        const childTitle = bestMetadata.title;
        if (childTitle.toLowerCase().startsWith(parentPrefix)) return childTitle;
        return `${bestSection.title} ${childTitle}`;
      })();

      assets.push({
        relativeDir: 'autotiles',
        fileSlug: slugifyUnderscore(`${dirName}_${fileStem}`),
        data: {
          name: `Autotiles for ${metadataLabel}`,
          type: 'fe',
          path: 'autotiles',
          format: 'tileset',
          license: bestMetadata.license || 'F2U, F2E',
          credits: bestMetadata.credits,
          preview: relativePublicAssetPath(filePath, publicRoot),
          download: '',
          description: bestMetadata.description || undefined,
        },
      });
    }
  });

  return { assets, metas };
}

export function scanIcons(sourceRoot, publicRoot) {
  return scanGenericCategory(sourceRoot, publicRoot, 'icons', 'spritesheet');
}

export function scanMaps(sourceRoot, publicRoot) {
  const assets = [];
  const metas = [];
  const mapReadmeByFile = parseMapReadmeMetadata(sourceRoot);

  const entries = fs.readdirSync(sourceRoot, { withFileTypes: true });

  const rootImageFiles = entries
    .filter((entry) => entry.isFile() && !entry.name.startsWith('_') && isImageFile(entry.name))
    .map((entry) => entry.name);

  for (const fileName of rootImageFiles) {
    const fullPath = path.join(sourceRoot, fileName);
    const slug = slugifyUnderscore(path.basename(fileName, path.extname(fileName)));
    const credits = mapReadmeByFile.get(fileName.toLowerCase())?.credits ?? [];

    // Skip if no credits found
    if (credits.length === 0) {
      console.warn(`⚠️  Skipping map import: maps/${slug} - no credits found in README`);
      continue;
    }

    assets.push({
      relativeDir: 'maps',
      fileSlug: slug,
      data: {
        name: mapReadmeByFile.get(fileName.toLowerCase())?.name
          ?? titleCaseFromSlug(path.basename(fileName, path.extname(fileName))),
        type: 'fe',
        path: 'maps',
        format: 'spritesheet',
        license: mapReadmeByFile.get(fileName.toLowerCase())?.license || 'F2U, F2E',
        credits,
        description: mapReadmeByFile.get(fileName.toLowerCase())?.description || undefined,
        preview: relativePublicAssetPath(fullPath, publicRoot),
        download: '',
      },
    });
  }

  const dirs = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  dirs.forEach((dirName, index) => {
    const fullDir = path.join(sourceRoot, dirName);
    const dirEntries = fs.readdirSync(fullDir, { withFileTypes: true });

    const imageFiles = dirEntries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('_') && isImageFile(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    if (imageFiles.length === 0) return;

    metas.push({
      relativeDir: path.join('maps', dirName.toLowerCase()),
      meta: buildMeta(titleCaseFromSlug(dirName), (index + 1) * 10),
    });

    for (const fileName of imageFiles) {
      const fullPath = path.join(fullDir, fileName);
      assets.push({
        relativeDir: path.join('maps', dirName.toLowerCase()),
        fileSlug: slugifyUnderscore(path.basename(fileName, path.extname(fileName))),
        data: {
          name: mapReadmeByFile.get(fileName.toLowerCase())?.name
            ?? titleCaseFromSlug(path.basename(fileName, path.extname(fileName))),
          type: 'fe',
          path: `maps/${dirName.toLowerCase()}`,
          format: 'spritesheet',
          license: mapReadmeByFile.get(fileName.toLowerCase())?.license || 'F2U, F2E',
          credits: mapReadmeByFile.get(fileName.toLowerCase())?.credits ?? [],
          description: mapReadmeByFile.get(fileName.toLowerCase())?.description || undefined,
          preview: relativePublicAssetPath(fullPath, publicRoot),
          download: '',
        },
      });
    }
  });

  return { assets, metas };
}
