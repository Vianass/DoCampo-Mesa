import type { ReactNode } from 'react';
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  id,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
        {description && <p className="section-heading__description">{description}</p>}
      </div>
      {action && <div className="section-heading__action">{action}</div>}
    </div>
  );
}
