import { publicProductPath, publicProducerPath } from '../../../features/api/catalog';
import { Link, useParams } from 'react-router';
import { Button } from '../../../components/Button';
import { EmptyState } from '../../../components/EmptyState';
import { MarketImage } from '../../../components/MarketImage';
import { PriceDisplay } from '../../../components/PriceDisplay';
import { BuyerPageFrame } from '../../../features/buyer/BuyerPageFrame';
import { OrderStatusBadge } from '../../../features/buyer/OrderCard';
import {
  buyerDate,
  lineSubtotal,
  orderGroups,
  orderStatusLabels,
  orderTotal,
  selectOrder,
} from '../../../features/buyer/selectors';

export default function BuyerOrderDetailPage() {
  const { id } = useParams();
  return (
    <BuyerPageFrame
      title="Cada escolha,"
      accent="uma história à mesa."
      description="Os produtos, a origem e o percurso de uma encomenda demonstrativa."
    >
      {(data) => {
        const order = selectOrder(data, id);
        if (!order)
          return (
            <EmptyState
              title="Esta encomenda não está no teu percurso."
              description="A referência não existe neste cenário ou não pertence ao comprador demonstrativo."
              action={<Button to="/area/comprador/encomendas">Voltar às encomendas</Button>}
            />
          );
        return (
          <>
            <Link to="/area/comprador/encomendas" className="buyer-detail-link">
              ← Todas as encomendas
            </Link>
            <section className="buyer-order-detail" aria-labelledby="order-reference">
              <header>
                <div>
                  <p className="eyebrow">Encomenda demonstrativa</p>
                  <h2 id="order-reference">{order.reference}</h2>
                  <time dateTime={order.createdAt}>{buyerDate(order.createdAt)}</time>
                </div>
                <OrderStatusBadge status={order.status} />
              </header>
              {orderGroups(order).map((group) => (
                <section
                  key={group.producerId}
                  className="buyer-order-producer"
                  aria-labelledby={`order-producer-${group.producerId}`}
                >
                  <h3 id={`order-producer-${group.producerId}`}>
                    <Link to={publicProducerPath(group.producerId)}>{group.producerName}</Link>
                  </h3>
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.productId} className="buyer-order-line">
                        <MarketImage
                          src={item.image.src}
                          alt={item.image.alt}
                          width="140"
                          height="140"
                          loading="lazy"
                        />
                        <div>
                          <h4>
                            <Link to={publicProductPath(item.productId)}>{item.productName}</Link>
                          </h4>
                          <p>
                            {item.quantity} {item.quantity === 1 ? 'unidade' : 'unidades'} ·{' '}
                            {item.unit} por unidade
                          </p>
                          <span>
                            Preço da encomenda:{' '}
                            <PriceDisplay amountCents={item.unitPriceCents} unit={item.unit} />
                          </span>
                        </div>
                        <div className="buyer-order-line__total">
                          <span>Subtotal</span>
                          <PriceDisplay amountCents={lineSubtotal(item)} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <footer>
                    <span>Subtotal de {group.producerName}</span>
                    <PriceDisplay amountCents={group.subtotalCents} />
                  </footer>
                </section>
              ))}
              <div className="buyer-order-total">
                <span>Total da encomenda</span>
                <PriceDisplay amountCents={orderTotal(order)} large />
              </div>
              <p className="buyer-snapshot-note">
                Preços e unidades guardados neste exemplo de encomenda. Sem taxas ou custos
                adicionais. Não corresponde a um pagamento.
              </p>
              <section className="buyer-order-history" aria-labelledby="order-history-title">
                <h3 id="order-history-title">O caminho desta escolha.</h3>
                <ol>
                  {order.history.map((entry) => (
                    <li key={entry.status}>
                      <strong>{orderStatusLabels[entry.status]}</strong>
                      <time dateTime={entry.occurredAt}>{buyerDate(entry.occurredAt)}</time>
                    </li>
                  ))}
                </ol>
                <p>Histórico fictício. A consulta não permite ao comprador alterar o estado.</p>
              </section>
            </section>
          </>
        );
      }}
    </BuyerPageFrame>
  );
}
