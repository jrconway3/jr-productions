import { render, screen } from '@testing-library/react';
import LpcSlug from '../../../pages/lpc/[...slug]';
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
  slug: 'hair',
  path: 'lpc/hair',
  label: 'Hair',
  description: 'Hair sprites',
  priority: 1,
  accent: 'saturated',
  children: [
    {
      slug: 'long',
      path: 'lpc/hair/long',
      label: 'Long Hair',
      description: '',
      priority: 1,
      accent: 'saturated',
      children: [],
    },
  ],
};

describe('LPC slug page', () => {
  it('renders the category heading', () => {
    render(<LpcSlug category={mockCategory} assets={[]} slugs={['hair']} />);
    expect(screen.getByRole('heading', { name: 'Hair' })).toBeInTheDocument();
  });

  it('renders breadcrumb back to LPC root', () => {
    render(<LpcSlug category={mockCategory} assets={[]} slugs={['hair']} />);
    expect(screen.getByRole('link', { name: 'LPC' })).toBeInTheDocument();
  });

  it('renders subcategory links', () => {
    render(<LpcSlug category={mockCategory} assets={[]} slugs={['hair']} />);
    expect(screen.getByRole('link', { name: 'Long Hair' })).toBeInTheDocument();
  });

  it('renders asset cards when assets are present', () => {
    const asset: Asset = { id: 'h1', name: 'Braided Hair', category: 'lpc', type: 'spritesheet' };
    render(<LpcSlug category={mockCategory} assets={[asset]} slugs={['hair']} />);
    expect(screen.getByText('Braided Hair')).toBeInTheDocument();
  });
});
