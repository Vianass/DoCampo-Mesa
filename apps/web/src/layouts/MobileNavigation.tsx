import { NavLink } from 'react-router';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';

export function MobileNavigation({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  return (
    <nav
      id="mobile-navigation"
      className="mobile-navigation"
      aria-label="Navegação móvel"
      hidden={!open}
    >
      <p className="eyebrow">O teu mercado, aqui perto.</p>
      <div className="mobile-navigation__links">
        {[
          { to: '/produtos', label: 'Produtos', caption: 'Descobre os sabores da época' },
          { to: '/produtores', label: 'Produtores', caption: 'Conhece quem está na origem' },
          { to: '/leiloes', label: 'Leilões', caption: 'Colheitas com uma nova oportunidade' },
          {
            to: '/como-funciona',
            label: 'Como funciona',
            caption: 'Do campo, por um caminho mais curto',
          },
        ].map((item) => (
          <NavLink key={item.to} to={item.to} onClick={onNavigate}>
            <span>
              {item.label}
              <small>{item.caption}</small>
            </span>
            <Icon name="arrow" />
          </NavLink>
        ))}
      </div>
      <div className="mobile-navigation__account">
        <NavLink to="/entrar" onClick={onNavigate}>
          Entrar
        </NavLink>
        <Button to="/registo" size="small" onClick={onNavigate}>
          Criar conta
          <Icon name="arrow" />
        </Button>
      </div>
    </nav>
  );
}
