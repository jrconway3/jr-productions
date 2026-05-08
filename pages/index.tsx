import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getTopLevelCategories } from 'app/CategoryService';
import { getAllAssets } from 'app/AssetService';
import { toPublicAssetUrl } from 'app/assetUrl';
import MasonryGrid from 'components/gallery/MasonryGrid';
import AssetCard from 'components/gallery/AssetCard';
import type { Category } from 'app/models/Category';
import type { Asset } from 'app/models/Asset';

interface HomeProps {
  categories: Category[];
  featuredAssets: Asset[];
}

const FEATURED_ASSET_COUNT = 36;
const FEATURED_CACHE_KEY = 'home-featured-assets-v1';
const FEATURED_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

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

export default function Home({ categories, featuredAssets }: HomeProps) {
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

  return (
    <>
      <Head>
        <title>JaidynReiman Productions — Sprite &amp; Game Asset Portfolio</title>
        <meta name="description" content="Pixel art sprites, tilesets, and game assets by JaidynReiman." />
      </Head>

      {/* Hero: title + sprite collage */}
      <div className="hero-banner">
        <div className="page-wide py-12 flex flex-col lg:flex-row gap-8 items-center lg:items-stretch">
          <div className="shrink-0 lg:flex lg:flex-col lg:justify-center">
            <h1 className="text-4xl xl:text-5xl mb-4 leading-tight">
              JaidynReiman<br />
              <span className="text-lpc-accent">Productions</span>
            </h1>
            <p className="font-body text-site-muted text-base max-w-sm mb-6">
              Pixel art sprites, game assets, and tilesets — free to use under open licenses.
            </p>
            <div className="flex gap-3 flex-wrap">
              {categories.map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/${cat.slug}`}
                  className="font-pixel text-xs px-4 py-2 border transition-colors"
                  style={{
                    borderColor: cat.accent === 'warm' ? 'var(--accent-fe)' : 'var(--accent-lpc)',
                    color: cat.accent === 'warm' ? 'var(--accent-fe)' : 'var(--accent-lpc)',
                  }}
                >
                  {cat.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Standalone hero banner area (intentionally not tied to featured asset cards). */}
          <div className="flex-1 w-full lg:w-auto">
            <div className="hero-standalone-banner hero-standalone-banner--hidden" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Main: asset gallery or section nav */}
      <main className="page-wide py-10">
        {displayAssets.length > 0 ? (
          <>
            <h2 className="font-pixel text-sm text-site-muted mb-6 tracking-widest uppercase">Featured Picks</h2>
            <MasonryGrid className="masonry-grid-featured">
              {displayAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} sizeMode="featured" />
              ))}
            </MasonryGrid>
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
  const featuredAssets = getAllAssets()
    .filter((asset) => Boolean(toPublicAssetUrl(asset.preview)))
    .slice(0, 240);
  return { props: { categories, featuredAssets } };
};
