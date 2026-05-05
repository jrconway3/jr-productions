import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getTopLevelCategories } from 'app/CategoryService';
import { getAllAssets } from 'app/AssetService';
import MasonryGrid from 'components/gallery/MasonryGrid';
import AssetCard from 'components/gallery/AssetCard';
import type { Category } from 'app/models/Category';
import type { Asset } from 'app/models/Asset';

interface HomeProps {
  categories: Category[];
  featuredAssets: Asset[];
}

export default function Home({ categories, featuredAssets }: HomeProps) {
  return (
    <>
      <Head>
        <title>JaidynReiman Productions — Sprite &amp; Game Asset Portfolio</title>
        <meta name="description" content="Pixel art sprites, tilesets, and game assets by JaidynReiman." />
      </Head>

      {/* Hero: title + sprite collage */}
      <div className="hero-banner">
        <div className="page-wide py-12 flex flex-col lg:flex-row gap-8 items-center">
          <div className="shrink-0">
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

          {/* Sprite collage — replace inner content with <Image> tiles when assets are available */}
          <div className="flex-1 w-full lg:w-auto">
            <div className="sprite-collage-grid">
              {featuredAssets.length > 0
                ? featuredAssets.slice(0, 12).map((asset) => (
                    <Link key={asset.id} href={`/${asset.category}/${asset.id}`} className="block">
                      <img
                        src={`/${asset.preview}`}
                        alt={asset.name}
                        className="w-full h-full object-contain"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </Link>
                  ))
                : Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="sprite-collage-placeholder" />
                  ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main: asset gallery or section nav */}
      <main className="page-wide py-10">
        {featuredAssets.length > 0 ? (
          <>
            <h2 className="font-pixel text-sm text-site-muted mb-6 tracking-widest uppercase">All Assets</h2>
            <MasonryGrid>
              {featuredAssets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} />
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
  const featuredAssets = getAllAssets().slice(0, 48);
  return { props: { categories, featuredAssets } };
};
