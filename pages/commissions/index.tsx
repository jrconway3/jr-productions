import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { resolveAssetsSpecs } from 'app/AnimationService';
import { getAllAssets } from 'app/AssetService';
import { getResolvedCommissionData } from 'app/CommissionService';
import type { ResolvedCommissionData, CommissionEntry, Modifier, ResolvedCommissionExample } from 'app/CommissionTypes';
import UnifiedAssetCard from 'components/gallery/UnifiedAssetCard';
import type { Asset, AnimationSpec, ResolvedFeSpec, ResolvedLpcSpec } from 'app/models/Asset';

interface CommissionsProps {
  data: ResolvedCommissionData;
  examplesByEntryId: Record<string, ResolvedCommissionExample>;
  exampleAssetsById: Record<string, Asset>;
  resolvedSpecsByAssetId: Record<string, AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec>;
}

function creditsLine(asset: Asset): string | null {
  if (!asset.credits?.length) return null;
  const authors = [...new Set(asset.credits.flatMap((credit) => credit.authors))].join(', ');
  return asset.license ? `${authors} - ${asset.license}` : authors;
}

function formatPrice(entry: CommissionEntry): string {
  if (entry.inquire) {
    return 'Inquire for quote';
  }

  if (entry.price_min === null || entry.price_max === null) {
    return 'Contact for pricing';
  }

  let priceStr: string;

  if (entry.price_min === entry.price_max) {
    priceStr = `$${entry.price_min}`;
  } else {
    priceStr = `$${entry.price_min}–$${entry.price_max}`;
  }

  if (entry.price_base !== undefined && entry.price_per) {
    return `$${entry.price_base} base + ${priceStr}/${entry.price_per}`;
  }

  if (entry.price_per) {
    return `${priceStr}/${entry.price_per}`;
  }

  return priceStr;
}

