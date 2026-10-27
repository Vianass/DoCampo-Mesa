import type { Page } from '@playwright/test';
import type { Role } from '../../src/features/auth/types';
export const fixtureToken = 'ZXhhbXBsZQ.dGVzdA.c2lnbmF0dXJl';
export const fixtureUser = {
  id: '000000000000000000000501',
  nome: 'Pessoa fictícia da conta',
  email: 'conta@example.invalid',
  papeis: ['comprador'] as Role[],
};
export const fixturePassword = 'Frase fictícia para autenticar 5C!';
export async function mockAccount(page: Page) {
  const state = {
    roles: ['comprador'] as Role[],
    meStatus: 200,
    loginStatus: 200,
    registerStatus: 202,
    loginGate: undefined as Promise<void> | undefined,
    meGate: undefined as Promise<void> | undefined,
    logoutGate: undefined as Promise<void> | undefined,
    bodies: [] as { path: string; body: unknown }[],
    meCalls: 0,
  };
  await page.route(
    (url) => url.pathname.startsWith('/api/auth/'),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const user = { ...fixtureUser, papeis: state.roles };
      if (route.request().method() === 'POST')
        state.bodies.push({ path, body: route.request().postDataJSON() });
      if (path.endsWith('/register')) {
        await route.fulfill({
          status: state.registerStatus,
          json: {
            mensagem: 'Pedido de registo recebido. Tenta iniciar sessão com os dados indicados.',
          },
        });
        return;
      }
      if (path.endsWith('/login')) {
        await state.loginGate;
        await route.fulfill({
          status: state.loginStatus,
          json:
            state.loginStatus === 200
              ? {
                  accessToken: fixtureToken,
                  tokenType: 'Bearer',
                  expiresAt: new Date(Date.now() + 900000).toISOString(),
                  utilizador: user,
                }
              : {
                  codigo: 'AUTENTICACAO_INVALIDA',
                  mensagem: 'Não foi possível autenticar o pedido.',
                },
        });
        return;
      }
      if (path.endsWith('/me')) {
        state.meCalls++;
        await state.meGate;
        const status =
          route.request().headers().authorization === 'Bearer ' + fixtureToken
            ? state.meStatus
            : 401;
        await route.fulfill({
          status,
          json:
            status === 200
              ? user
              : {
                  codigo: 'ACESSO_PROIBIDO',
                  mensagem: 'detalhes internos não devem ser apresentados',
                },
        });
        return;
      }
      if (path.endsWith('/logout')) {
        await state.logoutGate;
        await route.fulfill({
          json: {
            mensagem: 'Termina a sessão no cliente. O token continua válido até expirar.',
            revogado: false,
          },
        });
        return;
      }
      await route.fallback();
    },
  );
  return state;
}
export async function accountLogin(page: Page) {
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expectIdentity(page);
}
export async function expectIdentity(page: Page) {
  await page.locator('.account-identity').waitFor();
}
