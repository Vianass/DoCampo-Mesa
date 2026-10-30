import { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { FormField } from '../../components/FormField';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { EmptyState } from '../../components/EmptyState';
import { PriceDisplay } from '../../components/PriceDisplay';
import { ProducerSelect } from '../producer/ProducerFields';
import { AdminFeedback } from '../admin-users/AdminFeedback';
import { AuctionBadge, AuctionImage, AuctionClock } from '../auctions/components';
import { auctionLabels, auctionStates } from '../auctions/contracts';
import { auctionDate, sampleClock, lotLabel } from '../auctions/model';
import {
  adminAuctionsPath,
  adminAuctionsApi,
  auctionQuery,
  auctionSearch,
  parseAdminAuction,
  parseAdminAuctions,
  parseAdminBids,
  type AuctionQuery,
  type AdminAuction,
} from './contracts';
import { useSupervisionResource } from './useSupervisionResource';
import { useAdminAuctionLive } from './useAdminAuctionLive';
import type { LiveStatus } from '../auctions/live-client';
const connectionLabels: Record<LiveStatus, string> = {
  connecting: 'A ligar à supervisão',
  connected: 'Ligação ativa',
  reconnecting: 'A restabelecer a ligação',
  disconnected: 'Sem ligação em direto',
  expired: 'Sessão expirada',
  forbidden: 'Sem acesso à supervisão',
};
function Connection({ status, updating }: { status: LiveStatus; updating: boolean }) {
  return (
    <p className="admin-auction-connection" role="status">
      {connectionLabels[status]} ·{' '}
      {updating ? 'A confirmar alterações na API.' : 'Dados da última consulta confirmada.'}
    </p>
  );
}
function Pager({
  page,
  pages,
  change,
  label,
}: {
  page: number;
  pages: number;
  change: (page: number) => void;
  label: string;
}) {
  return pages > 1 ? (
    <nav className="admin-application-pagination" aria-label={label}>
      <Button variant="secondary" disabled={page === 1} onClick={() => change(page - 1)}>
        Página anterior
      </Button>
      <span>
        Página {page} de {pages}
      </span>
      <Button
        variant="secondary"
        disabled={page >= pages || page >= 1000}
        onClick={() => change(page + 1)}
      >
        Página seguinte
      </Button>
    </nav>
  ) : null;
}
function AuctionList() {
  const [params, setParams] = useSearchParams(),
    q = auctionQuery(params),
    search = auctionSearch(q),
    r = useSupervisionResource(adminAuctionsApi + '?' + search, parseAdminAuctions),
    live = useAdminAuctionLive(r.refresh),
    focus = useRef(false),
    title = useRef<HTMLHeadingElement>(null);
  const last = r.data ? Math.max(1, Math.min(1000, r.data.totalPaginas)) : q.pagina,
    corrected = q.pagina > last ? auctionSearch({ ...q, pagina: last }) : '';
  useEffect(() => {
    if (corrected) {
      focus.current = true;
      setParams(corrected, { replace: true });
    }
  }, [corrected, setParams]);
  useEffect(() => {
    if (r.data && !r.updating && !corrected && focus.current) {
      focus.current = false;
      title.current?.focus();
    }
  }, [r.data, r.updating, corrected]);
  function change(next: Partial<AuctionQuery>, move = false) {
    focus.current = move;
    setParams(auctionSearch({ ...q, pagina: 1, ...next }));
  }
  return (
    <>
      <form
        className="admin-auction-filters"
        aria-label="Pesquisar leilões"
        key={search}
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          change(
            Object.fromEntries(
              ['identificador', 'produtor', 'produto', 'desde', 'ate'].map((k) => [
                k,
                String(f.get(k) ?? '').trim(),
              ]),
            ),
            true,
          );
        }}
      >
        <FormField
          label="Identificador exato do leilão"
          name="identificador"
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
          defaultValue={q.identificador}
          hint="Pesquisa global por referência completa, com 24 caracteres."
        />
        <FormField
          label="ID da conta do produtor"
          name="produtor"
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
          defaultValue={q.produtor}
        />
        <FormField
          label="ID do produto"
          name="produto"
          pattern="[a-fA-F0-9]{24}"
          maxLength={24}
          defaultValue={q.produto}
        />
        <FormField
          label="Início desde (UTC)"
          type="date"
          name="desde"
          defaultValue={q.desde}
          min="1970-01-01"
          max="9999-12-30"
        />
        <FormField
          label="Início até (UTC, inclusive)"
          type="date"
          name="ate"
          defaultValue={q.ate}
          min={q.desde || '1970-01-01'}
          max="9999-12-30"
        />
        <Button type="submit">Pesquisar leilões</Button>
      </form>
      <div className="admin-application-filters">
        <ProducerSelect
          label="Estado do leilão"
          value={q.estado}
          onChange={(e) => change({ estado: e.target.value })}
        >
          <option value="">Todos os estados</option>
          {auctionStates.map((s) => (
            <option key={s} value={s}>
              {auctionLabels[s]}
            </option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Leilões por página"
          value={q.porPagina}
          onChange={(e) =>
            change({ porPagina: Number(e.target.value) as AuctionQuery['porPagina'] })
          }
        >
          {[12, 24, 36].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </ProducerSelect>
        <ProducerSelect
          label="Ordenar leilões por criação"
          value={q.ordem}
          onChange={(e) => change({ ordem: e.target.value as AuctionQuery['ordem'] })}
        >
          <option value="recentes">Mais recentes primeiro</option>
          <option value="antigas">Mais antigas primeiro</option>
        </ProducerSelect>
      </div>
      <div className="admin-decision-actions">
        <Button
          variant="secondary"
          disabled={r.loading || r.updating}
          onClick={() => {
            focus.current = true;
            r.refresh();
          }}
        >
          Atualizar leilões
        </Button>
        <Button
          variant="text"
          onClick={() =>
            change(
              { estado: '', produtor: '', produto: '', identificador: '', desde: '', ate: '' },
              true,
            )
          }
        >
          Limpar filtros
        </Button>
      </div>
      <Connection status={live.status} updating={r.updating} />
      {r.loading && <LoadingSkeleton label="A consultar leilões reais" count={3} />}
      {r.error && <AdminFeedback message={r.error} retry={r.refresh} forbidden={r.forbidden} />}
      {r.data && !corrected && (
        <>
          <h2 ref={title} tabIndex={-1}>
            O mercado em movimento.
          </h2>
          <p role="status">
            {r.data.total} {r.data.total === 1 ? 'leilão' : 'leilões'} nesta consulta.
          </p>
          <dl className="admin-real-metrics" aria-label="Indicadores dos leilões filtrados">
            <div>
              <dt>Total de leilões</dt>
              <dd>{r.data.indicadores.numeroLeiloes}</dd>
            </div>
            {auctionStates.map((s) => (
              <div key={s}>
                <dt>{auctionLabels[s]}</dt>
                <dd>{r.data!.indicadores.porEstado[s]}</dd>
              </div>
            ))}
            <div>
              <dt>Licitações confirmadas</dt>
              <dd>{r.data.indicadores.numeroLicitacoes}</dd>
            </div>
            <div>
              <dt>Valor das ofertas vencedoras</dt>
              <dd>
                <PriceDisplay amountCents={r.data.indicadores.valorOfertasVencedorasCent} />
              </dd>
            </div>
          </dl>
          <p className="admin-help">
            Indicadores de todos os resultados dos filtros, independentemente da página. Uma oferta
            vencedora não representa receita recebida. As alterações são relidas na API; a
            recuperação periódica cobre notificações perdidas.
          </p>
          {r.data.itens.length ? (
            <section className="admin-user-cards" aria-label="Leilões reais">
              {r.data.itens.map((a) => (
                <article className="admin-application-paper admin-auction-card" key={a.id}>
                  <AuctionBadge state={a.estado} />
                  <h3>{a.titulo}</h3>
                  <p>
                    {a.lote.nome} · {lotLabel(a)}
                  </p>
                  <p>{a.produtor.nome}</p>
                  <small>Leilão · {a.id}</small>
                  <small>Produto · {a.produtoId}</small>
                  <small>Conta produtora · {a.produtorContaId}</small>
                  <dl>
                    <div>
                      <dt>Base do lote</dt>
                      <dd>
                        <PriceDisplay amountCents={a.precoBaseCent} />
                      </dd>
                    </div>
                    <div>
                      <dt>Valor atual</dt>
                      <dd>
                        <PriceDisplay amountCents={a.licitacaoAtual.valorCent} />
                      </dd>
                    </div>
                    <div>
                      <dt>Licitações</dt>
                      <dd>{a.numeroLicitacoes}</dd>
                    </div>
                  </dl>
                  <p>
                    Início · {auctionDate(a.iniciaEm)}
                    <br />
                    Fim · {auctionDate(a.terminaEm)}
                  </p>
                  {a.estadoEmAtualizacao && <p>A aguardar a transição confirmada pelo serviço.</p>}
                  <Button variant="text" to={adminAuctionsPath + '/' + a.id + '?' + search}>
                    Supervisionar leilão{' '}
                    <span className="visually-hidden">
                      {a.titulo}, {a.id}
                    </span>{' '}
                    →
                  </Button>
                </article>
              ))}
            </section>
          ) : (
            <EmptyState
              title="Nenhum leilão corresponde à consulta."
              description="Revê os filtros ou atualiza a listagem."
            />
          )}
          <Pager
            label="Paginação de leilões"
            page={q.pagina}
            pages={r.data.totalPaginas}
            change={(p) => change({ pagina: p }, true)}
          />
        </>
      )}
    </>
  );
}
function BidHistory({
  auction,
  refreshDetail,
}: {
  auction: AdminAuction;
  refreshDetail: () => void;
}) {
  const [page, setPage] = useState(1),
    [order, setOrder] = useState<'recentes' | 'antigas'>('recentes'),
    title = useRef<HTMLHeadingElement>(null),
    focus = useRef(false);
  const r = useSupervisionResource(
    adminAuctionsApi +
      '/' +
      auction.id +
      '/bids?' +
      new URLSearchParams({ pagina: String(page), porPagina: '12', ordem: order }),
    parseAdminBids,
    auction.versao,
  );
  const last = r.data ? Math.max(1, Math.min(1000, r.data.totalPaginas)) : page;
  if (page > last) setPage(last);
  useEffect(() => {
    if (r.data && !r.updating && focus.current) {
      focus.current = false;
      title.current?.focus();
    }
  }, [r.data, r.updating]);
  const version = r.data?.versaoSnapshot ?? 0;
  useEffect(() => {
    if (version > auction.versao) {
      const timer = setTimeout(refreshDetail, 250);
      return () => clearTimeout(timer);
    }
  }, [version, auction.versao, refreshDetail]);
  return (
    <section className="admin-application-paper admin-auction-history">
      <h2 ref={title} tabIndex={-1}>
        Licitações confirmadas
      </h2>
      <p>
        Registos aceites no MongoDB, com referência limitada por leilão. Eventos de ligação não são
        um histórico de ofertas.
      </p>
      <ProducerSelect
        label="Ordenar licitações"
        value={order}
        onChange={(e) => {
          setOrder(e.target.value as typeof order);
          setPage(1);
        }}
      >
        <option value="recentes">Mais recentes primeiro</option>
        <option value="antigas">Mais antigas primeiro</option>
      </ProducerSelect>
      {r.loading && <LoadingSkeleton label="A consultar licitações confirmadas" count={2} />}
      {r.error && <AdminFeedback message={r.error} retry={r.refresh} forbidden={r.forbidden} />}
      {r.data && (
        <>
          <p role="status">
            {r.data.total} {r.data.total === 1 ? 'licitação' : 'licitações'} · histórico consultado
            na versão {r.data.versaoSnapshot}.
          </p>
          {r.data.itens.length ? (
            <ol className="admin-auction-bids">
              {r.data.itens.map((b) => (
                <li key={b.id}>
                  <strong>
                    Oferta {b.sequencia} · <PriceDisplay amountCents={b.valorCent} />
                  </strong>
                  <time dateTime={b.aceiteEm}>{auctionDate(b.aceiteEm)}</time>
                  <small>Participante · {b.participante.referencia}</small>
                  <span>Confirmada</span>
                </li>
              ))}
            </ol>
          ) : (
            <p>Sem licitações confirmadas neste leilão.</p>
          )}
          <Pager
            label="Paginação de licitações"
            page={page}
            pages={r.data.totalPaginas}
            change={(p) => {
              focus.current = true;
              setPage(p);
            }}
          />
        </>
      )}
    </section>
  );
}
function AuctionDetail({ id }: { id: string }) {
  const { search } = useLocation(),
    r = useSupervisionResource(adminAuctionsApi + '/' + id, parseAdminAuction),
    live = useAdminAuctionLive(r.refresh, r.data, id),
    a = r.data,
    clock = useMemo(() => sampleClock(a?.serverNow ?? new Date().toISOString()), [a]);
  return (
    <>
      <div className="admin-decision-actions">
        <Button variant="text" to={adminAuctionsPath + search}>
          ← Voltar aos leilões
        </Button>
        <Button variant="secondary" disabled={r.loading || r.updating} onClick={r.refresh}>
          Atualizar supervisão
        </Button>
      </div>
      <Connection status={live.status} updating={r.updating} />
      {r.loading && <LoadingSkeleton label="A consultar detalhe do leilão" count={3} />}
      {r.error && <AdminFeedback message={r.error} retry={r.refresh} forbidden={r.forbidden} />}
      {a && (
        <>
          <section className="admin-auction-detail">
            <AuctionImage auction={a} />
            <div className="admin-application-paper">
              <AuctionBadge state={a.estado} />
              <h2>{a.titulo}</h2>
              <p>
                {a.lote.nome} · {lotLabel(a)}
              </p>
              <p>{a.descricao}</p>
              <p>{a.produtor.nome}</p>
              <small>Leilão · {a.id}</small>
              <small>Produto · {a.produtoId}</small>
              <small>Conta produtora · {a.produtorContaId}</small>
              <dl className="admin-auction-numbers">
                <div>
                  <dt>Valor atual do lote</dt>
                  <dd>
                    <PriceDisplay amountCents={a.licitacaoAtual.valorCent} />
                  </dd>
                </div>
                <div>
                  <dt>Preço inicial</dt>
                  <dd>
                    <PriceDisplay amountCents={a.precoBaseCent} />
                  </dd>
                </div>
                <div>
                  <dt>Incremento mínimo</dt>
                  <dd>
                    <PriceDisplay amountCents={a.incrementoCent} />
                  </dd>
                </div>
                <div>
                  <dt>Licitações confirmadas</dt>
                  <dd>{a.numeroLicitacoes}</dd>
                </div>
              </dl>
              <AuctionClock state={a} sample={clock} onBoundary={r.refresh} />
              <p>
                Início · {auctionDate(a.iniciaEm)}
                <br />
                Fim · {auctionDate(a.terminaEm)}
              </p>
              <p>
                Versão confirmada: {a.versao} · sequência: {a.sequencia}
              </p>
              <p>Liderança: {a.lider?.referencia ?? 'Sem ofertas confirmadas'}</p>
              {live.expected > a.versao && (
                <p role="status">
                  A confirmar uma atualização mais recente na API. Mantém-se a última versão
                  consultada.
                </p>
              )}
              {a.estadoEmAtualizacao && (
                <p>
                  A aguardar a transição confirmada pelo serviço. O prazo visual não decide o
                  resultado.
                </p>
              )}
              <p className="admin-help">
                Supervisão de leitura. As ofertas e a gestão do lote mantêm as suas regras e os seus
                percursos.
              </p>
            </div>
          </section>
          {a.estado === 'terminado' && a.resultado && (
            <section className="admin-application-paper admin-auction-result">
              <h2>Resultado confirmado pelo serviço</h2>
              {a.resultado.tipo === 'vencedor' ? (
                <>
                  <p>
                    Oferta vencedora · <PriceDisplay amountCents={a.resultado.valorCent!} />
                  </p>
                  <small>Vencedor · {a.vencedor?.referencia ?? 'Referência não disponível'}</small>
                  <p>Este valor não representa pagamento ou receita recebida.</p>
                </>
              ) : (
                <p>O leilão terminou sem licitações.</p>
              )}
            </section>
          )}
          <BidHistory auction={a} refreshDetail={r.refresh} />
        </>
      )}
    </>
  );
}
export default function AdminAuctionsArea() {
  const { pathname } = useLocation(),
    parts = pathname.split('/').filter(Boolean),
    id = parts[3];
  return (
    <div className="admin-workspace admin-applications admin-users admin-auctions">
      <header className="admin-intro">
        <p className="eyebrow">Administração · Leilões reais</p>
        <h1>
          O pulso
          <br />
          <em>de cada lote.</em>
        </h1>
        <p>Acompanha o mercado em direto, com decisões e valores confirmados pelo serviço.</p>
      </header>
      {parts.length > 4 || (id && !/^[a-fA-F0-9]{24}$/.test(id)) ? (
        <EmptyState
          title="O leilão não está disponível."
          description="Revê o identificador."
          action={<Button to={adminAuctionsPath}>Voltar aos leilões</Button>}
        />
      ) : id ? (
        <AuctionDetail key={id} id={id.toLowerCase()} />
      ) : (
        <AuctionList />
      )}
    </div>
  );
}
