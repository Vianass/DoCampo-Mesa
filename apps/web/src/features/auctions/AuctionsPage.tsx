import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Container } from '../../components/Container';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { getJson } from '../api/client';
import { useRemote } from '../api/useRemote';
import { useAuth } from '../auth/useAuth';
import { auctionStates, auctionLabels, parseAuctions } from './contracts';
import { localSearch } from './model';
import { LiveAuctionCard, AuctionPagination } from './components';

export function AuctionListing({ own = false }: { own?: boolean }) {
  const [params, setParams] = useSearchParams(),
    [search, setSearch] = useState(''),
    auth = useAuth();
  const page = Math.min(1000, Math.max(1, Number(params.get('pagina')) || 1));
  const state = auctionStates.find((s) => s === params.get('estado')) ?? '',
    order = params.get('ordem') === 'antigas' ? 'antigas' : 'recentes';
  const size = [12, 24, 36].includes(Number(params.get('porPagina')))
    ? Number(params.get('porPagina'))
    : 12;
  const query = new URLSearchParams({
    pagina: String(page),
    porPagina: String(size),
    ordem: order,
  });
  if (state) query.set('estado', state);
  const userId = auth.session.kind === 'authenticated' ? auth.session.user.id : '';
  const resource = useRemote((own ? userId + ':own:' : 'public:') + query, (signal) =>
    own
      ? auth.request('/me/producer/auctions?' + query, parseAuctions, {}, signal)
      : getJson('/auctions?' + query, parseAuctions, signal),
  );
  const items = resource.data ? localSearch(resource.data.itens, search) : [];
  function filters(changes: Record<string, string>) {
    const p = new URLSearchParams(params);
    p.delete('pagina');
    for (const [k, v] of Object.entries(changes)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    setSearch('');
    setParams(p);
  }
  return (
    <>
      <div className="auction-filters">
        <div className="form-field">
          <label htmlFor="auction-state-filter">Estado do leilão</label>
          <select
            id="auction-state-filter"
            className="form-select"
            value={state}
            onChange={(e) => filters({ estado: e.target.value })}
          >
            <option value="">Todos os estados</option>
            {auctionStates.map((s) => (
              <option key={s} value={s}>
                {auctionLabels[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="auction-sort">Ordenar por data</label>
          <select
            id="auction-sort"
            className="form-select"
            value={order}
            onChange={(e) => filters({ ordem: e.target.value })}
          >
            <option value="recentes">Mais recentes</option>
            <option value="antigas">Mais antigos</option>
          </select>
        </div>
        <div className="form-field auction-search">
          <label htmlFor="auction-search">Pesquisar nesta página</label>
          <input
            id="auction-search"
            type="search"
            className="form-control"
            placeholder="Lote, produto ou produtor"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <small>Pesquisa apenas os leilões carregados nesta página.</small>
        </div>
      </div>
      {resource.loading && <LoadingSkeleton count={3} label="A carregar os leilões" />}
      {resource.error && (
        <div className="auction-notice" role="alert">
          <h2>O mercado precisa de uma nova tentativa.</h2>
          <p>Não foi possível consultar os leilões. Tenta novamente dentro de momentos.</p>
          <Button onClick={resource.retry}>Tentar novamente</Button>
        </div>
      )}
      {resource.data && (
        <>
          <div className="auction-results-line">
            <p role="status">
              {resource.data.total} leilões nesta consulta
              {search ? ` · ${items.length} correspondências nesta página` : ''}
            </p>
            <Button variant="text" onClick={resource.retry}>
              Atualizar leilões ↻
            </Button>
          </div>
          {items.length ? (
            <section
              className="auction-lot-grid"
              aria-label={own ? 'Leilões da tua produção' : 'Leilões do mercado'}
            >
              {items.map((a) => (
                <LiveAuctionCard key={a.id + ':' + a.versao} auction={a} own={own} />
              ))}
            </section>
          ) : (
            <EmptyState
              title={
                search
                  ? 'Nenhum lote corresponde nesta página.'
                  : 'Ainda sem leilões nesta consulta.'
              }
              description={
                search
                  ? 'A pesquisa é limitada à página atual. Revê o texto ou consulta outra página.'
                  : 'Experimenta outro estado ou volta mais tarde para conhecer novas colheitas.'
              }
              action={
                search ? (
                  <Button variant="secondary" onClick={() => setSearch('')}>
                    Limpar pesquisa
                  </Button>
                ) : undefined
              }
            />
          )}
          <AuctionPagination
            page={page}
            totalPages={resource.data.totalPaginas}
            onChange={(n) => {
              setSearch('');
              const p = new URLSearchParams(params);
              p.set('pagina', String(n));
              setParams(p);
            }}
          />
        </>
      )}
    </>
  );
}
export default function AuctionsPage() {
  return (
    <Container>
      <div className="auction-market">
        <header className="auction-market-intro">
          <div>
            <p className="eyebrow">Cada colheita tem o seu momento</p>
            <h1>
              O bom da terra.
              <br />
              <em>A tua próxima oportunidade.</em>
            </h1>
            <p>
              Lotes com origem, tempo e valor. Conhece quem produz e participa numa forma diferente
              de trazer a colheita à mesa.
            </p>
          </div>
          <aside>
            <span aria-hidden="true">↗</span>
            <strong>
              Uma colheita.
              <br />
              Várias possibilidades.
            </strong>
            <p>
              Ofertas pelo lote completo.
              <br />A origem continua próxima.
            </p>
          </aside>
        </header>
        <AuctionListing />
      </div>
    </Container>
  );
}
