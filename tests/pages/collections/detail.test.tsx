import { render, screen } from '@testing-library/react';
import CollectionDetail from '../../../pages/collections/[id]';
import type { Collection } from 'app/models/Collection';
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

const mockCollection: Collection = {
  id: 'demo',
  label: 'Demo Collection',
  description: 'A demo collection',
  oga_url: 'https://opengameart.org/content/demo',
  assets: [],
};

describe('Collection detail page', () => {
  it('renders the collection label', () => {
    render(<CollectionDetail collection={mockCollection} assets={[]} />);
    expect(screen.getByRole('heading', { name: 'Demo Collection' })).toBeInTheDocument();
  });

  it('renders the OGA link when present', () => {
    render(<CollectionDetail collection={mockCollection} assets={[]} />);
    expect(screen.getByRole('link', { name: /opengameart/i })).toBeInTheDocument();
  });

  it('renders empty state when no assets', () => {
    render(<CollectionDetail collection={mockCollection} assets={[]} />);
    expect(screen.getByText(/no assets in this collection/i)).toBeInTheDocument();
  });

  it('renders asset cards when assets are present', () => {
    const asset: Asset = { id: 'a1', name: 'Shield Sprite', type: 'fe', format: 'spritesheet' };
    render(<CollectionDetail collection={mockCollection} assets={[asset]} />);
    expect(screen.getByText('Shield Sprite')).toBeInTheDocument();
  });
});
