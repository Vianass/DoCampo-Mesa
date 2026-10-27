import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ApiFailure } from '../api/client';
import { objectId, type PageDto } from '../api/catalog-contract';
import { parseOrderDetail, parseOrders, stateLabels, type OwnOrder } from '../checkout/contracts';
import { OrderDetails } from './OrderDetails';
import { orderDate } from './format';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { PriceDisplay } from '../../components/PriceDisplay';
type Resource = { key: string; data?: PageDto<OwnOrder> | OwnOrder; error?: string };
export default function OrdersArea() {
  const { session, request } = useAuth(),
    location = useLocation(),
    [params, setParams] = useSearchParams();
  const id = location.pathname.split('/')[4];
  const rawPage = params.get('pagina') ?? '1',
    page = /^[1-9]\d{0,3}$/.test(rawPage) && Number(rawPage) <= 1000 ? Number(rawPage) : 1;
  const sort = params.get('ordem') === 'antigas' ? 'antigas' : 'recentes';
  const [retry, setRetry] = useState(0),
    [resource, setResource] = useState<Resource>({ key: '' });
  const userId = session.kind === 'authenticated' ? session.user.id : '';
  const key = JSON.stringify([userId, id, page, sort, retry]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        if (id && !objectId(id)) throw new ApiFailure('http', 404);
        const data = id
          ? await request('/orders/' + id, parseOrderDetail, {}, controller.signal)
          : await request(
              `/orders?pagina=${page}&ordem=${sort}`,
              parseOrders,
              {},
              controller.signal,
            );
        if (!controller.signal.aborted) setResource({ key, data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResource({
            key,
            error:
              error instanceof ApiFailure && error.status === 404
                ? 'Esta encomenda não está disponível na tua conta.'
                : 'Não foi possível consultar as tuas encomendas. Tenta novamente.',
          });
      }
    })();
    return () => controller.abort();
  }, [key, request, id, page, sort]);
  const current = resource.key === key ? resource : undefined;
  function change(value: number, order = sort) {
    const next = new URLSearchParams();
    if (value > 1) next.set('pagina', String(value));
    if (order !== 'recentes') next.set('ordem', order);
    setParams(next);
  }
  return (
    <div className="buyer-page live-orders">
      <header className="buyer-intro">
        <p className="eyebrow">O teu mercado · Comprador</p>
        <h1>{id ? 'Cada escolha, uma história à mesa.' : 'As minhas encomendas.'}</h1>
        <p>
          Compras registadas na tua conta, com os produtos e valores confirmados no momento da
          compra.
        </p>
      </header>
      {id && (
        <Link className="buyer-detail-link" to="/area/comprador/encomendas">
          ← Todas as encomendas
        </Link>
      )}
      {!current && <LoadingSkeleton label="A carregar as tuas encomendas" count={2} />}
      {current?.error && (
        <div className="buyer-error" role="alert">
          <p>{current.error}</p>
          <Button onClick={() => setRetry((n) => n + 1)}>Tentar novamente</Button>
          {id && (
            <Button to="/area/comprador/encomendas" variant="text">
              Voltar às encomendas
            </Button>
          )}
        </div>
      )}
      {current?.data &&
        ('itens' in current.data ? (
          <>
            <div className="buyer-order-filters">
              <div>
                <label htmlFor="live-order-sort">Ordenar por data</label>
                <select
                  id="live-order-sort"
                  className="form-select"
                  value={sort}
                  onChange={(e) => change(1, e.target.value)}
                >
                  <option value="recentes">Mais recentes primeiro</option>
                  <option value="antigas">Mais antigas primeiro</option>
                </select>
              </div>
            </div>
            <p className="buyer-result-count" role="status">
              {current.data.total} {current.data.total === 1 ? 'encomenda' : 'encomendas'}
            </p>
            {current.data.itens.length ? (
              <section className="buyer-orders" aria-label="As tuas encomendas">
                {current.data.itens.map((order) => (
                  <article key={order.id} className="buyer-order-card live-order-card">
                    <p className="eyebrow">
                      {order.produtor?.nomePublico ?? 'Encomenda registada'}
                    </p>
                    <h2>
                      <Link to={'/area/comprador/encomendas/' + order.id}>{order.id}</Link>
                    </h2>
                    <p>
                      {orderDate(order.criadaEm)} · {stateLabels[order.estado]}
                    </p>
                    <p>{order.linhas.map((l) => l.nome).join(' · ')}</p>
                    <PriceDisplay amountCents={order.totalCent} />
                    <Link
                      className="editorial-text-link"
                      to={'/area/comprador/encomendas/' + order.id}
                    >
                      Consultar encomenda →
                    </Link>
                  </article>
                ))}
              </section>
            ) : (
              <EmptyState
                title={
                  current.data.total
                    ? 'Não há encomendas nesta página.'
                    : 'Ainda não tens encomendas.'
                }
                description="Quando concluíres uma compra, os seus detalhes ficam disponíveis aqui."
                action={<Button to="/produtos">Explorar produtos</Button>}
              />
            )}
            {current.data.totalPaginas > 1 && (
              <nav className="checkout-pagination" aria-label="Paginação de encomendas">
                <Button variant="secondary" disabled={page <= 1} onClick={() => change(page - 1)}>
                  Página anterior
                </Button>
                <span>
                  Página {page} de {current.data.totalPaginas}
                </span>
                <Button
                  variant="secondary"
                  disabled={page >= current.data.totalPaginas}
                  onClick={() => change(page + 1)}
                >
                  Página seguinte
                </Button>
              </nav>
            )}
          </>
        ) : (
          <OrderDetails order={current.data} />
        ))}
    </div>
  );
}
