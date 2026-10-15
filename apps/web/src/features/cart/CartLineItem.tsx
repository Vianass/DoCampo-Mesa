import { Link } from 'react-router';
import { MarketImage } from '../../components/MarketImage';
import { PriceDisplay } from '../../components/PriceDisplay';
import type { CartLine } from './types';
import { QuantityControl } from './QuantityControl';
import { useCart } from './useCart';

export function CartLineItem({ line, onRemoved }: { line: CartLine; onRemoved: () => void }) {
  const { updateQuantity, removeItem } = useCart();
  const { item, product, subtotalCents } = line;
  return (
    <article className="cart-line" aria-label={`Produto na cesta: ${product.name}`}>
      <Link
        to={`/produtos/${product.id}`}
        className="cart-line__image-link"
        aria-label={`Ver ${product.name}`}
      >
        <MarketImage
          src={product.images[0].src}
          alt={product.images[0].alt}
          width="200"
          height="200"
          loading="lazy"
        />
      </Link>
      <div className="cart-line__details">
        <p className="cart-line__category">{product.category}</p>
        <h3>
          <Link to={`/produtos/${product.id}`}>{product.name}</Link>
        </h3>
        <PriceDisplay amountCents={item.unitPriceSnapshotCents} unit={item.unit} />
        <p className="cart-line__stock">
          {product.availableStock} unidades disponíveis · {item.unit} por unidade.
        </p>
        <button
          className="cart-remove"
          type="button"
          aria-label={`Retirar ${product.name} do carrinho`}
          onClick={() => {
            removeItem(product.id);
            onRemoved();
          }}
        >
          Retirar produto
        </button>
      </div>
      <div className="cart-line__quantity">
        <QuantityControl
          quantity={item.quantity}
          stock={product.availableStock}
          name={product.name}
          onChange={(quantity) => {
            updateQuantity(product.id, quantity);
            if (quantity === 0) onRemoved();
          }}
        />
      </div>
      <div className="cart-line__subtotal">
        <span>Subtotal do produto</span>
        <PriceDisplay amountCents={subtotalCents} />
      </div>
    </article>
  );
}
