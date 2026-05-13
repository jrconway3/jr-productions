import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getTopLevelCategories } from 'app/CategoryService';
import { getHomepageFeaturedAssets, getSectionPageCredits } from 'app/AssetService';
import { toPublicAssetUrl } from 'app/assetUrl';
import { resolveHomepageSpecs } from 'app/AnimationService';
import { collectLpcBodyTypes } from 'app/lpcLayers';
import MasonryGrid from 'components/gallery/MasonryGrid';
import AssetCard, { LpcCard, LpcGroupCard, FeCard } from 'components/gallery/AssetCard';
import PageCredits from 'components/gallery/PageCredits';
import type { Category, ResolvedPageCredit } from 'app/models/Category';
import type { Asset, AnimationSpec, ResolvedFeSpec, ResolvedLpcSpec } from 'app/models/Asset';

interface HomeProps {
  categories: Category[];
  featuredAssets: Asset[];
  resolvedSpecs: Record<string, AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec>;
  animNames: Record<string, string>;
  groupNames: Record<string, string[]>;
  bodyTypes: Record<string, string>;
  pageCredits: ResolvedPageCredit[];
}

const FEATURED_ASSET_COUNT = 180;
const FEATURED_CACHE_KEY = 'home-featured-assets-v1';
const FEATURED_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

function isAnimationSpec(value: AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec | undefined): value is AnimationSpec {
  return Boolean(value && typeof value === 'object' && 'id' in value);
}

function isResolvedLpcSpec(value: AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec | undefined): value is ResolvedLpcSpec {
  return Boolean(value && typeof value === 'object' && !('id' in value));
}

function pickRandomAssets(pool: Asset[], count: number): Asset[] {
  if (pool.length <= count) return [...pool];
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  return shuffled.slice(0, count);
}

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

export default function Home({ categories, featuredAssets, resolvedSpecs, animNames, bodyTypes, groupNames, pageCredits }: HomeProps) {
  const [displayAssets, setDisplayAssets] = useState<Asset[]>(() => featuredAssets.slice(0, FEATURED_ASSET_COUNT));

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

    const picked = pickRandomAssets(featuredAssets, FEATURED_ASSET_COUNT);
    updateDisplayAssets(picked);
    setCachedAssetIds(picked.map((asset) => asset.id));
  }, [featuredAssets, featuredById]);

  const bodyTypeMap = useMemo(() => new Map(Object.entries(bodyTypes)), [bodyTypes]);
  const groupNamesMap = useMemo(() => new Map(Object.entries(groupNames)), [groupNames]);

  return (
    <>
      <Head>
        <title>JaidynReiman Productions — Sprite &amp; Game Asset Portfolio</title>
        <meta name="description" content="Pixel art sprites, tilesets, and game assets by JaidynReiman." />
      </Head>

      {/* Main: asset gallery or section nav */}
      <main className="page-wide py-10">
        {displayAssets.length > 0 ? (
          <>
            <h2 className="font-pixel text-sm text-site-muted mb-6 tracking-widest uppercase">Featured Picks</h2>
            <MasonryGrid className="masonry-grid-featured">
              {displayAssets.map((asset) => {
                const resolvedSpec = resolvedSpecs[asset.id];
                if (asset.type === 'lpc' && asset.animations?.length) {
                  const animName = animNames[asset.id] ?? asset.animations[0];
                  const fallbackTypes = asset.body_types?.length ? asset.body_types : collectLpcBodyTypes(asset.layers);
                  const bodyType = bodyTypeMap.get(asset.id) || fallbackTypes[0];
                  const groupAnimNames = groupNamesMap.get(asset.id);
                  if (groupAnimNames?.length) {
                    const groupSpec = isResolvedLpcSpec(resolvedSpec) ? resolvedSpec : undefined;
                    const validAnimNames = groupAnimNames.filter((name) => groupSpec?.[name]);
                    if (validAnimNames.length > 1) {
                      return (
                        <LpcGroupCard
                          key={asset.id}
                          asset={asset}
                          animNames={validAnimNames}
                          specs={validAnimNames.map((name) => groupSpec?.[name])}
                          bodyType={bodyType}
                          backgroundLayers={asset.context_layers}
                          allAnimSpecs={groupSpec}
                        />
                      );
                    }

                    if (validAnimNames.length === 1) {
                      const fallbackAnimName = validAnimNames[0];
                      return (
                        <LpcCard
                          key={asset.id}
                          asset={asset}
                          animName={fallbackAnimName}
                          bodyType={bodyType}
                          backgroundLayers={asset.context_layers}
                          animSpec={groupSpec?.[fallbackAnimName]}
                          allAnimSpecs={groupSpec}
                        />
                      );
                    }

                    return <AssetCard key={asset.id} asset={asset} />;
                  }

                  const animSpec = isAnimationSpec(resolvedSpec) ? resolvedSpec : undefined;
                  if (!animSpec) {
                    return <AssetCard key={asset.id} asset={asset} />;
                  }

                  return (
                    <LpcCard
                      key={asset.id}
                      asset={asset}
                      animName={animName}
                      bodyType={bodyType}
                      backgroundLayers={asset.context_layers}
                      animSpec={animSpec}
                    />
                  );
                }
                if (asset.type === 'fe') {
                  return (
                    <FeCard
                      key={asset.id}
                      asset={asset}
                      feSpec={resolvedSpecs[asset.id] as ResolvedFeSpec | undefined}
                    />
                  );
                }
                return <AssetCard key={asset.id} asset={asset} />;
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
    .slice(0, 400);
  const { specs: resolvedSpecs, animNames, bodyTypes, groupNames } = resolveHomepageSpecs(featuredAssets);
  const pageCredits = [
    ...getSectionPageCredits('lpc'),
    ...getSectionPageCredits('fe'),
  ];
  return { props: { categories, featuredAssets, resolvedSpecs, animNames, bodyTypes, groupNames, pageCredits } };
};
