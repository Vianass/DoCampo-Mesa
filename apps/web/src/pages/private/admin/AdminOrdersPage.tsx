import { useParams, useSearchParams } from 'react-router';
import { Button } from '../../../components/Button';
import { MarketImage } from '../../../components/MarketImage';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { OrderStatusBadge } from '../../../features/buyer/OrderCard';
import {
  buyerDate,
  orderTotal,
  lineSubtotal,
  orderStatusLabels,
} from '../../../features/buyer/selectors';
import { AdminPageFrame } from '../../../features/admin/AdminPageFrame';
import { AdminEmpty, AdminFilters } from '../../../features/admin/AdminComponents';
import {
  adminHome,
  byId,
  filterOptions,
  selectAdminOrders,
} from '../../../features/admin/selectors';
export default function AdminOrdersPage({ detail = false }: { detail?: boolean }) {
  const { id } = useParams();
  const [params] = useSearchParams();
  const options = filterOptions(params, orderStatusLabels);
  return (
    <AdminPageFrame
      title={detail ? 'O percurso de uma encomenda.' : 'Escolhas que ligam pessoas.'}
      description="Encomendas demonstrativas de todo o mercado, apenas para consulta. Valores históricos em cêntimos, sem taxas, portes ou pagamentos simulados."
    >
      {(data) => {
        if (detail) {
          const order = byId(data.orders, id);
          if (!order) return <AdminEmpty section="encomendas" missing />;
          return (
            <section className="admin-order-detail">
              <div className="admin-section-heading">
                <h2>{order.reference}</h2>
                <OrderStatusBadge status={order.status} />
              </div>
              <p>
                Identificador: {order.id} · {buyerDate(order.createdAt)}
              </p>
              <div className="admin-detail-grid">
                <div>
                  <h3>Comprador</h3>
                  <Button to={adminHome + '/utilizadores/' + order.buyerId} variant="text">
                    {byId(data.users, order.buyerId)?.displayName}
                  </Button>
                </div>
                <div>
                  <h3>Produtor</h3>
                  <Button to={adminHome + '/produtores/' + order.producerId} variant="text">
                    {byId(data.producers, order.producerId)?.profile.name}
                  </Button>
                </div>
              </div>
              <ul className="admin-list admin-order-lines">
                {order.items.map((item) => (
                  <li key={item.productId}>
                    <MarketImage
                      src={item.image.src}
                      alt={item.image.alt}
                      width="80"
                      height="80"
                      loading="lazy"
                    />
                    <div>
                      <h3>{item.productName}</h3>
                      <p>
                        {item.quantity} unidades comerciais · {item.unit}
                      </p>
                      <p>
                        Preço histórico:{' '}
                        <PriceDisplay amountCents={item.unitPriceCents} unit={item.unit} />
                      </p>
                    </div>
                    <div>
                      <span>Subtotal </span>
                      <PriceDisplay amountCents={lineSubtotal(item)} />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="admin-total">
                <span>Total da encomenda</span>
                <PriceDisplay amountCents={orderTotal(order)} large />
              </div>
              <h3>Histórico disponível.</h3>
              <ol className="admin-history">
                {order.history.map((entry) => (
                  <li key={entry.status}>
                    <strong>{orderStatusLabels[entry.status]}</strong>
                    <time dateTime={entry.occurredAt}>
                      {buyerDate(entry.occurredAt)} ·{' '}
                      {new Date(entry.occurredAt).toLocaleTimeString('pt-PT', {
                        timeZone: 'Europe/Lisbon',
                      })}
                    </time>
                  </li>
                ))}
              </ol>
              <p className="admin-help">
                Snapshots históricos. Não existem ações administrativas de alteração do estado.
              </p>
              <Button to={adminHome + '/encomendas'} variant="secondary">
                Voltar às encomendas
              </Button>
            </section>
          );
        }
        const list = selectAdminOrders(data, options.search, options.status);
        return (
          <>
            <AdminFilters label="encomendas" options={orderStatusLabels} {...options} />
            <p className="admin-result-count">{list.length} encomendas</p>
            {!list.length ? (
              <AdminEmpty section="encomendas" />
            ) : (
              <ul className="admin-list admin-order-list">
                {list.map((o) => (
                  <li key={o.id}>
                    <div>
                      <h2>{o.reference}</h2>
                      <p>
                        {byId(data.users, o.buyerId)?.displayName} ·{' '}
                        {byId(data.producers, o.producerId)?.profile.name}
                      </p>
                      <p>
                        {buyerDate(o.createdAt)} ·{' '}
                        {o.items.reduce((sum, item) => sum + item.quantity, 0)} unidades comerciais
                      </p>
                      <OrderStatusBadge status={o.status} />
                    </div>
                    <div>
                      <PriceDisplay amountCents={orderTotal(o)} />
                      <Button to={adminHome + '/encomendas/' + o.id} variant="text">
                        Consultar encomenda
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        );
      }}
    </AdminPageFrame>
  );
}
