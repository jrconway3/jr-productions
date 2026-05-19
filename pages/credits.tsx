import type { GetStaticProps } from 'next';
import Head from 'next/head';
import { getAllAssets } from 'app/AssetService';
import type { AssetCredit } from 'app/models/Asset';

interface CreditEntry {
  authors: string[];
  urls: string[];
  notes?: string;
  assetNames: string[];
  license: string;
}

interface LicenseGroup {
  license: string;
  assetCount: number;
  entries: CreditEntry[];
}

interface CreditsProps {
  groups: LicenseGroup[];
}

export default function Credits({ groups }: CreditsProps) {
  return (
    <>
      <Head>
        <title>Credits - JaidynReiman Productions</title>
      </Head>

      <main className="page-wide py-12">
        <h1 className="text-2xl mb-2">Credits</h1>
        <p className="font-body text-site-muted text-sm mb-10">
          Assets are available under various free and open licenses. Source links and author attributions are listed below.
        </p>

        {groups.map((group) => (
          <section key={group.license} className="mb-12">
            <h2 className="font-pixel text-sm uppercase tracking-widest text-site-muted mb-1">{group.license}</h2>
            <p className="font-body text-xs text-site-muted opacity-60 mb-4">{group.assetCount} asset{group.assetCount !== 1 ? 's' : ''}</p>

            <div className="space-y-4">
              {group.entries.map((entry, i) => (
                <div key={i} className="sprite-card p-3">
                  <p className="font-pixel text-xs mb-1">{entry.authors.join(', ')}</p>
                  {entry.assetNames.length > 0 && (
                    <p className="font-body text-xs text-site-muted opacity-70 mb-1 truncate">
                      {entry.assetNames.join(', ')}
                    </p>
                  )}
                  {entry.notes && (
                    <p className="font-body text-xs text-site-muted opacity-60 italic mb-1">{entry.notes}</p>
                  )}
                  {entry.urls.length > 0 && (
                    <div className="flex flex-col gap-0.5">
                      {entry.urls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-body text-xs text-lpc-accent hover:text-lpc-accentLight transition-colors truncate"
                        >
                          {url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}

export const getStaticProps: GetStaticProps<CreditsProps> = async () => {
  const assets = getAllAssets();

  type EntryKey = string;
  const entryMap = new Map<EntryKey, { credit: AssetCredit; assetNames: Set<string>; license: string }>();

  for (const asset of assets) {
    if (!asset.credits?.length) continue;
    const license = asset.license ?? 'Unknown';

    for (const credit of asset.credits) {
      const key = `${license}::${[...credit.authors].sort().join('|')}::${[...(credit.urls ?? [])].sort().join('|')}::${credit.notes ?? ''}`;
      if (!entryMap.has(key)) {
        entryMap.set(key, { credit, assetNames: new Set(), license });
      }
      entryMap.get(key)!.assetNames.add(asset.name);
    }
  }

  const licenseMap = new Map<string, CreditEntry[]>();

  for (const { credit, assetNames, license } of entryMap.values()) {
    if (!licenseMap.has(license)) licenseMap.set(license, []);
    const entry: CreditEntry = {
      authors: credit.authors,
      urls: credit.urls ?? [],
      assetNames: [...assetNames].sort(),
      license,
    };
    if (credit.notes) entry.notes = credit.notes;
    licenseMap.get(license)!.push(entry);
  }

  const groups: LicenseGroup[] = [...licenseMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([license, entries]) => ({
      license,
      assetCount: entries.reduce((sum, e) => sum + e.assetNames.length, 0),
      entries: entries.sort((a, b) => a.authors[0]?.localeCompare(b.authors[0] ?? '') ?? 0),
    }));

  return { props: { groups } };
};
