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
    intro: 'Test intro.',
    contact_note: 'For inquiries, reach out on Ko-Fi.',
    license_note: 'All OGA-based assets require attribution under their respective CC license.',
    payment_methods: ['kofi', 'paypal'],
  },
  categories: [
    {
      key: 'lpc',
      label: 'LPC Commissions',
      sections: [
        {
          key: 'base',
          label: 'Base Assets',
          entries: [
            {
              id: 'lpc_head_static',
              name: 'Static Head Asset',
              description: 'Four directional frames plus mapping to all animation frames.',
              price_min: 25,
              price_max: 30,
              inquire: false,
              kofi_url: null,
              examples: [],
            },
          ],
        },
        {
          key: 'addons',
          label: 'Add-on Animations',
          entries: [],
        },
      ],
    },
    {
      key: 'fe',
      label: 'Fire Emblem Commissions',
      sections: [
        {
          key: 'base',
          label: 'Base Assets',
          entries: [
            {
              id: 'fe_portrait_static',
              name: 'Static Portrait',
              description: 'A single portrait frame.',
              price_min: 20,
              price_max: 25,
              inquire: false,
              kofi_url: null,
              examples: [],
            },
          ],
        },
      ],
    },
  ],
  examplesByEntryId: {},
};

describe('Commissions page', () => {
  it('renders the heading', () => {
    render(
      <Commissions
        data={mockData}
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
        exampleAssetsById={{}}
        resolvedSpecsByAssetId={{}}
      />,
    );
    expect(screen.getByText('Payment Methods:')).toBeInTheDocument();
    expect(screen.getByText('Licensing:')).toBeInTheDocument();
  });
});
