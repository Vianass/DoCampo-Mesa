import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { Container } from '../../components/Container';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { PriceDisplay } from '../../components/PriceDisplay';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { useAuth } from '../auth/useAuth';
import { useRemote } from '../api/useRemote';
import { objectId } from '../api/catalog-contract';
import { AuctionDetailPage as LegacyDetail, NotFoundPage } from '../../pages/MarketPages';
import { auction as legacy } from '../../data/market';
import {
  parseAuction,
  parseAuctionDetail,
  parseHistory,
  type AuctionDetail,
  type AuctionSummary,
  type AuctionSnapshot,
  fromDetail,
} from './contracts';
import { AuctionImage, AuctionBadge, AuctionClock, AuctionPagination } from './components';
import { useAuctionRoom } from './useAuctionRoom';
import { cents, euros, nextMinimum, auctionDate, serverTime, sampleClock, lotLabel } from './model';

export function AuctionRoom({
  detail,
  onRefresh,
  ownerControls,
}: {
  detail: AuctionDetail;
  onRefresh: () => void;
  ownerControls?: (state: AuctionSnapshot) => React.ReactNode;
}) {
  const auth = useAuth(),
    live = useAuctionRoom(detail),
    [amount, setAmount] = useState(''),
    [validation, setValidation] = useState(''),
    [historyPage, setHistoryPage] = useState(1);
  const state = live.state,
    snapshotClock = live.clock,
    sequence = state?.sequencia ?? detail.sequencia;
  useEffect(() => {
    // O evento não transporta título/descrição nem o ETag. Reler alterações anteriores à primeira oferta.
    if (state && state.sequencia === 0 && state.versao > detail.versao) onRefresh();
  }, [state, detail.versao, onRefresh]);
  const [historyVersion, setHistoryVersion] = useState(sequence);
  useEffect(() => {
    const timer = setTimeout(() => setHistoryVersion(sequence), 250);
    return () => clearTimeout(timer);
  }, [sequence]);
  const history = useRemote(
    detail.id + ':history:' + historyVersion + ':' + historyPage,
    (signal) =>
      auth.request(
        '/auctions/' + detail.id + '/bids?porPagina=12&pagina=' + historyPage,
        parseHistory,
        {},
        signal,
      ),
  );
  const min = nextMinimum(
    state?.valorAtualCent ?? detail.licitacaoAtual.valorCent,
    state?.incrementoCent ?? detail.incrementoCent,
  );
  const owner = !!detail.reserva,
    canBid =
      auth.session.kind === 'authenticated' &&
      auth.session.user.papeis.includes('comprador') &&
      !owner;
  const seedClock = useMemo(() => sampleClock(detail.serverNow), [detail.serverNow]);
  const clock = snapshotClock ?? seedClock;
  const [now, setNow] = useState(() => serverTime(clock));
  useEffect(() => {
    const tick = () => setNow(serverTime(clock));
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [clock]);
  const active =
    (state?.estado ?? detail.estado) === 'ativo' &&
    now < Date.parse(state?.terminaEm ?? detail.terminaEm) &&
    now >= Date.parse(state?.iniciaEm ?? detail.iniciaEm);
  const synced = live.status === 'connected' && !!state;
  const leaderOwn =
    state?.lider?.referencia &&
    (state.lider.referencia === live.receipt?.licitacao.participante.referencia ||
      (detail.lider?.proprio && state.lider.referencia === detail.lider.referencia) ||
      history.data?.itens.some(
        (b) => b.participante.proprio && b.participante.referencia === state.lider!.referencia,
      ));
  const hasOwnOffer = !!live.receipt || history.data?.itens.some((bid) => bid.participante.proprio);
  const receiptOvertaken = !!(
    live.receipt &&
    state &&
    state.sequencia > live.receipt.licitacao.sequencia
  );
  const statusLabels = {
    connecting: 'A ligar à sala',
    connected: 'Ligado à sala',
    reconnecting: 'A reconectar',
    disconnected: 'Ligação indisponível',
    expired: 'Sessão expirada',
    forbidden: 'Sem autorização',
  };
  const refresh = live.refresh;
  const boundary = useCallback(() => {
    void refresh();
  }, [refresh]);
  const initialBoundary = useRef('');
  const confirmBoundary = () => {
    const key = (state?.versao ?? detail.versao) + ':' + (state?.estado ?? detail.estado);
    if (initialBoundary.current !== key) {
      initialBoundary.current = key;
      boundary();
    }
  };
  return (
    <div
      className="auction-room"
      data-auction-id={detail.id}
      data-version={state?.versao ?? detail.versao}
    >
      <header className="auction-room-intro">
        <p className="eyebrow">O tempo da colheita · {detail.produtor.nome}</p>
        <h1>{detail.titulo}</h1>
        <p>
          {detail.lote.nome} · {lotLabel(detail)}
        </p>
      </header>
      <div className="auction-room-grid auction-room-grid--participation">
        <aside className="auction-bid-panel" aria-label="Acompanhar e licitar">
          <div className="auction-card-top">
            <AuctionBadge state={state?.estado ?? detail.estado} />
            <span
              className={'auction-connection auction-connection--' + (live.status ?? 'connecting')}
            >
              {statusLabels[live.status ?? 'connecting']}
            </span>
          </div>
          <p className="auction-price-caption">Valor atual do lote</p>
          <div className="auction-current-value" data-testid="auction-current-value">
            <PriceDisplay amountCents={state?.valorAtualCent ?? detail.licitacaoAtual.valorCent} />
          </div>
          <div className="auction-price-meta">
            <span>
              Base <PriceDisplay amountCents={detail.precoBaseCent} />
            </span>
            <span>
              Incremento{' '}
              <PriceDisplay amountCents={state?.incrementoCent ?? detail.incrementoCent} />
            </span>
          </div>
          <AuctionClock
            state={{
              estado: state?.estado ?? detail.estado,
              iniciaEm: state?.iniciaEm ?? detail.iniciaEm,
              terminaEm: state?.terminaEm ?? detail.terminaEm,
            }}
            sample={clock}
            onBoundary={confirmBoundary}
          />
          {state?.estado === 'terminado' && state.resultado && (
            <section className="auction-final" role="status">
              <h2>
                {state.resultado.tipo === 'sem_licitacoes'
                  ? 'Este lote terminou sem ofertas.'
                  : leaderOwn
                    ? 'A tua oferta terminou na liderança.'
                    : 'O leilão chegou ao fim.'}
              </h2>
              {state.resultado.valorCent !== null && (
                <p>
                  Oferta final <PriceDisplay amountCents={state.resultado.valorCent} />
                </p>
              )}
              <p>
                Resultado confirmado pelo serviço. Não representa uma venda concluída ou pagamento
                recebido.
              </p>
            </section>
          )}
          {state?.estado === 'cancelado' && (
            <p className="auction-notice">Este leilão foi cancelado. Não aceita ofertas.</p>
          )}
          {live.status && live.status !== 'connected' && (
            <div className="auction-notice">
              <p>
                {live.status === 'reconnecting'
                  ? 'A recuperar a ligação. Os valores apresentados são a última confirmação disponível.'
                  : 'A ligação tem de estar confirmada para enviar uma oferta.'}
              </p>
              <Button variant="secondary" onClick={() => void live.refresh()}>
                Voltar a ligar
              </Button>
            </div>
          )}
          <p className="auction-lead" data-testid="auction-lead">
            {sequence === 0
              ? 'Ainda sem ofertas.'
              : leaderOwn
                ? 'A tua oferta está na liderança.'
                : hasOwnOffer
                  ? 'A tua oferta foi ultrapassada.'
                  : 'Há uma oferta na liderança.'}
          </p>
          {canBid && (
            <form
              className="auction-bid-form"
              aria-label="Apresentar oferta"
              onSubmit={(e) => {
                e.preventDefault();
                const value = cents(amount || (min !== undefined ? euros(min) : ''));
                if (value === undefined || min === undefined || value < min) {
                  setValidation('Indica um valor igual ou superior à próxima oferta mínima.');
                  return;
                }
                setValidation('');
                void live.submit(value);
              }}
            >
              <label htmlFor="auction-bid-amount">A tua oferta pelo lote (€)</label>
              <input
                id="auction-bid-amount"
                className="form-control"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                placeholder={min !== undefined ? euros(min) : '—'}
                disabled={!active || !synced || live.busy || !!live.attempt}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setValidation('');
                }}
                aria-invalid={validation ? true : undefined}
                aria-describedby="auction-minimum auction-bid-error"
              />
              <p id="auction-minimum">
                Próxima oferta mínima:{' '}
                {min !== undefined ? (
                  <PriceDisplay amountCents={min} />
                ) : (
                  'Limite de valor atingido'
                )}
              </p>
              <p id="auction-bid-error" role={validation ? 'alert' : undefined}>
                {validation}
              </p>
              <Button
                type="submit"
                disabled={!active || !synced || !!live.busy || !!live.attempt || min === undefined}
              >
                {live.busy ? 'A confirmar oferta…' : 'Confirmar oferta'}
              </Button>
              {live.attempt && (
                <Button
                  variant="secondary"
                  disabled={!synced || live.busy}
                  onClick={() => void live.submit()}
                >
                  Recuperar resultado da oferta
                </Button>
              )}
            </form>
          )}
          {!canBid && (
            <p className="auction-help">
              {owner
                ? 'Este é um lote da tua produção. Podes acompanhar as ofertas; não podes licitar no próprio leilão.'
                : 'A tua conta pode acompanhar este leilão. Para apresentar ofertas é necessária capacidade de comprador.'}
            </p>
          )}
          <div
            className={
              'auction-bid-feedback' +
              (receiptOvertaken && !live.notice ? ' auction-bid-feedback--historical' : '')
            }
            role="status"
            aria-live="polite"
          >
            {live.notice ??
              (live.receipt && (
                <>
                  <span>
                    Oferta de <PriceDisplay amountCents={live.receipt.licitacao.valorCent} /> aceite
                    e registada no histórico.
                  </span>
                  {live.receipt.origem === 'replay' && (
                    <span>Oferta confirmada: recuperámos a tua tentativa original.</span>
                  )}
                  {receiptOvertaken && <span>Esta oferta foi entretanto ultrapassada.</span>}
                </>
              ))}
          </div>
          {synced && (
            <p className="auction-presence">
              {live.presence ?? 0} ligações nesta sala{' '}
              <span>· Cada separador conta como uma ligação.</span>
            </p>
          )}
          <Button
            variant="text"
            onClick={() => {
              onRefresh();
              void live.refresh();
            }}
          >
            Atualizar o leilão ↻
          </Button>
          {ownerControls?.(state ?? fromDetail(detail))}
        </aside>
        <div className="auction-room-story">
          <AuctionImage auction={detail} />
          <div className="auction-provenance">
            <span className="eyebrow">Da origem ao lote</span>
            <h2>{detail.lote.nome}</h2>
            <p>{detail.descricao}</p>
            <Link to={'/produtores/' + detail.produtor.perfilId} className="editorial-text-link">
              Conhecer {detail.produtor.nome} ↗
            </Link>
            <dl className="auction-schedule">
              <div>
                <dt>Início</dt>
                <dd>{auctionDate(state?.iniciaEm ?? detail.iniciaEm)}</dd>
              </div>
              <div>
                <dt>Fim</dt>
                <dd>{auctionDate(state?.terminaEm ?? detail.terminaEm)}</dd>
              </div>
            </dl>
            <p className="auction-help">
              A oferta corresponde ao lote completo. O resultado do leilão não cria automaticamente
              uma encomenda ou um pagamento.
            </p>
          </div>
        </div>
      </div>
      <section className="auction-history" aria-labelledby="auction-history-title">
        <div className="auction-history-heading">
          <div>
            <p className="eyebrow">O percurso das ofertas</p>
            <h2 id="auction-history-title">Cada oferta fica na história.</h2>
          </div>
          <Button variant="text" onClick={history.retry}>
            Atualizar histórico ↻
          </Button>
        </div>
        {history.loading && <LoadingSkeleton label="A carregar o histórico de ofertas" count={1} />}
        {history.error && (
          <p role="alert">
            Não foi possível consultar o histórico.{' '}
            <button type="button" onClick={history.retry}>
              Tentar novamente
            </button>
          </p>
        )}
        {history.data && !history.data.itens.length && (
          <p>A primeira oferta pode ser a tua. Ainda não foram aceites licitações neste lote.</p>
        )}
        {history.data && (
          <>
            <ol className="auction-bid-ledger">
              {history.data.itens.map((b) => (
                <li key={b.id}>
                  <span className="auction-bid-sequence">
                    {String(b.sequencia).padStart(2, '0')}
                  </span>
                  <div>
                    <strong>
                      {b.participante.proprio
                        ? 'A tua oferta'
                        : 'Participante ' + b.participante.referencia.slice(-6)}
                    </strong>
                    <time dateTime={b.aceiteEm}>{auctionDate(b.aceiteEm)}</time>
                  </div>
                  <PriceDisplay amountCents={b.valorCent} />
                </li>
              ))}
            </ol>
            <p className="auction-help">
              {history.data.total} ofertas confirmadas até à sequência{' '}
              {history.data.sequenciaSnapshot}. As referências protegem a identidade dos
              participantes.
            </p>
            <AuctionPagination
              page={historyPage}
              totalPages={history.data.totalPaginas}
              onChange={setHistoryPage}
            />
          </>
        )}
      </section>
    </div>
  );
}
export function AuthorizedAuctionDetail({ id, owner = false }: { id: string; owner?: boolean }) {
  const auth = useAuth(),
    userId = auth.session.kind === 'authenticated' ? auth.session.user.id : '';
  const resource = useRemote(userId + ':auction:' + id, (signal) =>
    auth.request('/auctions/' + id, parseAuctionDetail, {}, signal),
  );
  if (resource.loading) return <LoadingSkeleton label="A carregar o leilão" count={2} />;
  if (resource.error)
    return (
      <div className="auction-notice" role="alert">
        <h1>
          {resource.error.status === 404
            ? 'Este leilão não está disponível.'
            : 'Não foi possível abrir o leilão.'}
        </h1>
        <p>Confirma o teu acesso ou tenta novamente.</p>
        <Button onClick={resource.retry}>Tentar novamente</Button>
      </div>
    );
  if (!resource.data) return null;
  if (owner && !resource.data.reserva)
    return (
      <div className="auction-notice">
        <h1>Este lote não pertence à tua produção.</h1>
        <Button to="/area/produtor/leiloes">Voltar aos teus leilões</Button>
      </div>
    );
  return <AuctionRoom detail={resource.data} onRefresh={resource.retry} />;
}
function VisitorPreview({ id }: { id: string }) {
  const location = useLocation();
  let preview: AuctionSummary | undefined;
  try {
    const value = (location.state as { auction?: unknown } | null)?.auction;
    if (value) {
      const parsed = parseAuction(value);
      if (parsed.id === id) preview = parsed;
    }
  } catch {
    /* Não confiar em estado de navegação manipulado. */
  }
  return (
    <div className="auction-room">
      <header className="auction-room-intro">
        <p className="eyebrow">Uma colheita, uma oportunidade</p>
        <h1>{preview?.titulo ?? 'O próximo encontro começa aqui.'}</h1>
        <p>
          {preview
            ? preview.lote.nome + ' · ' + lotLabel(preview)
            : 'Entra para conhecer o lote e acompanhar as ofertas.'}
        </p>
      </header>
      <div className="auction-room-grid">
        {preview && <AuctionImage auction={preview} />}
        <section className="auction-bid-panel">
          <p className="eyebrow">O lugar à mesa é teu</p>
          <h2>Entra para acompanhar este leilão.</h2>
          <p>
            O detalhe, o histórico e as ofertas estão reservados a contas autenticadas. O resumo do
            mercado continua público.
          </p>
          {preview && (
            <>
              <AuctionBadge state={preview.estado} />
              <p>
                Último valor consultado{' '}
                <PriceDisplay amountCents={preview.licitacaoAtual.valorCent} />
              </p>
              <p className="auction-help">Este resumo não acompanha alterações em direto.</p>
            </>
          )}
          <Button to={'/entrar?destino=' + encodeURIComponent('/leiloes/' + id)}>
            Entrar para acompanhar
          </Button>
          <Button to="/leiloes" variant="text">
            Voltar aos leilões
          </Button>
        </section>
      </div>
    </div>
  );
}
export default function AuctionDetailPage() {
  const { id = '' } = useParams(),
    { session } = useAuth();
  if (id === legacy.id) return <LegacyDetail />;
  if (!objectId(id)) return <NotFoundPage />;
  return (
    <Container>
      <div className="auction-market">
        <Breadcrumbs items={[{ label: 'Leilões', to: '/leiloes' }, { label: 'O lote' }]} />
        {session.kind === 'authenticated' ? (
          session.status === 'ready' ? (
            <AuthorizedAuctionDetail id={id} />
          ) : (
            <div className="auction-notice">
              <h1>A confirmar o teu acesso.</h1>
              <LoadingSkeleton count={1} label="A confirmar a sessão" />
            </div>
          )
        ) : (
          <VisitorPreview id={id} />
        )}
      </div>
    </Container>
  );
}
