import { useRef, useState } from 'react';
import { Button } from '../components/Button';
import { Container } from '../components/Container';
import { EmptyState } from '../components/EmptyState';
import { FormField } from '../components/FormField';
import { Icon } from '../components/Icon';
import { ProductCard } from '../components/ProductCard';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { RemoteError } from '../features/market/RemoteError';
import { CatalogIntro } from '../features/catalog/CatalogIntro';
import { CatalogFilters } from '../features/catalog/CatalogFilters';
import { CatalogFilterDialog } from '../features/catalog/CatalogFilterDialog';
import { CatalogPagination } from '../features/catalog/CatalogPagination';
import { pageSizes, sortOptions } from '../features/catalog/catalog';
import { useCatalog } from '../features/catalog/useCatalog';

export default function ProductsPage() {
  const catalog = useCatalog();
  const { state, options, pagination, activeFilters } = catalog;
  const [mobileOpen, setMobileOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  function focusResults() {
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  }
  function dismissFilters() {
    setMobileOpen(false);
    filterButton.current?.focus();
  }
  const filterProps = {
    filters: state.filters,
    options,
    activeCount: activeFilters.length,
    onChange: catalog.setFilter,
    onClear: catalog.clearFilters,
    producerPicker: catalog,
  };
  return (
    <div className="catalog-page">
      <Container>
        <CatalogIntro />
        <div className="catalog-search-row">
          <form
            role="search"
            onSubmit={(event) => event.preventDefault()}
            className="catalog-search-field"
          >
            <Icon name="search" />
            <FormField
              label="Pesquisar produtos ou produtores"
              labelHidden
              type="search"
              placeholder="Um produto, um produtor, uma história…"
              value={state.filters.search}
              maxLength={100}
              onChange={(event) => catalog.setFilter('search', event.target.value, true)}
            />
            {state.filters.search && (
              <button
                type="button"
                aria-label="Limpar pesquisa"
                onClick={() => catalog.setFilter('search', '')}
              >
                <Icon name="close" />
              </button>
            )}
          </form>
          <button
            ref={filterButton}
            type="button"
            className="catalog-open-filters"
            aria-haspopup="dialog"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            <Icon name="menu" />
            Filtrar{activeFilters.length > 0 && <span>{activeFilters.length}</span>}
          </button>
        </div>
        <p className="catalog-demo-label">
          Produtos e origens do catálogo público. A cesta guarda escolhas locais; ainda não há
          compras online.
        </p>
        <div className="catalog-layout">
          <aside className="catalog-sidebar" aria-label="Filtros do catálogo">
            <CatalogFilters {...filterProps} />
          </aside>
          <section className="catalog-results-panel" aria-labelledby="catalog-results-title">
            <div className="catalog-results-heading">
              <div>
                <h2 ref={resultsHeading} id="catalog-results-title" tabIndex={-1}>
                  Os sabores do mercado.
                </h2>
                <p
                  className="catalog-result-count"
                  role="status"
                  aria-label="Resultados do catálogo"
                  aria-live="polite"
                >
                  {catalog.loading ? (
                    'A consultar o mercado…'
                  ) : catalog.error ? (
                    'Consulta indisponível'
                  ) : (
                    <>
                      {pagination.total}{' '}
                      {pagination.total === 1 ? 'produto encontrado' : 'produtos encontrados'}
                    </>
                  )}
                </p>
              </div>
              <div className="catalog-sort">
                <label htmlFor="catalog-sort">Ordenar por</label>
                <select
                  className="form-select"
                  id="catalog-sort"
                  value={state.sort}
                  onChange={(event) => {
                    const sort = sortOptions.find((item) => item.value === event.target.value);
                    if (sort) catalog.setSort(sort.value);
                  }}
                >
                  {sortOptions.map((sort) => (
                    <option key={sort.value} value={sort.value}>
                      {sort.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {activeFilters.length > 0 && (
              <div className="catalog-active-filters" role="group" aria-label="Filtros ativos">
                {activeFilters.map((filter) => (
                  <button
                    type="button"
                    key={filter.key}
                    aria-label={`Remover filtro: ${filter.label}`}
                    onClick={() => catalog.clearFilter(filter.key)}
                  >
                    {filter.label}
                    <Icon name="close" width="14" height="14" />
                  </button>
                ))}
                <button type="button" className="catalog-clear" onClick={catalog.clearFilters}>
                  Limpar tudo
                </button>
              </div>
            )}
            {catalog.loading ? (
              <LoadingSkeleton label="A carregar o catálogo" count={6} />
            ) : catalog.error ? (
              <RemoteError error={catalog.error} retry={catalog.retry} />
            ) : pagination.items.length ? (
              <div className="product-grid">
                {pagination.items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>
            ) : (
              <EmptyState
                title={
                  pagination.total
                    ? 'Esta página não tem produtos.'
                    : 'Ainda não encontrámos esse sabor.'
                }
                description="Experimenta outra combinação, alarga o preço máximo ou volta a descobrir o mercado completo."
                action={
                  <Button
                    variant="secondary"
                    onClick={() => (pagination.total ? catalog.setPage(1) : catalog.clearFilters())}
                  >
                    Ver todos os produtos
                    <Icon name="arrow" />
                  </Button>
                }
              />
            )}
            {!catalog.loading && !catalog.error && (
              <div className="catalog-results-bottom">
                {pagination.total > 0 && (
                  <div className="catalog-page-size">
                    <label htmlFor="catalog-page-size">Produtos por página</label>
                    <select
                      id="catalog-page-size"
                      className="form-select"
                      value={state.pageSize}
                      onChange={(event) => {
                        catalog.setPageSize(Number(event.target.value));
                      }}
                    >
                      {pageSizes.map((size) => (
                        <option value={size} key={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <CatalogPagination
                  {...pagination}
                  onPageChange={(page) => {
                    catalog.setPage(page);
                    focusResults();
                  }}
                />
              </div>
            )}
          </section>
        </div>
      </Container>
      {mobileOpen && (
        <CatalogFilterDialog
          total={catalog.loading || catalog.error ? null : pagination.total}
          onDismiss={dismissFilters}
          onApply={() => {
            setMobileOpen(false);
            focusResults();
          }}
        >
          <CatalogFilters {...filterProps} />
        </CatalogFilterDialog>
      )}
    </div>
  );
}