function CommissionCard({
  entry,
  color,
  example,
  exampleAsset,
  resolvedSpec,
}: {
  entry: CommissionEntry;
  color: 'lpc' | 'fe';
  example?: ResolvedCommissionExample;
  exampleAsset?: Asset;
  resolvedSpec?: AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec;
}) {
  const appliesToText =
    entry.applies_to && entry.applies_to.length > 0
      ? `Applies to: ${entry.applies_to.join(', ')}`
      : 'Applies to any base asset';
  const accentClass = color === 'lpc' ? 'text-lpc-accent border-lpc-accent/45' : 'text-fe-accent border-fe-accent/45';
  const kofiLink = entry.kofi_url || 'https://ko-fi.com/jaidynreiman';
  const credits = exampleAsset ? creditsLine(exampleAsset) : null;
  return (
    <div className={`border rounded-md overflow-hidden ${accentClass}`}>
      {example && exampleAsset && (
        <div className="commission-example-host relative">
          <UnifiedAssetCard
            asset={exampleAsset}
            resolvedSpec={resolvedSpec}
            animName={example.animation}
            weapon={example.weapon}
            bodyType={example.bodyType}
            groupAnimNames={example.groupAnimNames}
          />
          {credits && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1">
              <p className="font-body text-[11px] leading-tight text-white/85 break-words">{credits}</p>
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="mb-2">
          <h3 className="text-base font-bold text-site-text font-pixel">{entry.name}</h3>
          {entry.addon && entry.applies_to && entry.applies_to.length > 0 && (
            <p className="text-xs text-site-muted mt-1">{appliesToText}</p>
          )}
        </div>

        <p className="text-site-muted text-sm mb-3">{entry.description}</p>

        <div className="flex items-end justify-between gap-2">
          <div>
            <p className={`text-lg font-bold font-pixel ${color === 'lpc' ? 'text-lpc-accent' : 'text-fe-accent'}`}>{formatPrice(entry)}</p>
            {entry.price_note && <p className="text-xs text-site-muted mt-1">{entry.price_note}</p>}
          </div>

          <div className="flex gap-2 flex-wrap justify-end">
            <a
              href={kofiLink}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 bg-site-muted text-site-surface rounded text-xs font-bold hover:opacity-80 transition-opacity"
            >
              Ko-Fi
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function CommissionSection({
  title,
  entries,
  color,
  examplesByEntryId,
  exampleAssetsById,
  resolvedSpecsByAssetId,
}: {
  title: string;
  entries: CommissionEntry[];
  color: 'lpc' | 'fe';
  examplesByEntryId: Record<string, ResolvedCommissionExample>;
  exampleAssetsById: Record<string, Asset>;
  resolvedSpecsByAssetId: Record<string, AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec>;
}) {
  if (entries.length === 0) return null;

  const baseEntries = entries.filter((e) => !e.addon);
  const addonEntries = entries.filter((e) => e.addon);
  const accentClass = color === 'lpc' ? 'text-lpc-accent' : 'text-fe-accent';

  return (
    <div className="mb-12">
      <div className="mb-6">
        <h2 className={`text-2xl font-bold font-pixel ${accentClass} mb-2`}>{title}</h2>
        <div className="h-0.5 bg-gradient-to-r from-site-muted to-transparent w-32" />
      </div>

      {baseEntries.length > 0 && (
        <div className="mb-8">
          <h3 className="text-site-text font-pixel text-sm mb-4 pl-1">Base Assets</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {baseEntries.map((entry) => (
              <CommissionCard
                key={entry.id}
                entry={entry}
                color={color}
                example={examplesByEntryId[entry.id]}
                exampleAsset={examplesByEntryId[entry.id] ? exampleAssetsById[examplesByEntryId[entry.id]!.assetId] : undefined}
                resolvedSpec={examplesByEntryId[entry.id] ? resolvedSpecsByAssetId[examplesByEntryId[entry.id]!.assetId] : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {addonEntries.length > 0 && (
        <div>
          <h3 className="text-site-text font-pixel text-sm mb-4 pl-1">Add-on Animations</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {addonEntries.map((entry) => (
              <CommissionCard
                key={entry.id}
                entry={entry}
                color={color}
                example={examplesByEntryId[entry.id]}
                exampleAsset={examplesByEntryId[entry.id] ? exampleAssetsById[examplesByEntryId[entry.id]!.assetId] : undefined}
                resolvedSpec={examplesByEntryId[entry.id] ? resolvedSpecsByAssetId[examplesByEntryId[entry.id]!.assetId] : undefined}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModifierCard({ modifier }: { modifier: Modifier }) {
  return (
    <div className="border border-site-muted/30 rounded-md p-4 hover:border-lpc-accent/50 transition-colors">
      <h4 className="font-bold text-site-text font-pixel mb-1">{modifier.name}</h4>
      <p className="text-site-muted text-sm mb-2">{modifier.description}</p>
      <p className="font-bold text-lpc-accent font-pixel">
        {modifier.price_min === modifier.price_max
          ? `$${modifier.price_min}`
          : `$${modifier.price_min}–$${modifier.price_max}`}
      </p>
      {modifier.price_note && <p className="text-xs text-site-muted mt-1">{modifier.price_note}</p>}
    </div>
  );
}

export default function Commissions({ data, examplesByEntryId, exampleAssetsById, resolvedSpecsByAssetId }: CommissionsProps) {
  const allLpcEntries = [...data.lpc_base, ...data.lpc_addons];
  const allFeEntries = [...data.fe_base, ...data.fe_addons];

  const isOpen = data.meta.status === 'open';
  const bannerText = data.meta.status === 'open' ? 'OPEN!' : data.meta.status === 'waitlist' ? 'Waitlist' : 'Closed';
  const bannerClass = data.meta.status === 'open'
    ? 'border-open-line/80 text-open-text bg-open-bg/55 shadow-[0_0_20px_rgba(217,226,102,0.30)]'
    : data.meta.status === 'waitlist'
      ? 'border-amber-400/70 text-amber-200 bg-amber-900/20'
      : 'border-rose-400/70 text-rose-200 bg-rose-900/20';

  return (
    <>
      <Head>
        <title>Commissions - JaidynReiman Productions</title>
        <meta name="description" content="Commission LPC and Fire Emblem assets from Jaidyn Reiman" />
      </Head>

      <main className="page-wide py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-site-text mb-1">Commissions</h1>
          <p className="text-site-muted font-body">Custom LPC and FE commission work with real example previews in each card.</p>
        </header>

        <div className={`mb-8 border rounded-md px-4 py-2 inline-flex items-center gap-2 font-pixel text-sm ${bannerClass}`}>
          <span>Status:</span>
          <span className="font-bold">{bannerText}</span>
        </div>

        <section className="mb-12 border border-site-muted/30 rounded-md p-5">
          <p className="text-site-muted font-body text-sm mb-4">
            Hello, I&apos;m JaidynReiman and I&apos;m currently taking Commissions! Feel free to browse the options below or the assets across the rest of the website. Most assets are modifications of existing assets, but I am willing to accept custom sprites with special accomodation. Reach out to me directly on my blog website or on Ko-Fi.
          </p>

          <h2 className="text-site-text font-pixel text-sm mb-2">Payment Methods:</h2>
          <p className="text-site-muted font-body text-sm mb-4">
            All commissions are available on Ko-Fi. If you would prefer just to take Paypal, let me know and we can make an arrangement and I will send you a Paypal invoice.
          </p>

          <h2 className="text-site-text font-pixel text-sm mb-2">Licensing:</h2>
          <p className="text-site-muted font-body text-sm mb-2">
            Any custom assets, including LPC or even FE style assets, will be available in a commercial free CC license by default. Special accomodation can be provided for an extra fee.
          </p>
          <p className="text-site-muted font-body text-sm">
            FE asset edits or modifications cannot be used commercially. Only commission this if you&apos;re just looking for FE Fangame graphics.
          </p>
        </section>

        {!isOpen && data.meta.status_note && (
          <div className="mb-12 p-4 border border-site-muted/30 rounded-md">
            <p className="text-site-muted text-sm">{data.meta.status_note}</p>
          </div>
        )}

        <CommissionSection
          title="LPC Commissions"
          entries={allLpcEntries}
          color="lpc"
          examplesByEntryId={examplesByEntryId}
          exampleAssetsById={exampleAssetsById}
          resolvedSpecsByAssetId={resolvedSpecsByAssetId}
        />
        <CommissionSection
          title="Fire Emblem Commissions"
          entries={allFeEntries}
          color="fe"
          examplesByEntryId={examplesByEntryId}
          exampleAssetsById={exampleAssetsById}
          resolvedSpecsByAssetId={resolvedSpecsByAssetId}
        />
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<CommissionsProps> = async () => {
  const data = getResolvedCommissionData();
  const exampleAssetIds = [...new Set(Object.values(data.examplesByEntryId).map((example) => example?.assetId).filter(Boolean))] as string[];
  const allAssets = getAllAssets();
  const exampleAssets = allAssets.filter((asset) => exampleAssetIds.includes(asset.id));

  const exampleAssetsById = Object.fromEntries(exampleAssets.map((asset) => [asset.id, asset]));
  const resolvedSpecsByAssetId = resolveAssetsSpecs(exampleAssets);

  return {
    props: {
      data,
      examplesByEntryId: data.examplesByEntryId,
      exampleAssetsById,
      resolvedSpecsByAssetId,
    },
  };
};
