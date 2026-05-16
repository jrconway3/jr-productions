import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getAllCollections } from 'app/CollectionService';
import type { Collection } from 'app/models/Collection';

interface CollectionsIndexProps {
  collections: Collection[];
}

export default function CollectionsIndex({ collections }: CollectionsIndexProps) {
  return (
    <>
      <Head>
        <title>Collections - JaidynReiman Productions</title>
      </Head>

      <main className="page-wide py-12">
        <h1 className="text-2xl mb-8">Collections</h1>

        {collections.length === 0 && (
          <p className="text-site-muted font-body">No collections yet.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {collections.map((col) => (
            <Link
              key={col.id}
              href={`/collections/${col.id}`}
              className="sprite-card p-6 block hover:no-underline"
            >
              <h2 className="text-lg mb-1">{col.label}</h2>
              {col.description && (
                <p className="text-site-muted font-body text-sm">{col.description}</p>
              )}
              <p className="text-site-muted font-body text-xs mt-2">{col.assets.length} assets</p>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<CollectionsIndexProps> = async () => {
  const collections = getAllCollections();
  return { props: { collections } };
};
