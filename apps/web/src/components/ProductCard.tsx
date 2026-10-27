import { Link } from 'react-router';
import type { Product } from '../data/market';
import { Icon } from './Icon';
import { MarketImage } from './MarketImage';
import { PriceDisplay } from './PriceDisplay';
import { StatusBadge } from './StatusBadge';
import { stockLabel } from '../features/api/catalog';
import { AddToCart } from '../features/cart/AddToCart';

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link
        to={`/produtos/${product.id}`}
        className="product-card__link"
        aria-label={`Ver ${product.name}`}
      >
        <div className="product-card__image">
          <MarketImage
            src={product.images[0].src}
            alt={product.images[0].alt}
            width="800"
            height="800"
            loading="lazy"
            decoding="async"
          />
          <div className="product-card__badges">
            {product.featured && product.season.length < 4 && (
              <StatusBadge tone="seasonal">Da época</StatusBadge>
            )}
            {product.organic && (
              <StatusBadge tone="organic">
                {product.source === 'api' ? 'Biológico · declarado' : 'Biológico'}
              </StatusBadge>
            )}
          </div>
          {product.images[0].src.endsWith('product-placeholder.svg') && (
            <span className="product-card__placeholder-note">Fotografia a preparar</span>
          )}
          <span className="product-card__arrow">
            <Icon name="diagonal" />
          </span>
        </div>
      </Link>
      <div className="product-card__body">
        <p className="product-card__origin">
          <Link to={`/produtores/${product.producerId}`}>{product.producerName}</Link>
          <span className="product-card__locality">
            <Icon name="location" width="12" height="12" />
            {product.producerLocation}
          </span>
        </p>
        <h3>
          <Link to={`/produtos/${product.id}`}>{product.name}</Link>
        </h3>
        <PriceDisplay amountCents={product.priceCents} unit={product.unit} />
        <p
          className={`product-card__stock ${product.availableStock === 0 ? 'product-card__stock--empty' : ''}`}
        >
          <span aria-hidden="true" />
          {product.availableStock > 0 ? `Disponível · ${stockLabel(product)} em stock` : 'Esgotado'}
        </p>
        <AddToCart product={product} />
      </div>
    </article>
  );
}
