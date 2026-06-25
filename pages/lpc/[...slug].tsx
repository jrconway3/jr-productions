import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { getCategoryBySlug } from 'app/CategoryService';
import { getAssetsByCategoryTree, getSectionPageCredits } from 'app/AssetService';
import { resolveAssetsSpecs, resolveHomepageSpecs } from 'app/AnimationService';
import { toPublicAssetUrl } from 'app/assetUrl';
import { getCategorySampleCount, pickRandomAssetsPreferUnrestricted, resolvePrerequisites } from 'app/assetSampling';
import { collectLpcBodyTypes, expandLpcLayers } from 'app/lpcLayers';
import MasonryGrid from 'components/gallery/MasonryGrid';
import AssetCard, { LpcCard, LpcGroupCard } from 'components/gallery/AssetCard';
import PageCredits from 'components/gallery/PageCredits';
import type { BackgroundLayer, Category, ResolvedPageCredit } from 'app/models/Category';
import type { Asset, ResolvedLpcSpec, ResolvedFeSpec } from 'app/models/Asset';
import { SITE_URL } from 'app/siteConfig';

interface LpcSlugProps {
  category: Category;
  section?: Category;
  treeAssets?: Asset[];
  prereqAssets?: Asset[];
  assets?: Asset[];
  slugs: string[];
  breadcrumbs?: Array<{ label: string; href: string }>;
  resolvedSpecs?: Record<string, ResolvedLpcSpec | ResolvedFeSpec>;
  animNames?: Record<string, string>;
  pageCredits: ResolvedPageCredit[];
  pageUrl: string;
  ogImage: string | null;
}

const MAX_CARDS = 180;
const FEATURED_CACHE_TTL_MS = 1000 * 60 * 60 * 3;

function sortNewFirst(assets: Asset[]): Asset[] {
  return [...assets].sort((a, b) => (b.new ? 1 : 0) - (a.new ? 1 : 0));
}

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

