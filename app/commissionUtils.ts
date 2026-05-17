import type { CommissionEntry } from './CommissionTypes';

export function formatPrice(entry: CommissionEntry): string {
  if (entry.inquire) {
    return 'Inquire for quote';
  }

  if (entry.price_min === null || entry.price_max === null) {
    return 'Contact for pricing';
  }

  let priceStr: string;

  if (entry.price_min === entry.price_max) {
    priceStr = `$${entry.price_min}`;
  } else {
    priceStr = `$${entry.price_min}–$${entry.price_max}`;
  }

  if (entry.price_base !== undefined && entry.price_per) {
    return `$${entry.price_base} base + ${priceStr}/${entry.price_per}`;
  }

  if (entry.price_per) {
    return `${priceStr}/${entry.price_per}`;
  }

  return priceStr;
}
