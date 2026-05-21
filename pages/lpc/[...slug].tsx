import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { getCategoryBySlug } from 'app/CategoryService';
import { getAssetsByCategoryTree, getSectionPageCredits } from 'app/AssetService';
import { resolveAssetsSpecs } from 'app/AnimationService';
import { toPublicAssetUrl } from 'app/assetUrl';
import { getCategorySampleCount, pickRandomAssetsPreferUnrestricted } from 'app/assetSampling';
import { collectLpcBodyTypes } from 'app/lpcLayers';
import MasonryGrid from 'components/gallery/MasonryGrid';
import AssetCard, { LpcCard, LpcGroupCard } from 'components/gallery/AssetCard';
import PageCredits from 'components/gallery/PageCredits';
import type { Category, ResolvedPageCredit } from 'app/models/Category';
import type { Asset, ResolvedLpcSpec, ResolvedFeSpec } from 'app/models/Asset';

interface LpcSlugProps {
  category: Category;
  section?: Category;
  treeAssets?: Asset[];
  assets?: Asset[];
  slugs: string[];
  breadcrumbs?: Array<{ label: string; href: string }>;
  resolvedSpecs?: Record<string, ResolvedLpcSpec | ResolvedFeSpec>;
  pageCredits: ResolvedPageCredit[];
}

const MAX_CARDS = 180;
const FEATURED_CACHE_TTL_MS = 1000 * 60 * 60 * 3;

