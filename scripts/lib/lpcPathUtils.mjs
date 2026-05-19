import path from 'path';

export function normalizeSlashes(value) {
  return value.replace(/\\/g, '/');
}

export function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

export function toPosixRelative(rootPath, absolutePath) {
  return normalizeSlashes(path.relative(rootPath, absolutePath));
}

export function toOutputJsonRelativePath(sourceRoot, sourceJsonPath) {
  return toPosixRelative(sourceRoot, sourceJsonPath);
}

export function toAssetDirectoryRelativePath(sourceRoot, sourceJsonPath) {
  const relativeJson = toOutputJsonRelativePath(sourceRoot, sourceJsonPath);
  return normalizeSlashes(path.posix.dirname(relativeJson));
}

export function joinPosix(...parts) {
  return normalizeSlashes(path.posix.join(...parts));
}

export function cleanLayerSegment(segment) {
  const normalized = normalizeSlashes(segment ?? '');
  return stripTrailingSlash(normalized).replace(/^\/+/, '');
}

export function topLevelCategoryFromRelativeDir(relativeDir) {
  return normalizeSlashes(relativeDir).split('/').filter(Boolean)[0] ?? '';
}

export function titleCaseFromSlug(value) {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
