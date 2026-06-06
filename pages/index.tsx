import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getTopLevelCategories } from 'app/CategoryService';
import { getHomepageFeaturedAssets, getSectionPageCredits } from 'app/AssetService';
import { toPublicAssetUrl } from 'app/assetUrl';
import { resolveHomepageSpecs } from 'app/AnimationService';
import { pickRandomAssetsPreferUnrestricted } from 'app/assetSampling';
import { collectLpcBodyTypes } from 'app/lpcLayers';
import MasonryGrid from 'components/gallery/MasonryGrid';
import UnifiedAssetCard from 'components/gallery/UnifiedAssetCard';
import PageCredits from 'components/gallery/PageCredits';
import type { Category, ResolvedPageCredit } from 'app/models/Category';
import type { Asset, AnimationSpec, ResolvedFeSpec, ResolvedLpcSpec } from 'app/models/Asset';
import { SITE_URL } from 'app/siteConfig';

interface HomeProps {
  categories: Category[];
  featuredAssets: Asset[];
  resolvedSpecs: Record<string, AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec>;
  animNames: Record<string, string>;
  groupNames: Record<string, string[]>;
  bodyTypes: Record<string, string>;
  pageCredits: ResolvedPageCredit[];
  ogImage: string | null;
}

const FEATURED_ASSET_COUNT = 180;
const FEATURED_CACHE_KEY = 'home-featured-assets-v1';
const FEATURED_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

function getCachedAssetIds(): string[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(FEATURED_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { expiresAt?: number; ids?: string[] };
    if (!parsed || !Array.isArray(parsed.ids) || typeof parsed.expiresAt !== 'number') return null;
    if (Date.now() > parsed.expiresAt) return null;

    return parsed.ids;
  } catch {
    return null;
  }
}

function setCachedAssetIds(ids: string[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      FEATURED_CACHE_KEY,
      JSON.stringify({
        ids,
        expiresAt: Date.now() + FEATURED_CACHE_TTL_MS,
      }),
    );
  } catch {
    // Ignore storage errors (private mode/quota) and fall back to non-cached behavior.
  }
}

export default function Home({ categories, featuredAssets, resolvedSpecs, animNames, bodyTypes, groupNames, pageCredits, ogImage }: HomeProps) {
  const [displayAssets, setDisplayAssets] = useState<Asset[]>(() => featuredAssets);

  const featuredById = useMemo(() => {
    return new Map(featuredAssets.map((asset) => [asset.id, asset]));
  }, [featuredAssets]);

  useEffect(() => {
    const updateDisplayAssets = (assets: Asset[]) => {
      queueMicrotask(() => {
        setDisplayAssets(assets);
      });
    };

    const cachedIds = getCachedAssetIds();
    if (cachedIds && cachedIds.length > 0) {
      const cachedAssets = cachedIds
        .map((id) => featuredById.get(id))
        .filter((asset): asset is Asset => Boolean(asset));

      if (cachedAssets.length > 0) {
        updateDisplayAssets(cachedAssets);
        return;
      }
    }

    const picked = pickRandomAssetsPreferUnrestricted(featuredAssets, FEATURED_ASSET_COUNT);
    updateDisplayAssets(picked);
    setCachedAssetIds(picked.map((asset: Asset) => asset.id));
  }, [featuredAssets, featuredById]);

  const bodyTypeMap = useMemo(() => new Map(Object.entries(bodyTypes)), [bodyTypes]);
  const groupNamesMap = useMemo(() => new Map(Object.entries(groupNames)), [groupNames]);

  return (
    <>
      <Head>
        <title>JaidynReiman Productions - Sprite &amp; Game Asset Portfolio</title>
        <meta name="description" content="Pixel art sprites, tilesets, and game assets by JaidynReiman." />
        <meta property="og:title" content="JaidynReiman Productions - Sprite & Game Asset Portfolio" />
        <meta property="og:description" content="Pixel art sprites, tilesets, and game assets by JaidynReiman." />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE_URL} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'JaidynReiman Productions',
            url: SITE_URL,
            description: 'Pixel art sprites, tilesets, and game assets by JaidynReiman.',
            author: { '@type': 'Person', name: 'JaidynReiman' },
          }).replace(/</g, '\\u003c') }}
        />
      </Head>

      {/* Main: asset gallery or section nav */}
      <main className="page-wide py-10">
        <h1 className="sr-only">JaidynReiman Productions — Sprite & Game Asset Portfolio</h1>
        {displayAssets.length > 0 ? (
          <>
            <h2 className="font-pixel text-sm text-site-muted mb-6 tracking-widest uppercase">Featured Picks</h2>
            <MasonryGrid className="masonry-grid-featured">
              {displayAssets.map((asset) => {
                return (
                  <UnifiedAssetCard
                    key={asset.id}
                    asset={asset}
                    resolvedSpec={resolvedSpecs[asset.id]}
                    animName={animNames[asset.id] ?? asset.animations?.[0]}
                    bodyType={bodyTypeMap.get(asset.id)}
                    groupAnimNames={groupNamesMap.get(asset.id)}
                  />
                );
              })}
            </MasonryGrid>
            <PageCredits credits={pageCredits} />
          </>
        ) : (
          <>
            <h2 className="font-pixel text-sm text-site-muted mb-6 tracking-widest uppercase">Browse by section</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {categories.map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/${cat.slug}`}
                  className="sprite-card p-8 block hover:no-underline group"
                  style={{
                    borderLeftColor: cat.accent === 'warm' ? 'var(--accent-fe)' : 'var(--accent-lpc)',
                  }}
                >
                  <div
                    className="inline-block font-pixel text-xs px-2 py-0.5 mb-4"
                    style={{
                      background: cat.accent === 'warm' ? 'var(--accent-fe)' : 'var(--accent-lpc)',
                      color: '#071a0f',
                    }}
                  >
                    {cat.accent === 'warm' ? 'FE' : 'LPC'}
                  </div>
                  <h2 className="text-xl mb-2 group-hover:text-lpc-accentLight transition-colors">{cat.label}</h2>
                  {cat.description && (
                    <p className="text-site-muted font-body text-sm">{cat.description}</p>
                  )}
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<HomeProps> = async () => {
  const categories = getTopLevelCategories();
  const featuredAssets = getHomepageFeaturedAssets()
    .filter((asset) => Boolean(toPublicAssetUrl(asset.preview)))
    .slice(0, FEATURED_ASSET_COUNT);
  const { specs: resolvedSpecs, animNames, bodyTypes, groupNames } = resolveHomepageSpecs(featuredAssets);
  const pageCredits = [
    ...getSectionPageCredits('lpc'),
    ...getSectionPageCredits('fe'),
  ];
  const firstPreview = featuredAssets.find((a) => a.preview)?.preview;
  const ogImage = firstPreview
    ? `${SITE_URL}${firstPreview.startsWith('/') ? '' : '/'}${firstPreview}`
    : null;
  return { props: { categories, featuredAssets, resolvedSpecs, animNames, bodyTypes, groupNames, pageCredits, ogImage } };
};
