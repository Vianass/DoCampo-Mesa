import { startTransition, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Brand } from '../components/Brand';
import { Container } from '../components/Container';
import { Icon } from '../components/Icon';
import { useAuth } from '../features/auth/useAuth';
import { roleLabels } from '../features/auth/types';
import { privateSections, roleHome } from '../features/private-area/navigation';

export function PrivateLayout() {
  const { session, endDemonstration } = useAuth();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [open]);
  if (session.kind !== 'demonstration') return null;
  const { role } = session;
  const home = roleHome(role);
  return (
    <div className="private-shell">
      <a className="skip-link" href="#area-conteudo">
        Saltar para o conteúdo
      </a>
      <div className="private-edition">
        Área de demonstração <span aria-hidden="true">✳</span> Sem autenticação real
      </div>
      <Container>
        <header className="private-header">
          <Brand />
          <div className="private-header__actions">
            <Link to="/produtos">
              Voltar ao mercado <Icon name="arrow" />
            </Link>
            <button
              type="button"
              className="private-exit"
              onClick={() => {
                startTransition(() => {
                  endDemonstration();
                  navigate('/entrar', { replace: true });
                });
              }}
            >
              Sair da demonstração
            </button>
          </div>
        </header>
        <div className="private-role-line">
          <p>
            <span>Papel de demonstração</span>
            <strong>{roleLabels[role]}</strong>
          </p>
          <button
            ref={button}
            type="button"
            className="private-menu-toggle"
            aria-controls="private-navigation"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? 'close' : 'menu'} />
            {open ? 'Fechar navegação da área' : 'Abrir navegação da área'}
          </button>
        </div>
        <div className="private-layout">
          <nav
            id="private-navigation"
            className={`private-navigation ${open ? 'private-navigation--open' : ''}`}
            aria-label="Navegação da área de demonstração"
          >
            <p className="eyebrow">O teu espaço</p>
            <NavLink to={home} end onClick={() => setOpen(false)}>
              <span aria-hidden="true">00</span>Visão geral
            </NavLink>
            {privateSections[role].map((section, index) => (
              <NavLink
                key={section.slug}
                to={`${home}/${section.slug}`}
                onClick={() => setOpen(false)}
              >
                <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                {section.label}
              </NavLink>
            ))}
            {role === 'comprador' && (
              <Link to="/carrinho" onClick={() => setOpen(false)}>
                <Icon name="basket" />A minha cesta
              </Link>
            )}
            <p className="private-navigation__note">
              Estrutura em preparação. As operações desta área ainda não estão disponíveis.
            </p>
          </nav>
          <main id="area-conteudo" ref={main} tabIndex={-1}>
            <Outlet />
          </main>
        </div>
        <footer className="private-footer">
          Do Campo à Mesa · Protótipo académico{' '}
          <Link to="/entrar#demonstracao">Explorar outro papel</Link>
        </footer>
      </Container>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        Área de demonstração: {roleLabels[role]}. Página:{' '}
        {location.pathname.split('/').filter(Boolean).join(', ')}.
      </div>
    </div>
  );
}
