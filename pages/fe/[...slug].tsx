import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getCategoryBySlug } from 'app/CategoryService';
import { getAssetsByCategory } from 'app/AssetService';
import MasonryGrid from 'components/gallery/MasonryGrid';
import AssetCard from 'components/gallery/AssetCard';
import type { Category } from 'app/models/Category';
import type { Asset } from 'app/models/Asset';

interface FeSlugProps {
  category: Category;
  assets: Asset[];
  slugs: string[];
}

export default function FeSlug({ category, assets, slugs }: FeSlugProps) {
  return (
    <>
      <Head>
        <title>{category.label} — FE — JaidynReiman Productions</title>
      </Head>

      <main className="section-fe page-wide py-12">
        <nav className="text-site-muted font-body text-sm mb-6">
          <Link href="/fe">FE</Link>
          {slugs.map((seg, i) => (
            <span key={seg}>
              {' / '}
              <Link href={`/fe/${slugs.slice(0, i + 1).join('/')}`}>{seg}</Link>
            </span>
          ))}
        </nav>

        <h1 className="text-2xl mb-2">{category.label}</h1>

        {category.children.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
            {category.children.map((child) => (
              <Link
                key={child.slug}
                href={`/fe/${[...slugs, child.slug].join('/')}`}
                className="sprite-card p-4 block hover:no-underline"
              >
                <h2 className="text-sm">{child.label}</h2>
              </Link>
            ))}
          </div>
        )}

        {assets.length > 0 && (
          <MasonryGrid>
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </MasonryGrid>
        )}

        {assets.length === 0 && category.children.length === 0 && (
          <p className="text-site-muted font-body">No assets yet.</p>
        )}
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths: { params: { slug: string[] } }[] = [];

  function collectPaths(cat: Category, currentSlugs: string[]) {
    paths.push({ params: { slug: currentSlugs } });
    for (const child of cat.children) {
      collectPaths(child, [...currentSlugs, child.slug]);
    }
  }

  const fe = getCategoryBySlug(['fe']);
  if (fe) {
    for (const child of fe.children) {
      collectPaths(child, [child.slug]);
    }
  }

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<FeSlugProps> = async ({ params }) => {
  const slugs = params?.slug as string[];
  const category = getCategoryBySlug(['fe', ...slugs]);
  if (!category) return { notFound: true };

  const assets = getAssetsByCategory(['fe', ...slugs].join('/'));
  return { props: { category, assets, slugs } };
};
