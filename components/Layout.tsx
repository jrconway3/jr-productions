import type { ReactNode } from 'react';
import Link from 'next/link';

interface LayoutProps {
  children: ReactNode;
}

const NAV_LINKS = [
  { href: '/lpc', label: 'LPC', color: 'hover:text-lpc-accentLight' },
  { href: '/fe', label: 'FE', color: 'hover:text-fe-accentLight' },
  { href: '/collections', label: 'Collections', color: 'hover:text-site-text' },
  { href: '/commissions', label: 'Commissions', color: 'hover:text-site-text' },
];

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-site-surface border-b border-white/10 sticky top-0 z-50">
        <nav className="page-wide h-16 flex items-center gap-6">
          <Link href="/" className="font-pixel text-base text-site-text hover:text-lpc-accentLight shrink-0">
            JR Productions
          </Link>
          <div className="flex gap-6 ml-auto">
            {NAV_LINKS.map(({ href, label, color }) => (
              <Link
                key={href}
                href={href}
                className={`font-pixel text-xs text-site-muted ${color} transition-colors`}
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="bg-site-surface border-t border-white/10 py-6 mt-16">
        <div className="page-wide flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-body text-site-muted text-sm">
            &copy; {new Date().getFullYear()} JaidynReiman Productions
          </p>
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
