import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface LayoutProps {
  children: ReactNode;
}

const LPC_CATEGORY_LINKS = [
  { href: '/lpc/arms', label: 'Arms' },
  { href: '/lpc/body', label: 'Body' },
  { href: '/lpc/feet', label: 'Feet' },
  { href: '/lpc/hair', label: 'Hair' },
  { href: '/lpc/head', label: 'Head' },
  { href: '/lpc/headwear', label: 'Headwear' },
  { href: '/lpc/legs', label: 'Legs' },
  { href: '/lpc/tilesets', label: 'Tilesets' },
  { href: '/lpc/tools', label: 'Tools' },
  { href: '/lpc/torso', label: 'Torso' },
  { href: '/lpc/weapons', label: 'Weapons' },
];

const FE_CATEGORY_LINKS = [
  { href: '/fe/portraits', label: 'Portraits' },
  { href: '/fe/battle-animations', label: 'Battle Animations' },
  { href: '/fe/map-sprites', label: 'Map Sprites' },
  { href: '/fe/autotiles', label: 'Autotiles' },
  { href: '/fe/maps', label: 'Maps' },
  { href: '/fe/icons', label: 'Icons' },
];

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const currentPath = router.asPath.split('?')[0];

  const isPathActive = (href: string): boolean => {
    if (href === '/') return currentPath === '/';
    return currentPath === href || currentPath.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-site-surface border-b border-white/10 sticky top-0 z-50">
        <nav className="page-wide h-16 flex items-center gap-6">
          <Link href="/" className="font-pixel text-sm leading-none shrink-0 whitespace-nowrap hover:opacity-80 transition-opacity">
            <span className="text-site-text">JaidynReiman</span>
            <span className="text-lpc-accent">{' '}Productions</span>
          </Link>

          <div className="flex gap-6 ml-auto items-center">
            <div className="nav-dropdown group">
              <Link
                href="/lpc"
                className={`font-pixel text-xs text-site-muted hover:text-lpc-accentLight transition-colors ${isPathActive('/lpc') ? 'nav-link-active nav-link-active-lpc' : ''}`}
                aria-current={isPathActive('/lpc') ? 'page' : undefined}
              >
                LPC
              </Link>
              <div className="nav-dropdown-menu nav-dropdown-menu-lpc">
                {LPC_CATEGORY_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-dropdown-item ${isPathActive(item.href) ? 'nav-dropdown-item-active nav-dropdown-item-active-lpc' : ''}`}
                    aria-current={isPathActive(item.href) ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="nav-dropdown group">
              <Link
                href="/fe"
                className={`font-pixel text-xs text-site-muted hover:text-fe-accentLight transition-colors ${isPathActive('/fe') ? 'nav-link-active nav-link-active-fe' : ''}`}
                aria-current={isPathActive('/fe') ? 'page' : undefined}
              >
                FE
              </Link>
              <div className="nav-dropdown-menu nav-dropdown-menu-fe">
                {FE_CATEGORY_LINKS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-dropdown-item ${isPathActive(item.href) ? 'nav-dropdown-item-active nav-dropdown-item-active-fe' : ''}`}
                    aria-current={isPathActive(item.href) ? 'page' : undefined}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
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
