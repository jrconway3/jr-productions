import Link from 'next/link';
import Image from 'next/image';
import type { Asset } from 'app/models/Asset';

interface AssetCardProps {
  asset: Asset;
}

export default function AssetCard({ asset }: AssetCardProps) {
  return (
    <div className="sprite-card overflow-hidden">
      <div className="relative w-full bg-black/40" style={{ minHeight: '80px' }}>
        {asset.preview && (
          <Image
            src={`/${asset.preview}`}
            alt={asset.name}
            width={256}
            height={256}
            className="w-full h-auto object-contain"
            style={{ imageRendering: 'pixelated' }}
            unoptimized
          />
        )}
      </div>

      <div className="p-3">
        <h3 className="text-xs font-pixel leading-tight mb-1">{asset.name}</h3>

        <p className="font-body text-xs text-site-muted mb-2">{asset.license}</p>

        {(asset.tags ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1">
            {(asset.tags ?? []).slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="font-body text-xs px-1.5 py-0.5 bg-white/10 text-site-muted"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {asset.download && (
          <a
            href={`/${asset.download}`}
            download
            className="mt-3 block text-center font-body text-xs py-1.5 px-3 bg-lpc-accent hover:bg-lpc-accentDark text-white transition-colors"
          >
            Download
          </a>
        )}
      </div>
    </div>
  );
}
