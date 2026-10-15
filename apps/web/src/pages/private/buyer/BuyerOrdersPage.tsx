import { useSearchParams } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { BuyerPageFrame } from '../../../features/buyer/BuyerPageFrame';
import { OrderCard } from '../../../features/buyer/OrderCard';
import { orderStatuses } from '../../../features/buyer/types';
import {
  orderStatusLabels,
  parseOrderOptions,
  selectOrders,
} from '../../../features/buyer/selectors';

export default function BuyerOrdersPage() {
  const [params, setParams] = useSearchParams();
  const options = parseOrderOptions(params);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value === 'todos' || value === 'recentes') next.delete(key);
    else next.set(key, value);
    setParams(next);
  }
  return (
    <BuyerPageFrame
      title="As minhas encomendas."
      description="As escolhas que fazem parte desta história, da preparação à chegada à mesa."
    >
      {(data) => {
        const orders = selectOrders(data, options);
        return (
          <>
            <div className="buyer-order-filters">
              <div>
                <label htmlFor="order-state">Filtrar por estado</label>
                <select
                  id="order-state"
                  className="form-select"
                  value={options.status}
                  onChange={(event) => change('estado', event.target.value)}
                >
                  <option value="todos">Todos os estados</option>
                  {orderStatuses.map((status) => (
                    <option key={status} value={status}>
                      {orderStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="order-sort">Ordenar por data</label>
                <select
                  id="order-sort"
                  className="form-select"
                  value={options.sort}
                  onChange={(event) => change('ordem', event.target.value)}
                >
                  <option value="recentes">Mais recentes primeiro</option>
                  <option value="antigas">Mais antigas primeiro</option>
                </select>
              </div>
            </div>
            <p className="buyer-result-count" role="status" aria-live="polite">
              {orders.length}{' '}
              {orders.length === 1 ? 'encomenda neste percurso' : 'encomendas neste percurso'}
            </p>
            {orders.length ? (
              <section className="buyer-orders" aria-labelledby="orders-list-title">
                <h2 className="visually-hidden" id="orders-list-title">
                  Lista de encomendas demonstrativas
                </h2>
                {orders.map((order) => (
                  <OrderCard key={order.id} order={order} />
                ))}
              </section>
            ) : (
              <EmptyState
                title="Sem encomendas para esta escolha."
                description="Experimenta outro estado ou continua a conhecer os produtos do mercado."
                action={
                  <>
                    <Button variant="secondary" onClick={() => change('estado', 'todos')}>
                      Mostrar todos os estados
                    </Button>
                    <Button to="/produtos" variant="text">
                      Explorar produtos
                    </Button>
                  </>
                }
              />
            )}
          </>
        );
      }}
    </BuyerPageFrame>
  );
}
