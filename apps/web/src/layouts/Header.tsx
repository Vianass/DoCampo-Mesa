import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Brand } from '../components/Brand';
import { Button } from '../components/Button';
import { Container } from '../components/Container';
import { Icon } from '../components/Icon';
import { DesktopNavigation } from './DesktopNavigation';
import { MobileNavigation } from './MobileNavigation';

export function Header() {
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
            <Link to="/produtos?pesquisa=" className="icon-button" aria-label="Pesquisar produtos">
              <Icon name="search" />
            </Link>
            <Link to="/entrar" className="header-actions__login">
              Entrar
            </Link>
            <Button to="/registo" size="small" className="header-actions__register">
              Criar conta
              <Icon name="arrow" />
            </Button>
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
