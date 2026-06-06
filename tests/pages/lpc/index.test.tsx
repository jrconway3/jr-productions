import { render, screen } from '@testing-library/react';
import LpcIndex from '../../../pages/lpc/index';
import type { Category } from 'app/models/Category';

vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...(props as object)}>{children}</a>
  ),
}));

const mockCategory: Category = {
  slug: 'lpc',
  path: 'lpc',
  label: 'LPC Assets',
  description: 'Libre Pixel Art Collection assets',
  priority: 1,
  accent: 'saturated',
  children: [
    {
      slug: 'hair',
      path: 'lpc/hair',
      label: 'Hair',
      description: '',
      priority: 1,
      accent: 'saturated',
      children: [],
    },
  ],
};

describe('LPC index page', () => {
  it('renders the category heading', () => {
    render(<LpcIndex category={mockCategory} pageUrl="https://jaidynreiman.net/lpc" ogImage="https://jaidynreiman.net/og-default.png" />);
    expect(screen.getByRole('heading', { name: 'LPC Assets' })).toBeInTheDocument();
  });

  it('renders subcategory links', () => {
    render(<LpcIndex category={mockCategory} pageUrl="https://jaidynreiman.net/lpc" ogImage="https://jaidynreiman.net/og-default.png" />);
    expect(screen.getByRole('link', { name: 'Hair' })).toBeInTheDocument();
  });

  it('renders description when present', () => {
    render(<LpcIndex category={mockCategory} pageUrl="https://jaidynreiman.net/lpc" ogImage="https://jaidynreiman.net/og-default.png" />);
    expect(screen.getByText('Libre Pixel Art Collection assets')).toBeInTheDocument();
  });
});
