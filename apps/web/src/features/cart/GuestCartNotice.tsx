import { Button } from '../../components/Button';
import { useCart } from './useCart';

export function GuestCartNotice() {
  const cart = useCart();
  if (!cart.guestCartAvailable) return null;
  return (
    <section className="cart-recovery" aria-label="Cesta de visitante">
      <h2>Tens uma cesta de visitante neste navegador.</h2>
      <p>
        A tua cesta é independente. Só juntamos os artigos de visitante se confirmares que são teus.
      </p>
      <Button variant="secondary" onClick={cart.importGuestCart}>
        Importar cesta de visitante
      </Button>
    </section>
  );
}
