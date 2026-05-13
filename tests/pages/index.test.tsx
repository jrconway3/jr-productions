import { render, screen } from '@testing-library/react';
import Home from '../../pages/index';
import type { Category } from 'app/models/Category';
import type { Asset } from 'app/models/Asset';

vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...(props as object)}>{children}</a>
  ),
}));
vi.mock('components/gallery/MasonryGrid', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('components/gallery/AssetCard', () => ({
  default: ({ asset }: { asset: Asset }) => <div>{asset.name}</div>,
}));

const mockCategory: Category = {
  slug: 'lpc',
  path: 'lpc',
  label: 'LPC Assets',
  description: 'Libre Pixel Art assets',
  priority: 1,
  accent: 'saturated',
  children: [],
};

describe('Home page', () => {
  it('renders heading with empty data', () => {
    render(<Home categories={[]} featuredAssets={[]} resolvedSpecs={{}} animNames={{}} bodyTypes={{}} pageCredits={[]} />);
    expect(screen.getByText('Productions')).toBeInTheDocument();
  });

  it('renders category navigation buttons', () => {
    render(<Home categories={[mockCategory]} featuredAssets={[]} resolvedSpecs={{}} animNames={{}} bodyTypes={{}} pageCredits={[]} />);
    expect(screen.getAllByText('LPC Assets').length).toBeGreaterThan(0);
  });

  it('renders asset gallery when assets are present', () => {
    const asset: Asset = { id: 'a1', name: 'My Sprite', type: 'lpc', format: 'spritesheet' };
    render(<Home categories={[]} featuredAssets={[asset]} resolvedSpecs={{}} animNames={{}} bodyTypes={{}} pageCredits={[]} />);
    expect(screen.getByText('My Sprite')).toBeInTheDocument();
  });
});
