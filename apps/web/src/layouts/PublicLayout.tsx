import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Header } from './Header';
import { Footer } from './Footer';

export function PublicLayout() {
  const location = useLocation();
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.getElementById('conteudo')?.focus({ preventScroll: true });
  }, [location.pathname]);
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Saltar para o conteúdo
      </a>
      <Header />
      <main id="conteudo" tabIndex={-1}>
        <Outlet />
      </main>
      <Footer />
      <div className="visually-hidden" aria-live="polite" aria-atomic="true">
        Página:{' '}
        {location.pathname === '/'
          ? 'Início'
          : location.pathname.split('/').filter(Boolean).join(', ')}
      </div>
    </>
  );
}
