import { Link } from 'react-router';
import { MarketImage } from '../../components/MarketImage';
import { PriceDisplay } from '../../components/PriceDisplay';
import { StatusBadge } from '../../components/StatusBadge';
import { OrderStatusBadge } from '../buyer/OrderCard';
import { buyerDate, orderTotal } from '../buyer/selectors';
import { stockLabels, stockSituation } from './selectors';
import type { ProducerAuction, ProducerOrder, ProducerProduct } from './types';
export function StockStatus({ product }: { product: ProducerProduct }) {
  const state = stockSituation(product);
  return (
    <StatusBadge tone={state === 'disponivel' ? 'organic' : 'neutral'}>
      {stockLabels[state]}
    </StatusBadge>
  );
}
export function ProducerProductList({ products }: { products: readonly ProducerProduct[] }) {
  return (
    <div className="producer-product-list">
      {products.map((product) => (
        <article
          key={product.id}
          className="producer-product-row"
          aria-label={'Produto ' + product.name}
        >
          <Link
            to={'/area/produtor/produtos/' + product.id}
            className="producer-product-row__image"
            aria-label={'Consultar ' + product.name}
          >
            <MarketImage
              src={product.images[0].src}
              alt={product.images[0].alt}
              width="100"
              height="100"
              loading="lazy"
            />
          </Link>
          <div>
            <p className="eyebrow">{product.category}</p>
            <h3>
              <Link to={'/area/produtor/produtos/' + product.id}>{product.name}</Link>
            </h3>
            <PriceDisplay amountCents={product.priceCents} unit={product.unit} />
          </div>
          <div className="producer-product-row__stock">
            <StockStatus product={product} />
            <p>
              {product.availableStock} unidades comerciais · {product.unit}
            </p>
            <small>Limiar ilustrativo: {product.lowStockThreshold}</small>
          </div>
          <Link
            className="producer-text-link"
            to={'/area/produtor/produtos/' + product.id + '/editar'}
            aria-label={'Editar ' + product.name}
          >
            Editar →
          </Link>
        </article>
      ))}
    </div>
  );
}
export function ProducerOrderList({ orders }: { orders: readonly ProducerOrder[] }) {
  return (
    <div className="producer-order-list">
      {orders.map((order) => (
        <article
          className="producer-order-row"
          key={order.id}
          aria-label={'Encomenda ' + order.reference}
        >
          <div>
            <h3>
              <Link to={'/area/produtor/encomendas/' + order.id}>{order.reference}</Link>
            </h3>
            <time dateTime={order.createdAt}>{buyerDate(order.createdAt)}</time>
            <p>{order.items.map((item) => item.quantity + ' × ' + item.productName).join(' · ')}</p>
          </div>
          <div>
            <OrderStatusBadge status={order.status} />
            <PriceDisplay amountCents={orderTotal(order)} />
            <Link
              className="producer-text-link"
              to={'/area/produtor/encomendas/' + order.id}
              aria-label={'Ver encomenda ' + order.reference}
            >
              Ver detalhe →
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
export function ProducerAuctionList({ auctions }: { auctions: readonly ProducerAuction[] }) {
  return (
    <div className="producer-auction-list">
      {auctions.map((auction) => (
        <article key={auction.id} className="producer-auction-row">
          <div>
            <StatusBadge tone={auction.state === 'ativo' ? 'organic' : 'neutral'}>
              {auction.state === 'ativo'
                ? 'Ativo'
                : auction.state === 'agendado'
                  ? 'Agendado'
                  : 'Terminado'}
            </StatusBadge>
            <h3>
              <Link to={'/area/produtor/leiloes/' + auction.id}>{auction.title}</Link>
            </h3>
            <p>{auction.lot}</p>
            <time dateTime={auction.endsAt}>Fim do cenário: {buyerDate(auction.endsAt)}</time>
          </div>
          <div>
            <span>
              {auction.currentBid ? 'Oferta mais elevada no retrato' : 'Preço base · sem ofertas'}
            </span>
            <PriceDisplay amountCents={auction.currentBid?.amountCents ?? auction.basePriceCents} />
            <p>{auction.bidCount} ofertas aceites · cenário</p>
            <Link className="producer-text-link" to={'/area/produtor/leiloes/' + auction.id}>
              Consultar o lote →
            </Link>
          </div>
        </article>
      ))}
    </div>
  );
}
