import type { ReactNode } from 'react';
export function Container({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`container market-container ${className}`}>{children}</div>;
}
