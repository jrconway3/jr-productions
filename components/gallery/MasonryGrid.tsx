import type { ReactNode } from 'react';

interface MasonryGridProps {
  children: ReactNode;
  className?: string;
}

export default function MasonryGrid({ children, className = '' }: MasonryGridProps) {
  return (
    <div className={`masonry-grid ${className}`}>
      {children}
    </div>
  );
}
