import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Container } from '../components/Container';
import { ProducerCard } from '../components/ProducerCard';
import { FormField } from '../components/FormField';
import { EmptyState } from '../components/EmptyState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { adaptProducer, catalogApi } from '../features/api/catalog';
import { useRemote } from '../features/api/useRemote';
import { RemoteError } from '../features/market/RemoteError';
import { CatalogPagination } from '../features/catalog/CatalogPagination';
export function ProducersPage() {
  const [urlParams, setParams] = useSearchParams();
  const [pending, setPending] = useState<{
    source: URLSearchParams;
    params: URLSearchParams;
  } | null>(null);
  const waiting = pending?.source === urlParams;
  if (pending && !waiting) setPending(null);
  const params = pending && waiting ? pending.params : urlParams;
  const search = params.get('pesquisa') ?? '';
  const location = params.get('localidade') ?? '';
  const page = /^[1-9]\d{0,3}$/.test(params.get('pagina') ?? '')
    ? Math.min(1000, Number(params.get('pagina')))
    : 1;
  const query = new URLSearchParams({
    pagina: String(page),
    porPagina: '12',
    ...(search.trim() ? { pesquisa: search.trim().slice(0, 100) } : {}),
    ...(location.trim() ? { localidade: location.trim().slice(0, 120) } : {}),
  }).toString();
  const remote = useRemote(query, (signal) => catalogApi.producers(query, signal), 250);
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'pagina') next.delete('pagina');
    setPending({ source: urlParams, params: next });
    setParams(next, { replace: key !== 'pagina', preventScrollReset: true });
  }
  return (
    <Container>
      <div className="page-intro">
        <p className="eyebrow">Quem cuida da origem</p>
        <h1>Boas coisas começam com pessoas.</h1>
        <p>Conhece os perfis públicos e os produtos publicados no nosso mercado.</p>
      </div>
      <div className="showcase-fields">
        <FormField
          label="Pesquisar produtores"
          type="search"
          maxLength={100}
          value={search}
          onChange={(e) => update('pesquisa', e.target.value)}
        />
        <FormField
          label="Localidade dos produtores"
          type="search"
          maxLength={120}
          value={location}
          onChange={(e) => update('localidade', e.target.value)}
        />
      </div>
      <section className="catalog-results producer-directory" aria-labelledby="producer-list-title">
        <h2 className="visually-hidden" id="producer-list-title">
          Histórias dos produtores
        </h2>
        {remote.loading ? (
          <LoadingSkeleton label="A carregar produtores" count={3} />
        ) : remote.error ? (
          <RemoteError error={remote.error} retry={remote.retry} />
        ) : (
          <>
            <p role="status" aria-label="Resultados de produtores">
              {remote.data!.total} produtores encontrados
            </p>
            <div className="producer-grid">
              {remote.data!.itens.map((p) => (
                <ProducerCard key={p.id} producer={adaptProducer(p)} />
              ))}
            </div>
            {!remote.data!.itens.length && (
              <EmptyState
                title="Ainda não encontrámos esta origem."
                description="Experimenta outra pesquisa ou outra página."
              />
            )}
            <CatalogPagination
              entityLabel="produtores"
              page={page}
              totalPages={remote.data!.totalPaginas}
              total={remote.data!.total}
              start={remote.data!.itens.length ? (page - 1) * 12 + 1 : 0}
              end={remote.data!.itens.length ? Math.min(page * 12, remote.data!.total) : 0}
              onPageChange={(p) => update('pagina', String(p))}
            />
          </>
        )}
      </section>
    </Container>
  );
}
