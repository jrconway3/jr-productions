import { render, screen } from '@testing-library/react';
import FeSlug from '../../../pages/fe/[...slug]';
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
  FeCard: ({ asset }: { asset: Asset }) => <div>{asset.name}</div>,
}));

const mockCategory: Category = {
  slug: 'portraits',
  path: 'fe/portraits',
  label: 'Portraits',
  description: 'Character portrait sprites',
  priority: 1,
  accent: 'warm',
  children: [],
};

describe('FE slug page', () => {
  it('renders the category heading', () => {
    render(<FeSlug category={mockCategory} assets={[]} slugs={['portraits']} pageCredits={[]} />);
    expect(screen.getByRole('heading', { name: 'Portraits' })).toBeInTheDocument();
  });

  it('renders breadcrumb back to FE root', () => {
    render(<FeSlug category={mockCategory} assets={[]} slugs={['portraits']} pageCredits={[]} />);
    expect(screen.getByRole('link', { name: 'FE' })).toBeInTheDocument();
  });

  it('renders empty state when no assets and no children', () => {
    render(<FeSlug category={mockCategory} assets={[]} slugs={['portraits']} pageCredits={[]} />);
    expect(screen.getByText(/no assets yet/i)).toBeInTheDocument();
  });

  it('renders asset cards when assets are present', () => {
    const asset: Asset = { id: 'p1', name: 'Hero Portrait', type: 'fe', format: 'portrait' };
    render(<FeSlug category={mockCategory} assets={[asset]} slugs={['portraits']} pageCredits={[]} />);
    expect(screen.getByText('Hero Portrait')).toBeInTheDocument();
  });
});
