import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getCategoryBySlug } from 'app/CategoryService';
import { getAssetsByCategoryTree } from 'app/AssetService';
import MasonryGrid from 'components/gallery/MasonryGrid';
import AssetCard from 'components/gallery/AssetCard';
import type { Category } from 'app/models/Category';
import type { Asset } from 'app/models/Asset';

interface FeSlugProps {
  category: Category;
  section?: Category;
  treeAssets?: Asset[];
  assets?: Asset[];
  slugs: string[];
  breadcrumbs?: Array<{ label: string; href: string }>;
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

export default function FeSlug({ category, section, treeAssets, assets, slugs, breadcrumbs }: FeSlugProps) {
  const scopedAssets = treeAssets ?? assets ?? [];
  const navBreadcrumbs = breadcrumbs ?? [{ label: 'FE', href: '/fe' }, { label: category.label, href: `/fe/${slugsToPath(slugs)}` }];
  const sectionCategory = section ?? {
    ...category,
    children: [],
  };
  const [displayAssets, setDisplayAssets] = useState<Asset[]>(() => scopedAssets.slice(0, FEATURED_ASSET_COUNT));

  const treeAssetsById = useMemo(() => {
    return new Map(scopedAssets.map((asset) => [asset.id, asset]));
  }, [scopedAssets]);

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

    const picked = pickRandomAssets(scopedAssets, FEATURED_ASSET_COUNT);
    updateDisplayAssets(picked);
    setCachedAssetIds(cacheKey, picked.map((asset) => asset.id));
  }, [category.path, scopedAssets, treeAssetsById]);

  return (
    <>
      <Head>
        <title>{category.label} — FE — JaidynReiman Productions</title>
      </Head>

      <main className="section-fe page-wide py-12">
        <div className="content-with-sidebar">
          <section>
            <h1 className="text-2xl mb-2">{category.label}</h1>

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
              {navBreadcrumbs.map((crumb, index) => (
                <span key={crumb.href}>
                  {index > 0 && ' / '}
                  <Link href={crumb.href}>{crumb.label}</Link>
                </span>
              ))}
            </nav>

            {category.children.length > 0 && (
              <div className="mb-8">
                <h2 className="font-pixel text-xs uppercase tracking-widest text-site-muted mb-3">In {category.label}</h2>
                <div className="space-y-2">
                  {category.children.map((child) => (
                    <Link
                      key={child.slug}
                      href={`/fe/${category.path.replace(/^fe\/?/, '')}/${child.slug}`.replace(/\/+/g, '/')}
                      className={`sprite-card p-3 block hover:no-underline ${category.path === child.path ? 'sidebar-link-active sidebar-link-active-fe' : ''}`}
                    >
                      <h3 className="text-xs">{child.label}</h3>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="font-pixel text-xs uppercase tracking-widest text-site-muted mb-3">All FE Categories</h2>
              <div className="space-y-2 max-h-[52vh] overflow-auto pr-1">
                {sectionCategory.children.map((child) => (
                  <Link
                    key={child.slug}
                    href={`/fe/${child.slug}`}
                    className={`sprite-card p-3 block hover:no-underline ${category.path === child.path || category.path.startsWith(`${child.path}/`) ? 'sidebar-link-active sidebar-link-active-fe' : ''}`}
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

function slugsToPath(slugs: string[]): string {
  return slugs.join('/');
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
  const section = getCategoryBySlug(['fe']);
  const category = getCategoryBySlug(['fe', ...slugs]);
  if (!category || !section) return { notFound: true };

  const breadcrumbs: Array<{ label: string; href: string }> = [{ label: 'FE', href: '/fe' }];
  let current: Category | null = section;
  for (let index = 0; index < slugs.length; index += 1) {
    const slug = slugs[index];
    const child: Category | null = current?.children.find((entry) => entry.slug === slug) ?? null;
    if (!child) break;

    breadcrumbs.push({
      label: child.label,
      href: `/fe/${slugs.slice(0, index + 1).join('/')}`,
    });
    current = child;
  }

  const treeAssets = getAssetsByCategoryTree(['fe', ...slugs].join('/'));
  return { props: { category, section, treeAssets, slugs, breadcrumbs } };
};
