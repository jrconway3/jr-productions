import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getNavMenus, type NavMenuItem } from 'app/NavService';

interface LayoutProps {
  children: ReactNode;
}

function menuAccentClass(menu: NavMenuItem, active: boolean): string {
  const common = 'font-pixel text-xs transition-colors';

  if (menu.accent === 'lpc') {
    return `${common} text-site-muted hover:text-lpc-accentLight ${active ? 'nav-link-active nav-link-active-lpc' : ''}`;
  }

  if (menu.accent === 'fe') {
    return `${common} text-site-muted hover:text-fe-accentLight ${active ? 'nav-link-active nav-link-active-fe' : ''}`;
  }

  if (menu.accent === 'commissions') {
    const status = menu.commissionStatus || 'closed';
    const activeClass = `nav-link-active nav-link-active-commissions-${status}`;
    const prominentClass = `nav-link-prominent-commissions-${status}`;
    return `${common} ${active ? activeClass : prominentClass}`;
  }

  return `${common} text-site-muted hover:text-site-text ${active ? 'nav-link-active nav-link-active-about' : ''}`;
}

function menuWrapperClass(menu: NavMenuItem): string {
  if (menu.accent === 'lpc') return 'nav-dropdown-menu nav-dropdown-menu-lpc';
  if (menu.accent === 'fe') return 'nav-dropdown-menu nav-dropdown-menu-fe';
  if (menu.accent === 'commissions') {
    const status = menu.commissionStatus || 'closed';
    return `nav-dropdown-menu nav-dropdown-menu-commissions nav-dropdown-menu-commissions-${status}`;
  }
  return 'nav-dropdown-menu nav-dropdown-menu-about';
}

function menuItemClass(menu: NavMenuItem, active: boolean): string {
  if (menu.accent === 'lpc') {
    return `nav-dropdown-item ${active ? 'nav-dropdown-item-active nav-dropdown-item-active-lpc' : ''}`;
  }
  if (menu.accent === 'fe') {
    return `nav-dropdown-item ${active ? 'nav-dropdown-item-active nav-dropdown-item-active-fe' : ''}`;
  }
  if (menu.accent === 'commissions') {
    const status = menu.commissionStatus || 'closed';
    return `nav-dropdown-item ${active ? `nav-dropdown-item-active nav-dropdown-item-active-commissions-${status}` : ''}`;
  }
  return `nav-dropdown-item ${active ? 'nav-dropdown-item-active nav-dropdown-item-active-about' : ''}`;
}

function linkIsActive(currentPath: string, href: string): boolean {
  if (!href.startsWith('/')) return false;
  if (href === '/') return currentPath === '/';
  return currentPath === href || currentPath.startsWith(`${href}/`);
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const currentPath = router.asPath.split('?')[0];
  const menus = getNavMenus();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-site-surface border-b border-white/10 sticky top-0 z-50">
        <nav className="page-wide h-16 flex items-center gap-6">
          <Link href="/" className="font-pixel text-sm leading-none shrink-0 whitespace-nowrap hover:opacity-80 transition-opacity">
            <span className="text-site-text">JaidynReiman</span>
            <span className="text-lpc-accent">{' '}Productions</span>
          </Link>

          <div className="flex gap-6 ml-auto items-center">
            {menus.map((menu) => {
              const active = linkIsActive(currentPath, menu.href);
              const topClassName = menuAccentClass(menu, active);

              return (
                <div key={menu.id} className="nav-dropdown group">
                  {menu.external ? (
                    <a
                      href={menu.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={topClassName}
                    >
                      {menu.label}
                    </a>
                  ) : (
                    <Link
                      href={menu.href}
                      className={topClassName}
                      aria-current={active ? 'page' : undefined}
                    >
                      {menu.accent === 'commissions' ? (
                        <>
                          {menu.label}
                          <span
                            className={`nav-commissions-status nav-commissions-status-${menu.commissionStatus || 'closed'}`}
                          >
                            {menu.commissionStatusText || 'Closed'}
                          </span>
                        </>
                      ) : (
                        menu.label
                      )}
                    </Link>
                  )}

                  <div className={menuWrapperClass(menu)}>
                    {menu.links.map((item) => {
                      const itemActive = linkIsActive(currentPath, item.href);
                      const className = menuItemClass(menu, itemActive);

                      if (item.external) {
                        return (
                          <a
                            key={`${menu.id}:${item.href}`}
                            href={item.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={className}
                          >
                            {item.label}
                          </a>
                        );
                      }

                      return (
                        <Link
                          key={`${menu.id}:${item.href}`}
                          href={item.href}
                          className={className}
                          aria-current={itemActive ? 'page' : undefined}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </nav>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="bg-site-surface border-t border-white/10 py-6 mt-16">
        <div className="page-wide flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex flex-col gap-1 items-center sm:items-start">
            <p className="font-body text-site-muted text-sm">
              &copy; {new Date().getFullYear()} JaidynReiman Productions
            </p>
            <p className="font-body text-site-muted text-xs opacity-70">
              Assets are provided under their respective licenses.{' '}
              <Link href="/credits" className="hover:text-site-text transition-colors">Credits →</Link>
            </p>
          </div>
          <a
            href="https://ko-fi.com/jaidynreiman"
            target="_blank"
            rel="noopener noreferrer"
            className="font-body text-sm text-fe-accent hover:text-fe-accentLight transition-colors"
          >
            Support on Ko-fi ♥
          </a>
        </div>
      </footer>
    </div>
  );
}
