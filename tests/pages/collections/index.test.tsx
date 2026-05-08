import { render, screen } from '@testing-library/react';
import CollectionsIndex from '../../../pages/collections/index';
import type { Collection } from 'app/models/Collection';

vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...(props as object)}>{children}</a>
  ),
}));

const mockCollection: Collection = {
  id: 'demo',
  label: 'Demo Collection',
  description: 'A demo collection',
  assets: ['a1', 'a2'],
};

describe('Collections index page', () => {
  it('renders the heading', () => {
    render(<CollectionsIndex collections={[]} />);
    expect(screen.getByRole('heading', { name: 'Collections' })).toBeInTheDocument();
  });

  it('renders empty state message when no collections', () => {
    render(<CollectionsIndex collections={[]} />);
    expect(screen.getByText(/no collections yet/i)).toBeInTheDocument();
  });

  it('renders collection cards', () => {
    render(<CollectionsIndex collections={[mockCollection]} />);
    expect(screen.getByText('Demo Collection')).toBeInTheDocument();
    expect(screen.getByText('2 assets')).toBeInTheDocument();
  });
});
