import { useOrderUpdates } from '../orders/OrderUpdatesContext';
import { OrderConnectionNote } from '../orders/OrderConnectionNote';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { AccountIdentity } from '../private-area/AccountIdentity';
import { ApiFailure } from '../api/client';
import { objectId } from '../api/catalog-contract';
import { orderStates, stateLabels } from '../checkout/contracts';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { PriceDisplay } from '../../components/PriceDisplay';
import { OrderDetails } from '../orders/OrderDetails';
import { orderDate } from '../orders/format';
import {
  parseProducerOrders,
  parseProducerOrder,
  producerActionLabels,
  type OrderState,
  type ProducerOrderPage,
  type ProducerOrderDetail,
  type SalesIndicators,
} from './contracts';

const base = '/me/producer/orders';
function Indicators({ data }: { data: SalesIndicators }) {
  return (
    <section className="producer-activity" aria-label="Indicadores reais de vendas">
      <dl className="producer-metrics">
        <div>
          <dt>Encomendas recebidas</dt>
          <dd>{data.numeroEncomendas}</dd>
        </div>
        <div>
          <dt>Encomendas pendentes</dt>
          <dd>{data.porEstado.pendente}</dd>
        </div>
        <div>
          <dt>Encomendas concluídas</dt>
          <dd>{data.porEstado.concluida}</dd>
        </div>
        <div>
          <dt>Valor das encomendas concluídas</dt>
          <dd>
            <PriceDisplay amountCents={data.valorConcluidasCent} />
          </dd>
        </div>
      </dl>
      <p className="producer-help">
        Indicadores de todas as tuas encomendas, independentes do filtro e da página. O valor inclui
        apenas encomendas concluídas e não representa pagamentos recebidos, lucro ou saldo
        disponível.
      </p>
      <dl className="producer-live-states">
        {orderStates.map((s) => (
          <div key={s}>
            <dt>
              <Link to={'/area/produtor/encomendas?estado=' + s}>{stateLabels[s]}</Link>
            </dt>
            <dd>{data.porEstado[s]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
type Resource = { key: string; data?: ProducerOrderPage | ProducerOrderDetail; error?: string };
export default function ProducerOrdersArea({ overview = false }: { overview?: boolean }) {
  const { request, session } = useAuth(),
    location = useLocation(),
    [params, setParams] = useSearchParams();
  const realtime = useOrderUpdates();
  const id = overview ? undefined : location.pathname.split('/')[4];
  const rawPage = params.get('pagina') ?? '1',
    page = /^[1-9]\d{0,3}$/.test(rawPage) && Number(rawPage) <= 1000 ? Number(rawPage) : 1;
  const state = orderStates.find((s) => s === params.get('estado')) ?? '',
    sort = params.get('ordem') === 'antigas' ? 'antigas' : 'recentes';
  const [retry, setRetry] = useState(0),
    [resource, setResource] = useState<Resource>({ key: '' });
  const [write, setWrite] = useState<{
    key: string;
    busy?: boolean;
    error?: string;
    success?: string;
  }>({ key: '' });
  const userId = session.kind === 'authenticated' ? session.user.id : '';
  const key = JSON.stringify([userId, id, page, state, sort, retry, overview]);
  const pending = useRef<AbortController | undefined>(undefined),
    reader = useRef<AbortController | undefined>(undefined),
    missed = useRef(false);
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    if (pending.current) {
      missed.current = true;
      return;
    }
    const controller = new AbortController();
    reader.current = controller;
    void (async () => {
      try {
        if (id && !objectId(id)) throw new ApiFailure('http', 404);
        const query = new URLSearchParams({ pagina: String(page), ordem: sort });
        if (state) query.set('estado', state);
        const data = id
          ? await request(base + '/' + id, parseProducerOrder, {}, controller.signal)
          : await request(base + '?' + query, parseProducerOrders, {}, controller.signal);
        if (id && (!('id' in data) || data.id !== id)) throw new ApiFailure('invalid');
        if (!controller.signal.aborted) setResource({ key, data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResource({
            key,
            error:
              error instanceof ApiFailure && error.status === 404
                ? 'Esta encomenda não está disponível na tua produção.'
                : error instanceof ApiFailure && error.status === 403
                  ? 'A tua conta não tem acesso à gestão de encomendas.'
                  : 'Não foi possível consultar as encomendas. Tenta novamente.',
          });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [key, id, page, state, sort, request, realtime.revision, settled]);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = undefined;
    },
    [userId, id, page, state, sort],
  );
  const current = resource.key === key ? resource : undefined,
    notice = write.key === key ? write : undefined;
  function filters(nextState = state, nextSort = sort, nextPage = 1) {
    const next = new URLSearchParams();
    if (nextState) next.set('estado', nextState);
    if (nextSort !== 'recentes') next.set('ordem', nextSort);
    if (nextPage > 1) next.set('pagina', String(nextPage));
    setParams(next);
  }
  async function update(order: ProducerOrderDetail, target: OrderState) {
    if (pending.current || notice?.error) return;
    const controller = new AbortController();
    pending.current = controller;
    reader.current?.abort();
    setWrite({ key, busy: true });
    try {
      const data = await request(
        base + '/' + order.id + '/status',
        parseProducerOrder,
        { method: 'PATCH', body: { estado: target }, ifMatch: order.etag },
        controller.signal,
      );
      if (data.id !== order.id || data.estado !== target) throw new ApiFailure('invalid');
      if (!controller.signal.aborted) {
        setResource({ key, data });
        setWrite({
          key,
          success:
            'Estado atualizado para ' +
            stateLabels[data.estado] +
            '. O comprador pode consultar esta alteração.',
        });
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        setWrite({
          key,
          error:
            error instanceof ApiFailure && [409, 412].includes(error.status ?? 0)
              ? 'A encomenda mudou ou a transição já não é permitida. Atualiza a consulta antes de continuar.'
              : 'Não foi possível confirmar a alteração. Atualiza a consulta para verificar o estado antes de repetir.',
        });
      }
    } finally {
      if (pending.current === controller) {
        pending.current = undefined;
        if (missed.current) {
          missed.current = false;
          setSettled((n) => n + 1);
        }
      }
    }
  }
  return (
    <div className="producer-workspace producer-live">
      <header className="producer-intro">
        <p className="eyebrow">A tua produção · Produtor</p>
        <h1>
          {id
            ? 'Cada encomenda, um compromisso.'
            : overview
              ? 'Da tua terra, para outras mesas.'
              : 'As minhas encomendas.'}
        </h1>
        <p>
          {id
            ? 'Produtos e condições guardados no momento da compra.'
            : 'Acompanha as encomendas reais da tua produção, da primeira escolha à preparação.'}
        </p>
      </header>
      {overview && session.kind === 'authenticated' && <AccountIdentity user={session.user} />}
      <OrderConnectionNote />
      <div className="producer-live-toolbar">
        <Button to="/area/produtor/encomendas" variant="text">
          Todas as encomendas
        </Button>
        <Button onClick={() => setRetry((n) => n + 1)} variant="secondary" disabled={notice?.busy}>
          Atualizar consulta
        </Button>
      </div>
      {!current && <LoadingSkeleton label="A carregar as encomendas da produção" count={2} />}
      {current?.error && (
        <div role="alert" className="producer-error">
          <p>{current.error}</p>
          <Button onClick={() => setRetry((n) => n + 1)}>Tentar novamente</Button>
        </div>
      )}
      {current?.data &&
        ('itens' in current.data ? (
          <>
            <Indicators data={current.data.indicadores} />
            {!overview && (
              <div className="producer-filters">
                <div className="form-field">
                  <label htmlFor="producer-order-state">Estado das encomendas recebidas</label>
                  <select
                    id="producer-order-state"
                    className="form-select"
                    value={state}
                    onChange={(e) => filters(e.target.value as OrderState | '')}
                  >
                    <option value="">Todos os estados</option>
                    {orderStates.map((s) => (
                      <option key={s} value={s}>
                        {stateLabels[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-field">
                  <label htmlFor="producer-order-sort">Ordenar por data</label>
                  <select
                    id="producer-order-sort"
                    className="form-select"
                    value={sort}
                    onChange={(e) => filters(state, e.target.value as typeof sort)}
                  >
                    <option value="recentes">Mais recentes primeiro</option>
                    <option value="antigas">Mais antigas primeiro</option>
                  </select>
                </div>
              </div>
            )}
            <p className="producer-result-count" role="status">
              {current.data.total} encomendas{overview ? ' no total' : ' nesta consulta'}
            </p>
            {current.data.itens.length ? (
              <section className="buyer-orders" aria-label="Encomendas recebidas">
                {current.data.itens.slice(0, overview ? 3 : undefined).map((order) => (
                  <article className="buyer-order-card producer-live-card" key={order.id}>
                    <p className="eyebrow">
                      {stateLabels[order.estado]} ·{' '}
                      {order.modalidade === 'entrega' ? 'Entrega' : 'Levantamento'}
                    </p>
                    <h2>
                      <Link to={'/area/produtor/encomendas/' + order.id}>{order.id}</Link>
                    </h2>
                    <p>{orderDate(order.criadaEm)}</p>
                    <p>{order.linhas.map((l) => l.nome).join(' · ')}</p>
                    <PriceDisplay amountCents={order.totalCent} />
                    <Link
                      className="editorial-text-link"
                      to={'/area/produtor/encomendas/' + order.id}
                    >
                      Consultar encomenda →
                    </Link>
                  </article>
                ))}
              </section>
            ) : (
              <EmptyState
                title="Ainda sem encomendas nesta consulta."
                description="As compras associadas à tua produção aparecerão aqui. Podes rever os filtros ou atualizar a consulta."
              />
            )}
            {!overview && current.data.totalPaginas > 1 && (
              <nav className="checkout-pagination" aria-label="Paginação de encomendas recebidas">
                <Button
                  variant="secondary"
                  disabled={page <= 1}
                  onClick={() => filters(state, sort, page - 1)}
                >
                  Página anterior
                </Button>
                <span>
                  Página {page} de {current.data.totalPaginas}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= current.data.totalPaginas}
                  onClick={() => filters(state, sort, page + 1)}
                >
                  Página seguinte
                </Button>
              </nav>
            )}
          </>
        ) : (
          <>
            {notice?.success && (
              <p role="status" className="producer-feedback producer-feedback--success">
                {notice.success}
              </p>
            )}
            {notice?.error && (
              <p role="alert" className="producer-error">
                {notice.error}
              </p>
            )}
            <OrderDetails order={current.data} showProducer={false} />
            <section className="producer-live-actions" aria-label="Gestão do estado">
              <h2>O próximo passo.</h2>
              {current.data.acoesPermitidas.length ? (
                current.data.acoesPermitidas.map((target) => (
                  <Button
                    key={target}
                    disabled={!!notice?.busy || !!notice?.error}
                    onClick={() => void update(current.data as ProducerOrderDetail, target)}
                  >
                    {notice?.busy ? 'A guardar alteração…' : producerActionLabels[target]}
                  </Button>
                ))
              ) : (
                <p>Não há transições de estado disponíveis para o produtor nesta etapa.</p>
              )}
              <p className="producer-help">
                A conclusão depende da confirmação explícita de receção pelo comprador. Esta
                operação não altera pagamentos, produtos, stock ou condições históricas. As
                atualizações em direto sinalizam alterações confirmadas; a API mantém o estado de
                referência.
              </p>
            </section>
          </>
        ))}
    </div>
  );
}
