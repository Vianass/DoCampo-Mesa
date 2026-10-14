import type { ReactNode } from 'react';
export function StatusBadge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'seasonal' | 'live' | 'organic';
}) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      {tone === 'live' && <span className="status-badge__dot" />}
      {children}
    </span>
  );
}
