import { render, screen } from '@testing-library/react';
import Commissions from '../../pages/commissions';

vi.mock('next/head', () => ({ default: () => null }));

describe('Commissions page', () => {
  it('renders the heading', () => {
    render(<Commissions />);
    expect(screen.getByRole('heading', { name: 'Commission Rates' })).toBeInTheDocument();
  });

  it('renders the coming soon message', () => {
    render(<Commissions />);
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });
});
