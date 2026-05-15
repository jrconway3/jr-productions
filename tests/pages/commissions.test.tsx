import { render, screen } from '@testing-library/react';
import Commissions from '../../pages/commissions/index';
import type { ResolvedCommissionData } from '../../app/CommissionTypes';

vi.mock('next/head', () => ({ default: () => null }));
vi.mock('components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockData: ResolvedCommissionData = {
  meta: {
    status: 'open',
    status_note: '',
    contact_note: 'For inquiries or commissions not listed, use the contact page.',
    license_note: 'All OGA-based assets require attribution under their respective CC license.',
    payment_methods: ['kofi', 'paypal'],
  },
  lpc_base: [
    {
      id: 'lpc_head_static',
      name: 'Static Head Asset',
      category: 'lpc',
      description: 'Four directional frames plus mapping to all animation frames.',
      price_min: 25,
      price_max: 30,
      addon: false,
      inquire: false,
      kofi_url: null,
      examples: [],
    },
  ],
  lpc_addons: [],
  fe_base: [],
  fe_addons: [],
  examplesByEntryId: {},
};

describe('Commissions page', () => {
  it('renders the heading', () => {
    render(
      <Commissions
        data={mockData}
        examplesByEntryId={{}}
        exampleAssetsById={{}}
        resolvedSpecsByAssetId={{}}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Commissions' })).toBeInTheDocument();
  });

  it('renders commission sections', () => {
    render(
      <Commissions
        data={mockData}
        examplesByEntryId={{}}
        exampleAssetsById={{}}
        resolvedSpecsByAssetId={{}}
      />,
    );
    expect(screen.getByText('LPC Commissions')).toBeInTheDocument();
    expect(screen.getByText('Fire Emblem Commissions')).toBeInTheDocument();
  });

  it('renders payment and licensing text', () => {
    render(
      <Commissions
        data={mockData}
        examplesByEntryId={{}}
        exampleAssetsById={{}}
        resolvedSpecsByAssetId={{}}
      />,
    );
    expect(screen.getByText('Payment Methods:')).toBeInTheDocument();
    expect(screen.getByText('Licensing:')).toBeInTheDocument();
  });
});
