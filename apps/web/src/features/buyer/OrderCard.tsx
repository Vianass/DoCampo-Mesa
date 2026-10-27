import { publicProductPath, publicProducerPath } from '../../features/api/catalog';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { PriceDisplay } from '../../components/PriceDisplay';
import { StatusBadge } from '../../components/StatusBadge';
import { buyerDate, orderGroups, orderStatusLabels, orderTotal } from './selectors';
import type { BuyerOrder, OrderStatus } from './types';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <StatusBadge
      tone={status === 'entregue' ? 'organic' : status === 'pronta' ? 'seasonal' : 'neutral'}
    >
      {orderStatusLabels[status]}
    </StatusBadge>
  );
}
export function OrderCard({ order }: { order: BuyerOrder }) {
  return (
    <article className="buyer-order-card" aria-label={`Encomenda ${order.reference}`}>
      <header>
        <div>
          <h3>
            <Link to={`/area/comprador/encomendas/${order.id}`}>{order.reference}</Link>
          </h3>
          <time dateTime={order.createdAt}>{buyerDate(order.createdAt)}</time>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>
      {orderGroups(order).map((group) => (
        <div key={group.producerId} className="buyer-order-card__group">
          <Link to={publicProducerPath(group.producerId)} className="buyer-producer-link">
            {group.producerName}
          </Link>
          <ul>
            {group.items.map((item) => (
              <li key={item.productId}>
                <Link to={publicProductPath(item.productId)}>{item.productName}</Link>
                <span>
                  {item.quantity} ×{' '}
                  <PriceDisplay amountCents={item.unitPriceCents} unit={item.unit} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <footer>
        <div>
          <span>Total da encomenda</span>
          <PriceDisplay amountCents={orderTotal(order)} />
        </div>
        <Button
          to={`/area/comprador/encomendas/${order.id}`}
          variant="text"
          size="small"
          aria-label={`Ver encomenda ${order.reference}`}
        >
          Ver detalhe →
        </Button>
      </footer>
    </article>
  );
}
