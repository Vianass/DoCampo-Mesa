import { Link } from 'react-router';
import { useCart } from './useCart';

export function CartNotices() {
  const { storageIssue, recoveryMessages } = useCart();
  if (!storageIssue && !recoveryMessages.length) return null;
  return (
    <div className="cart-notice-banner" role="status" aria-label="Informações do carrinho">
      <div className="market-container">
        {storageIssue && <p>{storageIssue}</p>}
        {recoveryMessages.length > 0 && (
          <p>
            A cesta guardada foi revista.{' '}
            <Link to="/carrinho">
              Consultar os ajustes no carrinho <span aria-hidden="true">→</span>
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
