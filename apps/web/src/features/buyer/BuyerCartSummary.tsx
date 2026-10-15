import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { PriceDisplay } from '../../components/PriceDisplay';
import { useCart } from '../cart/useCart';

export function BuyerCartSummary() {
  const { cart, itemCount, subtotalCents } = useCart();
  return (
    <aside className="buyer-cart-summary" aria-labelledby="buyer-cart-title">
      <Icon name="basket" width="32" height="32" />
      <p className="eyebrow">As próximas escolhas</p>
      <h2 id="buyer-cart-title">
        A tua cesta,
        <br />
        <em>aqui ao lado.</em>
      </h2>
      <p>
        {itemCount} {itemCount === 1 ? 'unidade' : 'unidades'} · {cart.items.length}{' '}
        {cart.items.length === 1 ? 'produto diferente' : 'produtos diferentes'}
      </p>
      <dl>
        <div>
          <dt>Subtotal demonstrativo</dt>
          <dd>
            <PriceDisplay amountCents={subtotalCents} />
          </dd>
        </div>
      </dl>
      <Button to="/carrinho" variant="secondary">
        Consultar a cesta <Icon name="arrow" />
      </Button>
      <Button to="/produtos" variant="text">
        Continuar a explorar
      </Button>
      <small>A cesta não reserva stock. O checkout ainda não está disponível.</small>
    </aside>
  );
}
