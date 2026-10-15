import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { Product } from '../../types/market';
import {
  activeCatalogFilters,
  defaultFilters,
  deriveCatalogOptions,
  filterProducts,
  paginateProducts,
  readCatalogQuery,
  sortProducts,
  writeCatalogQuery,
  type CatalogFilters,
  type CatalogSort,
  type CatalogState,
} from './catalog';

export function useCatalog(products: readonly Product[]) {
  const [params, setParams] = useSearchParams();
  const options = useMemo(() => deriveCatalogOptions(products), [products]);
  const urlState = useMemo(() => readCatalogQuery(params, options), [params, options]);
  const [pending, setPending] = useState<{
    source: URLSearchParams;
    state: CatalogState;
  } | null>(null);
  // Router navigation runs in a transition. Keep controlled inputs current while
  // it finishes, then let URL changes (including Back/Forward) supply the state.
  const waitingForUrl = pending?.source === params;
  if (pending && !waitingForUrl) setPending(null);
  const state = pending && waitingForUrl ? pending.state : urlState;
  const filtered = useMemo(
    () => filterProducts(products, state.filters),
    [products, state.filters],
  );
  const sorted = useMemo(
    () => sortProducts(filtered, state.sort, state.filters.search),
    [filtered, state.sort, state.filters.search],
  );
  const pagination = useMemo(
    () => paginateProducts(sorted, state.page, state.pageSize),
    [sorted, state.page, state.pageSize],
  );
  const activeFilters = useMemo(
    () => activeCatalogFilters(state.filters, options),
    [state.filters, options],
  );
  function update(next: CatalogState, replace = false) {
    setPending({ source: params, state: next });
    setParams(writeCatalogQuery(next, params), { replace, preventScrollReset: true });
  }
  function setFilter<K extends keyof CatalogFilters>(
    key: K,
    value: CatalogFilters[K],
    replace = false,
  ) {
    update({ ...state, page: 1, filters: { ...state.filters, [key]: value } }, replace);
  }
  return {
    state,
    options,
    pagination,
    activeFilters,
    setFilter,
    clearFilter: (key: keyof CatalogFilters) => setFilter(key, defaultFilters()[key]),
    clearFilters: () => update({ ...state, page: 1, filters: defaultFilters() }),
    setSort: (sort: CatalogSort) => update({ ...state, page: 1, sort }),
    setPage: (page: number) => update({ ...state, page }),
    setPageSize: (pageSize: number) => update({ ...state, page: 1, pageSize }),
  };
}
