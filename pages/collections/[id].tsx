import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getAllCollections, getCollectionAssets } from 'app/CollectionService';
import MasonryGrid from 'components/gallery/MasonryGrid';
import AssetCard from 'components/gallery/AssetCard';
import type { Collection } from 'app/models/Collection';
import type { Asset } from 'app/models/Asset';

interface CollectionDetailProps {
  collection: Collection;
  assets: Asset[];
}

export default function CollectionDetail({ collection, assets }: CollectionDetailProps) {
  return (
    <>
      <Head>
        <title>{collection.label} - Collections - JaidynReiman Productions</title>
      </Head>

      <main className="page-wide py-12">
        <nav className="text-site-muted font-body text-sm mb-6">
          <Link href="/collections">Collections</Link>
          {' / '}
          <span>{collection.label}</span>
        </nav>

        <h1 className="text-2xl mb-2">{collection.label}</h1>
        {collection.description && (
          <p className="text-site-muted font-body mb-2">{collection.description}</p>
        )}
        {collection.oga_url && (
          <a
            href={collection.oga_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-lpc-accentLight font-body text-sm underline"
          >
            View on OpenGameArt
          </a>
        )}

        <div className="mt-10">
          {assets.length > 0 ? (
            <MasonryGrid>
              {assets.map((asset) => (
                <AssetCard key={asset.id} asset={asset} />
              ))}
            </MasonryGrid>
          ) : (
            <p className="text-site-muted font-body">No assets in this collection yet.</p>
          )}
        </div>
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const collections = getAllCollections();
  return {
    paths: collections.map((c) => ({ params: { id: c.id } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<CollectionDetailProps> = async ({ params }) => {
  const id = params?.id as string;
  const collections = getAllCollections();
  const collection = collections.find((c) => c.id === id);
  if (!collection) return { notFound: true };

  const assets = getCollectionAssets(id);
  return { props: { collection, assets } };
};
