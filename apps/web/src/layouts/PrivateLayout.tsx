import { startTransition, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { Brand } from '../components/Brand';
import { Container } from '../components/Container';
import { Icon } from '../components/Icon';
import { useAuth } from '../features/auth/useAuth';
import { isRole } from '../features/auth/types';
import { demonstrationSite } from '../features/auth/demo-mode';
import { AccountArea } from '../features/private-area/AccountArea';
import { roleLabels } from '../features/auth/types';
import { privateSections, roleHome } from '../features/private-area/navigation';
import { applicationPath } from '../features/producer-application/model';

export function PrivateLayout() {
  const { session: account, demonstration, endDemonstration, logout } = useAuth();
  const session = demonstrationSite ? demonstration : account;
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
  if (session.kind === 'visitor') return null;
  const requested = location.pathname.split('/')[2];
  const role =
    session.kind === 'demonstration'
      ? session.role
      : isRole(requested) && session.user.papeis.includes(requested)
        ? requested
        : session.user.papeis[0]!;
  const home = roleHome(role);
  const sharedApplication = !demonstrationSite && location.pathname === applicationPath;
  const contextLabel = sharedApplication ? 'Candidatura a produtor' : roleLabels[role];
  return (
    <div className="private-shell">
      <a className="skip-link" href="#area-conteudo">
        Saltar para o conteúdo
      </a>
      <div className="private-edition">
        {demonstrationSite ? 'Área de demonstração' : 'Área pessoal'}{' '}
        <span aria-hidden="true">✳</span>{' '}
        {demonstrationSite ? 'Sem autenticação real' : 'Identidade confirmada pelo serviço'}
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
                  if (demonstrationSite) endDemonstration();
                  else void logout();
                  navigate('/entrar', { replace: true });
                });
              }}
            >
              {demonstrationSite ? 'Sair da demonstração' : 'Terminar sessão'}
            </button>
          </div>
        </header>
        <div className="private-role-line">
          <p>
            <span>
              {demonstrationSite
                ? 'Papel de demonstração'
                : session.kind === 'authenticated'
                  ? session.user.nome
                  : 'Área pessoal'}
            </span>
            <strong>{contextLabel}</strong>
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
            aria-label={
              demonstrationSite ? 'Navegação da área de demonstração' : 'Navegação da área pessoal'
            }
          >
            <p className="eyebrow">O teu espaço</p>
            {session.kind === 'authenticated' && session.user.papeis.length > 1 && (
              <div className="account-role-links" aria-label="Áreas autorizadas">
                {session.user.papeis.map((p) => (
                  <Link key={p} to={roleHome(p)} onClick={() => setOpen(false)}>
                    Área de {roleLabels[p]}
                  </Link>
                ))}
              </div>
            )}
            <NavLink to={home} end onClick={() => setOpen(false)}>
              <span aria-hidden="true">00</span>Visão geral
            </NavLink>
            {sharedApplication && (
              <NavLink to={applicationPath} onClick={() => setOpen(false)}>
                <span aria-hidden="true">01</span>Candidatura a produtor
              </NavLink>
            )}
            {!sharedApplication &&
              privateSections[role].map((section, index) => (
                <NavLink
                  key={section.slug}
                  to={
                    !demonstrationSite && role === 'produtor' && section.slug === 'candidatura'
                      ? applicationPath
                      : `${home}/${section.slug}`
                  }
                  onClick={() => setOpen(false)}
                >
                  <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  {!demonstrationSite && role === 'produtor' && section.slug === 'candidatura'
                    ? 'Estatuto de produtor'
                    : section.label}
                </NavLink>
              ))}
            {role === 'comprador' && (
              <Link to="/carrinho" onClick={() => setOpen(false)}>
                <Icon name="basket" />A minha cesta
              </Link>
            )}
            <p className="private-navigation__note">
              {!demonstrationSite
                ? 'Cada secção indica os dados disponíveis. Os exemplos demonstrativos não pertencem à tua conta.'
                : role === 'comprador'
                  ? 'Atividade fictícia para explorar. Sem compras, pagamentos ou ofertas reais.'
                  : role === 'produtor'
                    ? 'Gestão local demonstrativa. Sem publicação, aprovação ou vendas reais.'
                    : 'Supervisão demonstrativa. Decisões apenas nesta sessão; sem efeitos administrativos reais.'}
            </p>
          </nav>
          <main id="area-conteudo" ref={main} tabIndex={-1}>
            {demonstrationSite ? <Outlet /> : <AccountArea />}
          </main>
        </div>
        <footer className="private-footer">
          Do Campo à Mesa · Protótipo académico{' '}
          {demonstrationSite ? (
            <>
              <Link to="/entrar#demonstracao">Explorar outro papel</Link> ·{' '}
              <a href="/produtos">Sair do espaço demonstrativo</a>
            </>
          ) : (
            <Link to="/produtos">Explorar o mercado</Link>
          )}
        </footer>
      </Container>
      <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
        {demonstrationSite ? 'Área de demonstração' : 'Área pessoal'}: {contextLabel}. Página:{' '}
        {location.pathname.split('/').filter(Boolean).join(', ')}.
      </div>
    </div>
  );
}
