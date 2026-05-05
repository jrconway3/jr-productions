import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getCategoryBySlug } from 'app/CategoryService';
import type { Category } from 'app/models/Category';

interface LpcIndexProps {
  category: Category;
}

export default function LpcIndex({ category }: LpcIndexProps) {
  return (
    <>
      <Head>
        <title>{category.label} — JaidynReiman Productions</title>
      </Head>

      <main className="section-lpc page-wide py-12">
        <h1 className="text-2xl mb-2">{category.label}</h1>
        {category.description && (
          <p className="text-site-muted font-body mb-8">{category.description}</p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {category.children.map((child) => (
            <Link
              key={child.slug}
              href={`/lpc/${child.slug}`}
              className="sprite-card p-4 block hover:no-underline"
            >
              <h2 className="text-sm">{child.label}</h2>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<LpcIndexProps> = async () => {
  const category = getCategoryBySlug(['lpc']);
  if (!category) return { notFound: true };
  return { props: { category } };
};
