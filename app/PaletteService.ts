import type { PaletteVariant } from './models/Asset';

export function applyPaletteSwaps(
  imageDataUrl: string,
  palette: PaletteVariant,
): string {
  // Palette swap via canvas pixel manipulation — future feature (paint-in-place).
  // Returns the original image until implemented.
  void palette;
  return imageDataUrl;
}

export function buildPalettePreviewUrl(
  baseUrl: string,
  palette: PaletteVariant,
): string {
  // Will generate a query-string-based URL for server-side palette previews.
  // Stub until the paint-in-place feature is built.
  void palette;
  return baseUrl;
}
