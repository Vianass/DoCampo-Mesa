import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  activeCatalogFilters,
  defaultFilters,
  readCatalogQuery,
  writeCatalogQuery,
  type CatalogFilters,
  type CatalogSort,
  type CatalogState,
  type CatalogOptions,
} from './catalog';
import { categories } from '../api/catalog-contract';
import { adaptProduct, catalogApi } from '../api/catalog';
import { useRemote } from '../api/useRemote';
const baseOptions: CatalogOptions = {
  categories: categories.map((c) => c.name),
  categoryIds: Object.fromEntries(categories.map((c) => [c.name, c.id])),
  producers: [],
  locations: [],
  seasons: ['Primavera', 'Verão', 'Outono', 'Inverno'],
  priceCeilingCents: 1000000,
  remote: true,
};
export function useCatalog() {
  const [params, setParams] = useSearchParams();
  const urlState = useMemo(() => readCatalogQuery(params, baseOptions), [params]);
  const [pending, setPending] = useState<{ source: URLSearchParams; state: CatalogState } | null>(
    null,
  );
  const waiting = pending?.source === params;
  if (pending && !waiting) setPending(null);
  const state = pending && waiting ? pending.state : urlState;
  const query = writeCatalogQuery(state).toString();
  const remote = useRemote(query, (signal) => catalogApi.products(query, signal), 250);
  const [producerSearch, setProducerSearch] = useState('');
  const [producerPage, setProducerPage] = useState(1);
  const producerQuery = new URLSearchParams({
    porPagina: '12',
    pagina: String(producerPage),
    ...(producerSearch.trim() ? { pesquisa: producerSearch.trim().slice(0, 100) } : {}),
  }).toString();
  const producerRemote = useRemote(
    producerQuery,
    (signal) => catalogApi.producers(producerQuery, signal),
    250,
  );
  const options = {
    ...baseOptions,
    producers: producerRemote.data?.itens.map((p) => ({ id: p.id, name: p.nomePublico })) ?? [],
  };
  const data = remote.data;
  const pagination = {
    items: data?.itens.map(adaptProduct) ?? [],
    page: state.page,
    pageSize: state.pageSize,
    totalPages: data?.totalPaginas ?? 0,
    total: data?.total ?? 0,
    start: data?.itens.length ? (data.pagina - 1) * data.porPagina + 1 : 0,
    end: data?.itens.length ? Math.min(data.pagina * data.porPagina, data.total) : 0,
  };
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
    loading: remote.loading,
    error: remote.error,
    retry: remote.retry,
    activeFilters: activeCatalogFilters(state.filters, options),
    setFilter,
    clearFilter: (key: keyof CatalogFilters) => setFilter(key, defaultFilters()[key] ?? ''),
    clearFilters: () => update({ ...state, page: 1, filters: defaultFilters() }),
    setSort: (sort: CatalogSort) => update({ ...state, page: 1, sort }),
    setPage: (page: number) => update({ ...state, page }),
    setPageSize: (pageSize: number) => update({ ...state, page: 1, pageSize }),
    producerSearch,
    setProducerSearch: (v: string) => {
      setProducerSearch(v);
      setProducerPage(1);
    },
    producerPage,
    setProducerPage,
    producerPages: producerRemote.data?.totalPaginas ?? 0,
    producerLoading: producerRemote.loading,
    producerError: producerRemote.error,
    producerRetry: producerRemote.retry,
  };
}
