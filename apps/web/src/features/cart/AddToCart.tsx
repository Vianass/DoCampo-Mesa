import { useId, useState } from 'react';
import type { Product } from '../../types/market';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { quantityError } from './model';
import { useCart } from './useCart';

export function AddToCart({ product, detailed = false }: { product: Product; detailed?: boolean }) {
  const { addItem, cart, feedback } = useCart();
  const [quantity, setQuantity] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const existing = cart.items.find((item) => item.productId === product.id)?.quantity ?? 0;
  const remaining = product.availableStock - existing;
  const message = feedback?.productId === product.id ? feedback : null;
  return (
    <div className={`add-to-cart ${detailed ? 'add-to-cart--detailed' : ''}`}>
      {detailed && product.availableStock > 0 && (
        <div className="add-to-cart__quantity">
          <label htmlFor={id}>Quantidade a adicionar</label>
          <input
            id={id}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={quantity}
            maxLength={12}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : undefined}
            onChange={(event) => {
              setQuantity(event.target.value);
              setError(null);
            }}
          />
        </div>
      )}
      <Button
        variant={detailed ? 'primary' : 'secondary'}
        size={detailed ? 'regular' : 'small'}
        disabled={remaining <= 0}
        aria-label={`Adicionar ${product.name} ao carrinho`}
        onClick={() => {
          const invalid = quantityError(detailed ? quantity : 1, remaining, false);
          setError(invalid);
          if (!invalid) addItem(product.id, detailed ? Number(quantity) : 1);
        }}
      >
        <Icon name="basket" />
        <span>
          {product.availableStock === 0
            ? 'Esgotado'
            : remaining <= 0
              ? 'Limite na cesta'
              : 'Adicionar à cesta'}
        </span>
      </Button>
      {error && (
        <p id={`${id}-error`} className="cart-field-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p
          className={`add-to-cart__feedback ${message.kind === 'error' ? 'cart-field-error' : ''}`}
        >
          {message.message}
        </p>
      )}
      {!message && existing > 0 && (
        <p className="add-to-cart__feedback">Na tua cesta: {existing}.</p>
      )}
    </div>
  );
}
