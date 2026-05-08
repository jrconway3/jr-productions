import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getCategoryBySlug } from 'app/CategoryService';
import { getAssetsByCategoryTree } from 'app/AssetService';
import MasonryGrid from 'components/gallery/MasonryGrid';
import AssetCard from 'components/gallery/AssetCard';
import type { Category } from 'app/models/Category';
import type { Asset } from 'app/models/Asset';

interface FeIndexProps {
  category: Category;
  treeAssets?: Asset[];
}

const FEATURED_ASSET_COUNT = 48;
const FEATURED_CACHE_TTL_MS = 1000 * 60 * 60 * 3;

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

function getCategoryCacheKey(path: string): string {
  return `category-featured-v1:${path}`;
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

export default function FeIndex({ category, treeAssets }: FeIndexProps) {
  const allAssets = treeAssets ?? [];
  const [displayAssets, setDisplayAssets] = useState<Asset[]>(() => allAssets.slice(0, FEATURED_ASSET_COUNT));

  const treeAssetsById = useMemo(() => {
    return new Map(allAssets.map((asset) => [asset.id, asset]));
  }, [allAssets]);

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

    const picked = pickRandomAssets(allAssets, FEATURED_ASSET_COUNT);
    updateDisplayAssets(picked);
    setCachedAssetIds(cacheKey, picked.map((asset) => asset.id));
  }, [category.path, allAssets, treeAssetsById]);

  return (
    <>
      <Head>
        <title>{category.label} — JaidynReiman Productions</title>
      </Head>

      <main className="section-fe page-wide py-12">
        <div className="content-with-sidebar">
          <section>
            <h1 className="text-2xl mb-2">{category.label}</h1>
            {category.description && (
              <p className="text-site-muted font-body mb-6">{category.description}</p>
            )}

            {displayAssets.length > 0 ? (
              <MasonryGrid>
                {displayAssets.map((asset) => (
                  <AssetCard key={asset.id} asset={asset} />
                ))}
              </MasonryGrid>
            ) : (
              <p className="text-site-muted font-body">No assets yet.</p>
            )}
          </section>

          <aside className="content-sidebar">
            <nav className="text-site-muted font-body text-sm mb-6">
              <Link href="/fe">FE</Link>
            </nav>

            <div>
              <h2 className="font-pixel text-xs uppercase tracking-widest text-site-muted mb-3">All FE Categories</h2>
              <div className="space-y-2 max-h-[52vh] overflow-auto pr-1">
                {category.children.map((child) => (
                  <Link
                    key={child.slug}
                    href={`/fe/${child.slug}`}
                    className="sprite-card p-3 block hover:no-underline"
                  >
                    <h3 className="text-xs">{child.label}</h3>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<FeIndexProps> = async () => {
  const category = getCategoryBySlug(['fe']);
  if (!category) return { notFound: true };

  const treeAssets = getAssetsByCategoryTree('fe');
  return { props: { category, treeAssets } };
};