export default function LpcSlug({ category, section, treeAssets, prereqAssets, assets, slugs, breadcrumbs, resolvedSpecs, animNames, pageCredits, pageUrl, ogImage }: LpcSlugProps) {
  const scopedAssets = useMemo(() => treeAssets ?? assets ?? [], [treeAssets, assets]);
  const featuredAssetCount = useMemo(() => getCategorySampleCount(category.path, 'lpc'), [category.path]);
  const navBreadcrumbs = breadcrumbs ?? [{ label: 'LPC', href: '/lpc' }, { label: category.label, href: `/lpc/${slugsToPath(slugs)}` }];
  const sectionCategory = section ?? { ...category, children: [] };
  const [displayAssets, setDisplayAssets] = useState<Asset[]>([]);

  const treeAssetsById = useMemo(() => {
    const map = new Map(scopedAssets.map((asset) => [asset.id, asset]));
    for (const asset of prereqAssets ?? []) map.set(asset.id, asset);
    return map;
  }, [scopedAssets, prereqAssets]);

  const resolvePool = useMemo(
    () => prereqAssets?.length ? [...scopedAssets, ...prereqAssets] : scopedAssets,
    [scopedAssets, prereqAssets],
  );

  const cards = useMemo(() => {
    const result: React.ReactNode[] = [];

    // Build prereq-asset background layers for compositing.
    const prereqLayersByAssetId = new Map<string, BackgroundLayer[]>();
    {
      const byId = new Map<string, Asset>();
      const bySubcategory = new Map<string, Asset[]>();
      const byCategory = new Map<string, Asset[]>();
      for (const a of displayAssets) {
        byId.set(a.id, a);
        if (a.subcategory) {
          if (!bySubcategory.has(a.subcategory)) bySubcategory.set(a.subcategory, []);
          bySubcategory.get(a.subcategory)!.push(a);
        }
        if (a.category) {
          if (!byCategory.has(a.category)) byCategory.set(a.category, []);
          byCategory.get(a.category)!.push(a);
        }
      }
      for (const a of displayAssets) {
        const prereqs = a.prerequisites;
        if (!prereqs) continue;
        let prereqAsset: Asset | undefined;
        if (prereqs.asset?.length) {
          for (const id of prereqs.asset) {
            const candidate = byId.get(id);
            if (candidate && candidate.id !== a.id) { prereqAsset = candidate; break; }
          }
        }
        if (!prereqAsset && prereqs.subcategory?.length) {
          for (const sub of prereqs.subcategory) {
            const cs = bySubcategory.get(sub) ?? [];
            prereqAsset = cs.find(c => c.id !== a.id && !c.prerequisites?.subcategory?.includes(sub))
              ?? cs.find(c => c.id !== a.id);
            if (prereqAsset) break;
          }
        }
        if (!prereqAsset && prereqs.category?.length) {
          for (const cat of prereqs.category) {
            const cs = byCategory.get(cat) ?? [];
            prereqAsset = cs.find(c => c.id !== a.id && !c.prerequisites?.category?.includes(cat))
              ?? cs.find(c => c.id !== a.id);
            if (prereqAsset) break;
          }
        }
        if (!prereqAsset) continue;
        prereqLayersByAssetId.set(a.id, expandLpcLayers(prereqAsset.layers));
      }
    }

    for (const asset of displayAssets) {
      if (result.length >= MAX_CARDS) break;
      const assetStartCount = result.length;
      const lpcSpec = resolvedSpecs?.[asset.id] as ResolvedLpcSpec | undefined;
      const derivedBodyTypes = collectLpcBodyTypes(asset.layers);
      const bodyTypeList: (string | undefined)[] = asset.body_types?.length
        ? asset.body_types
        : (derivedBodyTypes.length > 0 ? derivedBodyTypes : [undefined]);

      const prereqLayers = prereqLayersByAssetId.get(asset.id);
      const bgLayers = prereqLayers?.length
        ? [...prereqLayers, ...(asset.context_layers ?? [])]
        : asset.context_layers;

      // Show ONE card per (asset × body type) using the server-picked random animation.
      // This prevents long runs of the same asset and keeps the grid varied.
      for (const bodyType of bodyTypeList) {
        if (result.length >= MAX_CARDS) break;

        const standaloneAnims = (asset.animations ?? []).filter((n) => {
          const spec = lpcSpec?.[n];
          if (!spec) return false;
          if (spec.standalone === false) return false;
          if (spec.body_types?.length && (!bodyType || !spec.body_types.includes(bodyType))) return false;
          return true;
        });

        if (standaloneAnims.length === 0) continue;

        // Use server-side-picked animation; fall back to first valid standalone.
        const pickedAnim = animNames?.[asset.id];
        const chosenAnim = (pickedAnim && standaloneAnims.includes(pickedAnim))
          ? pickedAnim
          : standaloneAnims[0];

        const chosenSpec = lpcSpec?.[chosenAnim];
        const groupMembers = chosenSpec?.group;
        const isGroupLeader = Boolean(
          groupMembers?.length && groupMembers.every((m) => standaloneAnims.includes(m))
        );

        if (isGroupLeader && groupMembers) {
          const specs = groupMembers.map((n) => lpcSpec?.[n]);
          result.push(
            <LpcGroupCard
              key={`${asset.id}:${bodyType ?? ''}:group:${chosenAnim}`}
              asset={asset} animNames={groupMembers} specs={specs}
              bodyType={bodyType} backgroundLayers={bgLayers}
              allAnimSpecs={lpcSpec}
            />,
          );
        } else {
          result.push(
            <LpcCard
              key={`${asset.id}:${bodyType ?? ''}:${chosenAnim}`}
              asset={asset} animName={chosenAnim} bodyType={bodyType}
              backgroundLayers={bgLayers}
              animSpec={chosenSpec} allAnimSpecs={lpcSpec}
            />,
          );
        }
      }

      if (result.length === assetStartCount && result.length < MAX_CARDS && toPublicAssetUrl(asset.preview)) {
        result.push(<AssetCard key={asset.id} asset={asset} />);
      }
    }
    return result;
  }, [displayAssets, resolvedSpecs, animNames]);

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
    const resolved = resolvePrerequisites(picked, resolvePool);
    updateDisplayAssets(resolved);
    setCachedAssetIds(cacheKey, resolved.map((asset) => asset.id));
  }, [category.path, scopedAssets, resolvePool, treeAssetsById, featuredAssetCount]);

  return (
    <>
      <Head>
        <title>{`${category.label} - LPC - JaidynReiman Productions`}</title>
        {category.description && <meta name="description" content={category.description} />}
        <meta property="og:title" content={`${category.label} - LPC - JaidynReiman Productions`} />
        {category.description && <meta property="og:description" content={category.description} />}
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={pageUrl} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: `${category.label} - LPC - JaidynReiman Productions`,
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

  // For deep subcategory pages, collect prerequisite assets from outside the current subtree so
  // resolvePrerequisites can find sibling/cousin assets (e.g. sleeveless shirts for a sleeves page).
  let prereqAssets: Asset[] = [];
  if (slugs.length > 1) {
    const prereqIds = new Set<string>();
    const prereqSubcategories = new Set<string>();
    for (const asset of treeAssets) {
      for (const id of asset.prerequisites?.asset ?? []) prereqIds.add(id);
      for (const sub of asset.prerequisites?.subcategory ?? []) prereqSubcategories.add(sub);
    }
    if (prereqIds.size > 0 || prereqSubcategories.size > 0) {
      const treeIds = new Set(treeAssets.map((a) => a.id));
      const sectionAll = getAssetsByCategoryTree(`lpc/${slugs[0]}`);
      prereqAssets = sectionAll.filter((a) =>
        !treeIds.has(a.id) && (
          prereqIds.has(a.id) ||
          (a.subcategory != null && prereqSubcategories.has(a.subcategory))
        ),
      );
    }
  }

  const resolvedSpecs = resolveAssetsSpecs([...treeAssets, ...(prereqAssets ?? [])]);
  const { animNames } = resolveHomepageSpecs([...treeAssets, ...prereqAssets]);
  const pageCredits = getSectionPageCredits(['lpc', ...slugs].join('/'), treeAssets);
  const firstPreview = treeAssets.find((a) => a.preview)?.preview;
  const ogImage = firstPreview
    ? `${SITE_URL}${firstPreview.startsWith('/') ? '' : '/'}${firstPreview}`
    : null;
  const pageUrl = `${SITE_URL}/lpc/${slugs.join('/')}`;
  return { props: { category, section, treeAssets, prereqAssets, slugs, breadcrumbs, resolvedSpecs, animNames, pageCredits, pageUrl, ogImage } };
};
