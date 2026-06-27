import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getCategoryBySlug } from 'app/CategoryService';
import { getAssetsByCategoryTree, getSectionPageCredits } from 'app/AssetService';
import { resolveHomepageSpecs } from 'app/AnimationService';
import { getCategorySampleCount, pickRandomAssetsPreferUnrestricted, resolvePrerequisites } from 'app/assetSampling';
import { buildPrereqLayersByAssetId } from 'app/prereqLayers';
import MasonryGrid from 'components/gallery/MasonryGrid';
import PageCredits from 'components/gallery/PageCredits';
import UnifiedAssetCard from 'components/gallery/UnifiedAssetCard';
import type { Category, ResolvedPageCredit } from 'app/models/Category';
import type { Asset, AnimationSpec, ResolvedFeSpec, ResolvedLpcSpec } from 'app/models/Asset';
import { SITE_URL } from 'app/siteConfig';

interface LpcIndexProps {
  category: Category;
  treeAssets?: Asset[];
  resolvedSpecs?: Record<string, AnimationSpec | ResolvedFeSpec | ResolvedLpcSpec>;
  animNames?: Record<string, string>;
  bodyTypes?: Record<string, string>;
  groupNames?: Record<string, string[]>;
  pageCredits?: ResolvedPageCredit[];
  pageUrl: string;
  ogImage: string | null;
}

const FEATURED_CACHE_TTL_MS = 1000 * 60 * 60 * 3;

function getCategoryCacheKey(path: string): string {
  return `category-featured-v4:${path}`;
}

function getCachedAssetIds(cacheKey: string): string[] | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { expiresAt?: number; ids?: string[] };
    if (!parsed || !Array.isArray(parsed.ids) || typeof parsed.expiresAt !== 'number') return null;
    if (Date.now() > parsed.expiresAt) return null;

    return parsed.ids;
  } catch {
    return null;
  }
}

function setCachedAssetIds(cacheKey: string, ids: string[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      cacheKey,
      JSON.stringify({
        ids,
        expiresAt: Date.now() + FEATURED_CACHE_TTL_MS,
      }),
    );
  } catch {
    // Ignore storage failures and continue without cache.
  }
}

export default function LpcIndex({ category, treeAssets, resolvedSpecs = {}, animNames = {}, bodyTypes = {}, groupNames = {}, pageCredits = [], pageUrl, ogImage }: LpcIndexProps) {
  const allAssets = useMemo(() => treeAssets ?? [], [treeAssets]);
  const featuredAssetCount = useMemo(() => getCategorySampleCount(category.path, 'lpc'), [category.path]);
  const [displayAssets, setDisplayAssets] = useState<Asset[]>(() => allAssets.slice(0, featuredAssetCount));

  const treeAssetsById = useMemo(() => {
    return new Map(allAssets.map((asset) => [asset.id, asset]));
  }, [allAssets]);

  const prereqLayersByAssetId = useMemo(
    () => buildPrereqLayersByAssetId(displayAssets),
    [displayAssets],
  );

  useEffect(() => {
    const cacheKey = getCategoryCacheKey(category.path);

    const updateDisplayAssets = (nextAssets: Asset[]) => {
      queueMicrotask(() => {
        setDisplayAssets(nextAssets);
      });
    };

    const cachedIds = getCachedAssetIds(cacheKey);
    if (cachedIds && cachedIds.length > 0) {
      const cachedAssets = cachedIds
        .map((id) => treeAssetsById.get(id))
        .filter((asset): asset is Asset => Boolean(asset));

      if (cachedAssets.length > 0) {
        updateDisplayAssets(cachedAssets);
        return;
      }
    }

    const picked = pickRandomAssetsPreferUnrestricted(allAssets, featuredAssetCount);
    const resolved = resolvePrerequisites(picked, allAssets);
    updateDisplayAssets(resolved);
    setCachedAssetIds(cacheKey, resolved.map((asset) => asset.id));
  }, [category.path, allAssets, treeAssetsById, featuredAssetCount]);

  return (
    <>
      <Head>
        <title>{`${category.label} - JaidynReiman Productions`}</title>
        {category.description && <meta name="description" content={category.description} />}
        <meta property="og:title" content={`${category.label} - JaidynReiman Productions`} />
        {category.description && <meta property="og:description" content={category.description} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `${category.label} - JaidynReiman Productions`,
            description: category.description ?? '',
            url: pageUrl,
            author: { '@type': 'Person', name: 'JaidynReiman' },
          }).replace(/</g, '\\u003c') }}
        />
      </Head>

      <main className="section-lpc page-wide py-12">
        <div className="content-with-sidebar">
          <section>
            <h1 className="text-2xl mb-2">{category.label}</h1>
            {category.description && (
              <p className="text-site-muted font-body mb-6">{category.description}</p>
            )}

            {displayAssets.length > 0 ? (
              <MasonryGrid>
                {displayAssets.map((asset) => {
                  const prereqLayers = prereqLayersByAssetId.get(asset.id);
                  const bgLayers = prereqLayers?.length
                    ? [...prereqLayers, ...(asset.context_layers ?? [])]
                    : asset.context_layers;
                  return (
                    <UnifiedAssetCard
                      key={asset.id}
                      asset={asset}
                      resolvedSpec={resolvedSpecs[asset.id]}
                      animName={animNames[asset.id] ?? asset.animations?.[0]}
                      bodyType={bodyTypes[asset.id]}
                      groupAnimNames={groupNames[asset.id]}
                      backgroundLayers={bgLayers}
                    />
                  );
                })}
              </MasonryGrid>
            ) : (
              <p className="text-site-muted font-body">No assets yet.</p>
            )}
          </section>

          <aside className="content-sidebar">
            <nav className="text-site-muted font-body text-sm mb-6">
              <Link href="/lpc">LPC</Link>
            </nav>

            <div>
              <h2 className="font-pixel text-xs uppercase tracking-widest text-site-muted mb-3">All LPC Categories</h2>
              <div className="space-y-2">
                {category.children.map((child) => (
                  <Link
                    key={child.slug}
                    href={`/lpc/${child.slug}`}
                    className="sprite-card p-3 block hover:no-underline"
                  >
                    <h3 className="text-xs">{child.label}</h3>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
        <PageCredits credits={pageCredits} />
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<LpcIndexProps> = async () => {
  const category = getCategoryBySlug(['lpc']);
  if (!category) return { notFound: true };

  const treeAssets = getAssetsByCategoryTree('lpc');
  const { specs: resolvedSpecs, animNames, bodyTypes, groupNames } = resolveHomepageSpecs(treeAssets);
  const pageCredits = getSectionPageCredits('lpc', treeAssets);
  const firstPreview = treeAssets.find((a) => a.preview)?.preview;
  const ogImage = firstPreview
    ? `${SITE_URL}${firstPreview.startsWith('/') ? '' : '/'}${firstPreview}`
    : null;
  return { props: { category, treeAssets, resolvedSpecs, animNames, bodyTypes, groupNames, pageCredits, pageUrl: `${SITE_URL}/lpc`, ogImage } };
};
