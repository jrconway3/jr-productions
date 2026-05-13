import type { ResolvedPageCredit } from 'app/models/Category';

interface PageCreditsProps {
  credits: ResolvedPageCredit[];
}

export default function PageCredits({ credits }: PageCreditsProps) {
  if (!credits.length) return null;

  return (
    <div className="border-t border-white/10 mt-14 pt-5 pb-0 -mb-6 space-y-3">
      {credits.map((credit, i) => {
        const href = credit.urls[0] ?? undefined;
        return (
          <div key={i} className="font-body text-xs leading-relaxed">
            <div className="flex flex-wrap items-baseline gap-x-2 mb-0.5">
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className="font-semibold text-site-fg hover:underline">
                  {credit.label}
                </a>
              ) : (
                <span className="font-semibold text-site-fg">{credit.label}</span>
              )}
              {credit.license && (
                <span className="text-site-muted opacity-60">{credit.license}</span>
              )}
            </div>
            {credit.authors.length > 0 && (
              <div className="text-site-muted opacity-70">{credit.authors.join(', ')}</div>
            )}
            {credit.notes && (
              <div className="text-site-muted opacity-40 italic">{credit.notes}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
