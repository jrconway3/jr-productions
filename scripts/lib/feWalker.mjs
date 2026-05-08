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
import { parseCreditsFile } from './feCredits.mjs';

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

function collectCreditsForBattleVariant(variantDir, classDir, typeDir, sourceRoot) {
  const localCredits = parseFirstExistingCredits(variantDir);
  if (localCredits.length > 0) return localCredits;

  const childDirs = listNonUnderscoreDirs(variantDir);
  for (const childDirName of childDirs) {
    const childDir = path.join(variantDir, childDirName);
    const childCredits = parseFirstExistingCredits(childDir);
    if (childCredits.length > 0) return childCredits;
  }

  const fallbackDirs = [classDir, typeDir, sourceRoot];
  for (const fallbackDir of fallbackDirs) {
    const parsed = parseFirstExistingCredits(fallbackDir);
    if (parsed.length > 0) return parsed;
  }

  return [];
}

export function scanBattleAnimations(sourceRoot, publicRoot) {
  const assets = [];
  const metas = [];
  const typeDirs = listNonUnderscoreDirs(sourceRoot);

  typeDirs.forEach((typeDirName, typeIndex) => {
    const typeDir = path.join(sourceRoot, typeDirName);
    const typeAssetsStart = assets.length;
    const classMetaEntries = [];

    const classDirs = listNonUnderscoreDirs(typeDir);
    classDirs.forEach((classDirName, classIndex) => {
      const classDir = path.join(typeDir, classDirName);
      const classAssetsStart = assets.length;

      const variantDirs = listNonUnderscoreDirs(classDir);
      variantDirs.forEach((variantDirName) => {
        const variantDir = path.join(classDir, variantDirName);
        const candidateFiles = collectCandidateFiles(variantDir);
        const imageFiles = candidateFiles.filter((filePath) => isImageFile(path.basename(filePath)));
        if (imageFiles.length === 0) return;

        const previewFile = pickPreviewFromFiles(candidateFiles);
        const credits = collectCreditsForBattleVariant(variantDir, classDir, typeDir, sourceRoot);

        const weaponDirs = listNonUnderscoreDirs(variantDir)
          .filter((name) => ['sword', 'axe', 'lance', 'dagger', 'magic', 'bow', 'staff', 'unarmed'].includes(name.toLowerCase()));

        const bodyTypes = [];
        if (/(^|[_\s-])female($|[_\s-])/i.test(variantDirName)) bodyTypes.push('female');
        if (/(^|[_\s-])male($|[_\s-])/i.test(variantDirName)) bodyTypes.push('male');

        assets.push({
          relativeDir: path.join('battle-animations', typeDirName, classDirName),
          fileSlug: slugifyUnderscore(variantDirName),
          data: {
            name: titleCaseFromSlug(variantDirName),
            type: 'fe',
            path: `battle-animations/${typeDirName}/${classDirName}`,
            format: getFormatForPreview(previewFile, 'spritesheet'),
            license: 'F2U, F2E',
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

export function scanPortraits(sourceRoot, publicRoot) {
  const assets = [];
  const metas = [];
  const tierDirs = listNonUnderscoreDirs(sourceRoot);

  tierDirs.forEach((tierName, tierIndex) => {
    const tierDir = path.join(sourceRoot, tierName);
    const tierAssetsStart = assets.length;

    const charDirs = listNonUnderscoreDirs(tierDir);
    charDirs.forEach((charDirName) => {
      const charDir = path.join(tierDir, charDirName);
      const charEntries = fs.readdirSync(charDir, { withFileTypes: true });

      // Parent character asset: include only files directly in the character directory.
      const rootImagePaths = charEntries
        .filter((entry) => entry.isFile() && !entry.name.startsWith('_') && isImageFile(entry.name))
        .map((entry) => path.join(charDir, entry.name));

      if (rootImagePaths.length > 0) {
        const previewFile = pickPreviewFromFiles(rootImagePaths);
        const variants = rootImagePaths
          .map((filePath) => path.basename(filePath, path.extname(filePath)).replace(/\{[^}]*\}/g, '').trim())
          .filter(Boolean);

        assets.push({
          relativeDir: path.join('portraits', tierName.toLowerCase()),
          fileSlug: slugifyUnderscore(charDirName),
          data: {
            name: titleCaseFromSlug(charDirName),
            type: 'fe',
            path: `portraits/${tierName.toLowerCase()}`,
            format: 'portrait',
            license: 'F2U, F2E',
            credits: [],
            variants: [...new Set(variants)],
            preview: previewFile ? relativePublicAssetPath(previewFile, publicRoot) : '',
            download: '',
          },
        });
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

        assets.push({
          relativeDir: path.join('portraits', tierName.toLowerCase()),
          fileSlug: `${slugifyUnderscore(charDirName)}_${slugifyUnderscore(childDirName)}`,
          data: {
            name: `${titleCaseFromSlug(charDirName)} ${titleCaseFromSlug(childDirName)}`,
            type: 'fe',
            path: `portraits/${tierName.toLowerCase()}`,
            format: 'portrait',
            license: 'F2U, F2E',
            credits: [],
            variants: [...new Set(variants)],
            preview: previewFile ? relativePublicAssetPath(previewFile, publicRoot) : '',
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

export function scanMapSprites(sourceRoot, publicRoot) {
  const assets = [];
  const metas = [];
  const typeDirs = listNonUnderscoreDirs(sourceRoot);

  typeDirs.forEach((typeName, typeIndex) => {
    const typeDir = path.join(sourceRoot, typeName);
    const typeAssetsStart = assets.length;

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
      if (animations.includes('stand')) normalizedAnimations.push('stand');
      if (animations.includes('walk')) normalizedAnimations.push('walk');
      for (const animation of animations) {
        if (!normalizedAnimations.includes(animation)) normalizedAnimations.push(animation);
      }

      assets.push({
        relativeDir: path.join('map-sprites', typeName),
        fileSlug: group.slug,
        data: {
          name: titleCaseFromSlug(group.name),
          type: 'fe',
          path: `map-sprites/${typeName}`,
          format: 'spritesheet',
          license: 'F2U, F2E',
          body_types: [...group.bodyTypes],
          credits: group.authors.size > 0 ? [{ authors: [...group.authors] }] : [],
          animations: normalizedAnimations,
          variants: [...group.variants],
          preview: previewFile ? relativePublicAssetPath(previewFile, publicRoot) : '',
          download: '',
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
  return scanGenericCategory(sourceRoot, publicRoot, 'autotiles', 'tileset');
}

export function scanIcons(sourceRoot, publicRoot) {
  return scanGenericCategory(sourceRoot, publicRoot, 'icons', 'spritesheet');
}

export function scanMaps(sourceRoot, publicRoot) {
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
      relativeDir: 'maps',
      fileSlug: slug,
      data: {
        name: titleCaseFromSlug(path.basename(fileName, path.extname(fileName))),
        type: 'fe',
        path: 'maps',
        format: 'spritesheet',
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
          name: titleCaseFromSlug(path.basename(fileName, path.extname(fileName))),
          type: 'fe',
          path: `maps/${dirName.toLowerCase()}`,
          format: 'spritesheet',
          license: 'F2U, F2E',
          credits: [],
          preview: relativePublicAssetPath(fullPath, publicRoot),
          download: '',
        },
      });
    }
  });

  return { assets, metas };
}
