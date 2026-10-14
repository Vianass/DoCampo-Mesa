import { Link } from 'react-router';
import type { Product } from '../data/market';
import { Icon } from './Icon';
import { PriceDisplay } from './PriceDisplay';
import { StatusBadge } from './StatusBadge';

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <Link to={`/produtos/${product.id}`} className="product-card__link">
        <div className="product-card__image">
          <img
            src={product.image}
            alt={product.imageAlt}
            width="800"
            height="800"
            loading="lazy"
            decoding="async"
          />
          {product.tag && <StatusBadge tone="seasonal">{product.tag}</StatusBadge>}
          <span className="product-card__arrow">
            <Icon name="diagonal" />
          </span>
        </div>
        <div className="product-card__body">
          <p className="product-card__origin">
            {product.producer} <span>· {product.locality}</span>
          </p>
          <h3>{product.name}</h3>
          <PriceDisplay amountCents={product.priceCents} unit={product.unit} />
        </div>
      </Link>
    </article>
  );
}