function sortNewFirst(assets: Asset[]): Asset[] {
  return [...assets].sort((a, b) => (b.new ? 1 : 0) - (a.new ? 1 : 0));
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

export default function LpcSlug({ category, section, treeAssets, assets, slugs, breadcrumbs, resolvedSpecs, pageCredits }: LpcSlugProps) {
  const scopedAssets = useMemo(() => treeAssets ?? assets ?? [], [treeAssets, assets]);
  const featuredAssetCount = useMemo(() => getCategorySampleCount(category.path, 'lpc'), [category.path]);
  const navBreadcrumbs = breadcrumbs ?? [{ label: 'LPC', href: '/lpc' }, { label: category.label, href: `/lpc/${slugsToPath(slugs)}` }];
  const sectionCategory = section ?? { ...category, children: [] };
  const [displayAssets, setDisplayAssets] = useState<Asset[]>(() => sortNewFirst(scopedAssets.slice(0, featuredAssetCount)));

  const treeAssetsById = useMemo(() => {
    return new Map(scopedAssets.map((asset) => [asset.id, asset]));
  }, [scopedAssets]);

  const cards = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (const asset of displayAssets) {
      if (result.length >= MAX_CARDS) break;
      const assetStartCount = result.length;
      const lpcSpec = resolvedSpecs?.[asset.id] as ResolvedLpcSpec | undefined;
      const derivedBodyTypes = collectLpcBodyTypes(asset.layers);
      const bodyTypes: (string | undefined)[] = asset.body_types?.length
        ? asset.body_types
        : (derivedBodyTypes.length > 0 ? derivedBodyTypes : [undefined]);

      for (const bodyType of bodyTypes) {
        if (result.length >= MAX_CARDS) break;

        const standaloneAnims = (asset.animations ?? []).filter((n) => {
          const spec = lpcSpec?.[n];
          if (!spec) return false;
          if (spec?.standalone === false) return false;
          if (spec?.body_types?.length && (!bodyType || !spec.body_types.includes(bodyType))) return false;
          return true;
        });

        if (standaloneAnims.length === 0) {
          continue;
        }

        // Pass 1: find groups whose every member is present in standaloneAnims.
        // Only the spec that *defines* the group array (the primary) triggers group formation.
        const standaloneAnimSet = new Set(standaloneAnims);
        const claimed = new Set<string>();
        const groups: { key: string; animNames: string[] }[] = [];
        for (const animName of standaloneAnims) {
          const groupMembers = lpcSpec?.[animName]?.group;
          if (!groupMembers?.length) continue;
          if (groupMembers.every((m) => standaloneAnimSet.has(m))) {
            groups.push({ key: animName, animNames: groupMembers });
            for (const m of groupMembers) claimed.add(m);
          }
        }

        // Pass 2: render unclaimed animations as standalone cards, then group cards.
        for (const animName of standaloneAnims) {
          if (result.length >= MAX_CARDS) break;
          if (claimed.has(animName)) continue;
          result.push(
            <LpcCard
              key={`${asset.id}:${bodyType ?? ''}:${animName}`}
              asset={asset} animName={animName} bodyType={bodyType}
              backgroundLayers={asset.context_layers}
              animSpec={lpcSpec?.[animName]} allAnimSpecs={lpcSpec}
            />,
          );
        }

        for (const { key, animNames: groupAnimNames } of groups) {
          if (result.length >= MAX_CARDS) break;
          const specs = groupAnimNames.map((n) => lpcSpec?.[n]);
          result.push(
            <LpcGroupCard
              key={`${asset.id}:${bodyType ?? ''}:group:${key}`}
              asset={asset} animNames={groupAnimNames} specs={specs}
              bodyType={bodyType} backgroundLayers={asset.context_layers}
              allAnimSpecs={lpcSpec}
            />,
          );
        }
      }

      if (result.length === assetStartCount && result.length < MAX_CARDS && toPublicAssetUrl(asset.preview)) {
        result.push(<AssetCard key={asset.id} asset={asset} />);
      }
    }
    return result;
  }, [displayAssets, resolvedSpecs]);

  useEffect(() => {
    const cacheKey = getCategoryCacheKey(category.path);

    const updateDisplayAssets = (nextAssets: Asset[]) => {
      queueMicrotask(() => {
        setDisplayAssets(sortNewFirst(nextAssets));
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

    const picked = pickRandomAssetsPreferUnrestricted(scopedAssets, featuredAssetCount);
    updateDisplayAssets(picked);
    setCachedAssetIds(cacheKey, picked.map((asset) => asset.id));
  }, [category.path, scopedAssets, treeAssetsById, featuredAssetCount]);

  return (
    <>
      <Head>
        <title>{`${category.label} - LPC - JaidynReiman Productions`}</title>
      </Head>

      <main className="section-lpc page-wide py-12">
        <div className="content-with-sidebar">
          <section>
            <h1 className="text-2xl mb-2">{category.label}</h1>

            {cards.length > 0 ? (
              <MasonryGrid>
                {cards}
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
                      href={`/lpc/${category.path.replace(/^lpc\/?/, '')}/${child.slug}`.replace(/\/+/g, '/')}
                      className={`sprite-card p-3 block hover:no-underline ${category.path === child.path ? 'sidebar-link-active sidebar-link-active-lpc' : ''}`}
                    >
                      <h3 className="text-xs">{child.label}</h3>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="font-pixel text-xs uppercase tracking-widest text-site-muted mb-3">All LPC Categories</h2>
              <div className="space-y-2">
                {sectionCategory.children.map((child) => (
                  <Link
                    key={child.slug}
                    href={`/lpc/${child.slug}`}
                    className={`sprite-card p-3 block hover:no-underline ${category.path === child.path || category.path.startsWith(`${child.path}/`) ? 'sidebar-link-active sidebar-link-active-lpc' : ''}`}
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

  const lpc = getCategoryBySlug(['lpc']);
  if (lpc) {
    for (const child of lpc.children) {
      collectPaths(child, [child.slug]);
    }
  }

  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<LpcSlugProps> = async ({ params }) => {
  const slugs = params?.slug as string[];
  const section = getCategoryBySlug(['lpc']);
  const category = getCategoryBySlug(['lpc', ...slugs]);
  if (!category || !section) return { notFound: true };

  const breadcrumbs: Array<{ label: string; href: string }> = [{ label: 'LPC', href: '/lpc' }];
  let current: Category | null = section;
  for (let index = 0; index < slugs.length; index += 1) {
    const slug = slugs[index];
    const child: Category | null = current?.children.find((entry) => entry.slug === slug) ?? null;
    if (!child) break;

    breadcrumbs.push({
      label: child.label,
      href: `/lpc/${slugs.slice(0, index + 1).join('/')}`,
    });
    current = child;
  }

  const treeAssets = getAssetsByCategoryTree(['lpc', ...slugs].join('/'));
  const resolvedSpecs = resolveAssetsSpecs(treeAssets);
  const pageCredits = getSectionPageCredits(['lpc', ...slugs].join('/'), treeAssets);
  return { props: { category, section, treeAssets, slugs, breadcrumbs, resolvedSpecs, pageCredits } };
};
