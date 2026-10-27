import { Icon } from '../../components/Icon';

export function CatalogPagination({
  page,
  totalPages,
  start,
  end,
  total,
  onPageChange,
  entityLabel = 'produtos',
}: {
  entityLabel?: string;
  page: number;
  totalPages: number;
  start: number;
  end: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  if (!total) return null;
  const first = Math.max(1, Math.min(page - 2, totalPages - 4));
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, index) => first + index);
  return (
    <div className="catalog-pagination">
      <p>
        A mostrar {start}–{end} de {total} {entityLabel}
      </p>
      <nav aria-label="Paginação do catálogo">
        <button
          type="button"
          className="catalog-pagination__previous"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Página anterior"
        >
          <Icon name="arrow" />
          <span>Anterior</span>
        </button>
        {first > 1 && (
          <>
            <button type="button" aria-label="Página 1" onClick={() => onPageChange(1)}>
              1
            </button>
            {first > 2 && <span aria-hidden="true">…</span>}
          </>
        )}
        {pages.map((number) => (
          <button
            type="button"
            key={number}
            aria-label={`Página ${number}`}
            aria-current={number === page ? 'page' : undefined}
            onClick={() => onPageChange(number)}
          >
            {number}
          </button>
        ))}
        {first + pages.length - 1 < totalPages && (
          <>
            {first + pages.length < totalPages && <span aria-hidden="true">…</span>}
            <button
              type="button"
              aria-label={`Página ${totalPages}`}
              onClick={() => onPageChange(totalPages)}
            >
              {totalPages}
            </button>
          </>
        )}
        <button
          type="button"
          className="catalog-pagination__next"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Página seguinte"
        >
          <span>Seguinte</span>
          <Icon name="arrow" />
        </button>
      </nav>
      <span className="catalog-pagination__indicator">
        Página {page} de {totalPages}
      </span>
    </div>
  );
}
