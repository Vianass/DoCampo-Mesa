import { useId, useState } from 'react';
import { quantityError, productQuantityError } from './model';
import type { Product } from '../../types/market';

export function QuantityControl({
  quantity,
  stock,
  name,
  onChange,
  product,
}: {
  product?: Product;
  quantity: number;
  stock: number;
  name: string;
  onChange: (quantity: number) => void;
}) {
  const [draft, setDraft] = useState({
    source: quantity,
    value: String(quantity),
    error: null as string | null,
  });
  const id = useId();
  if (draft.source !== quantity)
    setDraft({ source: quantity, value: String(quantity), error: null });
  function apply() {
    const error = product
      ? productQuantityError(draft.value, product, true)
      : quantityError(draft.value, stock);
    setDraft({ ...draft, error });
    if (!error && Number(draft.value) !== quantity) onChange(Number(draft.value));
  }
  return (
    <div className="cart-quantity-field">
      <label htmlFor={id}>
        Quantidade<span className="visually-hidden"> de {name}</span>
      </label>
      <div className="cart-quantity-control">
        <button
          type="button"
          aria-label={`Diminuir quantidade de ${name}`}
          disabled={quantity <= (product?.sale?.quantidadeMinima ?? 1)}
          onClick={() => onChange(quantity - (product?.sale?.incrementoCompra ?? 1))}
        >
          −
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={draft.value}
          maxLength={12}
          aria-invalid={!!draft.error}
          aria-describedby={`${id}-hint${draft.error ? ` ${id}-error` : ''}`}
          onChange={(event) => setDraft({ ...draft, value: event.target.value, error: null })}
          onBlur={apply}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              apply();
            }
          }}
        />
        <button
          type="button"
          aria-label={`Aumentar quantidade de ${name}`}
          disabled={quantity + (product?.sale?.incrementoCompra ?? 1) > stock}
          onClick={() => onChange(quantity + (product?.sale?.incrementoCompra ?? 1))}
        >
          +
        </button>
      </div>
      <p id={`${id}-hint`} className="cart-quantity-hint">
        Máximo {stock}
        {product?.sale
          ? ` ${product.sale.unidadeBase}. Mínimo ${product.sale.quantidadeMinima}; incremento ${product.sale.incrementoCompra}`
          : ''}
        . Introduzir 0 retira o produto.
      </p>
      {draft.error && (
        <p id={`${id}-error`} className="cart-field-error" role="alert">
          {draft.error}
        </p>
      )}
    </div>
  );
}
