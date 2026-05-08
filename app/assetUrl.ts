const HTTP_URL_PATTERN = /^https?:\/\//i;

export function toPublicAssetUrl(value?: string): string {
  if (!value) return '';
  if (HTTP_URL_PATTERN.test(value)) return value;
  return value.startsWith('/') ? value : `/${value}`;
}
