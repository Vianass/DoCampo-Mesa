import { NavLink } from 'react-router';
export function DesktopNavigation() {
  return (
    <nav className="desktop-navigation" aria-label="Navegação principal">
      <NavLink to="/produtos">Produtos</NavLink>
      <NavLink to="/produtores">Produtores</NavLink>
      <NavLink to="/leiloes">
        Leilões
        <span className="navigation-dot" />
      </NavLink>
      <NavLink to="/como-funciona">Como funciona</NavLink>
    </nav>
  );
}
