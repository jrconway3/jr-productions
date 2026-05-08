import { render, screen } from '@testing-library/react';
import FeIndex from '../../../pages/fe/index';
import type { Category } from 'app/models/Category';

vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...(props as object)}>{children}</a>
  ),
}));

const mockCategory: Category = {
  slug: 'fe',
  path: 'fe',
  label: 'Fire Emblem',
  description: 'Fire Emblem sprite assets',
  priority: 1,
  accent: 'warm',
  children: [
    {
      slug: 'portraits',
      path: 'fe/portraits',
      label: 'Portraits',
      description: '',
      priority: 1,
      accent: 'warm',
      children: [],
    },
  ],
};

describe('FE index page', () => {
  it('renders the category heading', () => {
    render(<FeIndex category={mockCategory} />);
    expect(screen.getByRole('heading', { name: 'Fire Emblem' })).toBeInTheDocument();
  });

  it('renders subcategory links', () => {
    render(<FeIndex category={mockCategory} />);
    expect(screen.getByRole('link', { name: 'Portraits' })).toBeInTheDocument();
  });

  it('renders description when present', () => {
    render(<FeIndex category={mockCategory} />);
    expect(screen.getByText('Fire Emblem sprite assets')).toBeInTheDocument();
  });
});
