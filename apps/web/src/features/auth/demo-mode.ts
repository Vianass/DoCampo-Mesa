// Espaço público de exemplos isolado das rotas autenticadas; não concede capacidades.
export const demonstrationSite =
  typeof window !== 'undefined' &&
  (window.location.pathname === '/demonstracao' ||
    window.location.pathname.startsWith('/demonstracao/'));
