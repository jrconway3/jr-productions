import navConfig from 'data/nav.json';
import commissionMeta from 'data/commissions/meta.json';
import navCategories from 'data/nav-categories.json';

type CommissionStatus = 'open' | 'closed' | 'waitlist';
type NavAccent = 'lpc' | 'fe' | 'commissions' | 'about';

interface NavConfigLink {
  href: string;
  label: string;
  external?: boolean;
}

interface NavConfigMenuSource {
  type: 'category';
  key: string;
}

interface NavConfigMenu {
  id: string;
  label: string;
  href: string;
  accent: NavAccent;
  external?: boolean;
  status_label?: Partial<Record<CommissionStatus, string>>;
  source?: NavConfigMenuSource;
  links?: NavConfigLink[];
}

interface NavConfig {
  menus: NavConfigMenu[];
}

interface NavCategoryIndex {
  categories: Record<string, NavConfigLink[]>;
}

export interface NavLinkItem {
  href: string;
  label: string;
  external: boolean;
}

export interface NavMenuItem {
  id: string;
  label: string;
  href: string;
  accent: NavAccent;
  external: boolean;
  links: NavLinkItem[];
  commissionStatus?: CommissionStatus;
  commissionStatusText?: string;
}

function titleCaseStatus(value: CommissionStatus): string {
  if (value === 'waitlist') return 'Waitlist';
  if (value === 'open') return 'Open';
  return 'Closed';
}

function resolveCommissionStatusText(menu: NavConfigMenu, status: CommissionStatus): string {
  const configured = menu.status_label?.[status]?.trim();
  if (!configured) return titleCaseStatus(status);

  const prefix = `${menu.label} `;
  if (configured.toLowerCase().startsWith(prefix.toLowerCase())) {
    return configured.slice(prefix.length).trim() || titleCaseStatus(status);
  }

  return configured;
}

function resolveLinks(menu: NavConfigMenu): NavLinkItem[] {
  if (menu.source?.type === 'category') {
    const index = navCategories as NavCategoryIndex;
    const links = index.categories[menu.source.key] || [];
    return links.map((link) => ({
      href: link.href,
      label: link.label,
      external: Boolean(link.external),
    }));
  }

  return (menu.links || []).map((link) => ({
    href: link.href,
    label: link.label,
    external: Boolean(link.external),
  }));
}

export function getNavMenus(): NavMenuItem[] {
  const typed = navConfig as NavConfig;
  const status = (commissionMeta.status as CommissionStatus | undefined) ?? 'closed';

  return typed.menus.map((menu) => {
    const statusText = menu.id === 'commissions'
      ? resolveCommissionStatusText(menu, status)
      : undefined;

    return {
      id: menu.id,
      label: menu.label,
      href: menu.href,
      accent: menu.accent,
      external: Boolean(menu.external),
      links: resolveLinks(menu),
      commissionStatus: menu.id === 'commissions' ? status : undefined,
      commissionStatusText: statusText,
    };
  });
}
