import { useParams } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { MarketImage } from '../../../components/MarketImage';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { OrderStatusBadge } from '../../../features/buyer/OrderCard';
import {
  buyerDate,
  lineSubtotal,
  orderStatusLabels,
  orderTotal,
} from '../../../features/buyer/selectors';
import { ProducerPageFrame } from '../../../features/producer/ProducerPageFrame';
import { ownOrders } from '../../../features/producer/selectors';
export default function ProducerOrderDetailPage() {
  const { id } = useParams();
  return (
    <ProducerPageFrame
      title="Uma escolha da tua origem."
      description="Produtos, quantidades e percurso de uma encomenda recebida, apenas para consulta."
    >
      {(data) => {
        const order = ownOrders(data).find((entry) => entry.id === id);
        if (!order)
          return (
            <EmptyState
              title="Esta encomenda não pertence à tua produção."
              description="O identificador não existe neste cenário ou está fora do teu percurso."
              action={<Button to="/area/produtor/encomendas">Voltar às encomendas</Button>}
            />
          );
        return (
          <section className="producer-order-detail">
            <div className="producer-section-heading">
              <div>
                <p className="eyebrow">Encomenda demonstrativa</p>
                <h2>{order.reference}</h2>
                <time dateTime={order.createdAt}>{buyerDate(order.createdAt)}</time>
                <p>{order.customerLabel}</p>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>
            <ul className="producer-order-lines">
              {order.items.map((item) => (
                <li key={item.productId}>
                  <MarketImage
                    src={item.image.src}
                    alt={item.image.alt}
                    width="100"
                    height="100"
                    loading="lazy"
                  />
                  <div>
                    <h3>{item.productName}</h3>
                    <p>
                      {item.quantity} unidades comerciais · {item.unit}
                    </p>
                    <span>
                      Preço histórico:{' '}
                      <PriceDisplay amountCents={item.unitPriceCents} unit={item.unit} />
                    </span>
                  </div>
                  <div>
                    <span>Subtotal</span>
                    <PriceDisplay amountCents={lineSubtotal(item)} />
                  </div>
                </li>
              ))}
            </ul>
            <div className="producer-order-total">
              <span>Total da encomenda</span>
              <PriceDisplay amountCents={orderTotal(order)} large />
            </div>
            <p className="producer-help">
              Snapshots históricos, independentes das edições de produtos. Sem taxas, portes ou
              pagamentos simulados.
            </p>
            <h3>O percurso desta encomenda.</h3>
            <ol className="producer-steps">
              {order.history.map((entry) => (
                <li key={entry.status}>
                  <strong>{orderStatusLabels[entry.status]}</strong>
                  <time dateTime={entry.occurredAt}>{buyerDate(entry.occurredAt)}</time>
                </li>
              ))}
            </ol>
            <p className="producer-help">
              Histórico ilustrativo. As alterações de estado e notificações ficam para a integração
              futura.
            </p>
            <Button to="/area/produtor/encomendas" variant="secondary">
              Voltar às encomendas
            </Button>
          </section>
        );
      }}
    </ProducerPageFrame>
  );
}
