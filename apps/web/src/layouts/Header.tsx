import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Brand } from '../components/Brand';
import { Button } from '../components/Button';
import { Container } from '../components/Container';
import { Icon } from '../components/Icon';
import { DesktopNavigation } from './DesktopNavigation';
import { MobileNavigation } from './MobileNavigation';
import { useCart } from '../features/cart/useCart';
import { useAuth } from '../features/auth/useAuth';
import { roleHome } from '../features/private-area/navigation';

export function Header() {
  const { itemCount } = useCart();
  const { session } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <header className="site-header">
      <div className="market-edition">
        <Container>
          <span>O sabor começa na origem.</span>
          <span>
            Edição de outono <span aria-hidden="true">✳</span> Mercado demonstrativo
          </span>
        </Container>
      </div>
      <Container>
        <div className="header-main">
          <Brand />
          <DesktopNavigation />
          <div className="header-actions">
            <Link
              to="/produtos?pesquisa="
              className="icon-button header-search"
              aria-label="Pesquisar produtos"
            >
              <Icon name="search" />
            </Link>
            <Link
              to="/carrinho"
              className="icon-button header-cart"
              aria-label={`Carrinho, ${itemCount} ${itemCount === 1 ? 'unidade' : 'unidades'}`}
            >
              <Icon name="basket" />
              <span className="header-cart__count" aria-hidden="true">
                {itemCount}
              </span>
            </Link>
            {session.kind === 'demonstration' ? (
              <Button to={roleHome(session.role)} size="small" className="header-actions__register">
                Área de demonstração <Icon name="arrow" />
              </Button>
            ) : (
              <>
                <Link to="/entrar" className="header-actions__login">
                  Entrar
                </Link>
                <Button to="/registo" size="small" className="header-actions__register">
                  Criar conta <Icon name="arrow" />
                </Button>
              </>
            )}
            <button
              ref={menuButton}
              type="button"
              className="icon-button header-menu-toggle"
              aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
        <MobileNavigation open={menuOpen} onNavigate={() => setMenuOpen(false)} />
      </Container>
    </header>
  );
}
