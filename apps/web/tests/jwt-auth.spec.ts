import { expect, test } from './support/test';
import {
  mockAccount,
  accountLogin,
  fixtureUser,
  fixturePassword,
  fixtureToken,
} from './support/auth-fixtures';
async function navigate(page: import('@playwright/test').Page, path: string) {
  await page.evaluate((path) => {
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}
async function registration(page: import('@playwright/test').Page) {
  await page.getByLabel('Nome', { exact: true }).fill('Pessoa do registo');
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(fixturePassword);
  await page.getByLabel('Confirmação da palavra-passe', { exact: true }).fill(fixturePassword);
}
test('registo público só envia nome/email/password e 202 não inicia sessão', async ({ page }) => {
  const api = await mockAccount(page);
  await page.goto('/registo?perfil=administrador');
  await expect(page.getByRole('radio')).toHaveCount(0);
  await registration(page);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.locator('.auth-form-status')).toContainText('Pedido de registo recebido');
  await expect(page.locator('.auth-form-status')).toContainText('não inicia sessão');
  expect(api.bodies[0]).toEqual({
    path: '/api/auth/register',
    body: { nome: 'Pessoa do registo', email: fixtureUser.email, password: fixturePassword },
  });
  await expect(page.locator('.header-actions__login')).toBeVisible();
  await expect(page.getByLabel('Palavra-passe', { exact: true })).toHaveValue('');
});
test('registo duplicado usa a mesma confirmação e não revela a existência do email', async ({
  page,
}) => {
  await mockAccount(page);
  await page.goto('/registo');
  await registration(page);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.locator('.auth-form-status')).toContainText('Pedido de registo recebido');
  const first = await page.locator('.auth-form-status').textContent();
  await registration(page);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.locator('.auth-form-status')).toHaveText(first!);
});
test('password real exige 15 caracteres e não bloqueia bcrypt antigo no login', async ({
  page,
}) => {
  const api = await mockAccount(page);
  await page.goto('/registo');
  await registration(page);
  await page.getByLabel('Palavra-passe', { exact: true }).fill('abcdefgh');
  await page.getByLabel('Confirmação da palavra-passe', { exact: true }).fill('abcdefgh');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('pelo menos 15');
  expect(api.bodies).toEqual([]);
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill('antiga');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.locator('.account-identity')).toBeVisible();
});
test('login confirma /me, atualiza a navegação e não mostra atividade fictícia', async ({
  page,
}) => {
  const api = await mockAccount(page);
  await accountLogin(page);
  await expect(page.locator('.account-identity')).toContainText(fixtureUser.nome);
  expect(api.meCalls).toBeGreaterThan(0);
  await expect(
    page.locator('.buyer-order-card,.review-card,.buyer-summary,.admin-metrics,.producer-metrics'),
  ).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'A tua atividade ficará aqui.' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar ao mercado' }).click();
  await expect(page.getByRole('link', { name: 'A minha área', exact: true })).toBeVisible();
  await expect(page.locator('.header-actions__login')).toHaveCount(0);
});
test('credenciais inválidas recebem mensagem uniforme e não deixam sessão', async ({ page }) => {
  const api = await mockAccount(page);
  api.loginStatus = 401;
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill('credencial fictícia incorreta');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Confirma o email e a palavra-passe');
  await expect(page.getByLabel('Palavra-passe', { exact: true })).toHaveValue('');
  await navigate(page, '/area/comprador');
  await expect(page).toHaveURL(/\/entrar\?destino=/);
});
test('visitante e destinos externos não concedem acesso privado', async ({ page }) => {
  await mockAccount(page);
  await page.goto('/area/administrador');
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await expect(page.getByRole('button', { name: /Explorar como/ })).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/comprador$/);
  await navigate(page, '/area/administrador');
  await expect(page.getByRole('heading', { name: 'Não tens acesso a esta área.' })).toBeVisible();
});
test('papéis atuais são atualizados pelo serviço e navegação multiárea não concede administrador', async ({
  page,
}) => {
  const api = await mockAccount(page);
  api.roles = ['comprador', 'produtor'];
  await accountLogin(page);
  await page.getByRole('link', { name: 'Área de Produtor', exact: true }).click();
  await expect(page).toHaveURL(/\/area\/produtor$/);
  await expect(page.locator('.account-identity')).toContainText('Produtor');
  await expect(page.getByRole('link', { name: 'Área de Administrador' })).toHaveCount(0);
  api.roles = ['produtor'];
  await navigate(page, '/area/comprador/encomendas');
  await expect(page.getByRole('heading', { name: 'Não tens acesso a esta área.' })).toBeVisible();
  await page.getByRole('link', { name: 'Voltar à minha área' }).click();
  await expect(page).toHaveURL(/\/area\/produtor$/);
});
test('401 de /me, incluindo conta inativa, termina a sessão sem alterar a cesta', async ({
  page,
}) => {
  const api = await mockAccount(page);
  await accountLogin(page);
  api.meStatus = 401;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await expect(page.locator('.auth-session-note')).toContainText('deixou de ser válida');
  await expect(page.locator('.account-identity')).toHaveCount(0);
});
test('403 recusa a consulta, mantém os dados privados bloqueados e permite nova confirmação', async ({
  page,
}) => {
  const api = await mockAccount(page);
  await accountLogin(page);
  api.meStatus = 403;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('heading', { name: 'O serviço não autorizou esta consulta.' }),
  ).toBeVisible();
  await expect(page.locator('.account-identity')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('detalhes internos');
  api.meStatus = 200;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.account-identity')).toBeVisible();
});
test('API indisponível durante revalidação bloqueia a área sem inventar dados', async ({
  page,
}) => {
  const api = await mockAccount(page);
  await accountLogin(page);
  api.meStatus = 503;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(
    page.getByRole('heading', { name: 'Não foi possível confirmar a sessão.' }),
  ).toBeVisible();
  await expect(page.locator('.account-identity')).toHaveCount(0);
  api.meStatus = 200;
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click();
  await expect(page.locator('.account-identity')).toBeVisible();
});
test('expiração local limpa a sessão e informa a necessidade de novo login', async ({ page }) => {
  await page.clock.install();
  await mockAccount(page);
  await accountLogin(page);
  await page.clock.fastForward(16 * 60 * 1000);
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await expect(page.locator('.auth-session-note')).toContainText('sessão terminou');
});
test('token adulterado recusado em /me não estabelece uma sessão', async ({ page }) => {
  const api = await mockAccount(page);
  api.meStatus = 401;
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível iniciar sessão');
  await expect(page.locator('.account-identity')).toHaveCount(0);
});
test('reload perde o JWT em memória e explica o novo login necessário', async ({ page }) => {
  await mockAccount(page);
  await accountLogin(page);
  await page.reload();
  await expect(page).toHaveURL(/\/entrar\?destino=/);
  await expect(page.locator('.auth-session-note')).toContainText('atualizaste a página');
});
test('logout é imediato no cliente, chama a API e não promete revogação', async ({ page }) => {
  const api = await mockAccount(page);
  await accountLogin(page);
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.locator('.auth-session-note')).toContainText('não é revogado');
  expect(api.bodies.some((b) => b.path === '/api/auth/logout')).toBe(true);
  await navigate(page, '/area/comprador');
  await expect(page).toHaveURL(/\/entrar$/);
});
test('logout durante /me não permite que a resposta antiga restaure a identidade', async ({
  page,
}) => {
  const api = await mockAccount(page);
  await accountLogin(page);
  let release!: () => void;
  api.meGate = new Promise<void>((resolve) => (release = resolve));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status', { name: 'A confirmar a sessão' })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar sessão', exact: true }).click();
  release();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.locator('.account-identity')).toHaveCount(0);
});
test('pedido de login abandonado não autentica depois da navegação', async ({ page }) => {
  const api = await mockAccount(page);
  let release!: () => void;
  api.loginGate = new Promise<void>((resolve) => (release = resolve));
  await page.goto('/entrar');
  await page.getByLabel('Email', { exact: true }).fill(fixtureUser.email);
  await page.getByLabel('Palavra-passe', { exact: true }).fill(fixturePassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'A verificar…', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: '← Continuar pelo mercado' }).click();
  release();
  await expect(page.locator('.header-actions__login')).toBeVisible();
});
test('JWT e password não aparecem em URL, DOM, console, cookies ou armazenamento', async ({
  page,
}) => {
  await mockAccount(page);
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  await accountLogin(page);
  const visible = await page.locator('body').innerText();
  const storage = await page.evaluate(() =>
    JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), document.cookie]),
  );
  for (const value of [fixtureToken, fixturePassword]) {
    expect(visible.includes(value)).toBe(false);
    expect(storage.includes(value)).toBe(false);
    expect(page.url().includes(value)).toBe(false);
    expect(logs.some((log) => log.includes(value))).toBe(false);
  }
});
test('demonstração isolada não abre área real e não disponibiliza JWT', async ({ page }) => {
  await mockAccount(page);
  await page.goto('/demonstracao/entrar');
  await page.getByRole('button', { name: 'Explorar como administrador', exact: true }).click();
  await expect(page).toHaveURL(/\/demonstracao\/area\/administrador$/);
  await page.goto('/area/administrador');
  await expect(page).toHaveURL(/\/entrar\?destino=/);
});
for (const width of [320, 430, 768, 1024, 1280, 1440])
  test(`entrada real e área pessoal sem overflow a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockAccount(page);
    await accountLogin(page);
    await page.evaluate(() => document.fonts.ready);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.goto('/entrar');
    await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });
