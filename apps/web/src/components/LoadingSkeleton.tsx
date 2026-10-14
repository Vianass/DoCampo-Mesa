export function LoadingSkeleton({
  label = 'A carregar conteúdo',
  count = 3,
}: {
  label?: string;
  count?: number;
}) {
  return (
    <div className="loading-skeleton" role="status" aria-label={label}>
      <span className="visually-hidden">{label}</span>
      {Array.from({ length: Math.max(1, Math.min(count, 6)) }, (_, index) => (
        <div className="loading-skeleton__card" key={index} aria-hidden="true">
          <div className="loading-skeleton__image" />
          <div className="loading-skeleton__line" />
          <div className="loading-skeleton__line loading-skeleton__line--short" />
        </div>
      ))}
    </div>
  );
}
