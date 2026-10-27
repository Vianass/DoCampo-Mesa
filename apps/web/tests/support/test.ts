import { test as base, expect } from '@playwright/test';
import { mockCatalog } from './catalog-fixtures';
export const test = base.extend({
  page: async ({ page }, use, info) => {
    // Os cenários históricos continuam a testar os mesmos dashboards fictícios,
    // agora no espaço isolado; nunca são usados como prova de autenticação real.
    if (/\/(auth|buyer|producer|admin)\.spec\.ts$/.test(info.file)) {
      const goto = page.goto.bind(page);
      page.goto = ((url, ...args) =>
        goto(
          url.startsWith('/') && !url.startsWith('/demonstracao') ? '/demonstracao' + url : url,
          ...args,
        )) as typeof page.goto;
      await page.addInitScript(() => {
        const prefix = (url: string | URL | null | undefined) =>
          typeof url === 'string' && url.startsWith('/') && !url.startsWith('/demonstracao')
            ? '/demonstracao' + url
            : url;
        const push = history.pushState.bind(history),
          replace = history.replaceState.bind(history);
        history.pushState = (data, unused, url) => push(data, unused, prefix(url));
        history.replaceState = (data, unused, url) => replace(data, unused, prefix(url));
      });
    }
    await mockCatalog(page);
    await use(page);
  },
});
export { expect };

export type { Page } from '@playwright/test';
